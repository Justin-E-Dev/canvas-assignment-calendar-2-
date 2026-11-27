// Vercel serverless function: writes study material for a book with Google's
// Gemini API (free tier). POST /api/gemini with JSON:
//
//   { action: "chapters", book }            -> the book's chapter list
//   { action: "outline",  book, chapter }   -> intro paragraph + the chapter's sections
//   { action: "section",  book, chapter, section, allSections } -> notes for one section
//   { action: "study",    book, chapter, part } -> key concepts, flashcards or quiz
//   { action: "stream",   book, chapter, section, allSections, soFar }
//        -> notes for one section, streamed as they're written (one JSON object per
//           line: {"t":"text"} … then {"done":true} or {"more":true}). Each request
//           stops after 45 s; the page then asks again with soFar to continue.
//   { action: "notes",    book, chapter }   -> (older) a whole chapter at once
//
// A whole chapter is too long to write within Vercel's 60-second limit, so the
// page asks for an outline first and then writes each section separately.
//
// The key lives only in Vercel's environment settings (GEMINI_API_KEY), never in
// this code or the browser. Get a free key at https://aistudio.google.com/apikey.

const API = "https://generativelanguage.googleapis.com/v1beta/models";

// Tried in order; the first one your key can use is remembered. Set GEMINI_MODEL
// in Vercel to force a specific model.
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
].filter(Boolean);
let workingModel = null;

// ---------- Response shapes (Gemini must answer in exactly this JSON) ----------
const S = (type, extra = {}) => ({ type, ...extra });
const obj = (properties) => S("OBJECT", { properties, required: Object.keys(properties) });

const SCHEMAS = {
  chapters: obj({
    recognized: S("BOOLEAN"),
    edition: S("STRING"),
    note: S("STRING"),
    chapters: S("ARRAY", { items: obj({ number: S("STRING"), title: S("STRING") }) }),
  }),
  notes: obj({ markdown: S("STRING") }),
  outline: obj({
    intro: S("STRING"),
    sections: S("ARRAY", { items: obj({ number: S("STRING"), title: S("STRING"), focus: S("STRING") }) }),
  }),
  section: obj({ markdown: S("STRING") }),
  concepts: obj({ keyConcepts: S("ARRAY", { items: obj({ title: S("STRING"), text: S("STRING") }) }) }),
  flashcards: obj({ flashcards: S("ARRAY", { items: obj({ front: S("STRING"), back: S("STRING") }) }) }),
  quiz: obj({
    quiz: S("ARRAY", {
      items: obj({ q: S("STRING"), options: S("ARRAY", { items: S("STRING") }), answer: S("INTEGER"), explain: S("STRING") }),
    }),
  }),
  study: obj({
    keyConcepts: S("ARRAY", { items: obj({ title: S("STRING"), text: S("STRING") }) }),
    flashcards: S("ARRAY", { items: obj({ front: S("STRING"), back: S("STRING") }) }),
    quiz: S("ARRAY", {
      items: obj({
        q: S("STRING"),
        options: S("ARRAY", { items: S("STRING") }),
        answer: S("INTEGER"),
        explain: S("STRING"),
      }),
    }),
  }),
};

const SYSTEM = `You write study material for a college student about one of their course textbooks.
You can't see the student's copy, so work from what you know about this book and its subject.
Write in clear, plain language, in your own words. Never copy text from the book.
If you aren't sure about something specific to this edition, write what the chapter most likely covers rather than refusing.`;

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

const STUDY_PARTS = {
  concepts: `"keyConcepts": 8-12 of the chapter's most important ideas, each with a short "title" and 1-3 sentence "text" (**bold** allowed).`,
  flashcards: `"flashcards": 20-25 cards, each with a "front" (question or term) and "back" (short answer or definition).`,
  quiz: `"quiz": 12 multiple-choice questions. Each has "q", exactly 4 different plausible "options", "answer" (the index 0-3 of the correct option) and a one-sentence "explain".`,
};

function prompts(action, book, chapter, section, allSections, extra = {}) {
  const ch = chapter && `Chapter ${chapter.number}${chapter.title ? `: ${chapter.title}` : ""}`;
  if (action === "study" && extra.part) {
    return `${describe(book)}

Write study tools for ${ch}:
${STUDY_PARTS[extra.part]}`;
  }
  if (action === "stream") {
    const base = `${describe(book)}

You're writing study notes for ${ch}, one section at a time. The chapter's sections are:
${allSections.map((x) => `- ${x.number} ${x.title}`).join("\n")}

Write the notes for section ${section.number} ${section.title} only${section.focus ? ` (it covers: ${section.focus})` : ""}.
About 400-700 words, explaining everything a student needs to understand this section, with examples, formulas or step-by-step processes where the topic has them.
Write plain Markdown using ONLY this format:
- First line exactly: "## ${section.number} ${section.title}"
- Then paragraphs, bullet lists ("- "), numbered lists ("1. "), one level of nested bullets (indent 2 spaces), **bold** for key terms, \`code\` for formulas. "### " for sub-headings.
- No "# " heading, no other "## " headings, no tables, images, links or HTML. Blank line between paragraphs.
- Don't repeat material that belongs to the other sections. Output only the notes, nothing else.`;
    if (!extra.soFar) return base;
    return `${base}

You already started writing this section. Here is everything written so far:
<<<
${extra.soFar}
>>>
Continue EXACTLY where it stops (even mid-sentence). Don't repeat anything above, don't restart the section and don't add the heading again. If the section is already complete, reply with nothing.`;
  }
  if (action === "outline") {
    return `${describe(book)}

Outline ${ch}.
"intro": one paragraph (3-5 sentences) on what the chapter covers and why it matters.
"sections": the chapter's main sections in order (usually 5-9). "number" like "${chapter.number}.1", "title" the section title, "focus" one sentence listing the topics that section covers.
Use the book's real section titles if you know them.`;
  }
  if (action === "section") {
    return `${describe(book)}

You're writing study notes for ${ch}, one section at a time. The chapter's sections are:
${allSections.map((x) => `- ${x.number} ${x.title}`).join("\n")}

Write the notes for section ${section.number} ${section.title} only${section.focus ? ` (it covers: ${section.focus})` : ""}.
About 400-700 words, explaining everything a student needs to understand this section, with examples, formulas or step-by-step processes where the topic has them.
Return them in "markdown" using ONLY this format:
- First line exactly: "## ${section.number} ${section.title}"
- Then paragraphs, bullet lists ("- "), numbered lists ("1. "), one level of nested bullets (indent 2 spaces), **bold** for key terms, \`code\` for formulas. "### " for sub-headings.
- No "# " heading, no other "## " headings, no tables, images, links or HTML. Blank line between paragraphs.
- Don't repeat material that belongs to the other sections.`;
  }
  if (action === "chapters") {
    return `${describe(book)}

List this book's chapters in order (main chapters only, not sections). Use the edition that matches the year/ISBN.
Set "recognized" to true only if you actually know this book's table of contents. If you don't, set it to false and give your best guess at the chapters a book with this title and subject would have.
"edition": a short label like "Computer Networking, 8th edition (2020)".
"note": one sentence for the student about how reliable this chapter list is.`;
  }
  if (action === "notes") {
    return `${describe(book)}

Write detailed study notes for ${ch}, section by section, covering everything a student needs to understand the chapter (about 2,000-3,500 words).
Return them in "markdown" using ONLY this format:
- First line: "# ${ch}"
- Then one intro paragraph about what the chapter covers.
- One "## " heading per section, starting with the section number, e.g. "## ${chapter.number}.1 Section title".
- Inside sections: paragraphs, bullet lists ("- "), numbered lists ("1. "), one level of nested bullets (indent 2 spaces), **bold** for key terms, \`code\` for formulas or commands. "### " for sub-headings.
- Include worked examples, formulas and step-by-step processes where the topic has them.
- End with "## Key terms" (bullets: "- **Term:** definition") and "## Quick review" (bullets of things to be able to do for a test).
- No tables, images, links or HTML. Blank line between paragraphs.`;
  }
  return `${describe(book)}

Write study tools for ${ch}:
- "keyConcepts": 8-12 of the chapter's most important ideas, each with a short "title" and 1-3 sentence "text" (**bold** allowed).
- "flashcards": 20-30 cards, each with a "front" (question or term) and "back" (answer or definition).
- "quiz": 12-15 multiple-choice questions. Each has "q", exactly 4 different plausible "options", "answer" (the index 0-3 of the correct option) and a one-sentence "explain".`;
}

// ---------- Calling Gemini ----------
class GeminiError extends Error {
  constructor(status, message, kind) {
    super(message);
    this.status = status;
    this.kind = kind; // "model" = try the next model, "quota", "other"
  }
}

// Keep "thinking" short: it's slow, and chapter lists and notes don't need much.
// Gemini 2.5 models take a thinking budget; newer models take a thinking level.
const thinkingFor = (model) => (/2\.5/.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: "low" });

async function callModel(model, action, text, deadline, opts = {}) {
  const schemaKey = opts.schemaKey || action;
  const perModel = 40000; // one slow model can't use up all the time
  const timeLeft = Math.min(perModel, deadline - Date.now());
  if (timeLeft < 3000) throw new GeminiError(504, "Ran out of time", "timeout");
  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: SCHEMAS[schemaKey],
    temperature: 0.4,
    maxOutputTokens: opts.maxOutputTokens || 16384,
  };
  if (!opts.noThinkingConfig) generationConfig.thinkingConfig = thinkingFor(model);
  let res;
  try {
    res = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
      signal: AbortSignal.timeout(timeLeft),
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig,
      }),
    });
  } catch (e) {
    if (e && (e.name === "TimeoutError" || e.name === "AbortError")) throw new GeminiError(504, `${model} took too long`, "timeout");
    throw new GeminiError(502, `Couldn't reach Gemini: ${e && e.message}`, "other");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || `HTTP ${res.status}`;
    // This model doesn't accept the thinking setting: ask again without it.
    if (res.status === 400 && /thinking/i.test(msg) && !opts.noThinkingConfig) {
      return callModel(model, action, text, deadline, { ...opts, noThinkingConfig: true });
    }
    // Model missing, renamed or not offered on the free tier: try the next one.
    if (res.status === 404 || (res.status === 400 && /model|not supported|not found/i.test(msg)) ||
        (res.status === 429 && /limit:\s*0\b|free_tier.*limit.*\b0\b/i.test(msg))) {
      throw new GeminiError(res.status, msg, "model");
    }
    if (res.status === 429) throw new GeminiError(429, msg, "quota");
    if (res.status === 400 && /api key/i.test(msg)) throw new GeminiError(401, msg, "key");
    if (res.status === 403) throw new GeminiError(403, msg, "key");
    if (res.status >= 500) throw new GeminiError(503, msg, "busy");
    throw new GeminiError(502, msg, "other");
  }
  const cand = (data.candidates || [])[0];
  const out = cand && cand.content && (cand.content.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  if (!out) {
    const reason = (cand && cand.finishReason) || (data.promptFeedback && data.promptFeedback.blockReason) || "empty answer";
    throw new GeminiError(502, `Gemini returned no text (${reason})`, "other");
  }
  return JSON.parse(out);
}

// Ask Google which Flash models this key can use, so we only try real ones.
let keyModels = null;
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

// Our preferred models that this key has, then any other plain Flash model it has (newest first).
async function modelOrder() {
  const available = await modelsForKey();
  if (!available) return MODELS;
  const version = (n) => parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  const preferred = MODELS.filter((m) => m === process.env.GEMINI_MODEL || available.includes(m));
  const extra = available
    .filter((n) => !preferred.includes(n) && !/lite|image|tts|audio|live|exp|preview|thinking/i.test(n))
    .sort((x, y) => version(y) - version(x));
  const order = [...preferred, ...extra];
  return order.length ? order : MODELS;
}

async function ask(action, text, opts = {}) {
  const deadline = Date.now() + 45000; // every request answers within 45 s
  const base = workingModel ? [workingModel] : [];
  const order = [...new Set([...base, ...(await modelOrder())])];
  let last;
  for (const model of order) {
    try {
      const result = await callModel(model, action, text, deadline, opts);
      workingModel = model;
      return { result, model };
    } catch (err) {
      last = err;
      if (!(err instanceof GeminiError)) throw err;
      // Unavailable, too slow or overloaded: try the next model if there's time.
      if (!["model", "timeout", "busy"].includes(err.kind)) throw err;
      if (deadline - Date.now() < 8000) break;
    }
  }
  throw last || new GeminiError(502, "No Gemini model available", "other");
}

// ---------- Streaming one section of notes (stops after 45 s) ----------
async function streamSection(res, text) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  const send = (obj) => res.write(JSON.stringify(obj) + "\n");
  const stopAt = Date.now() + 45000;
  const order = [...new Set([...(workingModel ? [workingModel] : []), ...(await modelOrder())])];
  let lastErr = null;

  for (const model of order) {
    if (stopAt - Date.now() < 8000) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), stopAt - Date.now());
    let wrote = false;
    try {
      const body = (withThinking) => JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096, ...(withThinking ? { thinkingConfig: thinkingFor(model) } : {}) },
      });
      const url = `${API}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
      const headers = { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY };
      let r = await fetch(url, { method: "POST", headers, body: body(true), signal: controller.signal });
      if (r.status === 400) {
        const msg = await r.text();
        if (/thinking/i.test(msg)) r = await fetch(url, { method: "POST", headers, body: body(false), signal: controller.signal });
        else throw new GeminiError(400, msg.slice(0, 300), /model|not supported|not found/i.test(msg) ? "model" : "other");
      }
      if (!r.ok) {
        const msg = (await r.text()).slice(0, 400);
        if (r.status === 404 || (r.status === 429 && /limit:\s*0\b/i.test(msg))) throw new GeminiError(r.status, msg, "model");
        if (r.status === 429) throw new GeminiError(429, msg, "quota");
        if (r.status === 403) throw new GeminiError(403, msg, "key");
        throw new GeminiError(r.status >= 500 ? 503 : 502, msg, r.status >= 500 ? "busy" : "other");
      }
      workingModel = model;
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finish = null;
      try {
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
              wrote = true;
              send({ t });
            }
            if (cand.finishReason) finish = cand.finishReason;
          }
        }
      } catch (e) {
        if (!(e && e.name === "AbortError")) throw e;
        // 45 s are up: send what we have; the page asks for the rest.
        clearTimeout(timer);
        send({ more: true, model });
        return res.end();
      }
      clearTimeout(timer);
      if (finish === "MAX_TOKENS") send({ more: true, model });
      else if (finish && finish !== "STOP") send({ error: `Gemini stopped early (${finish}). Try again.`, model });
      else send({ done: true, model });
      return res.end();
    } catch (e) {
      clearTimeout(timer);
      if (wrote) {
        // Something broke midway: keep what was written and continue next time.
        send({ more: true, model });
        return res.end();
      }
      lastErr = e && e.name === "AbortError" ? new GeminiError(504, "Gemini took too long", "timeout") : e;
      if (!(lastErr instanceof GeminiError) || !["model", "timeout", "busy"].includes(lastErr.kind)) break;
    }
  }
  const err = lastErr instanceof GeminiError ? lastErr : new GeminiError(502, String(lastErr && lastErr.message), "other");
  const wait = Number((String(err.message).match(/retry in ([\d.]+)s/i) || [])[1]);
  send({
    error: {
      quota: "Gemini's free limit is used up for now.",
      key: "The Gemini key in Vercel isn't working. Check GEMINI_API_KEY in the project's settings.",
      timeout: "Gemini didn't start answering in time.",
      busy: "Gemini is busy right now.",
    }[err.kind] || "Gemini had a problem.",
    retryAfter: err.kind === "quota" ? Math.min(60, Math.ceil(wait || 20)) : err.kind === "timeout" || err.kind === "busy" ? 5 : null,
    setup: err.kind === "key",
  });
  return res.end();
}

// ---------- Diagnostics: open /api/gemini in a browser ----------
// Shows which models the key can use and how fast each answers. Never shows the key.
async function diagnose() {
  const report = { keySet: !!process.env.GEMINI_API_KEY, checkedAt: new Date().toISOString() };
  if (!report.keySet) return { ...report, advice: "GEMINI_API_KEY isn't set in Vercel (or the site wasn't redeployed after adding it)." };
  try {
    const res = await fetch(`${API}?pageSize=200`, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(10000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ...report, listModelsError: (data.error && data.error.message) || `HTTP ${res.status}` };
    report.flashModelsForThisKey = (data.models || [])
      .filter((m) => /flash/i.test(m.name) && (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""));
  } catch (e) {
    return { ...report, listModelsError: String(e && e.message) };
  }
  report.tests = [];
  const deadline = Date.now() + 50000;
  for (const model of MODELS) {
    if (deadline - Date.now() < 5000) break;
    const t0 = Date.now();
    try {
      await callModel(model, "chapters", 'Return {"recognized":false,"edition":"test","note":"ok","chapters":[{"number":"1","title":"Test"}]}.', Math.min(deadline, Date.now() + 15000), { maxOutputTokens: 256 });
      report.tests.push({ model, ok: true, ms: Date.now() - t0 });
      break; // found a working one
    } catch (e) {
      report.tests.push({ model, ok: false, ms: Date.now() - t0, problem: e.kind || "error", detail: String(e.message).slice(0, 160) });
    }
  }
  return report;
}

// ---------- Cleaning up the answer ----------
function cleanStudy(s) {
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  return {
    keyConcepts: (s.keyConcepts || []).map((k) => ({ title: str(k.title), text: str(k.text) })).filter((k) => k.title && k.text),
    flashcards: (s.flashcards || []).map((c) => ({ front: str(c.front), back: str(c.back) })).filter((c) => c.front && c.back),
    quiz: (s.quiz || [])
      .map((q) => ({ q: str(q.q), options: (q.options || []).map(str), answer: q.answer, explain: str(q.explain) }))
      .filter((q) => q.q && q.options.length === 4 && new Set(q.options).size === 4 && q.options.every(Boolean) &&
        Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4),
  };
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
  if (!["chapters", "outline", "section", "notes", "study", "stream"].includes(action)) return res.status(400).json({ error: "Unknown action." });
  const part = ["concepts", "flashcards", "quiz"].includes(body.part) ? body.part : null;
  const book = readBook(body.book);
  if (!book) return res.status(400).json({ error: "Missing book details." });
  let chapter = null;
  if (action !== "chapters") {
    chapter = { number: clip(body.chapter && body.chapter.number, 20), title: clip(body.chapter && body.chapter.title, 200) };
    if (!chapter.number && !chapter.title) return res.status(400).json({ error: "Missing chapter." });
  }
  let section = null;
  let allSections = [];
  if (action === "section" || action === "stream") {
    const sec = body.section || {};
    section = { number: clip(sec.number, 20), title: clip(sec.title, 200), focus: clip(sec.focus, 400) };
    if (!section.title) return res.status(400).json({ error: "Missing section." });
    allSections = (Array.isArray(body.allSections) ? body.allSections : []).slice(0, 20)
      .map((x) => ({ number: clip(x && x.number, 20), title: clip(x && x.title, 200) })).filter((x) => x.title);
    if (!allSections.length) allSections = [section];
  }

  if (action === "stream") {
    const soFar = clip(body.soFar, 24000);
    try {
      return await streamSection(res, prompts("stream", book, chapter, section, allSections, { soFar }));
    } catch (err) {
      console.error("stream error", err);
      if (!res.headersSent) return res.status(502).json({ error: "Gemini had a problem. Please try again." });
      res.write(JSON.stringify({ error: "Gemini had a problem. Please try again.", retryAfter: 5 }) + "\n");
      return res.end();
    }
  }

  try {
    const { result, model } = await ask(action, prompts(action, book, chapter, section, allSections, { part }), part ? { schemaKey: part } : {});
    let out = result;
    if (action === "study") {
      const all = cleanStudy(result);
      out = part ? { [{ concepts: "keyConcepts", flashcards: "flashcards", quiz: "quiz" }[part]]: all[{ concepts: "keyConcepts", flashcards: "flashcards", quiz: "quiz" }[part]] } : all;
    }
    if (action === "section") {
      let md = String(result.markdown || "").trim().replace(/^#\s.*\n+/, "");
      const heading = `## ${[section.number, section.title].filter(Boolean).join(" ")}`;
      if (!/^##\s/.test(md)) md = `${heading}\n\n${md}`;
      // Only one section heading: demote any extra "## " headings to sub-headings.
      const lines = md.split("\n");
      md = [lines[0], ...lines.slice(1).map((l) => l.replace(/^##\s/, "### "))].join("\n");
      if (md.length < 80) return res.status(502).json({ error: "Gemini's notes for this section came back empty. Try again." });
      out = { markdown: md };
    }
    if (action === "outline") {
      out = {
        intro: clip(result.intro, 2000),
        sections: (result.sections || []).map((x) => ({ number: clip(x.number, 20), title: clip(x.title, 200), focus: clip(x.focus, 400) }))
          .filter((x) => x.title).slice(0, 14),
      };
      if (!out.sections.length) return res.status(502).json({ error: "Gemini couldn't outline this chapter. Try again." });
    }
    if (action === "notes" && !/^##\s/m.test(String(result.markdown || ""))) {
      return res.status(502).json({ error: "Gemini's notes came back in the wrong format. Try again." });
    }
    if (action === "chapters") {
      out.chapters = (result.chapters || [])
        .map((c) => ({ number: clip(c.number, 20).replace(/^chapter\s*/i, ""), title: clip(c.title, 200) }))
        .filter((c) => c.number && c.title);
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ...out, model });
  } catch (err) {
    if (err instanceof SyntaxError) return res.status(502).json({ error: "Gemini sent back an unreadable answer. Try again." });
    if (err instanceof GeminiError) {
      if (err.kind === "timeout") {
        return res.status(504).json({ error: "Gemini took too long to answer.", retryAfter: 5 });
      }
      if (err.kind === "busy") {
        return res.status(503).json({ error: "Gemini is busy right now.", retryAfter: 10 });
      }
      if (err.kind === "quota") {
        const wait = Number((String(err.message).match(/retry in ([\d.]+)s/i) || [])[1]);
        const daily = /per.?day|daily/i.test(err.message);
        return res.status(429).json({
          retryAfter: daily ? null : Math.min(60, Math.ceil(wait || 20)), error: "Gemini's free limit is used up for now. Wait a minute (or until tomorrow if it's the daily limit) and try again." });
      }
      if (err.kind === "key") {
        return res.status(503).json({ error: "The Gemini key in Vercel isn't working. Check GEMINI_API_KEY in the project's settings.", setup: true });
      }
      if (err.kind === "model") {
        return res.status(503).json({ error: "None of the Gemini models are available to this key. Set GEMINI_MODEL in Vercel to a model listed in Google AI Studio.", detail: err.message.slice(0, 300) });
      }
      console.error("Gemini error", err.status, err.message);
      return res.status(502).json({ error: "Gemini had a problem. Please try again.", detail: err.message.slice(0, 300) });
    }
    console.error("gemini handler error", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};

// Every request finishes within about 45 s, so 60 s is plenty on any Vercel plan.
module.exports.config = { maxDuration: 60 };
