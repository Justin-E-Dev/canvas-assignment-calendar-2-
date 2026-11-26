// Book dashboard: opened from a book in the Learning Center.
// URL: book.html?course=<class>&book=<ISBN or title>&c=<class color>

(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or unavailable */
    }
  }

  // ---------- Which book ----------
  const params = new URLSearchParams(location.search);
  const course = params.get("course") || "";
  const bookId = params.get("book") || "";
  const color = /^#[0-9a-f]{6}$/i.test(params.get("c") || "") ? params.get("c") : "#ff5a36";
  document.documentElement.style.setProperty("--c", color);

  const book = (load("cac.books", {})[course] || []).find((b) => (b.isbn || b.title) === bookId);
  if (!book) {
    $("missing").classList.remove("hidden");
    return;
  }

  const storeKey = `${course}::${bookId}`;
  const chapterStore = load("cac.chapters", {}); // { storeKey: { chapters, note, source } }
  const notesStore = load("cac.notes", {}); //       { storeKey: { chapterKey: notes } }
  const myNotes = () => (notesStore[storeKey] ||= {});
  const chapterKey = (ch) => `${ch.number}|${ch.title}`.toLowerCase();
  const chapterLabel = (ch) => [ch.number && `Chapter ${ch.number}`, ch.title].filter(Boolean).join(": ");

  // ---------- Header ----------
  document.title = `${book.title} – Book Dashboard`;
  $("heroCourse").textContent = course;
  $("heroTitle").textContent = book.title;
  $("heroAuthors").textContent = (book.authors || []).join(", ");
  $("heroMeta").textContent = [book.year, book.isbn && `ISBN ${book.isbn}`].filter(Boolean).join(" · ");
  $("heroCover").innerHTML = book.cover
    ? `<img src="${esc(book.cover)}" alt="Cover of ${esc(book.title)}">`
    : `<div class="cover-fallback"><span>${esc(book.title)}</span></div>`;
  const img = $("heroCover").querySelector("img");
  if (img) img.onerror = () => ($("heroCover").innerHTML = `<div class="cover-fallback"><span>${esc(book.title)}</span></div>`);

  const about = [
    ["Class", course],
    ["Author", (book.authors || []).join(", ")],
    ["Published", book.year],
    ["ISBN", book.isbn],
  ].filter(([, v]) => v);
  const q = encodeURIComponent(book.isbn || `${book.title} ${(book.authors || [])[0] || ""}`);
  $("aboutList").innerHTML =
    about.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("") +
    `<dt>Find it</dt><dd><a href="https://openlibrary.org/search?q=${q}" target="_blank" rel="noopener">Open Library</a> ·
      <a href="https://www.google.com/search?tbm=bks&q=${q}" target="_blank" rel="noopener">Google Books</a></dd>`;

  $("bookHero").classList.remove("hidden");
  $("dash").classList.remove("hidden");

  // ---------- Talking to the server ----------
  async function study(payload) {
    let res;
    try {
      res = await fetch("/api/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, book: { ...book, course } }),
      });
    } catch {
      throw new Error("Couldn't reach the website. Check your internet connection.");
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      throw new Error((data && data.error) || (res.status === 404
        ? "AI notes only work on the live website."
        : `Something went wrong (${res.status}).`));
    }
    return data;
  }

  // ---------- Chapter list ----------
  let chapters = [];

  // Open Library sometimes has the table of contents for an exact edition.
  async function openLibraryChapters() {
    if (!book.isbn) return [];
    try {
      const res = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(book.isbn)}.json`);
      if (!res.ok) return [];
      const toc = (await res.json()).table_of_contents || [];
      const top = toc.filter((t) => t.title && !(t.level > 0));
      const list = (top.length >= 3 ? top : toc.filter((t) => t.title)).map((t, i) => ({
        number: String(t.label || "").replace(/^chapter\s*/i, "").trim() || String(i + 1),
        title: String(t.title).trim(),
      }));
      return list.length >= 3 ? list : [];
    } catch {
      return [];
    }
  }

  function fillChapterSelect(note) {
    const sel = $("chapterSelect");
    if (!chapters.length) {
      sel.innerHTML = `<option value="">No chapter list – type one in below</option>`;
      sel.disabled = true;
      $("notesBtn").disabled = true;
      $("manualBox").open = true;
    } else {
      sel.innerHTML =
        `<option value="">Choose a chapter…</option>` +
        chapters.map((ch, i) => `<option value="${i}">${esc(chapterLabel(ch))}${myNotes()[chapterKey(ch)] ? " ✓" : ""}</option>`).join("");
      sel.disabled = false;
    }
    $("chapterNote").textContent = note || "";
  }

  async function loadChapters(force) {
    const cached = chapterStore[storeKey];
    if (cached && !force) {
      chapters = cached.chapters;
      return fillChapterSelect(cached.note);
    }
    $("chapterSelect").innerHTML = `<option>Loading chapters…</option>`;
    $("chapterSelect").disabled = true;

    let note = "";
    let list = await openLibraryChapters();
    if (list.length) {
      note = "Chapter list from Open Library for this edition.";
    } else {
      try {
        const data = await study({ action: "chapters" });
        list = data.recognized ? data.chapters || [] : [];
        note = data.note || "";
      } catch (err) {
        note = err.message;
      }
    }
    chapters = list;
    if (list.length) chapterStore[storeKey] = { chapters: list, note };
    save("cac.chapters", chapterStore);
    fillChapterSelect(note);
  }

  $("chapterSelect").onchange = () => {
    const ch = chapters[$("chapterSelect").value];
    $("notesBtn").disabled = !ch;
    if (!ch) return;
    const saved = myNotes()[chapterKey(ch)];
    $("notesBtn").textContent = saved ? "Show notes" : "Get notes";
    if (saved) showNotes(ch, saved);
  };
  $("notesBtn").onclick = () => {
    const ch = chapters[$("chapterSelect").value];
    if (ch) getNotes(ch);
  };
  $("manualForm").onsubmit = (ev) => {
    ev.preventDefault();
    let ch = { number: $("manualNum").value.trim(), title: $("manualTitle").value.trim() };
    if (!ch.number && !ch.title) return $("manualNum").focus();
    // A number that's already in the chapter list (with no title typed) means that chapter.
    const listed = !ch.title && chapters.find((c) => c.number.toLowerCase() === ch.number.toLowerCase());
    if (listed) ch = listed;
    getNotes(ch);
  };

  // ---------- Notes ----------
  async function getNotes(ch, rewrite) {
    const saved = myNotes()[chapterKey(ch)];
    if (saved && !rewrite) return showNotes(ch, saved);

    $("notes").innerHTML = `<div class="notes-loading">
      <div class="spinner" aria-hidden="true"></div>
      <p><strong>Writing notes for ${esc(chapterLabel(ch))}…</strong><br>This usually takes 15–45 seconds.</p>
    </div>`;
    setBusy(true);
    try {
      const notes = await study({ action: "summary", chapter: ch });
      notes.savedAt = new Date().toISOString();
      myNotes()[chapterKey(ch)] = { ...notes, chapter: ch };
      save("cac.notes", notesStore);
      showNotes(ch, myNotes()[chapterKey(ch)]);
      renderSaved();
      fillChapterSelect($("chapterNote").textContent);
      const i = chapters.findIndex((c) => chapterKey(c) === chapterKey(ch));
      if (i >= 0) $("chapterSelect").value = String(i);
    } catch (err) {
      $("notes").innerHTML = `<p class="notes-error">${esc(err.message)}</p>`;
    } finally {
      setBusy(false);
    }
  }

  function setBusy(busy) {
    document.querySelectorAll("#notesBtn, #manualForm button, #chapterSelect").forEach((el) => {
      if (el.id === "chapterSelect" && !chapters.length) return;
      if (el.id === "notesBtn" && !busy && !chapters[$("chapterSelect").value]) return;
      el.disabled = busy;
    });
  }

  function showNotes(ch, n) {
    const confidence = { high: "Strong match", medium: "Likely match", low: "Rough guess" }[n.confidence] || "";
    $("notes").innerHTML = `
      <article class="notes-card">
        <header class="notes-head">
          <div>
            <p class="eyebrow">${esc(ch.number ? `Chapter ${ch.number}` : "Chapter")}</p>
            <h3>${esc(n.chapter_title || ch.title || "")}</h3>
          </div>
          ${confidence ? `<span class="conf conf-${esc(n.confidence)}">${confidence}</span>` : ""}
        </header>
        ${n.caveat ? `<p class="caveat">${esc(n.caveat)}</p>` : ""}
        <p class="overview">${esc(n.overview)}</p>

        <h4>Key concepts</h4>
        <ol class="concepts">
          ${(n.key_concepts || []).map((k) => `<li><strong>${esc(k.name)}</strong><p>${esc(k.explanation)}</p></li>`).join("")}
        </ol>

        ${(n.key_terms || []).length ? `<h4>Key terms</h4>
        <dl class="terms">
          ${n.key_terms.map((t) => `<div><dt>${esc(t.term)}</dt><dd>${esc(t.definition)}</dd></div>`).join("")}
        </dl>` : ""}

        ${(n.takeaways || []).length ? `<h4>Remember for the test</h4>
        <ul class="takeaways">${n.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}

        <footer class="notes-foot">
          <span>Written by AI from its general knowledge of this book, not your copy. Check anything important against your textbook.</span>
          <button class="link-btn" id="rewriteBtn">Rewrite these notes</button>
        </footer>
      </article>`;
    $("rewriteBtn").onclick = () => getNotes(ch, true);
  }

  function renderSaved() {
    const entries = Object.values(myNotes());
    $("savedList").innerHTML = entries.length
      ? entries
          .sort((a, b) => String(a.chapter.number).localeCompare(String(b.chapter.number), undefined, { numeric: true }))
          .map((n, i) => `<li><button class="saved-btn" data-i="${i}">${esc(chapterLabel(n.chapter))}</button></li>`)
          .join("")
      : `<li class="muted">Notes you get will be saved here.</li>`;
    $("savedList").querySelectorAll(".saved-btn").forEach((btn) => {
      const n = entries[btn.dataset.i];
      btn.onclick = () => {
        showNotes(n.chapter, n);
        const i = chapters.findIndex((c) => chapterKey(c) === chapterKey(n.chapter));
        $("chapterSelect").value = i >= 0 ? String(i) : "";
        $("notes").scrollIntoView({ behavior: "smooth", block: "start" });
      };
    });
  }

  renderSaved();
  loadChapters(false);
})();
