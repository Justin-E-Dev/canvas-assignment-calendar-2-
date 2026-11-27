// Book dashboard: opened from a book in the Learning Center.
// URL: book.html?course=<class>&book=<ISBN or title>
// Layout: a one-screen dashboard. Notes, key concepts, flashcards and the quiz
// each sit in their own panel that scrolls on its own.

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

  const book = (load("cac.books", {})[course] || []).find((b) => (b.isbn || b.title) === bookId);
  if (!book) {
    $("missing").classList.remove("hidden");
    return;
  }

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

  const quizScores = load("cac.quizScores", {}); // { "<book id>:<chapter>": { score, total, date } }

  function shuffled(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
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
          ? `${answered}/${qs.length} answered · ${correct} correct${best ? ` · last ${best.score}/${best.total}` : ""}`
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
              updateStats();
            }
            updateScore();
          };
        });
      });
    };
    root.querySelector(".quiz-retake").onclick = () => {
      render();
      root.querySelector(".quiz-scroll").scrollTop = 0;
    };
    render();
  }


  // ---------- Header and book card ----------
  document.title = `${book.title} – Book Dashboard`;
  $("topCourse").textContent = course;
  $("topTitle").textContent = book.title;
  $("bookTitle").textContent = book.title;
  $("bookAuthors").textContent = (book.authors || []).join(", ");
  $("bookMeta").textContent = [book.year, book.isbn && `ISBN ${book.isbn}`].filter(Boolean).join(" · ");
  $("stats").classList.remove("hidden");
  $("panels").classList.remove("hidden");

  // ---------- Real cover image ----------
  // Tries Google Books (by ISBN, then by title + author), then Open Library, then the
  // cover saved when the book was added. If none loads, a plain book icon is shown.
  const BOOK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Z"/><path d="M6 19h12v2H6a2 2 0 0 1 0-4"/></svg>`;
  const coverCache = load("cac.coverCache", {});
  const coverKey = book.isbn || `${book.title}|${(book.authors || [])[0] || ""}`;

  function tryImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 20 && img.naturalHeight > 20 ? src : null);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function googleBooksCover() {
    const cleanTitle = book.title.replace(/\[[^\]]*\]|\([^)]*\)/g, "").trim();
    const queries = [];
    if (book.isbn) queries.push(`isbn:${book.isbn}`);
    queries.push(`intitle:${cleanTitle}${(book.authors || [])[0] ? `+inauthor:${book.authors[0].split(" ").pop()}` : ""}`);
    for (const q of queries) {
      try {
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`);
        if (!res.ok) continue;
        const items = (await res.json()).items || [];
        for (const it of items) {
          const links = (it.volumeInfo || {}).imageLinks || {};
          const raw = links.thumbnail || links.smallThumbnail;
          if (raw) return raw.replace(/^http:/, "https:").replace("&edge=curl", "");
        }
      } catch {
        /* try the next source */
      }
    }
    return null;
  }

  async function loadCover() {
    const box = $("cover");
    const show = (src) => {
      box.innerHTML = src ? `<img src="${esc(src)}" alt="Cover of ${esc(book.title)}">` : BOOK_ICON;
    };
    if (coverCache[coverKey]) show(coverCache[coverKey]);
    else box.innerHTML = BOOK_ICON;

    const candidates = [
      async () => googleBooksCover(),
      async () => book.isbn && `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(book.isbn)}-L.jpg?default=false`,
      async () => book.cover,
    ];
    for (const next of candidates) {
      const src = await tryImage(await next());
      if (src) {
        if (src !== coverCache[coverKey]) {
          coverCache[coverKey] = src;
          save("cac.coverCache", coverCache);
          show(src);
        }
        return;
      }
    }
    if (coverCache[coverKey]) return; // keep the last good one
    show(null);
  }
  loadCover();

  // ---------- Panels ----------
  let entry = null;
  let current = null; // index of the chapter shown

  function updateStats() {
    if (!entry || current === null) return;
    const ch = entry.chapters[current];
    const best = quizScores[`${entry.id}:${ch.number}`];
    $("statScore").textContent = best ? `${best.score}/${best.total}` : "–";
    $("statScoreLabel").textContent = best ? `Last quiz score · Ch. ${ch.number}` : "No quiz taken yet";
  }

  function setChapterActive(i) {
    document.querySelectorAll("#chapterNav button").forEach((b, j) => {
      b.classList.toggle("active", j === i);
      if (j === i) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
    $("chapterSelect").value = String(i);
  }

  async function showChapter(i) {
    const ch = entry.chapters[i];
    if (!ch) return;
    current = i;
    setChapterActive(i);
    history.replaceState(null, "", `#chapter-${ch.number}`);
    $("statChapter").textContent = `Chapter ${ch.number}`;
    $("statChapterTitle").textContent = ch.title;
    $("notesBody").innerHTML = `<p class="empty">Loading Chapter ${esc(ch.number)}…</p>`;
    try {
      const [res, studyRes] = await Promise.all([
        fetch(ch.file),
        fetch(ch.file.replace(/\.md$/, ".study.json")).catch(() => null),
      ]);
      if (!res.ok) throw new Error();
      const { html, sections } = renderMarkdown(await res.text());
      let study = null;
      try {
        if (studyRes && studyRes.ok) study = await studyRes.json();
      } catch {
        study = null;
      }

      // Notes
      $("notesBody").innerHTML = `${html}<p class="notes-foot">${esc(entry.source)}</p>`;
      $("notesBody").scrollTop = 0;
      $("sectionJump").innerHTML = `<option value="">Jump to section…</option>` +
        sections.map((s) => `<option value="${s.id}">${esc([s.number, s.title].filter(Boolean).join(" "))}</option>`).join("");
      $("sectionJump").onchange = () => {
        const target = document.getElementById($("sectionJump").value);
        if (target) $("notesBody").scrollTo({ top: target.offsetTop - $("notesBody").offsetTop - 8, behavior: "smooth" });
      };

      // Key concepts, flashcards, quiz
      if (study) {
        $("conceptsBody").innerHTML = `<ol class="concepts">${study.keyConcepts.map((k, n) => `
          <li class="concept"><span class="concept-num">${n + 1}</span>
            <div><h4>${inline(k.title)}</h4><p>${inline(k.text)}</p></div></li>`).join("")}</ol>`;
        $("conceptsBody").scrollTop = 0;
        $("statCards").textContent = study.flashcards.length;
        setupFlashcards($("flashcards"), study.flashcards);
        setupQuiz($("quiz"), study.quiz, `${entry.id}:${ch.number}`);
        $("quiz").querySelector(".quiz-scroll").scrollTop = 0;
        document.querySelectorAll(".p-concepts, .p-cards, .p-quiz").forEach((p) => p.classList.remove("hidden"));
      } else {
        $("statCards").textContent = "–";
        document.querySelectorAll(".p-concepts, .p-cards, .p-quiz").forEach((p) => p.classList.add("hidden"));
      }
      updateStats();
    } catch {
      $("notesBody").innerHTML = `<p class="empty">Couldn't load this chapter. Check your connection and try again.</p>`;
    }
  }

  function noNotes(message) {
    $("chaptersLabel").classList.add("hidden");
    $("chapterNav").classList.add("hidden");
    $("chapterSelect").parentElement.classList.add("hidden");
    document.querySelectorAll(".p-concepts, .p-cards, .p-quiz").forEach((p) => p.classList.add("hidden"));
    $("sectionJump").classList.add("hidden");
    $("panels").classList.add("single");
    $("notesBody").innerHTML = message;
  }

  async function start() {
    let index;
    try {
      const res = await fetch("notes/index.json", { cache: "no-cache" });
      index = await res.json();
    } catch {
      noNotes(`<p class="empty">Couldn't load the notes. Check your connection and refresh the page.</p>`);
      return;
    }
    entry = findNotes(index);
    if (!entry) {
      noNotes(`<p class="empty"><strong>No notes for this book yet.</strong><br>
        To get them, ask Claude in a Claude Code chat for this website: “Add notes for ${esc(book.title)}”.
        Claude will look the book up and add notes, key concepts, flashcards and a quiz for every chapter.</p>`);
      return;
    }
    $("chapterNav").innerHTML = entry.chapters.map((ch, i) => `
      <button type="button" data-i="${i}" title="${esc(ch.title)}">
        <span class="ch-num">${esc(ch.number)}</span><span class="ch-name">${esc(ch.title)}</span>
      </button>`).join("");
    $("chapterNav").querySelectorAll("button").forEach((b) => (b.onclick = () => showChapter(Number(b.dataset.i))));
    $("chapterSelect").innerHTML = entry.chapters
      .map((ch, i) => `<option value="${i}">Chapter ${esc(ch.number)}: ${esc(ch.title)}</option>`).join("");
    $("chapterSelect").onchange = () => showChapter(Number($("chapterSelect").value));

    window.addEventListener("hashchange", () => {
      const n = (location.hash.match(/^#chapter-(.+)$/) || [])[1];
      const j = entry.chapters.findIndex((c) => c.number === n);
      if (j >= 0 && j !== current) showChapter(j);
    });
    const fromHash = (location.hash.match(/^#chapter-(.+)$/) || [])[1];
    const i = entry.chapters.findIndex((c) => c.number === fromHash);
    showChapter(i >= 0 ? i : 0);
  }

  start();
})();
