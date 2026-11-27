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

  // Ask Gemini; if the free per-minute limit is hit, wait and try again (up to 4 times).
  async function gemini(payload, onWait) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await geminiOnce(payload);
      } catch (err) {
        if (!err.retryAfter || attempt >= 4) throw err;
        if (onWait) onWait(err.retryAfter);
        await sleep(err.retryAfter * 1000);
      }
    }
  }

  async function geminiOnce(payload) {
    let res;
    try {
      res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, book: { ...book, course } }),
        signal: AbortSignal.timeout(305000), // the server gives up at 5 minutes
      });
    } catch (e) {
      throw new Error(e && e.name === "TimeoutError"
        ? "Gemini took too long to answer. Please try again."
        : "Couldn't reach the website. Check your internet connection.");
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || {
        404: "Automatic notes only work on the live website.",
        504: "Gemini took too long to answer. Please try again.",
      }[res.status] || `Something went wrong (error ${res.status}).`);
      err.setup = !!(data && data.setup);
      if (res.status === 429 && data && data.retryAfter) err.retryAfter = data.retryAfter;
      throw err;
    }
    return data;
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

  function renderStudy(study, ch) {
    $("conceptsBody").innerHTML = `<ol class="concepts">${study.keyConcepts.map((k, n) => `
      <li class="concept"><span class="concept-num">${n + 1}</span>
        <div><h4>${inline(k.title)}</h4><p>${inline(k.text)}</p></div></li>`).join("")}</ol>`;
    $("conceptsBody").scrollTop = 0;
    $("statCards").textContent = study.flashcards.length;
    $("flashcards").classList.toggle("is-empty", !study.flashcards.length);
    if (study.flashcards.length) setupFlashcards($("flashcards"), study.flashcards);
    setupQuiz($("quiz"), study.quiz, `${entry.id}:${ch.number}`);
    $("quiz").querySelector(".quiz-scroll").scrollTop = 0;
    updateStats();
  }

  function studyLoading(text) {
    $("conceptsBody").innerHTML = waiting(text);
    $("flashcards").classList.add("is-empty");
    $("flashEmpty").innerHTML = waiting(text);
    $("quiz").querySelector(".quiz-list").innerHTML = `<li>${waiting(text)}</li>`;
    $("quiz").querySelector(".quiz-score").textContent = "";
    $("statCards").textContent = "–";
  }

  function studyError(err) {
    $("conceptsBody").innerHTML = errorHtml(err);
    $("flashEmpty").innerHTML = errorHtml(err);
    $("quiz").querySelector(".quiz-list").innerHTML = `<li>${errorHtml(err)}</li>`;
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
  // A whole chapter takes too long for one request, so: outline first, then each
  // section separately (two at a time), filling in as they finish.
  const chapterStore = (ch) => (genBook().content[ch.number] ||= {});

  async function runPool(items, limit, fn) {
    let next = 0;
    const worker = async () => {
      while (next < items.length) await fn(items[next++]);
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  }

  function assembleNotes(ch, c) {
    const parts = c.outline.sections.map((_, n) => c.sections[n]);
    return `# Chapter ${ch.number}: ${ch.title}\n\n${c.outline.intro}\n\n${parts.join("\n\n")}`;
  }

  async function writeNotes(ch, token) {
    const c = chapterStore(ch);
    if (c.markdown) {
      if (token === showToken) renderNotes(c.markdown);
      return;
    }
    const live = () => token === showToken;
    const label = `Chapter ${ch.number}`;
    if (!c.outline) {
      if (live()) {
        $("notesBody").innerHTML = waiting(`Gemini is outlining ${esc(label)}…`);
        $("sectionJump").classList.add("hidden");
      }
      c.outline = await gemini({ action: "outline", chapter: ch }, (secs) => {
        if (live()) $("notesBody").innerHTML = waiting(`Waiting ${secs}s for Gemini's free per-minute limit…`);
      });
      c.sections = {};
      saveGen();
    }
    c.sections ||= {};
    const secs = c.outline.sections;
    const all = secs.map((x) => ({ number: x.number, title: x.title }));

    // Skeleton: intro, then one block per section (finished, or "writing…").
    const blockHtml = (n) => c.sections[n]
      ? renderMarkdown(c.sections[n]).html
      : waiting(`Writing ${esc([secs[n].number, secs[n].title].filter(Boolean).join(" "))}…`);
    if (live()) {
      $("notesBody").innerHTML = `<section class="note-section intro"><p>${inline(c.outline.intro)}</p></section>` +
        secs.map((_, n) => `<div class="gen-sec" id="gsec-${n}">${blockHtml(n)}</div>`).join("") +
        `<p class="notes-foot" id="genFoot">Writing the rest of this chapter… sections appear as they're finished.</p>`;
      $("notesBody").scrollTop = 0;
      $("sectionJump").classList.remove("hidden");
      $("sectionJump").innerHTML = `<option value="">Jump to section…</option>` +
        secs.map((x, n) => `<option value="gsec-${n}">${esc([x.number, x.title].filter(Boolean).join(" "))}</option>`).join("");
      $("sectionJump").onchange = () => {
        const target = document.getElementById($("sectionJump").value);
        if (target) $("notesBody").scrollTo({ top: target.offsetTop - $("notesBody").offsetTop - 8, behavior: "smooth" });
      };
    }
    const block = (n) => (live() ? document.getElementById(`gsec-${n}`) : null);

    let failed = 0;
    const writeSection = async (n) => {
      try {
        const out = await gemini({ action: "section", chapter: ch, section: secs[n], allSections: all }, (wait) => {
          const el = block(n);
          if (el) el.innerHTML = waiting(`Waiting ${wait}s for Gemini's free per-minute limit…`);
        });
        c.sections[n] = out.markdown;
        saveGen();
        const el = block(n);
        if (el) el.innerHTML = renderMarkdown(out.markdown).html;
      } catch (err) {
        failed++;
        const el = block(n);
        if (el) {
          el.innerHTML = `<div class="writing failed"><p><strong>${esc([secs[n].number, secs[n].title].filter(Boolean).join(" "))}</strong>: ${esc(err.message)}</p>
            <button class="pill-btn" type="button">Retry</button></div>`;
          el.querySelector("button").onclick = () => {
            el.innerHTML = blockHtml(n);
            writeNotes(ch, showToken);
          };
        }
      }
    };
    const missing = secs.map((_, n) => n).filter((n) => !c.sections[n]);
    await runPool(missing, 2, writeSection);

    if (secs.every((_, n) => c.sections[n])) {
      c.markdown = assembleNotes(ch, c);
      saveGen();
      const foot = live() && $("genFoot");
      if (foot) foot.textContent = entry.source;
    } else if (live() && $("genFoot")) {
      $("genFoot").textContent = `${failed} section${failed === 1 ? "" : "s"} couldn't be written. Use Retry on ${failed === 1 ? "it" : "them"}.`;
    }
  }

  async function writeStudy(ch, token) {
    const c = chapterStore(ch);
    const live = () => token === showToken;
    if (!c.study) {
      if (live()) studyLoading(`Writing key concepts, flashcards and quiz for Chapter ${esc(ch.number)}…`);
      const s = await gemini({ action: "study", chapter: ch }, (secs) => {
        if (live()) studyLoading(`Waiting ${secs}s for Gemini's free per-minute limit…`);
      });
      c.study = { keyConcepts: s.keyConcepts, flashcards: s.flashcards, quiz: s.quiz };
      saveGen();
    }
    if (live()) renderStudy(c.study, ch);
  }

  async function showGenerated(ch, token, rewrite) {
    if (rewrite) {
      genBook().content[ch.number] = {};
      saveGen();
    }
    await Promise.all([
      writeNotes(ch, token).catch((err) => {
        if (token === showToken) {
          $("notesBody").innerHTML = errorHtml(err) + `<p><button class="pill-btn" id="notesRetry" type="button">Try again</button></p>`;
          $("sectionJump").classList.add("hidden");
          $("notesRetry").onclick = () => showChapter(current);
        }
      }),
      writeStudy(ch, token).catch((err) => {
        if (token === showToken) studyError(err);
      }),
    ]);
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
    $("rewriteBtn").classList.toggle("hidden", !entry.generated);
    $("rewriteBtn").onclick = () => {
      if (current !== null && confirm("Ask Gemini to write this chapter again? The current version will be replaced.")) showChapter(current, true);
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
          const data = await gemini({ action: "chapters" });
          if (!data.chapters || !data.chapters.length) throw new Error("Gemini couldn't come up with a chapter list for this book.");
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
    } else {
      startGenerated();
    }
  }

  start();
})();
