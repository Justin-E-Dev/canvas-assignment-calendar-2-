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
    return (index.books || []).find((b) =>
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
  // Two sources of chapter content, shown the same way:
  //  - built-in notes stored in this website (notes/index.json), e.g. Computer Networking;
  //  - notes written automatically by Gemini (api/gemini.js), saved in this browser.
  let entry = null; // { id, edition, source, chapters: [{ number, title, file? }], generated }
  let current = null; // index of the chapter shown
  let showToken = 0; // ignores slow answers for a chapter you've already left

  const GEN_KEY = "cac.genNotes";
  const genStore = load(GEN_KEY, {}); // { "<course>::<book>": { edition, note, chapters, model, content: { "<n>": { markdown, study } } } }
  const genId = `${course}::${bookId}`;
  const genBook = () => (genStore[genId] ||= { content: {} });
  const saveGen = () => save(GEN_KEY, genStore);

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

  const waiting = (text) => `<div class="writing"><span class="spinner" aria-hidden="true"></span><p>${text} <span class="elapsed" data-start="${Date.now()}"></span></p></div>`;
  setInterval(() => {
    document.querySelectorAll(".elapsed").forEach((el) => {
      const secs = Math.round((Date.now() - Number(el.dataset.start)) / 1000);
      el.textContent = secs >= 3 ? `(${secs}s)` : "";
    });
  }, 1000);

  // ---------- Asking Gemini (through this website's own server function) ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Talking to Gemini (through this website's own server function) ----------
  // Every request streams text back and stops after 45 s; streamAll keeps asking
  // Gemini to continue until the answer is complete, retrying temporary problems.
  const MODEL_KEY = "cac.geminiModel";
  const modelMemory = load(MODEL_KEY, {}); // { prefer: "fast model", avoid: ["slow models"], at }
  if (modelMemory.at && Date.now() - modelMemory.at > 6 * 3600 * 1000) modelMemory.avoid = []; // forget slow models after 6 h

  async function streamOnce(payload, onText) {
    let res;
    try {
      res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, book: { ...book, course: course === "My Books" ? "" : course }, prefer: modelMemory.prefer, avoid: modelMemory.avoid || [] }),
        signal: AbortSignal.timeout(65000),
      });
    } catch (e) {
      const err = new Error(e && e.name === "TimeoutError" ? "Gemini didn't answer in time." : "Couldn't reach the website. Check your internet connection.");
      err.retryAfter = 5;
      throw err;
    }
    if (!res.ok || !res.body) {
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* not JSON */
      }
      const err = new Error((data && data.error) || (res.status === 404 ? "Automatic notes only work on the live website." : `Something went wrong (error ${res.status}).`));
      err.setup = !!(data && data.setup);
      if (data && data.retryAfter) err.retryAfter = data.retryAfter;
      else if (res.status === 504 || res.status >= 500) err.retryAfter = 5;
      throw err;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch {
        return "more"; // connection dropped: keep what we have and continue
      }
      if (chunk.done) return "more";
      buf += decoder.decode(chunk.value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch {
          continue;
        }
        if (ev.model && (ev.done || ev.more)) {
          modelMemory.prefer = ev.model;
          modelMemory.at = Date.now();
          save(MODEL_KEY, modelMemory);
        }
        if (ev.t) onText(ev.t);
        if (ev.done) return "done";
        if (ev.more) return "more";
        if (ev.error) {
          if (Array.isArray(ev.avoid)) {
            modelMemory.avoid = ev.avoid;
            if (ev.avoid.includes(modelMemory.prefer)) delete modelMemory.prefer;
            modelMemory.at = Date.now();
            save(MODEL_KEY, modelMemory);
          }
          const err = new Error(ev.error);
          err.retryAfter = ev.retryAfter;
          err.setup = !!ev.setup;
          throw err;
        }
      }
    }
  }

  // Keeps going round by round until Gemini says it's done. Returns the full text.
  //   start: text already written (to continue), onText(fullText): called as text arrives,
  //   onWait(message): called while waiting to retry.
  async function streamAll(payload, { start = "", onText, onWait } = {}) {
    let text = start;
    let retries = 0;
    for (let round = 0; round < 15; round++) {
      let status;
      try {
        status = await streamOnce({ ...payload, soFar: text }, (t) => {
          text += t;
          if (onText) onText(text);
        });
        retries = 0;
      } catch (err) {
        if (!err.retryAfter || retries >= 6) throw err;
        retries++;
        if (onWait) onWait(`${err.message} Trying again in ${err.retryAfter}s…`);
        await sleep(err.retryAfter * 1000);
        continue;
      }
      if (status === "done") return text;
      if (onWait && text) onWait("Continuing…");
    }
    return text;
  }

  // ---------- Reading Gemini's line formats ----------
  const lineValue = (text, key) => {
    const m = text.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, "im"));
    return m ? m[1].trim() : "";
  };
  const fields = (line, n) => {
    const parts = line.split("|").map((x) => x.trim());
    if (parts.length > n) parts.splice(n - 1, parts.length, parts.slice(n - 1).join(" | "));
    return parts;
  };
  const linesOf = (text, key) => [...text.matchAll(new RegExp(`^\\s*\\**${key}:\\**\\s*(.+)$`, "gim"))].map((m) => m[1].trim());

  function parseChapters(text) {
    const chapters = linesOf(text, "CHAPTER").map((l) => fields(l, 2))
      .map(([number, title]) => ({ number: (number || "").replace(/^chapter\s*/i, ""), title: title || "" }))
      .filter((c) => c.number && c.title);
    return { chapters, edition: lineValue(text, "EDITION"), note: lineValue(text, "NOTE"), recognized: /^y/i.test(lineValue(text, "KNOWN")) };
  }
  function parseOutline(text) {
    const sections = linesOf(text, "SECTION").map((l) => fields(l, 3))
      .map(([number, title, focus]) => ({ number: number || "", title: title || "", focus: focus || "" }))
      .filter((x) => x.title);
    return { intro: lineValue(text, "INTRO"), sections };
  }
  // Only complete lines count while text is still arriving.
  const completeLines = (text, done) => (done ? text : text.slice(0, text.lastIndexOf("\n") + 1));
  function parseConcepts(text, done) {
    return linesOf(completeLines(text, done), "CONCEPT").map((l) => fields(l, 2))
      .map(([title, body]) => ({ title, text: body || "" })).filter((k) => k.title && k.text);
  }
  function parseCards(text, done) {
    return linesOf(completeLines(text, done), "CARD").map((l) => fields(l, 2))
      .map(([front, back]) => ({ front, back: back || "" })).filter((c) => c.front && c.back);
  }
  function parseQuiz(text) {
    const out = [];
    for (const block of text.split(/\n\s*\n|(?=^\s*\**Q:)/m)) {
      const q = lineValue(block, "\\**Q\\**");
      const opts = ["A", "B", "C", "D"].map((L) => {
        const m = block.match(new RegExp(`^\\s*\\**${L}[).:]\\**\\s*(.+)$`, "m"));
        return m ? m[1].trim() : "";
      });
      const ans = (lineValue(block, "\\**ANSWER\\**").match(/[ABCD]/i) || [""])[0].toUpperCase();
      const why = lineValue(block, "\\**WHY\\**");
      if (q && opts.every(Boolean) && new Set(opts).size === 4 && ans) {
        out.push({ q, options: opts, answer: "ABCD".indexOf(ans), explain: why || "" });
      }
    }
    return out;
  }

  const SETUP_HELP = `<p class="tiny">One-time setup: get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>,
    add it in Vercel → Settings → Environment Variables as <code>GEMINI_API_KEY</code>, then redeploy.</p>`;
  const errorHtml = (err) => `<p class="empty error">${esc(err.message)}</p>${err.setup ? SETUP_HELP : ""}`;

  // ---------- Showing one chapter ----------
  function renderNotes(markdown) {
    const { html, sections } = renderMarkdown(markdown);
    $("notesBody").innerHTML = `${html}<p class="notes-foot">${esc(entry.source)}</p>`;
    $("notesBody").scrollTop = 0;
    $("sectionJump").classList.remove("hidden");
    $("sectionJump").innerHTML = `<option value="">Jump to section…</option>` +
      sections.map((s) => `<option value="${s.id}">${esc([s.number, s.title].filter(Boolean).join(" "))}</option>`).join("");
    $("sectionJump").onchange = () => {
      const target = document.getElementById($("sectionJump").value);
      if (target) $("notesBody").scrollTo({ top: target.offsetTop - $("notesBody").offsetTop - 8, behavior: "smooth" });
    };
  }

  function renderConcepts(list) {
    $("conceptsBody").innerHTML = `<ol class="concepts">${list.map((k, n) => `
      <li class="concept"><span class="concept-num">${n + 1}</span>
        <div><h4>${inline(k.title)}</h4><p>${inline(k.text)}</p></div></li>`).join("")}</ol>`;
    $("conceptsBody").scrollTop = 0;
  }
  function renderCards(list) {
    $("statCards").textContent = list.length;
    $("flashcards").classList.toggle("is-empty", !list.length);
    if (list.length) setupFlashcards($("flashcards"), list);
    else $("flashEmpty").innerHTML = `<p class="empty">No flashcards.</p>`;
  }
  function renderQuiz(list, ch) {
    setupQuiz($("quiz"), list, `${entry.id}:${ch.number}`);
    $("quiz").querySelector(".quiz-scroll").scrollTop = 0;
    updateStats();
  }
  function renderStudy(study, ch) {
    renderConcepts(study.keyConcepts || []);
    renderCards(study.flashcards || []);
    renderQuiz(study.quiz || [], ch);
  }

  // Panel-by-panel "writing…" and error states.
  const PANEL = {
    concepts: (html) => ($("conceptsBody").innerHTML = html),
    flashcards: (html) => { $("flashcards").classList.add("is-empty"); $("flashEmpty").innerHTML = html; $("statCards").textContent = "–"; },
    quiz: (html) => { $("quiz").querySelector(".quiz-list").innerHTML = `<li>${html}</li>`; $("quiz").querySelector(".quiz-score").textContent = ""; },
  };
  function studyLoading(text) {
    Object.values(PANEL).forEach((set) => set(waiting(text)));
  }
  function studyError(err) {
    Object.values(PANEL).forEach((set) => set(errorHtml(err)));
  }

  // Built-in notes: two files per chapter.
  async function showBuiltIn(ch, token) {
    const [res, studyRes] = await Promise.all([
      fetch(ch.file),
      fetch(ch.file.replace(/\.md$/, ".study.json")).catch(() => null),
    ]);
    if (token !== showToken) return;
    if (!res.ok) throw new Error("Couldn't load this chapter. Check your connection and try again.");
    renderNotes(await res.text());
    let study = null;
    try {
      if (studyRes && studyRes.ok) study = await studyRes.json();
    } catch {
      study = null;
    }
    if (token !== showToken) return;
    if (study) renderStudy(study, ch);
    else studyError(new Error("No study tools for this chapter."));
  }

  // Gemini notes: written the first time you open a chapter, then saved in this browser.
  // Outline first; then each section is streamed onto the page as Gemini writes it.
  // Each request stops after 45 s and the page asks Gemini to continue where it left off.
  const chapterStore = (ch) => (genBook().content[ch.number] ||= {});

  async function runPool(items, limit, fn) {
    let next = 0;
    const worker = async () => {
      while (next < items.length) await fn(items[next++]);
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  // Make sure a section starts with its own "## " heading and has no other "## " headings.
  function tidySection(md, sec) {
    let text = String(md || "").replace(/^\s*#\s[^\n]*\n+/, "").trim();
    const heading = `## ${[sec.number, sec.title].filter(Boolean).join(" ")}`;
    if (!/^##\s/.test(text)) text = `${heading}\n\n${text}`;
    const lines = text.split("\n");
    return [lines[0], ...lines.slice(1).map((l) => l.replace(/^##\s/, "### "))].join("\n");
  }

  function assembleNotes(ch, c) {
    const parts = c.outline.sections.map((_, n) => c.sections[n]);
    return `# Chapter ${ch.number}: ${ch.title}\n\n${c.outline.intro}\n\n${parts.join("\n\n")}`;
  }

  async function writeNotes(ch, token) {
    const c = chapterStore(ch);
    const live = () => token === showToken;
    if (c.markdown) {
      if (live()) renderNotes(c.markdown);
      return;
    }
    if (!c.outline) {
      if (live()) {
        $("notesBody").innerHTML = waiting(`Gemini is outlining Chapter ${esc(ch.number)}…`);
        $("sectionJump").classList.add("hidden");
      }
      const outlineText = await streamAll({ action: "outline", chapter: ch }, {
        onText: (t) => {
          const intro = lineValue(t, "INTRO");
          if (live() && intro) $("notesBody").innerHTML = `<section class="note-section intro"><p>${inline(intro)}</p></section>` + waiting("Gemini is outlining the sections…");
        },
        onWait: (msg) => { if (live()) $("notesBody").innerHTML = waiting(esc(msg)); },
      });
      const outline = parseOutline(outlineText);
      if (!outline.sections.length) throw Object.assign(new Error("Gemini couldn't outline this chapter."), { retry: true });
      c.outline = outline;
      c.sections = {};
      c.partial = {};
      saveGen();
    }
    c.sections ||= {};
    c.partial ||= {};
    const secs = c.outline.sections;
    const all = secs.map((x) => ({ number: x.number, title: x.title }));
    const secName = (n) => esc([secs[n].number, secs[n].title].filter(Boolean).join(" "));

    // Skeleton: intro, then one block per section.
    const blockHtml = (n) => c.sections[n]
      ? renderMarkdown(c.sections[n]).html
      : c.partial[n]
        ? renderMarkdown(tidySection(c.partial[n], secs[n])).html + `<p class="typing">Writing…</p>`
        : waiting(`Waiting to write ${secName(n)}…`);
    if (live()) {
      $("notesBody").innerHTML = `<section class="note-section intro"><p>${inline(c.outline.intro)}</p></section>` +
        secs.map((_, n) => `<div class="gen-sec" id="gsec-${n}">${blockHtml(n)}</div>`).join("") +
        `<p class="notes-foot" id="genFoot">Writing this chapter… sections appear as Gemini writes them.</p>`;
      $("notesBody").scrollTop = 0;
      $("sectionJump").classList.remove("hidden");
      $("sectionJump").innerHTML = `<option value="">Jump to section…</option>` +
        secs.map((x, n) => `<option value="gsec-${n}">${secName(n)}</option>`).join("");
      $("sectionJump").onchange = () => {
        const target = document.getElementById($("sectionJump").value);
        if (target) $("notesBody").scrollTo({ top: target.offsetTop - $("notesBody").offsetTop - 8, behavior: "smooth" });
      };
    }
    const block = (n) => (live() ? document.getElementById(`gsec-${n}`) : null);

    let failed = 0;
    const writeSection = async (n) => {
      let text = c.partial[n] || "";
      let lastPaint = 0;
      const paint = (note) => {
        const el = block(n);
        if (el) el.innerHTML = (text ? renderMarkdown(tidySection(text, secs[n])).html : "") +
          (note ? `<p class="typing">${note}</p>` : "");
      };
      if (!text) {
        const el = block(n);
        if (el) el.innerHTML = waiting(`Writing ${secName(n)}…`);
      }
      try {
        text = await streamAll({ action: "section", chapter: ch, section: secs[n], allSections: all }, {
          start: text,
          onText: (t) => {
            text = t;
            c.partial[n] = text;
            if (Date.now() - lastPaint > 250) {
              lastPaint = Date.now();
              paint("Writing…");
              saveGen();
            }
          },
          onWait: (msg) => {
            c.partial[n] = text;
            saveGen();
            if (text) paint(esc(msg));
            else {
              const el = block(n);
              if (el) el.innerHTML = waiting(esc(msg));
            }
          },
        });
        c.partial[n] = text;
        saveGen();
        if (!text.replace(/^\s*#{1,3}\s[^\n]*\n?/, "").trim()) throw new Error("Gemini didn't write anything for this section.");
        c.sections[n] = tidySection(text, secs[n]);
        delete c.partial[n];
        saveGen();
        const el = block(n);
        if (el) el.innerHTML = renderMarkdown(c.sections[n]).html;
      } catch (err) {
        failed++;
        const el = block(n);
        if (el) {
          el.innerHTML = (text ? renderMarkdown(tidySection(text, secs[n])).html : "") +
            `<div class="writing failed"><p><strong>${secName(n)}</strong>: ${esc(err.message)}</p>
            <button class="pill-btn" type="button">${text ? "Continue writing" : "Retry"}</button></div>`;
          el.querySelector("button").onclick = () => writeNotes(ch, showToken);
        }
      }
    };
    const missing = secs.map((_, n) => n).filter((n) => !c.sections[n]);
    await runPool(missing, 2, writeSection);

    if (secs.every((_, n) => c.sections[n])) {
      c.markdown = assembleNotes(ch, c);
      delete c.partial;
      saveGen();
      const foot = live() && $("genFoot");
      if (foot) foot.textContent = entry.source;
    } else if (live() && $("genFoot")) {
      $("genFoot").textContent = `${failed} section${failed === 1 ? "" : "s"} couldn't be finished. Use the button on ${failed === 1 ? "it" : "them"}, or Regenerate chapter at the top.`;
    }
  }

  // Key concepts, flashcards and quiz: three separate streamed requests, each shown as it arrives.
  async function writeStudy(ch, token) {
    const c = chapterStore(ch);
    const live = () => token === showToken;
    c.study ||= {};
    const parts = [
      { part: "concepts", key: "keyConcepts", label: "key concepts", parse: parseConcepts, show: (v) => renderConcepts(v) },
      { part: "flashcards", key: "flashcards", label: "flashcards", parse: parseCards, show: (v) => renderCards(v) },
      { part: "quiz", key: "quiz", label: "quiz", parse: (t) => parseQuiz(t), show: (v) => renderQuiz(v, ch) },
    ];
    for (const p of parts) if (live() && !c.study[p.key]) PANEL[p.part](waiting(`Waiting to write the ${p.label}…`));
    for (const p of parts) {
      if (c.study[p.key]) {
        if (live()) p.show(c.study[p.key]);
        continue;
      }
      if (live()) PANEL[p.part](waiting(`Gemini is writing the ${p.label}…`));
      try {
        let lastPaint = 0;
        const text = await streamAll({ action: p.part, chapter: ch }, {
          onText: (t) => {
            if (!live() || Date.now() - lastPaint < 300) return;
            lastPaint = Date.now();
            const so = p.parse(t, false);
            if (!so.length) return;
            if (p.part === "concepts") renderConcepts(so);
            else PANEL[p.part](waiting(`Gemini is writing the ${p.label}… (${so.length} so far)`));
          },
          onWait: (msg) => { if (live()) PANEL[p.part](waiting(esc(msg))); },
        });
        const list = p.parse(text, true);
        if (!list.length) throw new Error(`Gemini didn't write any ${p.label}.`);
        c.study[p.key] = list;
        saveGen();
        if (live()) p.show(list);
      } catch (err) {
        if (live()) {
          PANEL[p.part](errorHtml(err) + `<p><button class="pill-btn study-retry" type="button">Retry</button></p>`);
          document.querySelectorAll(".study-retry:not([data-bound])").forEach((btn) => {
            btn.dataset.bound = "1";
            btn.onclick = () => writeStudy(ch, showToken);
          });
        }
      }
    }
  }

  // ---------- One-request chapters (condensed notes + key concepts + flashcards + quiz) ----------
  function splitChapterText(text) {
    const at = (re) => {
      const m = text.match(re);
      return m ? m.index : -1;
    };
    const marks = [
      ["concepts", at(/^\s*=+\s*CONCEPTS\s*=+\s*$/im)],
      ["cards", at(/^\s*=+\s*CARDS\s*=+\s*$/im)],
      ["quiz", at(/^\s*=+\s*QUIZ\s*=+\s*$/im)],
    ].filter(([, n]) => n >= 0).sort((a, b) => a[1] - b[1]);
    const notesEnd = marks.length ? marks[0][1] : text.length;
    const part = (name) => {
      const k = marks.findIndex(([n]) => n === name);
      if (k < 0) return "";
      const start = text.indexOf("\n", marks[k][1]);
      return text.slice(start < 0 ? text.length : start + 1, k + 1 < marks.length ? marks[k + 1][1] : text.length);
    };
    const notes = text.slice(0, notesEnd);
    return {
      intro: lineValue(notes, "INTRO"),
      notes: notes.replace(/^\s*\**INTRO:\**.*$/im, "").trim(),
      concepts: part("concepts"),
      cards: part("cards"),
      quiz: part("quiz"),
      seen: marks.map(([n]) => n),
    };
  }

  const chapterMarkdown = (ch, parts) => `# Chapter ${ch.number}: ${ch.title}\n\n${parts.intro}\n\n${parts.notes}`;

  function renderNotesKeepScroll(md) {
    const box = $("notesBody");
    const top = box.scrollTop;
    renderNotes(md);
    box.scrollTop = top;
  }

  function showGenerateButton(ch, token) {
    const c = chapterStore(ch);
    $("sectionJump").classList.add("hidden");
    $("notesBody").innerHTML = `<div class="generate-box">
        <p><strong>Chapter ${esc(ch.number)}: ${esc(ch.title)}</strong></p>
        <p class="muted">No notes for this chapter yet. Gemini can write detailed notes covering every concept in the chapter, with every key concept, a flashcard for each term and a quiz (usually 1–3 minutes, free).</p>
        <button class="pill-btn gen-btn" id="genBtn" type="button">Generate this chapter</button>
      </div>`;
    const hint = waitingMsg("Press “Generate this chapter” in the Notes panel.");
    if (!c.study || !c.study.keyConcepts) PANEL.concepts(hint);
    else renderConcepts(c.study.keyConcepts);
    if (!c.study || !c.study.flashcards) PANEL.flashcards(hint);
    else renderCards(c.study.flashcards);
    if (!c.study || !c.study.quiz) PANEL.quiz(hint);
    else renderQuiz(c.study.quiz, ch);
    $("genBtn").onclick = () => generateChapter(ch, token);
  }
  const waitingMsg = (text) => `<p class="empty">${esc(text)}</p>`;

  // Writes one chapter. "showing" says whether that chapter is on screen right now
  // (Regenerate all writes chapters in the background). Returns { ok, error }.
  async function generateChapter(ch, token, showing) {
    const c = chapterStore(ch);
    const live = showing || (() => token === showToken);
    if (live()) {
      $("notesBody").innerHTML = waiting(`Gemini is writing Chapter ${esc(ch.number)}…`);
      $("sectionJump").classList.add("hidden");
      ["concepts", "flashcards", "quiz"].forEach((p) => PANEL[p](waiting("Coming up after the notes…")));
    }
    let lastPaint = 0;
    let conceptsShown = 0;
    try {
      const text = await streamAll({ action: "chapter", chapter: ch }, {
        onText: (t) => {
          if (!live() || Date.now() - lastPaint < 250) return;
          lastPaint = Date.now();
          const parts = splitChapterText(t);
          if (parts.notes) renderNotesKeepScroll(chapterMarkdown(ch, parts) + "\n\n*Writing…*");
          if (parts.seen.includes("concepts")) {
            const list = parseConcepts(parts.concepts, false);
            if (list.length && list.length !== conceptsShown) {
              conceptsShown = list.length;
              renderConcepts(list);
            }
          }
          if (parts.seen.includes("cards")) PANEL.flashcards(waiting(`Writing flashcards… (${parseCards(parts.cards, false).length} so far)`));
          if (parts.seen.includes("quiz")) PANEL.quiz(waiting(`Writing quiz… (${parseQuiz(parts.quiz).length} so far)`));
        },
        onWait: (msg) => { if (live()) PANEL.flashcards(waiting(esc(msg))); },
      });
      const parts = splitChapterText(text);
      const study = {
        keyConcepts: parseConcepts(parts.concepts, true),
        flashcards: parseCards(parts.cards, true),
        quiz: parseQuiz(parts.quiz),
      };
      if (!parts.notes || !/^##\s/m.test(parts.notes)) throw new Error("Gemini's answer came back incomplete. Press Regenerate chapter to try again.");
      c.markdown = chapterMarkdown(ch, parts);
      c.study = study;
      saveGen();
      markWritten();
      if (live()) {
        renderNotes(c.markdown);
        renderStudy(study, ch);
      }
      return { ok: true };
    } catch (err) {
      if (live()) {
        $("notesBody").innerHTML = errorHtml(err) + `<p><button class="pill-btn" id="genRetry" type="button">Try again</button></p>`;
        $("genRetry").onclick = () => generateChapter(ch, showToken);
        ["concepts", "flashcards", "quiz"].forEach((p) => PANEL[p](waitingMsg("Not written yet.")));
      }
      return { ok: false, error: err };
    }
  }

  // ---------- Regenerate all: every chapter, one after another ----------
  const bulk = { running: false, stop: false, at: null, queue: [] };

  function markWritten() {
    if (!entry || !entry.generated) return;
    document.querySelectorAll("#chapterNav button").forEach((b, j) => {
      const ch = entry.chapters[j];
      b.classList.toggle("written", !!(ch && (genBook().content[ch.number] || {}).markdown));
      b.classList.toggle("writing", bulk.running && bulk.at === j);
    });
  }

  function bulkLabel(text) {
    $("regenAllBtn").querySelector("span").textContent = text;
  }

  async function regenerateAll() {
    if (bulk.running) {
      bulk.stop = true;
      bulkLabel("Stopping after this chapter…");
      return;
    }
    const total = entry.chapters.length;
    if (!confirm(`Regenerate all ${total} chapters? Gemini will write each chapter again, one after another (about 1-3 minutes each). Finished chapters are saved as it goes; you can keep reading while it works.`)) return;
    Object.assign(bulk, { running: true, stop: false, at: null, queue: entry.chapters.map((_, i) => i) });
    $("regenBtn").disabled = true;
    const failed = [];
    let stoppedFor = "";
    for (let k = 0; k < total; k++) {
      if (bulk.stop) {
        stoppedFor = "stopped";
        break;
      }
      bulk.at = k;
      bulk.queue = bulk.queue.filter((i) => i !== k);
      markWritten();
      bulkLabel(`Writing ${k + 1} of ${total}… (click to stop)`);
      const ch = entry.chapters[k];
      const showing = () => current === k;
      if (showing()) showChapter(k); // shows the "writing" state below
      const result = await generateChapter(ch, null, showing);
      if (!result.ok) {
        failed.push(ch.number);
        if (/daily limit|isn't working|aren't set up/i.test(result.error.message)) {
          stoppedFor = result.error.message;
          break;
        }
      }
    }
    Object.assign(bulk, { running: false, at: null, queue: [] });
    $("regenBtn").disabled = false;
    markWritten();
    bulkLabel("Regenerate all");
    const done = total - failed.length;
    if (stoppedFor === "stopped") alert("Stopped. Chapters finished before you stopped are saved.");
    else if (stoppedFor) alert(`Stopped early: ${stoppedFor}\n\nChapters finished so far are saved. Press Regenerate all again later to redo the rest.`);
    else if (failed.length) alert(`Done: ${done} of ${total} chapters written. These didn't work and can be retried with Regenerate chapter: ${failed.join(", ")}.`);
    if (current !== null && !bulk.running) showChapter(current);
  }

  async function showGenerated(ch, token, rewrite) {
    const c = chapterStore(ch);
    const idx = entry.chapters.indexOf(ch);
    if (bulk.running && bulk.at === idx && !rewrite) {
      $("notesBody").innerHTML = waiting(`Gemini is writing Chapter ${esc(ch.number)} (Regenerate all)…`);
      $("sectionJump").classList.add("hidden");
      ["concepts", "flashcards", "quiz"].forEach((p) => PANEL[p](waiting("Coming up after the notes…")));
      return;
    }
    if (rewrite) {
      genBook().content[ch.number] = {};
      saveGen();
      return generateChapter(ch, token);
    }
    if (c.markdown) {
      renderNotes(c.markdown);
      if (c.study && c.study.keyConcepts && c.study.flashcards && c.study.quiz) renderStudy(c.study, ch);
      else showStudyMissing(ch);
      return;
    }
    showGenerateButton(ch, token);
  }

  function showStudyMissing(ch) {
    const c = chapterStore(ch);
    const s = c.study || {};
    if (s.keyConcepts) renderConcepts(s.keyConcepts); else PANEL.concepts(waitingMsg("Not written yet. Use Regenerate chapter at the top."));
    if (s.flashcards) renderCards(s.flashcards); else PANEL.flashcards(waitingMsg("Not written yet. Use Regenerate chapter at the top."));
    if (s.quiz) renderQuiz(s.quiz, ch); else PANEL.quiz(waitingMsg("Not written yet. Use Regenerate chapter at the top."));
  }

  async function showChapter(i, rewrite) {
    const ch = entry.chapters[i];
    if (!ch) return;
    const token = ++showToken;
    current = i;
    setChapterActive(i);
    history.replaceState(null, "", `#chapter-${ch.number}`);
    $("statChapter").textContent = `Chapter ${ch.number}`;
    $("statChapterTitle").textContent = ch.title;
    $("statScore").textContent = "–";
    try {
      if (entry.generated) await showGenerated(ch, token, rewrite);
      else await showBuiltIn(ch, token);
    } catch (err) {
      if (token === showToken) $("notesBody").innerHTML = errorHtml(err);
    }
  }

  function listChapters() {
    $("chaptersLabel").classList.remove("hidden");
    $("chapterNav").classList.remove("hidden");
    $("chapterSelect").parentElement.classList.remove("hidden");
    $("chapterNav").innerHTML = entry.chapters.map((ch, i) => `
      <button type="button" data-i="${i}" title="${esc(ch.title)}">
        <span class="ch-num">${esc(ch.number)}</span><span class="ch-name">${esc(ch.title)}</span>
      </button>`).join("");
    $("chapterNav").querySelectorAll("button").forEach((b) => (b.onclick = () => showChapter(Number(b.dataset.i))));
    $("chapterSelect").innerHTML = entry.chapters
      .map((ch, i) => `<option value="${i}">Chapter ${esc(ch.number)}: ${esc(ch.title)}</option>`).join("");
    $("chapterSelect").onchange = () => showChapter(Number($("chapterSelect").value));
    $("regenBtn").classList.toggle("hidden", !entry.generated);
    $("regenAllBtn").classList.toggle("hidden", !entry.generated);
    $("regenAllBtn").onclick = regenerateAll;
    markWritten();
    $("regenBtn").onclick = () => {
      if (current === null) return;
      const ch = entry.chapters[current];
      if (confirm(`Regenerate Chapter ${ch.number}? Everything Gemini wrote for this chapter (notes, key concepts, flashcards and quiz) will be deleted and written again.`)) {
        showChapter(current, true);
      }
    };

    window.addEventListener("hashchange", () => {
      const n = (location.hash.match(/^#chapter-(.+)$/) || [])[1];
      const j = entry.chapters.findIndex((c) => c.number === n);
      if (j >= 0 && j !== current) showChapter(j);
    });
    const fromHash = (location.hash.match(/^#chapter-(.+)$/) || [])[1];
    const i = entry.chapters.findIndex((c) => c.number === fromHash);
    showChapter(i >= 0 ? i : 0);
  }

  // Open Library sometimes has the exact edition's table of contents.
  async function openLibraryChapters() {
    if (!book.isbn) return [];
    try {
      const res = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(book.isbn)}.json`, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return [];
      const toc = (await res.json()).table_of_contents || [];
      const top = toc.filter((t) => t.title && !(t.level > 0));
      const list = (top.length >= 3 ? top : toc.filter((t) => t.title)).map((t, n) => ({
        number: String(t.label || "").replace(/^chapter\s*/i, "").trim() || String(n + 1),
        title: String(t.title).trim(),
      }));
      return list.length >= 3 ? list : [];
    } catch {
      return [];
    }
  }

  // No built-in notes: get the chapter list (saved, Open Library, or Gemini), then go.
  async function startGenerated() {
    const g = genBook();
    if (!g.chapters || !g.chapters.length) {
      document.querySelectorAll(".p-concepts, .p-cards, .p-quiz").forEach((p) => p.classList.add("hidden"));
      $("panels").classList.add("single");
      $("chaptersLabel").classList.add("hidden");
      $("chapterSelect").parentElement.classList.add("hidden");
      $("sectionJump").classList.add("hidden");
      $("notesBody").innerHTML = waiting("Finding this book's chapters…");
      try {
        const ol = await openLibraryChapters();
        if (ol.length) {
          Object.assign(g, { chapters: ol, note: "Chapter list from Open Library.", edition: book.title });
        } else {
          const data = parseChapters(await streamAll({ action: "chapters" }, {
            onWait: (msg) => { $("notesBody").innerHTML = waiting(esc(msg)); },
          }));
          if (!data.chapters.length) throw new Error("Gemini couldn't come up with a chapter list for this book.");
          Object.assign(g, { chapters: data.chapters, note: data.note, edition: data.edition, recognized: data.recognized });
        }
        saveGen();
      } catch (err) {
        $("notesBody").innerHTML = errorHtml(err) + `<p><button class="pill-btn" id="retryBtn" type="button">Try again</button></p>`;
        $("retryBtn").onclick = () => startGenerated();
        return;
      }
      document.querySelectorAll(".p-concepts, .p-cards, .p-quiz").forEach((p) => p.classList.remove("hidden"));
      $("panels").classList.remove("single");
    }
    entry = {
      id: `gen:${genId}`,
      edition: g.edition || book.title,
      generated: true,
      source: `Written automatically by Google's Gemini AI from its general knowledge of this book. ${g.note || ""} It may not match your edition exactly; check anything important against your textbook.`,
      chapters: g.chapters,
    };
    listChapters();
  }

  async function start() {
    let index = { books: [] };
    try {
      const res = await fetch("notes/index.json", { cache: "no-cache" });
      if (res.ok) index = await res.json();
    } catch {
      /* no built-in notes reachable; Gemini can still write them */
    }
    const builtIn = findNotes(index);
    if (builtIn) {
      entry = builtIn;
      listChapters();
    } else if (GEMINI_ENABLED) {
      startGenerated();
    } else {
      showNoNotes();
    }
  }

  // Gemini writes notes for books without built-in notes, one chapter at a time,
  // only when you press "Generate this chapter" (one request per chapter).
  const GEMINI_ENABLED = true;

  function showNoNotes() {
    document.querySelectorAll(".p-concepts, .p-cards, .p-quiz").forEach((p) => p.classList.add("hidden"));
    $("panels").classList.add("single");
    $("chaptersLabel").classList.add("hidden");
    $("chapterNav").classList.add("hidden");
    $("chapterSelect").parentElement.classList.add("hidden");
    $("sectionJump").classList.add("hidden");
    $("regenBtn").classList.add("hidden");
    $("regenAllBtn").classList.add("hidden");
    $("notesBody").innerHTML = `<div class="no-notes">
      <p><strong>No notes for this book yet.</strong></p>
      <p>To get notes, key concepts, flashcards and a quiz for every chapter, ask Claude in a Claude Code chat for this website:</p>
      <p class="ask-line">Add notes for ${esc(book.title)}${book.isbn ? ` (ISBN ${esc(book.isbn)})` : ""}</p>
      <p class="tiny">Tip: type <code>/model sonnet</code> first. It's faster and uses less of your Claude limit.</p>
    </div>`;
  }

  start();
})();
