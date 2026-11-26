// Vercel serverless function: downloads a Canvas calendar feed for the page.
// Browsers block web pages from downloading the feed directly, so the page
// sends the link here (POST /api/feed) and this function fetches it.
//
// The link is sent in the request body, not the URL, so it doesn't end up in logs.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST" });
  }

  let url = (req.body && req.body.url) || "";
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
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(text);
  } catch {
    return res.status(502).json({ error: "Couldn't reach Canvas. Try again in a minute." });
  }
};
