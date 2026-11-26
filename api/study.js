// Vercel serverless function: AI study help for a book (POST /api/study).
//
//   { action: "chapters", book }           -> list of the book's chapters
//   { action: "summary",  book, chapter }  -> key-concept notes for one chapter
//
// Uses Claude through the Anthropic API. The API key lives only in Vercel's
// environment settings (ANTHROPIC_API_KEY), never in this code or the browser.

const { Anthropic } = require("@anthropic-ai/sdk");

const MODEL = "claude-opus-5-5";
let client; // created on first use, so a missing key gives a clear error instead of a crash

// ---------- Response shapes (Claude must answer in exactly this JSON) ----------
const CHAPTERS_SCHEMA = {
  type: "object",
  properties: {
    recognized: { type: "boolean", description: "True only if you know this specific book well enough to list its chapters." },
    note: { type: "string", description: "One short sentence for the student, e.g. which edition this list matches, or why it may not match." },
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          number: { type: "string", description: "Chapter number or label, e.g. \"1\" or \"Appendix A\"" },
          title: { type: "string" },
        },
        required: ["number", "title"],
        additionalProperties: false,
      },
    },
  },
  required: ["recognized", "note", "chapters"],
  additionalProperties: false,
};

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    chapter_title: { type: "string" },
    overview: { type: "string", description: "2-4 sentences: what the chapter is about and why it matters." },
    key_concepts: {
      type: "array",
      description: "The 4-8 most important ideas, most important first.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          explanation: { type: "string", description: "2-4 plain-language sentences, with a quick example where it helps." },
        },
        required: ["name", "explanation"],
        additionalProperties: false,
      },
    },
    key_terms: {
      type: "array",
      description: "5-12 vocabulary words a student should know.",
      items: {
        type: "object",
        properties: { term: { type: "string" }, definition: { type: "string" } },
        required: ["term", "definition"],
        additionalProperties: false,
      },
    },
    takeaways: { type: "array", items: { type: "string" }, description: "3-5 one-line things to remember for a test." },
    confidence: { type: "string", enum: ["high", "medium", "low"], description: "How sure you are that this matches this book's actual chapter." },
    caveat: { type: "string", description: "Empty if confidence is high; otherwise one sentence telling the student what may not match." },
  },
  required: ["chapter_title", "overview", "key_concepts", "key_terms", "takeaways", "confidence", "caveat"],
  additionalProperties: false,
};

const SYSTEM = `You help a college student study their course textbooks.
You only have your own knowledge of books; you cannot see the student's copy.
Be honest about that: if you don't know a specific book or chapter well, say so in the fields provided for it rather than inventing details. Never make up chapter titles for a book you don't recognize.
Write in clear, plain language a student can review quickly. Explain ideas in your own words; don't reproduce passages from the book.`;

// ---------- Input checks ----------
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

function readBook(raw) {
  if (!raw || typeof raw !== "object") return null;
  const book = {
    title: clip(raw.title, 300),
    authors: (Array.isArray(raw.authors) ? raw.authors : []).slice(0, 6).map((a) => clip(a, 100)).filter(Boolean),
    year: clip(raw.year, 10),
    isbn: clip(raw.isbn, 20),
    course: clip(raw.course, 100),
  };
  return book.title ? book : null;
}

function describeBook(b) {
  return [
    `Title: ${b.title}`,
    b.authors.length && `Author(s): ${b.authors.join(", ")}`,
    b.year && `Year: ${b.year}`,
    b.isbn && `ISBN: ${b.isbn}`,
    b.course && `The student is using it for the course: ${b.course}`,
  ].filter(Boolean).join("\n");
}

// ---------- Calling Claude ----------
async function askClaude(prompt, schema) {
  client ||= new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    // If Claude declines a request, retry it on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    const err = new Error("The AI couldn't help with this one. Try a different chapter or book.");
    err.status = 422;
    throw err;
  }
  if (response.stop_reason === "max_tokens") {
    const err = new Error("The answer was too long to finish. Please try again.");
    err.status = 502;
    throw err;
  }
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST" });
  }

  // Only accept requests from this website's own pages.
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).json({ error: "Not allowed." });
    } catch {
      return res.status(403).json({ error: "Not allowed." });
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: "AI notes aren't set up yet. Add an ANTHROPIC_API_KEY in the Vercel project's Environment Variables, then redeploy.",
    });
  }

  const body = req.body || {};
  const book = readBook(body.book);
  if (!book) return res.status(400).json({ error: "Missing book details." });

  let prompt, schema;
  if (body.action === "chapters") {
    schema = CHAPTERS_SCHEMA;
    prompt = `${describeBook(book)}

List this book's chapters in order (main chapters only, not sections). If several editions exist, use the edition that best matches the year/ISBN and say which in "note".
If you don't recognize this specific book, set "recognized" to false, return an empty "chapters" list, and use "note" to suggest the student type in the chapter themselves.`;
  } else if (body.action === "summary") {
    const number = clip(body.chapter && body.chapter.number, 40);
    const title = clip(body.chapter && body.chapter.title, 300);
    if (!number && !title) return res.status(400).json({ error: "Pick a chapter first." });
    schema = SUMMARY_SCHEMA;
    prompt = `${describeBook(book)}

Chapter: ${[number && `Chapter ${number}`, title].filter(Boolean).join(" - ")}

Write study notes covering the most important concepts in this chapter, as a quick-review guide.
If you aren't sure what this exact chapter covers in this edition, base the notes on what it most likely covers given the book and chapter title, set "confidence" accordingly, and explain in "caveat".`;
  } else {
    return res.status(400).json({ error: "Unknown action." });
  }

  try {
    const result = await askClaude(prompt, schema);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(result);
  } catch (err) {
    if (err.status === 422 || (err.status === 502 && !(err instanceof Anthropic.APIError))) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(503).json({ error: "The AI key in Vercel isn't working. Check ANTHROPIC_API_KEY in the project's settings." });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "The AI is busy right now. Wait a minute and try again." });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return res.status(502).json({ error: "The AI service had a problem. Please try again." });
    }
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: "The AI sent back an unreadable answer. Please try again." });
    }
    console.error("study error", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
};

// Give Claude enough time to write the notes.
module.exports.config = { maxDuration: 60 };
