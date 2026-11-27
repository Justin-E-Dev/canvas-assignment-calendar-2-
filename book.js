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


  // ---------- Book notes ----------
  // Notes live in the site itself: notes/index.json says which books have notes,
  // and each chapter is a Markdown file. Pick a chapter number to load its notes.

  // Does this saved book match a book in the notes index? (ISBN first, then title + author)
  function findNotes(index) {
    const isbn = String(book.isbn || "").replace(/[^0-9X]/gi, "");
    const title = book.title.toLowerCase();
    const authors = (book.authors || []).join(" ").toLowerCase();
    return index.books.find((b) =>
      (isbn && b.isbns.includes(isbn)) ||
      (title.includes(b.match.title) && authors.includes(b.match.author)));
  }

  // A small Markdown reader: headings, paragraphs, bullet lists (2 levels), bold, italic, code.
  function inline(text) {
    // Code spans are set aside first, so symbols inside them (like * wildcards) stay as typed.
    const codes = [];
    const marked = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    return esc(marked)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[i])}</code>`);
  }

  function renderMarkdown(md) {
    const html = [];
    const sections = [];
    let para = [];
    let list = null; // [{ text, sub: [] }], with list.ordered = true for numbered lists

    const flushPara = () => {
      if (para.length) html.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    };
    const flushList = () => {
      if (!list) return;
      const tag = list.ordered ? "ol" : "ul";
      html.push(`<${tag}>${list.map((it) => `<li>${inline(it.text)}${it.sub.length
        ? `<${it.subOrdered ? "ol" : "ul"}>${it.sub.map((x) => `<li>${inline(x)}</li>`).join("")}</${it.subOrdered ? "ol" : "ul"}>`
        : ""}</li>`).join("")}</${tag}>`);
      list = null;
    };
    const flush = () => { flushPara(); flushList(); };

    for (const raw of md.replace(/\r/g, "").split("\n")) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flush(); continue; }
      if ((m = line.match(/^#\s+(.*)/))) { flush(); continue; } // chapter title is shown separately
      if ((m = line.match(/^##\s+(.*)/))) {
        flush();
        const id = `sec-${sections.length + 1}`;
        const sm = m[1].match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
        sections.push({ id, number: sm ? sm[1] : "", title: sm ? sm[2] : m[1] });
        html.push(`</section><section class="note-section" id="${id}"><h3>${sm ? `<span>${esc(sm[1])}</span>` : ""}${inline(sm ? sm[2] : m[1])}</h3>`);
        continue;
      }
      if ((m = line.match(/^###\s+(.*)/))) { flush(); html.push(`<h4>${inline(m[1])}</h4>`); continue; }
      // Nested item ("  - x" or "  1. x") under the current list item.
      if ((m = line.match(/^\s{2,}(?:([-*])|\d+\.)\s+(.*)/)) && list) {
        const item = list[list.length - 1];
        item.sub.push(m[2]);
        item.subOrdered = !m[1];
        continue;
      }
      // Top-level item ("- x" or "1. x"); a switch between bullets and numbers starts a new list.
      if ((m = line.match(/^(?:([-*])|\d+\.)\s+(.*)/))) {
        flushPara();
        const ordered = !m[1];
        if (list && list.ordered !== ordered) flushList();
        if (!list) { list = []; list.ordered = ordered; }
        list.push({ text: m[2], sub: [] });
        continue;
      }
      if (list && /^\s{2,}\S/.test(raw)) { list[list.length - 1].text += " " + line.trim(); continue; }
      flushList();
      para.push(line.trim());
    }
    flush();
    return { html: `<section class="note-section intro">${html.join("")}</section>`, sections };
  }

  // ---------- Study tools: key concepts, flashcards, practice quiz ----------
  // Each chapter can have a "<chapter>.study.json" file next to its notes.

  const quizScores = load("cac.quizScores", {}); // { "<book id>:<chapter>": { score, total, date } }

  function shuffled(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function keyConceptsHtml(study) {
    return `<section class="study-block" id="key-concepts">
      <h3 class="study-title">Key Concepts</h3>
      <div class="concept-grid">
        ${study.keyConcepts.map((k, i) => `<article class="concept-card">
          <span class="concept-num">${i + 1}</span>
          <div><h4>${inline(k.title)}</h4><p>${inline(k.text)}</p></div>
        </article>`).join("")}
      </div>
    </section>`;
  }

  // Flashcards: one card at a time; click (or Space) to flip, arrows to move.
  function setupFlashcards(root, cards) {
    let order = cards.map((_, i) => i);
    let pos = 0;
    let flipped = false;
    const card = root.querySelector(".flashcard");
    const show = () => {
      const c = cards[order[pos]];
      flipped = false;
      card.classList.remove("flipped");
      root.querySelector(".fc-front").innerHTML = inline(c.front);
      root.querySelector(".fc-back").innerHTML = inline(c.back);
      root.querySelector(".fc-count").textContent = `${pos + 1} / ${cards.length}`;
      root.querySelector(".fc-prev").disabled = pos === 0;
      root.querySelector(".fc-next").disabled = pos === cards.length - 1;
      card.setAttribute("aria-label", `Card ${pos + 1}: ${c.front}. Press to show the answer.`);
    };
    const flip = () => {
      flipped = !flipped;
      card.classList.toggle("flipped", flipped);
    };
    card.onclick = flip;
    card.onkeydown = (ev) => {
      if (ev.key === " " || ev.key === "Enter") { ev.preventDefault(); flip(); }
      if (ev.key === "ArrowRight" && pos < cards.length - 1) { pos++; show(); }
      if (ev.key === "ArrowLeft" && pos > 0) { pos--; show(); }
    };
    root.querySelector(".fc-prev").onclick = () => { if (pos > 0) { pos--; show(); } };
    root.querySelector(".fc-next").onclick = () => { if (pos < cards.length - 1) { pos++; show(); } };
    root.querySelector(".fc-shuffle").onclick = () => { order = shuffled(order); pos = 0; show(); };
    show();
  }

  function flashcardsHtml(study) {
    return `<section class="study-block" id="flashcards">
      <h3 class="study-title">Flashcards</h3>
      <p class="study-sub">Click the card (or press Space) to flip it. Use the arrows to move between cards.</p>
      <div class="fc-wrap">
        <div class="flashcard" tabindex="0" role="button">
          <div class="fc-face fc-front"></div>
          <div class="fc-face fc-back"></div>
        </div>
        <div class="fc-controls">
          <button class="btn btn-ghost fc-prev" type="button" aria-label="Previous card">&larr;</button>
          <span class="fc-count"></span>
          <button class="btn btn-ghost fc-next" type="button" aria-label="Next card">&rarr;</button>
          <button class="link-btn fc-shuffle" type="button">Shuffle</button>
        </div>
      </div>
    </section>`;
  }

  // Practice quiz: answer each question to see if you're right and why; score at the end.
  function setupQuiz(root, questions, scoreKey) {
    const render = () => {
      const qs = shuffled(questions).map((q) => {
        const opts = shuffled(q.options.map((text, i) => ({ text, correct: i === q.answer })));
        return { ...q, opts };
      });
      let answered = 0, correct = 0;
      const best = quizScores[scoreKey];
      root.querySelector(".quiz-list").innerHTML = qs.map((q, qi) => `
        <li class="quiz-q" data-q="${qi}">
          <p class="quiz-question"><span>${qi + 1}.</span> ${inline(q.q)}</p>
          <div class="quiz-options">
            ${q.opts.map((o, oi) => `<button class="quiz-opt" type="button" data-o="${oi}">
              <span class="quiz-letter">${"ABCD"[oi]}</span><span>${inline(o.text)}</span></button>`).join("")}
          </div>
          <p class="quiz-feedback" hidden></p>
        </li>`).join("");
      const scoreEl = root.querySelector(".quiz-score");
      const updateScore = () => {
        scoreEl.innerHTML = answered < qs.length
          ? `Answered ${answered} of ${qs.length} · ${correct} correct${best ? ` · Last time: ${best.score}/${best.total}` : ""}`
          : `<strong>Score: ${correct} / ${qs.length} (${Math.round((correct / qs.length) * 100)}%)</strong> · ${
              correct === qs.length ? "Perfect!" : correct / qs.length >= 0.8 ? "Great job!" : correct / qs.length >= 0.6 ? "Good. Review the ones you missed." : "Keep studying and try again."}`;
      };
      updateScore();
      root.querySelectorAll(".quiz-q").forEach((li) => {
        const q = qs[li.dataset.q];
        li.querySelectorAll(".quiz-opt").forEach((btn) => {
          btn.onclick = () => {
            const pick = q.opts[btn.dataset.o];
            li.querySelectorAll(".quiz-opt").forEach((b) => {
              b.disabled = true;
              if (q.opts[b.dataset.o].correct) b.classList.add("right");
            });
            if (!pick.correct) btn.classList.add("wrong");
            const fb = li.querySelector(".quiz-feedback");
            fb.hidden = false;
            fb.className = `quiz-feedback ${pick.correct ? "ok" : "no"}`;
            fb.innerHTML = `<strong>${pick.correct ? "Correct!" : "Not quite."}</strong> ${inline(q.explain)}`;
            answered++;
            if (pick.correct) correct++;
            if (answered === qs.length) {
              quizScores[scoreKey] = { score: correct, total: qs.length, date: new Date().toISOString() };
              save("cac.quizScores", quizScores);
            }
            updateScore();
          };
        });
      });
    };
    root.querySelector(".quiz-retake").onclick = () => {
      render();
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    render();
  }

  function quizHtml(study) {
    return `<section class="study-block" id="quiz">
      <h3 class="study-title">Practice Quiz</h3>
      <p class="study-sub">${study.quiz.length} multiple-choice questions. Pick an answer to see if you're right and why. Questions and answers are shuffled each time.</p>
      <ol class="quiz-list"></ol>
      <div class="quiz-bottom">
        <p class="quiz-score"></p>
        <button class="btn quiz-retake" type="button">Retake quiz</button>
      </div>
    </section>`;
  }

  let entry = null;

  async function showChapter(i, scroll) {
    const ch = entry.chapters[i];
    if (!ch) return;
    document.querySelectorAll(".ch-btn").forEach((b, j) => b.classList.toggle("active", j === i));
    history.replaceState(null, "", `#chapter-${ch.number}`);
    $("notes").innerHTML = `<p class="muted">Loading Chapter ${esc(ch.number)}…</p>`;
    try {
      const studyFile = ch.file.replace(/\.md$/, ".study.json");
      const [res, studyRes] = await Promise.all([fetch(ch.file), fetch(studyFile).catch(() => null)]);
      if (!res.ok) throw new Error();
      const { html, sections } = renderMarkdown(await res.text());
      let study = null;
      try {
        if (studyRes && studyRes.ok) study = await studyRes.json();
      } catch {
        study = null; // notes still work without the study tools
      }
      const parts = study ? [
        ["key-concepts", "Key Concepts"], ["flashcards", "Flashcards"], ["quiz", "Practice Quiz"], ["full-notes", "Full Notes"],
      ] : [];
      $("notes").innerHTML = `
        <header class="chapter-head">
          <span class="chapter-num">${esc(ch.number)}</span>
          <div><p class="eyebrow">Chapter ${esc(ch.number)}</p><h3>${esc(ch.title)}</h3></div>
        </header>
        ${parts.length ? `<nav class="jump-bar" aria-label="Jump to">${parts.map(([id, label]) => `<a href="#${id}">${label}</a>`).join("")}</nav>` : ""}
        ${study ? keyConceptsHtml(study) + flashcardsHtml(study) + quizHtml(study) : ""}
        ${study ? `<h3 class="study-title full-notes-title" id="full-notes">Full Notes</h3>` : ""}
        ${html}
        <div class="chapter-nav">
          ${i > 0 ? `<button class="btn btn-ghost" data-go="${i - 1}">&larr; Chapter ${esc(entry.chapters[i - 1].number)}</button>` : "<span></span>"}
          ${i < entry.chapters.length - 1 ? `<button class="btn" data-go="${i + 1}">Chapter ${esc(entry.chapters[i + 1].number)} &rarr;</button>` : ""}
        </div>
        <p class="notes-foot">${esc(entry.source)}</p>`;
      $("notes").querySelectorAll("[data-go]").forEach((b) => (b.onclick = () => showChapter(Number(b.dataset.go), true)));
      if (study) {
        setupFlashcards($("flashcards"), study.flashcards);
        setupQuiz($("quiz"), study.quiz, `${entry.id}:${ch.number}`);
      }
      $("notes").querySelectorAll(".jump-bar a").forEach((a) => (a.onclick = (ev) => {
        ev.preventDefault();
        document.getElementById(a.getAttribute("href").slice(1)).scrollIntoView({ behavior: "smooth", block: "start" });
      }));
      const studyLinks = parts.slice(0, 3).map(([id, label]) => `<li><a href="#${id}"><span>★</span>${label}</a></li>`).join("");
      $("toc").innerHTML = studyLinks + sections
        .map((s) => `<li><a href="#${s.id}"><span>${esc(s.number)}</span>${esc(s.title)}</a></li>`)
        .join("");
      $("toc").querySelectorAll("a").forEach((a) => (a.onclick = (ev) => {
        ev.preventDefault();
        document.getElementById(a.getAttribute("href").slice(1)).scrollIntoView({ behavior: "smooth", block: "start" });
      }));
      $("tocTitle").textContent = `In Chapter ${ch.number}`;
      $("tocPanel").classList.remove("hidden");
      if (scroll) $("chapterBar").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      $("notes").innerHTML = `<p class="notes-error">Couldn't load this chapter's notes. Check your connection and try again.</p>`;
    }
  }

  async function start() {
    let index;
    try {
      const res = await fetch("notes/index.json", { cache: "no-cache" });
      index = await res.json();
    } catch {
      $("notes").innerHTML = `<p class="notes-error">Couldn't load the notes. Check your connection and refresh the page.</p>`;
      return;
    }
    entry = findNotes(index);
    if (!entry) {
      $("chapterBar").classList.add("hidden");
      $("notes").innerHTML = `<div class="empty-notes">
        <p><strong>No notes for this book yet.</strong></p>
        <p>To get them, ask Claude in a Claude Code chat for this website: “Add notes for ${esc(book.title)}”. Claude will look the book up and add notes for every chapter here.</p>
      </div>`;
      return;
    }
    $("edition").textContent = entry.edition;
    $("chapterButtons").innerHTML = entry.chapters
      .map((ch, i) => `<button class="ch-btn" type="button" data-i="${i}" title="${esc(ch.title)}">
          <span class="ch-btn-num">${esc(ch.number)}</span><span class="ch-btn-title">${esc(ch.title)}</span></button>`)
      .join("");
    $("chapterButtons").querySelectorAll(".ch-btn").forEach((b) => (b.onclick = () => showChapter(Number(b.dataset.i), false)));

    // Typing or pasting a #chapter-N address switches to that chapter.
    window.addEventListener("hashchange", () => {
      const n = (location.hash.match(/^#chapter-(.+)$/) || [])[1];
      const j = entry.chapters.findIndex((c) => c.number === n);
      if (j >= 0) showChapter(j, true);
    });
    const fromHash = (location.hash.match(/^#chapter-(.+)$/) || [])[1];
    const i = entry.chapters.findIndex((c) => c.number === fromHash);
    if (i >= 0) showChapter(i, false);
    else $("notes").innerHTML = `<p class="muted pick-hint">Pick a chapter above to read its notes.</p>`;
  }

  start();
})();
