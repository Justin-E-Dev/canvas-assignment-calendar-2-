// Sync between devices: books, Gemini notes, check-offs, time estimates and quiz scores
// are copied to this site's database (api/sync.js) and pulled down on other devices.
// Loaded before the page's own scripts so every localStorage write is noticed.
// Your Canvas feed link is never synced.
(function () {
  const WHOLE = { "cac.books": "books", "cac.done": "done", "cac.estimates": "estimates", "cac.quizScores": "quizScores" };
  const GEN = "cac.genNotes";
  const META_KEY = "cac.sync"; // { known: { field: { at, h } }, dirty: { field: true } }
  const rawSet = Storage.prototype.setItem;
  const rawGet = Storage.prototype.getItem;
  let off = false; // server has no database: stop trying for this page

  const read = (k, d) => {
    try {
      const v = rawGet.call(localStorage, k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  };
  const write = (k, v) => {
    try {
      rawSet.call(localStorage, k, JSON.stringify(v));
    } catch {
      /* storage full or blocked */
    }
  };
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
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: body.op === "set" && JSON.stringify(body).length < 60000,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 || res.status === 404) off = true;
    if (!res.ok) throw new Error(data.error || `Sync answered ${res.status}`);
    return data;
  }

  let pushing = null;
  async function push() {
    if (off) return;
    if (pushing) return pushing.then(push);
    pushing = (async () => {
      const now = localFields();
      for (const f of Object.keys(meta.dirty)) {
        const value = f in now ? now[f] : null;
        try {
          const { at } = await api({ op: "set", field: f, value });
          if (value === null) delete meta.known[f];
          else meta.known[f] = { at, h: hash(JSON.stringify(value)) };
          delete meta.dirty[f];
          saveMeta();
        } catch {
          break; // offline or not set up: try again later
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
    const need = Object.keys(server).filter((f) => !meta.dirty[f] && (!meta.known[f] || meta.known[f].at !== server[f]));
    let changed = false;
    if (need.length) {
      const { values } = await api({ op: "get", fields: need });
      if (window.cacBusy) return false; // Gemini is writing: don't disturb it, sync next time
      const gen = read(GEN, {}) || {};
      for (const [f, { value, at }] of Object.entries(values)) {
        let v = value;
        const firstTime = !meta.known[f] && f in now;
        if (firstTime) v = firstMerge(f, value, now[f]);
        if (f.startsWith("gen:")) gen[f.slice(4)] = v;
        else write(Object.keys(WHOLE).find((k) => WHOLE[k] === f), v);
        meta.known[f] = { at, h: hash(JSON.stringify(value)) };
        if (JSON.stringify(v) !== JSON.stringify(value)) meta.dirty[f] = true; // merged: send back
        changed = true;
      }
      write(GEN, gen);
    }
    // Deleted on another device.
    for (const f of Object.keys(meta.known)) {
      if (!(f in server) && !meta.dirty[f]) {
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
    return changed;
  }

  window.cacSync = { push, pull };

  function syncNow() {
    if (off) return Promise.resolve();
    return pull().then((changed) => {
      push();
      if (!changed || window.cacBusy) return;
      // Show what came from the other device (once; never loops).
      const last = Number(sessionStorage.getItem("cac.syncReload") || 0);
      if (Date.now() - last > 15000) {
        sessionStorage.setItem("cac.syncReload", String(Date.now()));
        location.reload();
      }
    }).catch(() => {
      /* offline or sync not set up: everything still works on this device */
    });
  }
  syncNow();
  // Coming back to the tab (e.g. switching apps on a phone): check for changes again.
  let lastCheck = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || Date.now() - lastCheck < 20000) return;
    lastCheck = Date.now();
    sessionStorage.removeItem("cac.syncReload");
    syncNow();
  });
})();
