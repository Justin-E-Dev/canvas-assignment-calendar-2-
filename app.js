// Canvas Assignment Calendar
// Reads a Canvas calendar feed (.ics) and shows assignments on a month calendar.

const STORE = {
  feedUrl: "cac.feedUrl",
  lastIcs: "cac.lastIcs",
  done: "cac.done",
  hideDone: "cac.hideDone",
};

const COLORS = [
  "#2f6fde", "#d9480f", "#2b8a3e", "#ae3ec9", "#e8590c",
  "#0c8599", "#c2255c", "#5c940d", "#6741d9", "#a61e4d",
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
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(),
  };

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
  function renderCalendar() {
    const first = new Date(state.viewYear, state.viewMonth, 1);
    $("monthLabel").textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

    const byDay = {};
    for (const e of visible()) (byDay[dayKey(e.due)] ||= []).push(e);

    const start = new Date(first);
    start.setDate(1 - first.getDay()); // back up to Sunday
    const today = new Date();
    const grid = $("grid");
    grid.innerHTML = "";

    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (i === 35 && d.getMonth() !== state.viewMonth) break; // skip a 6th row when not needed

      const cell = document.createElement("div");
      cell.className = "day";
      if (d.getMonth() !== state.viewMonth) cell.classList.add("other");
      if (sameDay(d, today)) cell.classList.add("today");
      cell.innerHTML = `<div class="day-num">${d.getDate()}</div>`;

      for (const e of byDay[dayKey(d)] || []) {
        const chip = document.createElement("button");
        chip.className = "chip" + (state.done.has(e.id) ? " done" : "");
        chip.style.setProperty("--c", state.courseColors[e.course]);
        chip.textContent = e.title;
        chip.title = `${e.title} (${e.course}) - ${fmtTime(e)}`;
        chip.onclick = () => showDetail(e);
        cell.appendChild(chip);
      }
      grid.appendChild(cell);
    }
  }

  function renderUpcoming() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekOut = new Date(startOfToday);
    weekOut.setDate(weekOut.getDate() + 8);

    const items = visible().filter((e) => {
      const after = e.allDay ? e.due >= startOfToday : e.due >= now;
      return after && e.due < weekOut;
    });

    const list = $("upcoming");
    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = `<li class="empty">Nothing due this week.</li>`;
      return;
    }
    for (const e of items) {
      const li = document.createElement("li");
      if (state.done.has(e.id)) li.classList.add("done");

      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = state.done.has(e.id);
      box.title = "Mark as done";
      box.onchange = () => toggleDone(e.id);

      const info = document.createElement("div");
      info.className = "info";
      info.innerHTML = `
        <div class="title"><span class="dot" style="--c:${state.courseColors[e.course]}"></span>${escapeHtml(e.title)}</div>
        <div class="meta">${escapeHtml(e.course)} &middot; ${fmtDay(e.due)}, ${fmtTime(e)}</div>`;
      info.onclick = () => showDetail(e);

      li.append(box, info);
      list.appendChild(li);
    }
  }

  function renderCourses() {
    const list = $("courses");
    list.innerHTML = "";
    for (const [course, color] of Object.entries(state.courseColors)) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="dot" style="--c:${color}"></span>${escapeHtml(course)}`;
      list.appendChild(li);
    }
  }

  function renderAll() {
    renderCalendar();
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
    state.viewMonth--;
    if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear--; }
    renderCalendar();
  };
  $("nextBtn").onclick = () => {
    state.viewMonth++;
    if (state.viewMonth > 11) { state.viewMonth = 0; state.viewYear++; }
    renderCalendar();
  };
  $("todayBtn").onclick = () => {
    const t = new Date();
    state.viewYear = t.getFullYear();
    state.viewMonth = t.getMonth();
    renderCalendar();
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
