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

  // ---------- Book notes (one set of notes for the whole book) ----------
  // { coverage, coverageNote, chapters: [{ number, title, overview, sections: [{ number, title, summary }], terms: [{ term, definition }] }], savedAt }
  const storeKey = `${course}::${bookId}`;
  const notesStore = load("cac.bookNotes", {});

  // ---------- The request sent to Claude ----------
  function notesPrompt() {
    const details = [
      `Title: ${book.title}`,
      (book.authors || []).length && `Author(s): ${book.authors.join(", ")}`,
      book.year && `Year: ${book.year}`,
      book.isbn && `ISBN: ${book.isbn}`,
      `My class: ${course}`,
    ].filter(Boolean).join("\n");

    return `I'm a college student using this textbook:
${details}

Please search the web for this book's table of contents and for what each chapter covers (publisher pages, previews, course syllabi, study guides). Then write study notes for the WHOLE book: every chapter, and the main sections inside each chapter, summarizing roughly what each one covers. Use your own words; it's fine if it isn't perfectly accurate. If you can't find much about this specific book, say so on the COVERAGE lines, then still write your best version based on what a book like this usually covers.

Reply in plain text using exactly this format (no code block, no other text):

COVERAGE: good, partial or limited
COVERAGE NOTE: one or two sentences on what you found online and how accurate these notes are likely to be

## Chapter 1: Chapter title
OVERVIEW: 2-3 sentences on what the chapter is about
### 1.1 Section title
2-4 sentences summarizing the section.
### 1.2 Section title
2-4 sentences summarizing the section.
KEY TERMS: term - short definition; term - short definition; term - short definition

## Chapter 2: Chapter title
(and so on for every chapter)

If you run out of room, stop at the end of a chapter and write "CONTINUE" on the last line; I'll ask you to keep going.`;
  }

  // ---------- Reading Claude's answer ----------
  const clean = (s) => s.replace(/\*\*|__/g, "").replace(/^[\s>*•-]+/, "").trim();

  function splitTerm(t) {
    const m = t.match(/^(.+?)\s+[-–—:]\s+(.+)$/) || t.match(/^(.+?):\s*(.+)$/);
    return m ? { term: m[1].trim(), definition: m[2].trim() } : { term: t.trim(), definition: "" };
  }

  function parseBookNotes(text) {
    const out = { coverage: "", coverageNote: "", chapters: [] };
    let chapter = null, section = null;
    for (const raw of text.replace(/\r/g, "").split("\n")) {
      const line = raw.trim();
      if (!line || /^`{3}/.test(line) || /^CONTINUE\.?$/i.test(clean(line))) continue;
      const plain = clean(line.replace(/^#+\s*/, ""));
      let m;

      if ((m = plain.match(/^COVERAGE NOTE:\s*(.*)$/i))) { out.coverageNote = m[1]; continue; }
      if ((m = plain.match(/^COVERAGE:\s*(\w+)/i))) { out.coverage = m[1].toLowerCase(); continue; }

      // "## Chapter 3: Title" (also "Chapter 3 - Title", "Part II: Title")
      if (/^##(?!#)/.test(line) || /^(chapter|part|unit)\s+[\w.]+\s*[:.\-–—]/i.test(plain)) {
        m = plain.match(/^(?:(?:chapter|part|unit)\s+(\w+)|([0-9]{1,3}))\s*[:.\-–—]?\s*(.*)$/i);
        chapter = {
          number: (m && (m[1] || m[2])) || String(out.chapters.length + 1),
          title: (m && m[3]) || plain,
          overview: "", sections: [], terms: [],
        };
        out.chapters.push(chapter);
        section = null;
        continue;
      }
      if (!chapter) continue; // text before the first chapter (greetings etc.)

      // "### 3.2 Title"
      if (/^###/.test(line)) {
        m = plain.match(/^([0-9]+(?:\.[0-9]+)*)\s*[:.\-–—]?\s*(.*)$/);
        section = { number: m ? m[1] : "", title: m ? m[2] || m[1] : plain, summary: "" };
        chapter.sections.push(section);
        continue;
      }
      if ((m = plain.match(/^OVERVIEW:\s*(.*)$/i))) { chapter.overview = m[1]; section = null; continue; }
      if ((m = plain.match(/^KEY TERMS?:\s*(.*)$/i))) {
        chapter.terms.push(...m[1].split(/;\s*/).filter((t) => t.trim()).map(splitTerm));
        section = null;
        continue;
      }
      // Any other text belongs to the current section, or else the chapter overview.
      if (section) section.summary += (section.summary ? " " : "") + plain;
      else chapter.overview += (chapter.overview ? " " : "") + plain;
    }
    if (!["good", "partial", "limited"].includes(out.coverage)) out.coverage = "";
    return out.chapters.length ? out : null;
  }

  // Adding a "continue" answer: chapters with the same number are replaced, new ones are added.
  function mergeNotes(old, add) {
    const chapters = [...old.chapters];
    for (const ch of add.chapters) {
      const i = chapters.findIndex((c) => c.number.toLowerCase() === ch.number.toLowerCase());
      if (i >= 0) chapters[i] = ch;
      else chapters.push(ch);
    }
    return { ...old, chapters, coverage: add.coverage || old.coverage, coverageNote: add.coverageNote || old.coverageNote };
  }

  // ---------- Copy helper ----------
  function copyText(text, textarea) {
    const fallback = () => {
      const wasHidden = textarea.classList.contains("hidden");
      textarea.classList.remove("hidden");
      textarea.select();
      try {
        document.execCommand("copy");
      } catch {
        /* the user can still copy it by hand from the box */
      }
      if (wasHidden) textarea.classList.add("hidden");
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).catch(fallback);
    else fallback();
  }

  // ---------- The "ask Claude" box ----------
  // mode "new": replace any notes; mode "more": add chapters to the saved notes.
  function showAsk(mode) {
    const prompt = mode === "more"
      ? "Please continue the notes from where you stopped, in exactly the same format (start with the next chapter's ## line)."
      : notesPrompt();
    const box = $("ask");
    box.innerHTML = `
      <div class="ask">
        <p class="ask-heading">${mode === "more" ? "Add more chapters" : "Get notes for this book"}</p>
        <ol class="ask-steps">
          <li>
            <strong>Ask Claude.</strong> ${mode === "more"
              ? "Go back to the same Claude chat and send this (it's copied for you):"
              : "This copies the request and opens Claude.ai in a new tab. Claude will search the web, then write notes for every chapter. If the message box is empty, paste (Ctrl+V, or ⌘V on a Mac) and send it."}
            <div class="ask-row">
              <button class="btn ask-open" type="button">${mode === "more" ? "Copy the request" : "Copy &amp; open Claude"}</button>
              <button class="link-btn ask-show" type="button">Show the request</button>
            </div>
            <textarea class="ask-prompt hidden" readonly rows="8"></textarea>
          </li>
          <li>
            <strong>Paste the answer here.</strong> When Claude finishes, click the copy button under its reply and paste it below.
            If Claude ended with "CONTINUE", save this part, then use <em>Add more chapters</em> for the rest.
            <textarea class="ask-answer" rows="7" placeholder="Paste Claude's whole answer here"></textarea>
            <div class="ask-row">
              <button class="btn ask-save" type="button">Save notes</button>
              <button class="link-btn ask-cancel" type="button">Cancel</button>
            </div>
            <p class="ask-msg"></p>
          </li>
        </ol>
      </div>`;
    const q = (sel) => box.querySelector(sel);
    q(".ask-prompt").value = prompt;
    q(".ask-open").onclick = () => {
      if (mode !== "more") window.open(`https://claude.ai/new?q=${encodeURIComponent(prompt)}`, "_blank", "noopener");
      copyText(prompt, q(".ask-prompt"));
      q(".ask-open").textContent = mode === "more" ? "Copied!" : "Copied! Open Claude again";
    };
    q(".ask-show").onclick = () => q(".ask-prompt").classList.toggle("hidden");
    q(".ask-cancel").onclick = () => {
      box.innerHTML = "";
      render();
    };
    q(".ask-save").onclick = () => {
      const text = q(".ask-answer").value.trim();
      if (!text) return (q(".ask-msg").textContent = "Paste Claude's answer in the box first.");
      const parsed = parseBookNotes(text);
      if (!parsed) {
        q(".ask-msg").textContent = "Couldn't find any chapters in that. Make sure you copied Claude's whole answer (it should have lines starting with \"## Chapter\").";
        return;
      }
      const old = notesStore[storeKey];
      notesStore[storeKey] = { ...(mode === "more" && old ? mergeNotes(old, parsed) : parsed), savedAt: new Date().toISOString() };
      save("cac.bookNotes", notesStore);
      box.innerHTML = "";
      render();
    };
    $("notes").classList.toggle("hidden", mode !== "more");
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- Showing the notes ----------
  const COVERAGE = {
    good: ["Good coverage", "Claude found solid information about this book."],
    partial: ["Partial coverage", "Some of this is based on what Claude found, some is its best guess."],
    limited: ["Limited coverage", "Claude couldn't find much about this exact book, so most of this is its best guess."],
  };

  function render() {
    const n = notesStore[storeKey];
    const has = n && n.chapters && n.chapters.length;
    $("notesTools").classList.toggle("hidden", !has);
    $("notes").classList.remove("hidden");
    $("tocPanel").classList.toggle("hidden", !has);

    if (!has) {
      $("notes").innerHTML = `<div class="empty-notes">
          <p>No notes for this book yet. Claude will look the book up online and summarize every chapter and section for you to scroll through.</p>
          <button class="btn" id="startBtn" type="button">Get notes for this book</button>
        </div>`;
      $("startBtn").onclick = () => showAsk("new");
      $("toc").innerHTML = "";
      return;
    }

    const [label, fallbackNote] = COVERAGE[n.coverage] || ["", ""];
    const note = n.coverageNote || fallbackNote;
    const chapterId = (i) => `ch-${i + 1}`;
    $("notes").innerHTML = `
      ${label || note ? `<div class="coverage coverage-${esc(n.coverage || "none")}">
        ${label ? `<strong>${esc(label)}</strong>` : ""}${note ? `<span>${esc(note)}</span>` : ""}
      </div>` : ""}
      ${n.chapters.map((ch, i) => `
        <article class="chapter" id="${chapterId(i)}">
          <header>
            <span class="chapter-num">${esc(ch.number)}</span>
            <h3>${esc(ch.title)}</h3>
          </header>
          ${ch.overview ? `<p class="overview">${esc(ch.overview)}</p>` : ""}
          ${ch.sections.length ? `<div class="sections">${ch.sections.map((s) => `
            <section class="section">
              <h4>${s.number ? `<span>${esc(s.number)}</span>` : ""}${esc(s.title)}</h4>
              ${s.summary ? `<p>${esc(s.summary)}</p>` : ""}
            </section>`).join("")}</div>` : ""}
          ${ch.terms.length ? `<p class="terms-label">Key terms</p>
          <dl class="terms">${ch.terms.map((t) => `<div><dt>${esc(t.term)}</dt>${t.definition ? `<dd>${esc(t.definition)}</dd>` : ""}</div>`).join("")}</dl>` : ""}
        </article>`).join("")}
      <p class="notes-foot">Written by Claude from what it found online and its general knowledge, not from your copy of the book. Check anything important against your textbook.</p>`;

    $("toc").innerHTML = n.chapters
      .map((ch, i) => `<li><a href="#${chapterId(i)}"><span>${esc(ch.number)}</span>${esc(ch.title)}</a></li>`)
      .join("");
    $("savedInfo").textContent = `${n.chapters.length} chapters · saved ${new Date(n.savedAt).toLocaleDateString()}`;
  }

  $("moreBtn").onclick = () => showAsk("more");
  $("redoBtn").onclick = () => showAsk("new");
  render();
})();
