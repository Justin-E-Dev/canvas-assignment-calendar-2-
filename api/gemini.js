// Vercel serverless function: writes study material for a book with Google's
// Gemini API (free tier). The key lives only in Vercel's environment settings
// (GEMINI_API_KEY), never in this code or the browser.
//
// POST /api/gemini  { action, book, chapter?, section?, allSections?, soFar?, prefer?, avoid? }
//   action: "chapters" | "chapter" | "outline" | "concepts" | "flashcards" | "quiz" | "section"
//   "chapter" writes a whole chapter (condensed notes + key concepts + flashcards
//   + quiz) in ONE request, to stay well inside Gemini's free daily limits.
//
// Everything is streamed back as it's written, one JSON object per line:
//   {"t":"text…"} … then {"done":true,"model":…} or {"more":true,"model":…}
//   or {"error":"…","retryAfter":seconds}
// Each request stops after 45 seconds. When it ends with "more", the page asks
// again with soFar (the text so far) and Gemini continues where it stopped, so
// nothing ever runs long enough to time out. The page turns the text into notes,
// key concepts, flashcards and quiz questions.
//
// GET /api/gemini shows which models the key can use (never the key itself).

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const ROUND_MS = 45000; // each request answers within 45 s
const FIRST_TEXT_MS = 20000; // a model that hasn't started writing by then is skipped

const SYSTEM = `You write study material for a college student about one of their course textbooks.
You can't see the student's copy, so work from what you know about this book and its subject.
Write in clear, plain language, in your own words. Never copy text from the book.
If you aren't sure about something specific to this edition, write what it most likely covers rather than refusing.
Follow the requested output format exactly and output nothing else.`;

// ---------- Input checks ----------
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

function readBook(raw) {
  if (!raw || typeof raw !== "object") return null;
  const book = {
    title: clip(raw.title, 300),
    authors: (Array.isArray(raw.authors) ? raw.authors : []).slice(0, 6).map((a) => clip(a, 100)).filter(Boolean),
    year: clip(raw.year, 10),
    isbn: clip(raw.isbn, 20),
    course: clip(raw.course, 150),
  };
  return book.title ? book : null;
}

const describe = (b) => [
  `Title: ${b.title}`,
  b.authors.length && `Author(s): ${b.authors.join(", ")}`,
  b.year && `Year: ${b.year}`,
  b.isbn && `ISBN: ${b.isbn}`,
  b.course && `The student's course: ${b.course}`,
].filter(Boolean).join("\n");

// ---------- What to ask for (simple line formats the page can read as they arrive) ----------
function prompt(action, book, chapter, section, allSections) {
  const ch = chapter && `Chapter ${chapter.number}${chapter.title ? `: ${chapter.title}` : ""}`;
  const head = describe(book);
  switch (action) {
    case "chapters":
      return `${head}

List this book's chapters in order (main chapters only, not sections), using the edition that matches the year/ISBN.
Output exactly this format, one item per line:
EDITION: short label, e.g. Computer Networking, 8th edition (2020)
KNOWN: yes (if you actually know this book's table of contents) or no (if this is your best guess)
NOTE: one sentence for the student about how reliable this list is
CHAPTER: 1 | Chapter title
CHAPTER: 2 | Chapter title
(one CHAPTER line per chapter)`;
    case "outline":
      return `${head}

Outline ${ch}. Output exactly this format:
INTRO: one paragraph (3-5 sentences, on a single line) about what the chapter covers and why it matters
SECTION: ${chapter.number}.1 | Section title | one sentence listing the topics it covers
SECTION: ${chapter.number}.2 | Section title | one sentence listing the topics it covers
(usually 5-9 SECTION lines; use the book's real section titles if you know them)`;
    case "concepts":
      return `${head}

List the 8-12 most important ideas in ${ch}, one per line, most important first, in exactly this format:
CONCEPT: Short title | 1-3 sentences explaining it (you may use **bold**)`;
    case "flashcards":
      return `${head}

Write 20-25 flashcards for ${ch}, one per line, in exactly this format:
CARD: question or term | short answer or definition`;
    case "quiz":
      return `${head}

Write 12 multiple-choice questions for ${ch}. Use exactly this format for each, with a blank line between questions:
Q: the question
A) option
B) option
C) option
D) option
ANSWER: the letter of the correct option
WHY: one sentence explaining the answer
All 4 options must be different and plausible.`;
    case "chapter":
      return `${head}

Write condensed study material for ${ch}. Output exactly these parts, in this order, and nothing else:

INTRO: one paragraph (2-4 sentences, on a single line) about what the chapter covers.

Then the notes: one "## " heading per main section of the chapter, starting with the section number (e.g. "## ${chapter.number}.1 Section title"; use the book's real section titles if you know them, usually 5-8 sections). Under each heading, the key points as "- " bullets (one level of nested "  - " bullets allowed), with **bold** key terms and \`code\` for formulas. About 900-1,400 words of notes in total.

===CONCEPTS===
8-10 lines, most important first:
CONCEPT: Short title | 1-2 sentences explaining it

===CARDS===
20 lines:
CARD: question or term | short answer or definition

===QUIZ===
10 questions, each in this format, with a blank line between questions:
Q: the question
A) option
B) option
C) option
D) option
ANSWER: the letter of the correct option
WHY: one sentence explaining the answer`;
    case "section":
      return `${head}

You're writing study notes for ${ch}, one section at a time. The chapter's sections are:
${allSections.map((x) => `- ${x.number} ${x.title}`).join("\n")}

Write the notes for section ${section.number} ${section.title} only${section.focus ? ` (it covers: ${section.focus})` : ""}.
About 400-700 words, explaining everything a student needs to understand this section, with examples, formulas or step-by-step processes where the topic has them.
Write plain Markdown using ONLY this format:
- First line exactly: "## ${section.number} ${section.title}"
- Then paragraphs, bullet lists ("- "), numbered lists ("1. "), one level of nested bullets (indent 2 spaces), **bold** for key terms, \`code\` for formulas. "### " for sub-headings.
- No "# " heading, no other "## " headings, no tables, images, links or HTML. Blank line between paragraphs.
- Don't repeat material that belongs to the other sections.`;
    default:
      return null;
  }
}

const continuation = (soFar) => `

You already started this answer. Here is everything written so far:
<<<
${soFar}
>>>
Continue EXACTLY where it stops (even mid-sentence or mid-line). Don't repeat anything above and don't start over. If the answer is already complete, reply with nothing.`;

// ---------- Choosing a model ----------
// Flash-Lite first: fastest, and usually the most generous free daily limit.
// Each model has its OWN free limit, so when one is used up we move to the next.
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
].filter(Boolean);

let keyModels = null; // models this key can use (asked once per server instance)
let lastGood = null; // the model that answered most recently
const slowUntil = new Map(); // model -> time until which we skip it

async function modelsForKey() {
  if (keyModels) return keyModels;
  try {
    const res = await fetch(`${API}?pageSize=200`, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const names = ((await res.json()).models || [])
      .filter((m) => /flash/i.test(m.name) && (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""));
    if (names.length) keyModels = names;
  } catch {
    /* fall back to the built-in list */
  }
  return keyModels;
}

async function modelOrder(prefer, avoid) {
  const available = await modelsForKey();
  const version = (n) => parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  let order;
  if (!available) order = MODELS;
  else {
    const preferred = MODELS.filter((m) => m === process.env.GEMINI_MODEL || available.includes(m));
    const other = available.filter((n) => !preferred.includes(n) && !/image|tts|audio|live|exp|preview|thinking|embed/i.test(n));
    const full = other.filter((n) => !/lite/i.test(n)).sort((a, b) => version(b) - version(a));
    const lite = other.filter((n) => /lite/i.test(n)).sort((a, b) => version(b) - version(a));
    order = [...preferred, ...lite, ...full];
  }
  const now = Date.now();
  const first = [prefer, lastGood].filter((m) => m && (!available || available.includes(m) || m === process.env.GEMINI_MODEL));
  const avoidSet = new Set((avoid || []).filter(Boolean));
  const ranked = [...new Set([...first, ...order])];
  const fresh = ranked.filter((m) => !avoidSet.has(m) && !(slowUntil.get(m) > now));
  // If everything has been slow lately, try them all anyway.
  return fresh.length ? fresh : ranked;
}

// Thinking slows the first words down a lot; ask for as little as each model allows.
// Gemini 2.5 takes a budget; newer models take a level. Try the lightest first.
const thinkingOptions = (model) => (/2\.5/.test(model)
  ? [{ thinkingBudget: 0 }, null]
  : [{ thinkingLevel: "minimal" }, { thinkingLevel: "low" }, null]);

const acceptedThinking = new Map(); // model -> which thinking option it accepted

class GeminiError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // "model" (try another), "slow", "quota", "key", "busy", "other"
  }
}

// Starts a streaming request to one model, trying lighter-to-heavier thinking settings
// until the model accepts one. Returns the open response.
async function openStream(model, text, signal) {
  const url = `${API}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const headers = { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY };
  let lastMsg = "";
  const options = thinkingOptions(model);
  const known = acceptedThinking.get(model);
  for (const thinking of known === undefined ? options : options.slice(known)) {
    const generationConfig = { temperature: 0.4, maxOutputTokens: 8192 };
    if (thinking) generationConfig.thinkingConfig = thinking;
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig,
      }),
    });
    if (res.ok) {
      acceptedThinking.set(model, options.indexOf(thinking));
      return res;
    }
    lastMsg = (await res.text()).slice(0, 400);
    if (res.status === 400 && /thinking/i.test(lastMsg)) continue; // try the next setting
    if (res.status === 404 || (res.status === 400 && /model|not supported|not found/i.test(lastMsg)) ||
        (res.status === 429 && /limit:\s*0\b/i.test(lastMsg))) throw new GeminiError("model", lastMsg);
    if (res.status === 429) throw new GeminiError("quota", lastMsg);
    if (res.status === 403 || (res.status === 400 && /api key/i.test(lastMsg))) throw new GeminiError("key", lastMsg);
    if (res.status >= 500) throw new GeminiError("busy", lastMsg);
    throw new GeminiError("other", lastMsg);
  }
  throw new GeminiError("model", lastMsg || "No thinking setting accepted");
}

// ---------- Streaming one round (up to 45 s) ----------
async function streamRound(res, text, prefer, avoid) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  const send = (obj) => res.write(JSON.stringify(obj) + "\n");
  const stopAt = Date.now() + ROUND_MS;
  let lastErr = null;
  const quotaHits = []; // one entry per model whose free limit was used up (true = daily)

  for (const model of await modelOrder(prefer, avoid)) {
    const left = stopAt - Date.now();
    if (left < 6000) break;
    const controller = new AbortController();
    let why = null; // "first" = no text in time, "round" = 45 s up
    const roundTimer = setTimeout(() => { why = why || "round"; controller.abort(); }, left);
    const firstTimer = setTimeout(() => { why = "first"; controller.abort(); }, Math.min(FIRST_TEXT_MS, left));
    let wrote = false;
    try {
      const r = await openStream(model, text, controller.signal);
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finish = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          let ev;
          try {
            ev = JSON.parse(line.slice(5));
          } catch {
            continue;
          }
          const cand = (ev.candidates || [])[0] || {};
          const t = ((cand.content || {}).parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
          if (t) {
            if (!wrote) clearTimeout(firstTimer);
            wrote = true;
            send({ t });
          }
          if (cand.finishReason) finish = cand.finishReason;
        }
      }
      clearTimeout(roundTimer);
      clearTimeout(firstTimer);
      lastGood = model;
      if (finish === "MAX_TOKENS") send({ more: true, model });
      else if (finish && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(finish)) send({ error: `Gemini stopped early (${finish}).`, retryAfter: 3, model });
      else send({ done: true, model });
      return res.end();
    } catch (e) {
      clearTimeout(roundTimer);
      clearTimeout(firstTimer);
      if (wrote) {
        // Time's up (or the connection broke) partway: keep what was written; the page continues.
        lastGood = model;
        send({ more: true, model });
        return res.end();
      }
      if (e && e.name === "AbortError") {
        // Didn't start writing in time: skip this model for a while and try the next one.
        slowUntil.set(model, Date.now() + 10 * 60 * 1000);
        lastErr = new GeminiError("slow", `${model} didn't start answering in time`);
        if (why === "round") break;
        continue;
      }
      lastErr = e instanceof GeminiError ? e : new GeminiError("other", String(e && e.message));
      if (lastErr.kind === "quota") {
        // This model's free limit is used up. Daily limits reset at midnight Pacific
        // (about 08:00 UTC); per-minute limits after a minute. Try another model.
        const daily = /per.?day|PerDay|daily/i.test(lastErr.message);
        lastErr.daily = daily;
        const until = new Date();
        if (daily) {
          until.setUTCHours(8, 0, 0, 0);
          if (until <= new Date()) until.setUTCDate(until.getUTCDate() + 1);
        } else until.setTime(Date.now() + 60 * 1000);
        slowUntil.set(model, until.getTime());
        quotaHits.push(daily);
        continue;
      }
      if (!["model", "busy"].includes(lastErr.kind)) break;
    }
  }

  const err = lastErr || new GeminiError("slow", "No model answered in time");
  if (quotaHits.length && quotaHits.every(Boolean)) {
    send({ error: "Gemini's free daily limit is used up on every model. It resets at midnight Pacific time; try again then.", retryAfter: null, daily: true });
    return res.end();
  }
  const wait = Number((String(err.message).match(/retry in ([\d.]+)s/i) || [])[1]);
  if (err.kind !== "key" && err.kind !== "quota") console.error("gemini", err.kind, err.message);
  send({
    error: {
      quota: "Gemini's free per-minute limit is used up for now.",
      key: "The Gemini key in Vercel isn't working. Check GEMINI_API_KEY in the project's settings.",
      slow: "Gemini was slow to start.",
      busy: "Gemini is busy right now.",
      model: "None of the Gemini models are available to this key.",
    }[err.kind] || "Gemini had a problem.",
    retryAfter: { quota: Math.min(60, Math.ceil(wait || 20)), slow: 2, busy: 10, other: 5 }[err.kind] || null,
    setup: err.kind === "key",
    avoid: err.kind === "slow" ? [...slowUntil.keys()] : undefined,
  });
  return res.end();
}

// ---------- Diagnostics: open /api/gemini in a browser ----------
async function diagnose() {
  const report = { keySet: !!process.env.GEMINI_API_KEY, checkedAt: new Date().toISOString() };
  if (!report.keySet) return { ...report, advice: "GEMINI_API_KEY isn't set in Vercel (or the site wasn't redeployed after adding it)." };
  report.flashModelsForThisKey = await modelsForKey();
  report.tryOrder = await modelOrder();
  report.tests = [];
  for (const model of report.tryOrder.slice(0, 4)) {
    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await openStream(model, "Reply with the single word OK.", controller.signal);
      const reader = r.body.getReader();
      const { value } = await reader.read();
      report.tests.push({ model, ok: true, firstTextAfterMs: Date.now() - t0, sample: new TextDecoder().decode(value || new Uint8Array()).slice(0, 80) });
      controller.abort();
      break;
    } catch (e) {
      report.tests.push({ model, ok: false, ms: Date.now() - t0, problem: e.kind || (e.name === "AbortError" ? "no answer in 20 s" : "error"), detail: String(e.message).slice(0, 160) });
    } finally {
      clearTimeout(timer);
    }
  }
  return report;
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(await diagnose());
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Use POST" });
  }
  // Only this website's own pages may use it.
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "Not allowed." });
    } catch {
      return res.status(403).json({ error: "Not allowed." });
    }
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: "Automatic notes aren't set up yet. Add a free GEMINI_API_KEY in the Vercel project's Environment Variables, then redeploy.",
      setup: true,
    });
  }

  const body = req.body || {};
  const action = body.action;
  if (!["chapters", "chapter", "outline", "concepts", "flashcards", "quiz", "section"].includes(action)) {
    return res.status(400).json({ error: "Unknown action." });
  }
  const book = readBook(body.book);
  if (!book) return res.status(400).json({ error: "Missing book details." });
  let chapter = null;
  if (action !== "chapters") {
    chapter = { number: clip(body.chapter && body.chapter.number, 20), title: clip(body.chapter && body.chapter.title, 200) };
    if (!chapter.number && !chapter.title) return res.status(400).json({ error: "Missing chapter." });
  }
  let section = null;
  let allSections = [];
  if (action === "section") {
    const sec = body.section || {};
    section = { number: clip(sec.number, 20), title: clip(sec.title, 200), focus: clip(sec.focus, 400) };
    if (!section.title) return res.status(400).json({ error: "Missing section." });
    allSections = (Array.isArray(body.allSections) ? body.allSections : []).slice(0, 20)
      .map((x) => ({ number: clip(x && x.number, 20), title: clip(x && x.title, 200) })).filter((x) => x.title);
    if (!allSections.length) allSections = [section];
  }

  const soFar = clip(body.soFar, 24000);
  const text = prompt(action, book, chapter, section, allSections) + (soFar ? continuation(soFar) : "");
  const prefer = clip(body.prefer, 80);
  const avoid = (Array.isArray(body.avoid) ? body.avoid : []).slice(0, 10).map((m) => clip(m, 80));
  try {
    return await streamRound(res, text, prefer, avoid);
  } catch (err) {
    console.error("gemini handler error", err);
    if (!res.headersSent) return res.status(502).json({ error: "Gemini had a problem.", retryAfter: 5 });
    res.write(JSON.stringify({ error: "Gemini had a problem.", retryAfter: 5 }) + "\n");
    return res.end();
  }
};

// Every request finishes within about 45 s, so 60 s is plenty on any Vercel plan.
module.exports.config = { maxDuration: 60 };
