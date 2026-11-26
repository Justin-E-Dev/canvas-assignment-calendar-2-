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

  // ---------- Asking Claude through your own (free) Claude.ai chat ----------
  // The page writes the request, you send it in Claude.ai, then paste the answer back here.
  const bookDescription = () =>
    [
      `Title: ${book.title}`,
      (book.authors || []).length && `Author(s): ${book.authors.join(", ")}`,
      book.year && `Year: ${book.year}`,
      book.isbn && `ISBN: ${book.isbn}`,
      `I'm using it for my class: ${course}`,
    ].filter(Boolean).join("\n");

  function notesPrompt(ch) {
    return `I'm a college student studying from this textbook:
${bookDescription()}

Please write quick-review study notes for ${chapterLabel(ch)}, covering its most important concepts. Explain ideas in plain language, in your own words. If you're not sure what this exact chapter covers in this edition, base the notes on what it most likely covers and say so in "caveat".

Reply with ONLY a JSON code block in exactly this format (no other text):
\`\`\`json
{
  "chapter_title": "the chapter's title",
  "overview": "2-4 sentences: what the chapter is about and why it matters",
  "key_concepts": [{ "name": "concept", "explanation": "2-4 plain sentences, with a quick example where it helps" }],
  "key_terms": [{ "term": "word", "definition": "short definition" }],
  "takeaways": ["one-line thing to remember for a test"],
  "confidence": "high, medium or low: how sure you are this matches this book's actual chapter",
  "caveat": "empty if confidence is high, otherwise one sentence on what may not match"
}
\`\`\`
Include 4-8 key concepts (most important first), 5-12 key terms and 3-5 takeaways.`;
  }

  function chaptersPrompt() {
    return `I'm a college student using this textbook:
${bookDescription()}

Please list its chapters in order (main chapters only, not sections), one per line, in exactly this format and nothing else:
1: Chapter title
2: Chapter title

If several editions exist, use the one matching the year/ISBN. If you don't know this specific book, say so instead of guessing.`;
  }

  // Shows the two steps (send the request in Claude.ai, paste the answer back) in a box.
  // onAnswer(text) returns an error message, or "" when the answer was used.
  function askInClaude(box, { heading, prompt, pasteLabel, onAnswer }) {
    const url = `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
    box.innerHTML = `
      <div class="ask">
        <p class="ask-heading">${esc(heading)}</p>
        <ol class="ask-steps">
          <li>
            <strong>Ask Claude.</strong> This copies the request and opens Claude.ai in a new tab (free with your Claude account).
            If the message box there is empty, paste it in (Ctrl+V, or ⌘V on a Mac) and send it.
            <div class="ask-row">
              <button class="btn ask-open" type="button">Copy &amp; open Claude</button>
              <button class="link-btn ask-show" type="button">Show the request</button>
            </div>
            <textarea class="ask-prompt hidden" readonly rows="8"></textarea>
          </li>
          <li>
            <strong>Paste the answer here.</strong> When Claude finishes, use the copy button under its reply (or on the code box), then paste it below.
            <textarea class="ask-answer" rows="6" placeholder="${esc(pasteLabel)}"></textarea>
            <div class="ask-row">
              <button class="btn ask-save" type="button">Save</button>
              <button class="link-btn ask-cancel" type="button">Cancel</button>
            </div>
            <p class="ask-msg"></p>
          </li>
        </ol>
      </div>`;
    const q = (sel) => box.querySelector(sel);
    q(".ask-prompt").value = prompt;
    q(".ask-open").onclick = () => {
      window.open(url, "_blank", "noopener");
      copyText(prompt, q(".ask-prompt"));
      q(".ask-open").textContent = "Copied! Open Claude again";
    };
    q(".ask-show").onclick = () => q(".ask-prompt").classList.toggle("hidden");
    q(".ask-cancel").onclick = () => (box.innerHTML = "");
    q(".ask-save").onclick = () => {
      const text = q(".ask-answer").value.trim();
      const msg = q(".ask-msg");
      if (!text) {
        msg.textContent = "Paste Claude's answer in the box first.";
        return;
      }
      const error = onAnswer(text);
      msg.textContent = error || "";
    };
  }

  // Copy to the clipboard; older or locked-down browsers get the select-and-copy fallback.
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

  // Pull the notes out of whatever was pasted (a JSON code block, or JSON with extra text around it).
  function parseNotes(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    let body = fenced ? fenced[1] : text;
    const start = body.indexOf("{"), end = body.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    let n;
    try {
      n = JSON.parse(body.slice(start, end + 1));
    } catch {
      return null;
    }
    const str = (v) => (typeof v === "string" ? v : "");
    const list = (v) => (Array.isArray(v) ? v : []);
    const notes = {
      chapter_title: str(n.chapter_title),
      overview: str(n.overview),
      key_concepts: list(n.key_concepts).filter((k) => k && (k.name || k.explanation)).map((k) => ({ name: str(k.name), explanation: str(k.explanation) })),
      key_terms: list(n.key_terms).filter((t) => t && t.term).map((t) => ({ term: str(t.term), definition: str(t.definition) })),
      takeaways: list(n.takeaways).map(str).filter(Boolean),
      confidence: ["high", "medium", "low"].includes(n.confidence) ? n.confidence : "",
      caveat: str(n.caveat),
    };
    return notes.overview || notes.key_concepts.length ? notes : null;
  }

  // "1: Title", "Chapter 1. Title", "1) Title", "- 1 – Title" ...
  function parseChapterLines(text) {
    const out = [];
    for (const raw of text.replace(/```[a-z]*/gi, "").split("\n")) {
      const m = raw.replace(/^[\s*•-]+/, "").replace(/\*\*/g, "").match(/^(?:chapter\s+)?([0-9]{1,3}|[ivxlc]{1,6}|[A-Z])\s*[:.)\-–—]\s*(.+)$/i);
      if (m && m[2].trim()) out.push({ number: m[1], title: m[2].trim() });
    }
    return out;
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
      sel.innerHTML = `<option value="">No chapter list yet</option>`;
      sel.disabled = true;
      $("notesBtn").disabled = true;
      $("manualBox").open = true;
    } else {
      sel.innerHTML =
        `<option value="">Choose a chapter…</option>` +
        chapters.map((ch, i) => `<option value="${i}">${esc(chapterLabel(ch))}${myNotes()[chapterKey(ch)] ? " ✓" : ""}</option>`).join("");
      sel.disabled = false;
    }
    $("chapterNote").innerHTML = esc(note || "") +
      ` <button class="link-btn" id="askChaptersBtn" type="button">${chapters.length ? "Get a different chapter list from Claude" : "Get the chapter list from Claude"}</button>`;
    $("askChaptersBtn").onclick = askForChapters;
  }

  function askForChapters() {
    askInClaude($("chapterHelp"), {
      heading: "Get this book's chapter list",
      prompt: chaptersPrompt(),
      pasteLabel: "Paste the chapter list here, e.g.\n1: Introduction\n2: …",
      onAnswer(text) {
        const list = parseChapterLines(text);
        if (list.length < 2) return "Couldn't find a chapter list in that. It should have one chapter per line, like \"1: Title\".";
        chapters = list;
        const note = "Chapter list from Claude. It may not match your edition exactly.";
        chapterStore[storeKey] = { chapters, note };
        save("cac.chapters", chapterStore);
        $("chapterHelp").innerHTML = "";
        fillChapterSelect(note);
        return "";
      },
    });
    $("chapterHelp").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function loadChapters() {
    const cached = chapterStore[storeKey];
    if (cached) {
      chapters = cached.chapters;
      return fillChapterSelect(cached.note);
    }
    $("chapterSelect").innerHTML = `<option>Loading chapters…</option>`;
    $("chapterSelect").disabled = true;
    const list = await openLibraryChapters();
    chapters = list;
    if (list.length) {
      const note = "Chapter list from Open Library for this edition.";
      chapterStore[storeKey] = { chapters: list, note };
      save("cac.chapters", chapterStore);
      fillChapterSelect(note);
    } else {
      fillChapterSelect("No chapter list found online. Type a chapter in below, or");
    }
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
  function getNotes(ch, rewrite) {
    const saved = myNotes()[chapterKey(ch)];
    if (saved && !rewrite) return showNotes(ch, saved);

    askInClaude($("notes"), {
      heading: `Notes for ${chapterLabel(ch)}`,
      prompt: notesPrompt(ch),
      pasteLabel: "Paste Claude's answer here (the part starting with { … })",
      onAnswer(text) {
        const notes = parseNotes(text);
        if (!notes) return "That doesn't look like the notes. Make sure you copied Claude's whole answer, including the { and } at the start and end.";
        notes.savedAt = new Date().toISOString();
        myNotes()[chapterKey(ch)] = { ...notes, chapter: ch };
        save("cac.notes", notesStore);
        showNotes(ch, myNotes()[chapterKey(ch)]);
        renderSaved();
        fillChapterSelect(chapterStore[storeKey] ? chapterStore[storeKey].note : "");
        const i = chapters.findIndex((c) => chapterKey(c) === chapterKey(ch));
        if (i >= 0) $("chapterSelect").value = String(i);
        return "";
      },
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
          <span>Written by Claude from its general knowledge of this book, not your copy. Check anything important against your textbook.</span>
          <button class="link-btn" id="rewriteBtn">Get new notes</button>
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
  loadChapters();
})();
