// Sync between devices: books, Gemini notes, check-offs, time estimates and quiz scores
// are copied to this site's database (api/sync.js) and pulled down on other devices.
// Loaded before the page's own scripts so every localStorage write is noticed.
// Your Canvas feed link is never synced.
(function () {
  const WHOLE = {
    "cac.books": "books",
    "cac.booksRemoved": "booksRemoved",
    "cac.done": "done",
    "cac.estimates": "estimates",
    "cac.quizScores": "quizScores",
  };
  // Books are combined book by book instead of one device's list replacing
  // another's, so a book added on one device is never wiped out by another.
  const BOOK_FIELDS = ["books", "booksRemoved"];
  const GEN = "cac.genNotes";
  const META_KEY = "cac.sync"; // { known: { field: { at, h } }, dirty: { field: true } }
  const rawSet = Storage.prototype.setItem;
  const rawGet = Storage.prototype.getItem;
  let off = false; // server has no database: stop trying for this page
  // What the last sync did, shown in Settings and the Learning Center.
  const status = { state: "checking", at: 0, message: "" };
  function setStatus(state, message) {
    status.state = state;
    status.message = message || "";
    if (state === "ok") status.at = Date.now();
    try {
      window.dispatchEvent(new CustomEvent("cac:sync", { detail: { ...status } }));
    } catch {
      /* old browser */
    }
  }

  const read = (k, d) => {
    try {
      const v = rawGet.call(localStorage, k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  };
  // Returns false if it couldn't be saved. When storage is full, drops things
  // that are easy to get back (cover cache, cached calendar) and tries again.
  const write = (k, v) => {
    const text = JSON.stringify(v);
    for (const spare of [null, "cac.coverCache", "cac.lastIcs"]) {
      try {
        if (spare) localStorage.removeItem(spare);
        rawSet.call(localStorage, k, text);
        return true;
      } catch {
        /* storage full or blocked: try making room */
      }
    }
    return false;
  };
  const FULL = "This browser's storage is full. Remove some generated book notes on this device to make room.";
  const meta = read(META_KEY, {});
  meta.known ||= {};
  meta.dirty ||= {};
  const saveMeta = () => write(META_KEY, meta);

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return `${str.length}:${h >>> 0}`;
  }

  // All synced fields with their current local values.
  function localFields() {
    const out = {};
    for (const [key, field] of Object.entries(WHOLE)) {
      const v = read(key, undefined);
      if (v !== undefined) out[field] = v;
    }
    for (const [id, book] of Object.entries(read(GEN, {}) || {})) out[`gen:${id}`] = book;
    return out;
  }

  function markChanges() {
    const now = localFields();
    for (const [f, v] of Object.entries(now)) {
      if (!meta.known[f] || meta.known[f].h !== hash(JSON.stringify(v))) meta.dirty[f] = true;
    }
    for (const f of Object.keys(meta.known)) if (!(f in now)) meta.dirty[f] = true; // deleted here
    saveMeta();
  }

  async function api(body) {
    let res;
    try {
      res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: body.op === "set" && JSON.stringify(body).length < 60000,
      });
    } catch {
      throw new Error("Couldn't reach the website (offline?).");
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 || res.status === 404) off = true;
    if (!res.ok) {
      let why = data.error || `Sync answered ${res.status}`;
      if (res.status === 503) why = "Sync isn't set up on this web address: no database is connected to it in Vercel.";
      if (res.status === 404) why = "This web address has no sync helper (it may be an old or preview copy of the site).";
      if (res.status === 403) why = "This web address isn't allowed to sync.";
      if (res.status === 413) why = "Too much to send at once (very large notes).";
      throw new Error(why);
    }
    return data;
  }

  // ----- Combining book lists -----
  const bookKey = (course, b) => `${course}|${b.isbn || b.title}`;
  function mergeRemoved(a, b) {
    const out = { ...(a || {}) };
    for (const [k, t] of Object.entries(b || {})) out[k] = Math.max(out[k] || 0, t);
    return out;
  }
  // Every book on either side, except ones removed after they were added.
  function mergeBooks(a, b, removed) {
    const out = {};
    for (const side of [a, b]) {
      for (const [course, list] of Object.entries(side || {})) {
        for (const book of Array.isArray(list) ? list : []) {
          const k = bookKey(course, book);
          if (removed[k] && (book.addedAt || 0) <= removed[k]) continue;
          const shelf = (out[course] ||= []);
          const at = shelf.findIndex((x) => bookKey(course, x) === k);
          if (at < 0) shelf.push(book);
          else if ((book.addedAt || 0) > (shelf[at].addedAt || 0)) shelf[at] = book;
        }
      }
    }
    return out;
  }
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  // Combine the server's books with this device's and save the result here.
  // Returns true if this device's copy changed.
  function combineBooks(serverBooks, serverRemoved) {
    const localBooks = read("cac.books", undefined);
    const localRemoved = read("cac.booksRemoved", undefined);
    const removed = mergeRemoved(serverRemoved, localRemoved);
    const books = mergeBooks(localBooks, serverBooks, removed);
    let changed = false;
    if (!same(books, localBooks || {}) && (localBooks !== undefined || Object.keys(books).length)) {
      if (!write("cac.books", books)) throw new Error(FULL);
      changed = true;
    }
    if (!same(removed, localRemoved || {}) && (localRemoved !== undefined || Object.keys(removed).length)) {
      if (!write("cac.booksRemoved", removed)) throw new Error(FULL);
      changed = true;
    }
    // Anything the server is missing gets sent up.
    if (!same(books, serverBooks || {})) meta.dirty.books = true;
    if (!same(removed, serverRemoved || {})) meta.dirty.booksRemoved = true;
    return changed;
  }
  // Right before sending books: fetch the server's latest and combine first.
  async function refreshBooksBeforePush() {
    const { values } = await api({ op: "get", fields: BOOK_FIELDS });
    const sv = (f) => (values[f] ? values[f].value : undefined);
    combineBooks(sv("books"), sv("booksRemoved"));
    for (const f of BOOK_FIELDS) {
      if (values[f]) meta.known[f] = { at: values[f].at, h: hash(JSON.stringify(values[f].value)) };
    }
    saveMeta();
  }

  let pushing = null;
  async function push() {
    if (off) return;
    if (pushing) return pushing.then(push);
    pushing = (async () => {
      if (BOOK_FIELDS.some((f) => meta.dirty[f])) {
        try {
          await refreshBooksBeforePush();
        } catch (err) {
          setStatus("error", `Couldn't send changes: ${err.message}`);
          return; // offline or not set up: try again later
        }
      }
      const now = localFields();
      // Books first; one field that fails (say, very large notes) doesn't stop the rest.
      const fields = Object.keys(meta.dirty).sort((a, b) => BOOK_FIELDS.includes(b) - BOOK_FIELDS.includes(a));
      for (const f of fields) {
        const value = f in now ? now[f] : null;
        try {
          const { at } = await api({ op: "set", field: f, value });
          if (value === null) delete meta.known[f];
          else meta.known[f] = { at, h: hash(JSON.stringify(value)) };
          delete meta.dirty[f];
          saveMeta();
        } catch (err) {
          setStatus("error", `Couldn't send ${f.startsWith("gen:") ? "one book's notes" : f}: ${err.message}`);
          if (off || /reach the website/.test(err.message)) break; // offline or not set up: try again later
        }
      }
    })();
    try {
      await pushing;
    } finally {
      pushing = null;
    }
  }

  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(push, 1500);
  };

  // Notice the page's own saves.
  Storage.prototype.setItem = function (key, value) {
    rawSet.call(this, key, value);
    if (this === localStorage && (key in WHOLE || key === GEN)) {
      markChanges();
      if (Object.keys(meta.dirty).length) schedule();
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && Object.keys(meta.dirty).length) push();
  });

  // First time on a device: keep what's here as well as what's on the server.
  function firstMerge(field, server, local) {
    if (field === "books") {
      const out = JSON.parse(JSON.stringify(server || {}));
      for (const [course, list] of Object.entries(local || {})) {
        out[course] ||= [];
        for (const b of list) {
          if (!out[course].some((x) => (x.isbn || x.title) === (b.isbn || b.title))) out[course].push(b);
        }
      }
      return out;
    }
    if (field.startsWith("gen:")) {
      // Keep chapters written on this device that the server doesn't have.
      const out = JSON.parse(JSON.stringify(server || {}));
      out.content ||= {};
      for (const [n, c] of Object.entries((local && local.content) || {})) {
        if (c && c.markdown && !(out.content[n] && out.content[n].markdown)) out.content[n] = c;
      }
      if (!out.chapters && local) out.chapters = local.chapters;
      return out;
    }
    if (Array.isArray(server) || Array.isArray(local)) return [...new Set([...(server || []), ...(local || [])])];
    return Object.assign({}, local || {}, server || {});
  }

  // Pull anything changed on another device.
  async function pull() {
    const { meta: server } = await api({ op: "meta" });
    const now = localFields();
    const need = Object.keys(server).filter(
      (f) => (BOOK_FIELDS.includes(f) || !meta.dirty[f]) && (!meta.known[f] || meta.known[f].at !== server[f])
    );
    let changed = false;
    let problem = "";
    if (need.length) {
      // Fetch in small pieces: books first, then the small settings, then each
      // book's notes on its own. One piece that fails doesn't stop the others.
      const pieces = [
        need.filter((f) => BOOK_FIELDS.includes(f)),
        need.filter((f) => !BOOK_FIELDS.includes(f) && !f.startsWith("gen:")),
        ...need.filter((f) => f.startsWith("gen:")).map((f) => [f]),
      ].filter((p) => p.length);
      const values = {};
      for (const piece of pieces) {
        try {
          Object.assign(values, (await api({ op: "get", fields: piece })).values);
        } catch (err) {
          if (piece.some((f) => BOOK_FIELDS.includes(f)) || off || /reach the website/.test(err.message)) throw err;
          problem = `Couldn't download ${piece[0].startsWith("gen:") ? "one book's notes" : "some settings"}: ${err.message}`;
        }
      }
      if (window.cacBusy) return false; // Gemini is writing: don't disturb it, sync next time
      const gen = read(GEN, {}) || {};
      if (BOOK_FIELDS.some((f) => values[f])) {
        const sv = (f) => (values[f] ? values[f].value : undefined);
        if (combineBooks(sv("books"), sv("booksRemoved"))) changed = true;
        for (const f of BOOK_FIELDS) {
          if (values[f]) meta.known[f] = { at: values[f].at, h: hash(JSON.stringify(values[f].value)) };
        }
      }
      for (const [f, { value, at }] of Object.entries(values)) {
        if (BOOK_FIELDS.includes(f)) continue;
        let v = value;
        const firstTime = !meta.known[f] && f in now;
        if (firstTime) v = firstMerge(f, value, now[f]);
        if (f.startsWith("gen:")) gen[f.slice(4)] = v;
        else if (!write(Object.keys(WHOLE).find((k) => WHOLE[k] === f), v)) {
          problem = FULL;
          continue; // not saved: fetch it again next time
        }
        meta.known[f] = { at, h: hash(JSON.stringify(value)) };
        if (JSON.stringify(v) !== JSON.stringify(value)) meta.dirty[f] = true; // merged: send back
        changed = true;
      }
      if (!write(GEN, gen)) {
        // Notes didn't fit: forget them so they're fetched again once there's room.
        for (const f of Object.keys(values)) if (f.startsWith("gen:")) delete meta.known[f];
        problem = FULL;
      }
    }
    // Deleted on another device.
    for (const f of Object.keys(meta.known)) {
      if (!(f in server) && !meta.dirty[f] && !BOOK_FIELDS.includes(f)) {
        if (window.cacBusy) continue;
        delete meta.known[f];
        if (f.startsWith("gen:")) {
          const gen = read(GEN, {}) || {};
          delete gen[f.slice(4)];
          write(GEN, gen);
        } else {
          localStorage.removeItem(Object.keys(WHOLE).find((k) => WHOLE[k] === f));
        }
        changed = true;
      }
    }
    saveMeta();
    markChanges(); // anything only on this device gets sent up
    if (problem) setStatus("error", problem);
    return changed;
  }


  // Show what came from another device by reloading the page. Not while you're
  // typing or Gemini is writing: then it waits until you're done.
  let pendingReload = false;
  const typing = () => {
    const el = document.activeElement;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
  };
  function showChanges() {
    if (!pendingReload) return;
    if (window.cacBusy || typing() || document.visibilityState !== "visible") return;
    const last = Number(sessionStorage.getItem("cac.syncReload") || 0);
    if (Date.now() - last < 15000) return setTimeout(showChanges, 15000 - (Date.now() - last)); // never loops
    sessionStorage.setItem("cac.syncReload", String(Date.now()));
    location.reload();
  }
  document.addEventListener("focusout", () => setTimeout(showChanges, 300));

  function syncNow() {
    if (off) return Promise.resolve();
    lastCheck = Date.now();
    setStatus("checking");
    return pull().then(async (changed) => {
      await push();
      if (status.state === "checking") setStatus("ok");
      if (changed) pendingReload = true;
      showChanges();
    }).catch((err) => {
      // Everything still works on this device; Settings says what went wrong.
      setStatus("error", err.message);
    });
  }

  // ----- Backup file -----
  const BACKUP_KEYS = [...Object.keys(WHOLE), GEN];
  function backup() {
    const data = {};
    for (const k of BACKUP_KEYS) {
      const v = read(k, undefined);
      if (v !== undefined) data[k] = v;
    }
    return { app: "efficient-learning", version: 1, savedAt: new Date().toISOString(), data };
  }
  // Adds what's in a backup file to what's here (nothing here is lost).
  function restore(file) {
    const data = file && file.data;
    if (!data || typeof data !== "object") throw new Error("That isn't a backup file from this site.");
    const removed = mergeRemoved(read("cac.booksRemoved", {}), data["cac.booksRemoved"]);
    const books = mergeBooks(read("cac.books", {}), data["cac.books"], removed);
    const out = { "cac.books": books, "cac.booksRemoved": removed };
    for (const k of ["cac.done", "cac.estimates", "cac.quizScores"]) {
      if (data[k] !== undefined) out[k] = firstMerge(WHOLE[k], read(k, undefined), data[k]);
    }
    if (data[GEN]) {
      const gen = read(GEN, {}) || {};
      for (const [id, book] of Object.entries(data[GEN])) gen[id] = firstMerge(`gen:${id}`, gen[id], book);
      out[GEN] = gen;
    }
    for (const [k, v] of Object.entries(out)) {
      try {
        localStorage.setItem(k, JSON.stringify(v)); // noticed by sync, so it goes to other devices too
      } catch {
        throw new Error("Your browser's storage is full. Remove some generated notes and try again.");
      }
    }
    let count = 0;
    for (const list of Object.values(books)) count += list.length;
    return { books: count };
  }

  function bookCount() {
    let n = 0;
    for (const list of Object.values(read("cac.books", {}) || {})) n += Array.isArray(list) ? list.length : 0;
    return n;
  }

  window.cacSync = {
    push,
    pull,
    status: () => ({ ...status, off, books: bookCount() }),
    // "Sync now": check right away and show anything new.
    now: () => {
      sessionStorage.removeItem("cac.syncReload");
      off = false;
      return syncNow().then(() => ({ ...status, books: bookCount() }));
    },
    backup,
    restore,
  };
  let lastCheck = 0;
  syncNow();
  // Check again when you come back to the site (switching tabs or apps, or
  // clicking back into the browser window on a computer), and every minute
  // while it's open on screen.
  const checkAgain = () => {
    if (document.visibilityState !== "visible" || Date.now() - lastCheck < 20000) return;
    syncNow();
  };
  document.addEventListener("visibilitychange", checkAgain);
  window.addEventListener("focus", checkAgain);
  setInterval(checkAgain, 60000);
})();
