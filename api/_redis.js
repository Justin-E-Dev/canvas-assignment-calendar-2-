// Shared helper for the site's free Upstash Redis database (Vercel → Storage).
// Files starting with "_" in api/ are not web endpoints on Vercel.

function store() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function redis(db, commands) {
  const res = await fetch(`${db.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${db.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Database answered ${res.status}`);
  const out = await res.json();
  const bad = out.find((r) => r.error);
  if (bad) throw new Error(bad.error);
  return out.map((r) => r.result);
}

// True when the request comes from this website's own pages.
function sameSite(req) {
  try {
    const origin = req.headers.origin;
    return !!origin && new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

module.exports = { store, redis, sameSite };
