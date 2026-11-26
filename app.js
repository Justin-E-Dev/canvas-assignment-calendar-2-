// Canvas Assignment Calendar
// Reads a Canvas calendar feed (.ics) and shows assignments on a month calendar.

const STORE = {
  feedUrl: "cac.feedUrl",
  lastIcs: "cac.lastIcs",
  done: "cac.done",
  hideDone: "cac.hideDone",
  range: "cac.range",
};

// How far ahead the "Due in the next…" list looks.
const RANGES = {
  "1w": { label: "week", days: 7 },
  "2w": { label: "2 weeks", days: 14 },
  "1m": { label: "month", months: 1 },
};

// Bold course colors, all dark enough for white text on top.
const COLORS = [
  "#4c4cf5", "#e0335f", "#0f8a5f", "#8a3ffc", "#d14d0f",
  "#0a7ea4", "#b8327a", "#5a7d0a", "#c2410c", "#1f6feb",
];

// ---------- Storage helpers (browser storage can fail, so never crash) ----------
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

// ---------- ICS parsing ----------
function unfold(text) {
  // Lines that start with a space or tab continue the previous line.
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeText(s) {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseDate(params, value) {
  // All-day: 20261130
  if (/VALUE=DATE(?!-)/i.test(params) || /^\d{8}$/.test(value)) {
    const y = +value.slice(0, 4), m = +value.slice(4, 6) - 1, d = +value.slice(6, 8);
    return { date: new Date(y, m, d), allDay: true };
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, z] = match.map((x, i) => (i > 0 && i < 7 ? +x : x));
  const date = z
    ? new Date(Date.UTC(y, mo - 1, d, h, mi, s))
    : new Date(y, mo - 1, d, h, mi, s); // TZID times: treat as local time
  return { date, allDay: false };
}

function splitCourse(summary) {
  // Canvas titles look like: "Essay 2 [ENGL 101-03]"
  const m = summary.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  return m ? { title: m[1], course: m[2] } : { title: summary, course: "Other" };
}

function parseICS(text) {
  const events = [];
  let cur = null;

  for (const line of unfold(text).split("\n")) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur && cur.start && cur.summary) {
        const { title, course } = splitCourse(cur.summary);
        events.push({
          id: cur.uid || `${cur.summary}-${cur.start.date.getTime()}`,
          title,
          course,
          due: cur.start.date,
          allDay: cur.start.allDay,
          url: cur.url || "",
          description: cur.description || "",
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name, ...rest] = head.split(";");
    const params = rest.join(";");

    switch (name.toUpperCase()) {
      case "SUMMARY": cur.summary = unescapeText(value); break;
      case "DTSTART": cur.start = parseDate(params, value); break;
      case "UID": cur.uid = value; break;
      case "URL": cur.url = value; break;
      case "DESCRIPTION": cur.description = unescapeText(value); break;
    }
  }
  return events.sort((a, b) => a.due - b.due);
}

// Let Node load the parser for testing; the rest only runs in a browser.
if (typeof module !== "undefined") {
  module.exports = { parseICS };
}

// ---------- App ----------
if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);

  const state = {
    events: [],
    courseColors: {},
    done: new Set(load(STORE.done, [])),
    hideDone: load(STORE.hideDone, false),
    range: RANGES[load(STORE.range, "1w")] ? load(STORE.range, "1w") : "1w",
    weekStart: startOfWeek(new Date()),
  };

  function startOfWeek(d) {
    const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    s.setDate(s.getDate() - s.getDay()); // back up to Sunday
    return s;
  }
  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  // ----- Formatting -----
  const fmtDay = (d) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const fmtTime = (e) => (e.allDay ? "All day" : e.due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function assignColors() {
    const courses = [...new Set(state.events.map((e) => e.course))].sort();
    state.courseColors = {};
    courses.forEach((c, i) => (state.courseColors[c] = COLORS[i % COLORS.length]));
  }

  const visible = () => state.events.filter((e) => !(state.hideDone && state.done.has(e.id)));

  // ----- Rendering -----
  // An assignment card: a round check button plus the title (opens details).
  function taskCard(e, metaText) {
    const done = state.done.has(e.id);
    const card = document.createElement("div");
    card.className = "task" + (done ? " done" : "");
    card.style.setProperty("--c", state.courseColors[e.course]);

    const check = document.createElement("button");
    check.className = "check" + (done ? " on" : "");
    check.textContent = "✓";
    check.setAttribute("aria-label", done ? "Mark as not done" : "Mark as done");
    check.onclick = () => toggleDone(e.id);

    const body = document.createElement("button");
    body.className = "task-body";
    body.innerHTML = `<div class="task-title">${escapeHtml(e.title)}</div>
      <div class="task-meta">${escapeHtml(metaText)}</div>`;
    body.onclick = () => showDetail(e);

    card.append(check, body);
    return card;
  }

  function renderWeek() {
    const start = state.weekStart;
    const end = addDays(start, 6);
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const endLabel = end.toLocaleDateString(undefined, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
    $("weekLabel").textContent = `${startLabel} – ${endLabel}`;

    const byDay = {};
    for (const e of visible()) (byDay[dayKey(e.due)] ||= []).push(e);

    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const board = $("board");
    board.innerHTML = "";
    let total = 0, left = 0;

    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const items = byDay[dayKey(d)] || [];
      total += items.length;
      left += items.filter((e) => !state.done.has(e.id)).length;

      const col = document.createElement("div");
      col.className = "day-col";
      if (sameDay(d, today)) col.classList.add("today");
      else if (d < startOfToday) col.classList.add("past");
      if (!items.length) col.classList.add("empty-day");

      col.innerHTML = `<div class="day-head">
          <span class="day-name">${d.toLocaleDateString(undefined, { weekday: "short" })}</span>
          <span class="day-num">${d.getDate()}</span>
        </div>${sameDay(d, today) ? `<span class="today-badge">Today</span>` : ""}`;

      for (const e of items) col.appendChild(taskCard(e, `${e.course} · ${fmtTime(e)}`));
      if (!items.length) col.insertAdjacentHTML("beforeend", `<div class="day-empty">Nothing due</div>`);
      board.appendChild(col);
    }

    const isThisWeek = sameDay(start, startOfWeek(today));
    const when = isThisWeek ? "this week" : "that week";
    $("weekSummary").textContent = total
      ? `${left} of ${total} left ${when}`
      : `Nothing due ${when}`;
  }

  function renderUpcoming() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const range = RANGES[state.range];
    // End is exclusive: the day after the last day shown (today counts as day 0).
    const end = new Date(startOfToday);
    if (range.months) end.setMonth(end.getMonth() + range.months);
    else end.setDate(end.getDate() + range.days);
    end.setDate(end.getDate() + 1);

    const items = visible().filter((e) => {
      const after = e.allDay ? e.due >= startOfToday : e.due >= now;
      return after && e.due < end;
    });

    const list = $("upcoming");
    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = `<li class="empty">Nothing due in the next ${range.label}. Nice!</li>`;
      return;
    }
    for (const e of items) {
      const li = document.createElement("li");
      li.appendChild(taskCard(e, `${e.course} · ${fmtDay(e.due)}, ${fmtTime(e)}`));
      list.appendChild(li);
    }
  }

  function renderCourses() {
    const list = $("courses");
    list.innerHTML = "";
    for (const [course, color] of Object.entries(state.courseColors)) {
      const li = document.createElement("li");
      li.style.setProperty("--c", color);
      li.textContent = course;
      list.appendChild(li);
    }
  }

  function renderAll() {
    renderWeek();
    renderUpcoming();
    renderCourses();
  }

  // ----- Detail popup -----
  function showDetail(e) {
    const isDone = state.done.has(e.id);
    const desc = e.description.trim();
    $("detailBody").innerHTML = `
      <h3>${escapeHtml(e.title)}</h3>
      <div class="meta"><span class="dot" style="--c:${state.courseColors[e.course]}"></span>${escapeHtml(e.course)}
        &middot; Due ${fmtDay(e.due)}, ${fmtTime(e)}</div>
      ${desc ? `<div class="desc">${escapeHtml(desc.slice(0, 1500))}${desc.length > 1500 ? "…" : ""}</div>` : ""}
      <div class="actions">
        <button id="doneBtn" class="btn">${isDone ? "Mark as not done" : "Mark as done"}</button>
        ${e.url ? `<a class="btn btn-ghost" href="${escapeHtml(e.url)}" target="_blank" rel="noopener">Open in Canvas</a>` : ""}
      </div>`;
    $("doneBtn").onclick = () => {
      toggleDone(e.id);
      hideDetail();
    };
    document.querySelector(".modal-card").style.setProperty("--c", state.courseColors[e.course]);
    $("detail").classList.remove("hidden");
  }
  function hideDetail() {
    $("detail").classList.add("hidden");
  }

  function toggleDone(id) {
    state.done.has(id) ? state.done.delete(id) : state.done.add(id);
    save(STORE.done, [...state.done]);
    renderAll();
  }

  // ----- Loading data -----
  function setStatus(text) {
    $("status").textContent = text;
  }
  function setupMessage(text, isError) {
    const el = $("setupMsg");
    el.textContent = text;
    el.className = "msg" + (isError ? " error" : "");
  }

  function showApp() {
    $("setup").classList.add("hidden");
    $("app").classList.remove("hidden");
  }
  function showSetup() {
    $("app").classList.add("hidden");
    $("setup").classList.remove("hidden");
    $("feedUrl").value = load(STORE.feedUrl, "");
  }

  function useIcs(text, sourceLabel) {
    const events = parseICS(text);
    if (!events.length && !/BEGIN:VCALENDAR/.test(text)) {
      throw new Error("That doesn't look like a calendar file (.ics).");
    }
    state.events = events;
    assignColors();
    save(STORE.lastIcs, text);
    showApp();
    renderAll();
    setStatus(`${events.length} items loaded from ${sourceLabel} at ${new Date().toLocaleTimeString()}.`);
  }

  async function fetchFeed(url) {
    // Canvas feed links start with webcal:// sometimes; browsers need https://
    const httpsUrl = url.trim().replace(/^webcal:\/\//i, "https://");

    if (!location.protocol.startsWith("http")) {
      throw new Error(
        "The feed link only works on the website (or with python server.py).\n" +
          "For now, open the feed link in a new tab to download the .ics file and use \"Load .ics file\"."
      );
    }

    // The site's own helper (/api/feed) downloads the feed, because browsers
    // block pages from downloading it directly. The link goes in the body, not the URL.
    let res;
    try {
      res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: httpsUrl }),
      });
    } catch {
      throw new Error("Couldn't reach the website's helper. Check your internet connection and try again.");
    }
    if (res.ok) return await res.text();

    let message = `Something went wrong (${res.status}).`;
    try {
      message = (await res.json()).error || message;
    } catch {
      /* not JSON */
    }
    throw new Error(message + "\nYou can also download the .ics file from Canvas and use \"Load .ics file\".");
  }

  async function loadFromUrl(url) {
    setupMessage("Loading…");
    try {
      const text = await fetchFeed(url);
      save(STORE.feedUrl, url.trim());
      useIcs(text, "your Canvas feed");
      setupMessage("");
    } catch (err) {
      showSetup();
      setupMessage(err.message, true);
    }
  }

  // ----- Wire up controls -----
  $("loadUrlBtn").onclick = () => {
    const url = $("feedUrl").value;
    if (!url.trim()) return setupMessage("Paste your Canvas feed link first.", true);
    loadFromUrl(url);
  };

  $("fileInput").onchange = (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        useIcs(reader.result, file.name);
      } catch (err) {
        setupMessage(err.message, true);
      }
    };
    reader.readAsText(file);
    ev.target.value = "";
  };

  $("refreshBtn").onclick = () => {
    const url = load(STORE.feedUrl, "");
    url ? loadFromUrl(url) : showSetup();
  };
  $("settingsBtn").onclick = showSetup;

  $("prevBtn").onclick = () => {
    state.weekStart = addDays(state.weekStart, -7);
    renderWeek();
  };
  $("nextBtn").onclick = () => {
    state.weekStart = addDays(state.weekStart, 7);
    renderWeek();
  };
  $("todayBtn").onclick = () => {
    state.weekStart = startOfWeek(new Date());
    renderWeek();
  };

  $("rangeSelect").value = state.range;
  $("rangeSelect").onchange = (ev) => {
    state.range = ev.target.value;
    save(STORE.range, state.range);
    renderUpcoming();
  };

  $("hideDone").checked = state.hideDone;
  $("hideDone").onchange = (ev) => {
    state.hideDone = ev.target.checked;
    save(STORE.hideDone, state.hideDone);
    renderAll();
  };

  $("closeDetail").onclick = hideDetail;
  $("detail").onclick = (ev) => { if (ev.target.id === "detail") hideDetail(); };
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") hideDetail(); });

  // ----- Start -----
  const savedUrl = load(STORE.feedUrl, "");
  const cached = load(STORE.lastIcs, "");
  if (cached) {
    try { useIcs(cached, "last saved copy"); } catch { showSetup(); }
  }
  if (savedUrl) {
    loadFromUrl(savedUrl); // refresh in the background
  } else if (!cached) {
    showSetup();
  }
}
