// Keeps your books, notes, check-offs and quiz scores the same on every device.
// Storage: a free Upstash Redis database connected to this Vercel project
// (Vercel → Storage → Upstash for Redis). Vercel adds its URL and token as
// environment variables; both the KV_* and UPSTASH_* names are supported.

const { store, redis, sameSite } = require("./_redis");

const DATA = "cac:data"; // field -> JSON value
const META = "cac:meta"; // field -> last change time (ms)
const FIELD = /^(books|booksRemoved|done|estimates|quizScores|gen:.{1,400})$/;

const pairs = (list) => {
  const o = {};
  for (let i = 0; i + 1 < (list || []).length; i += 2) o[list[i]] = Number(list[i + 1]);
  return o;
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST" });
  }
  // Only this website's own pages may use it.
  if (!sameSite(req)) return res.status(403).json({ error: "Not allowed." });
  const db = store();
  if (!db) return res.status(503).json({ error: "Sync isn't set up yet.", setup: true });

  const body = req.body || {};
  try {
    if (body.op === "meta") {
      const [meta] = await redis(db, [["HGETALL", META]]);
      return res.status(200).json({ meta: pairs(meta) });
    }
    if (body.op === "get") {
      const fields = (Array.isArray(body.fields) ? body.fields : []).filter((f) => FIELD.test(f)).slice(0, 200);
      if (!fields.length) return res.status(200).json({ values: {} });
      const [vals, ats] = await redis(db, [["HMGET", DATA, ...fields], ["HMGET", META, ...fields]]);
      const values = {};
      fields.forEach((f, i) => {
        if (vals[i] == null) return;
        try {
          values[f] = { value: JSON.parse(vals[i]), at: Number(ats[i]) || 0 };
        } catch {
          /* skip a damaged value */
        }
      });
      return res.status(200).json({ values });
    }
    if (body.op === "set") {
      const field = String(body.field || "");
      if (!FIELD.test(field)) return res.status(400).json({ error: "Unknown field." });
      const at = Date.now();
      if (body.value === null || body.value === undefined) {
        await redis(db, [["HDEL", DATA, field], ["HDEL", META, field]]);
      } else {
        await redis(db, [["HSET", DATA, field, JSON.stringify(body.value)], ["HSET", META, field, String(at)]]);
      }
      return res.status(200).json({ at });
    }
    return res.status(400).json({ error: "Unknown op." });
  } catch (err) {
    return res.status(502).json({ error: `Sync failed: ${err.message}` });
  }
};
