// Vercel serverless function: downloads a Canvas calendar feed for the page.
// Browsers block web pages from downloading the feed directly, so the page
// sends the link here (POST /api/feed) and this function fetches it.
//
// The link is sent in the request body, not the URL, so it doesn't end up in logs.
// If the page sends no link, the website uses a saved one, so you only paste it once:
//   1. CANVAS_FEED_URL in Vercel's environment settings, if you set it, or
//   2. the last link that worked, kept in the site's database (Upstash Redis).
// The saved link is only ever used here on the server; it is never sent back to a page.

const { store, redis, sameSite } = require("./_redis");

const SAVED = "cac:feedUrl";

async function savedLink() {
  if (process.env.CANVAS_FEED_URL) return process.env.CANVAS_FEED_URL;
  const db = store();
  if (!db) return "";
  try {
    const [url] = await redis(db, [["GET", SAVED]]);
    return url || "";
  } catch {
    return "";
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST" });
  }

  res.setHeader("Cache-Control", "no-store");
  if (!sameSite(req)) return res.status(403).json({ error: "Not allowed." });

  const pasted = (req.body && req.body.url) || "";
  let url = pasted || (await savedLink());
  if (!url) {
    return res.status(404).json({ error: "No feed link saved on the website yet.", noDefault: true });
  }
  url = String(url).trim().replace(/^webcal:\/\//i, "https://");

  let target;
  try {
    target = new URL(url);
  } catch {
    return res.status(400).json({ error: "That isn't a valid link." });
  }

  // Only Canvas calendar feed links (https://<school>/feeds/calendars/...).
  if (target.protocol !== "https:" || !target.pathname.startsWith("/feeds/calendars/")) {
    return res.status(400).json({
      error: "That doesn't look like a Canvas calendar feed link. It should contain /feeds/calendars/.",
    });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: { "User-Agent": "canvas-assignment-calendar" },
      redirect: "follow",
    });
    if (!upstream.ok) {
      return res.status(502).json({
        error: `Canvas answered with an error (${upstream.status}). Check that you copied the whole link.`,
      });
    }
    const text = await upstream.text();
    if (!text.includes("BEGIN:VCALENDAR")) {
      return res.status(502).json({ error: "Canvas didn't send back a calendar. Check that you copied the whole link." });
    }
    // A new link that works: remember it for every device and browser.
    const db = store();
    if (pasted && db) {
      try {
        await redis(db, [["SET", SAVED, target.toString()]]);
      } catch {
        /* still show the calendar */
      }
    }
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    return res.status(200).send(text);
  } catch {
    return res.status(502).json({ error: "Couldn't reach Canvas. Try again in a minute." });
  }
};
