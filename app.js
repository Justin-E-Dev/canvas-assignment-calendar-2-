// Canvas Assignment Calendar
// Reads a Canvas calendar feed (.ics) and shows assignments on a month calendar.

const STORE = {
  feedUrl: "cac.feedUrl",
  lastIcs: "cac.lastIcs",
  done: "cac.done",
  hideDone: "cac.hideDone",
  range: "cac.range",
  estimates: "cac.estimates",
};

// How far ahead the "Due in the next…" list looks.
const RANGES = {
  "1w": { label: "week", days: 7 },
  "2w": { label: "2 weeks", days: 14 },
  "1m": { label: "month", months: 1 },
};

// Bold course colors, all dark enough for white text on top.
// Soft, muted course colors: used only for small dots and stripes.
const COLORS = [
  "#6a85c9", "#c98a7a", "#6fa58b", "#9a8cc6", "#c9a46a",
  "#6aa4ae", "#b98aa6", "#8f9f6a", "#b08b6e", "#7f94b0",
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

// ---------- Time estimates ----------
// A rough guess of how long an assignment takes, from its title and description.
// Rules are checked in order; the first one whose pattern matches the title wins
// (or the description, if nothing matches the title).
const TASK_TYPES = [
  { kind: "quick task", re: /\b(survey|attendance|check-?in|syllabus|introduce yourself|acknowledg)/, minutes: 10 },
  { kind: "final exam", re: /\bfinal (exam|test)\b/, minutes: 240, study: true },
  { kind: "exam", re: /\b(midterm|exam)\b/, minutes: 180, study: true },
  { kind: "research paper", re: /\b(research|term|final) (paper|essay)\b/, minutes: 480, writing: true },
  { kind: "proposal", re: /\b(proposal|outline|abstract|thesis statement)\b/, minutes: 90, writing: true },
  { kind: "lab report", re: /\blab (report|write-?up)\b/, minutes: 180, writing: true },
  { kind: "draft", re: /\b(rough )?draft\b/, minutes: 150, writing: true },
  { kind: "essay", re: /\b(essay|paper|report|analysis|memo|article)\b/, minutes: 240, writing: true },
  { kind: "project", re: /\b(project|portfolio|capstone)\b/, minutes: 360 },
  { kind: "presentation", re: /\b(presentation|slides|speech|poster)\b/, minutes: 180 },
  { kind: "lab", re: /\blab\b/, minutes: 120 },
  { kind: "test", re: /\btest\b/, minutes: 90, study: true },
  { kind: "quiz", re: /\bquiz\b/, minutes: 30 },
  { kind: "problem set", re: /\b(problem set|pset|homework|hw|worksheet|exercises?|assignment)\b/, minutes: 90 },
  { kind: "discussion post", re: /\b(discussion|forum|post|reply|response|reflection|journal|blog)\b/, minutes: 45, writing: true },
  { kind: "reading", re: /\b(reading|read|chapters?|textbook|article)\b/, minutes: 60, reading: true },
  { kind: "video", re: /\b(video|watch|lecture|podcast|module)\b/, minutes: 45 },
];

function estimateTime(title, description) {
  const t = (title || "").toLowerCase();
  const d = (description || "").toLowerCase();
  const type = TASK_TYPES.find((x) => x.re.test(t)) || TASK_TYPES.find((x) => x.re.test(d)) ||
    { kind: "assignment", minutes: 60 };
  const why = [type.kind];
  let minutes = type.minutes;
  const num = (re) => {
    const m = d.match(re) || t.match(re);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
  };

  // Details in the text that change the guess.
  const words = num(/(\d[\d,]*)\s*(?:-|–|to\s*\d[\d,]*\s*)?\s*words?\b/);
  const pages = num(/(\d+)\s*(?:-|–|to\s*\d+\s*)?\s*pages?\b/);
  const questions = num(/(\d+)\s*(?:questions|problems|exercises)\b/);
  const chapters = num(/(\d+)\s*chapters\b/);

  if (words >= 100 && words <= 20000) {
    // About 300 finished words an hour, plus time to plan and edit.
    minutes = Math.max(minutes * 0.5, (words / 300) * 60 + 30);
    why.push(`${words.toLocaleString()} words`);
  } else if (pages > 0 && pages <= 100) {
    if (type.reading) {
      minutes = pages * 4;
      why.push(`${pages} pages to read`);
    } else {
      minutes = Math.max(minutes * 0.5, pages * 60 + 30);
      why.push(`${pages} pages`);
    }
  } else if (questions > 0 && questions <= 200) {
    const each = type.kind === "quiz" || type.kind === "test" ? 2 : 8;
    minutes = Math.max(15, questions * each);
    why.push(`${questions} questions`);
  } else if (chapters > 0 && chapters <= 30) {
    minutes = chapters * 50;
    why.push(`${chapters} chapters`);
  }
  if (type.study) why.push("includes study time");
  if (/\b(group|team)\b/.test(t + " " + d)) {
    minutes *= 1.25;
    why.push("group work");
  }

  minutes = Math.min(Math.max(15, Math.round(minutes / 15) * 15), 20 * 60);
  return { minutes, why: why.join(", ") };
}

function fmtDuration(minutes) {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Let Node load the parser for testing; the rest only runs in a browser.
if (typeof module !== "undefined") {
  module.exports = { parseICS, estimateTime, fmtDuration };
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
    estimates: load(STORE.estimates, {}), // your own corrections, by assignment id
  };

  // Time for an assignment: your correction if you made one, otherwise the guess.
  function timeFor(e) {
    if (typeof state.estimates[e.id] === "number") return { minutes: state.estimates[e.id], mine: true };
    return { ...estimateTime(e.title, e.description), mine: false };
  }
  // Total time still to do (skips finished work).
  const timeLeft = (items) =>
    items.filter((e) => !state.done.has(e.id)).reduce((sum, e) => sum + timeFor(e).minutes, 0);

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
    const time = timeFor(e);
    body.innerHTML = `<div class="task-title">${escapeHtml(e.title)}</div>
      <div class="task-meta">${escapeHtml(metaText)}</div>
      <span class="time-pill" title="${time.mine ? "Your estimate" : "Estimated time"}">${time.mine ? "" : "~"}${fmtDuration(time.minutes)}</span>`;
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
    let total = 0, left = 0, minutesLeft = 0;

    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const items = byDay[dayKey(d)] || [];
      total += items.length;
      left += items.filter((e) => !state.done.has(e.id)).length;
      const dayMinutes = timeLeft(items);
      minutesLeft += dayMinutes;

      const col = document.createElement("div");
      col.className = "day-col";
      if (sameDay(d, today)) col.classList.add("today");
      else if (d < startOfToday) col.classList.add("past");
      if (!items.length) col.classList.add("empty-day");

      col.innerHTML = `<div class="day-head">
          <span class="day-name">${d.toLocaleDateString(undefined, { weekday: "short" })}</span>
          <span class="day-num">${d.getDate()}</span>
        </div>${dayMinutes ? `<div class="day-load">~${fmtDuration(dayMinutes)} of work</div>` : ""}${sameDay(d, today) ? `<span class="today-badge">Today</span>` : ""}`;

      for (const e of items) col.appendChild(taskCard(e, `${e.course} · ${fmtTime(e)}`));
      if (!items.length) col.insertAdjacentHTML("beforeend", `<div class="day-empty">Nothing due</div>`);
      board.appendChild(col);
    }

    const isThisWeek = sameDay(start, startOfWeek(today));
    const when = isThisWeek ? "this week" : "that week";
    $("weekSummary").textContent = total
      ? `${left} of ${total} left ${when}` + (minutesLeft ? ` · about ${fmtDuration(minutesLeft)} of work` : "")
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
    const mins = timeLeft(items);
    $("rangeTotal").textContent = mins ? `About ${fmtDuration(mins)} of work left` : "";
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

  // Summary cards: always about the current calendar week.
  function renderStats() {
    if (!$("statLeft")) return;
    const today = new Date();
    const start = startOfWeek(today);
    const end = addDays(start, 7);
    const week = state.events.filter((e) => e.due >= start && e.due < end);
    const open = week.filter((e) => !state.done.has(e.id));
    $("statLeft").textContent = open.length;
    const mins = timeLeft(week);
    $("statHours").textContent = mins ? fmtDuration(mins) : "0h";
    $("statDone").textContent = `${week.length - open.length}/${week.length}`;
    $("statCourses").textContent = Object.keys(state.courseColors).filter((c) => c !== "Other" || Object.keys(state.courseColors).length === 1).length;
  }

  function renderHeader() {
    const now = new Date();
    if ($("todayLabel")) $("todayLabel").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const h = now.getHours();
    if ($("greeting")) $("greeting").textContent = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  }

  function renderAll() {
    renderHeader();
    renderStats();
    renderWeek();
    renderUpcoming();
    renderCourses();
    renderLearn();
  }

  // Learning Center: one card per class. Only rebuilt when the class list
  // changes, so a search you're in the middle of isn't wiped out.
  let learnCourses = null;
  function renderLearn() {
    let courses = Object.keys(state.courseColors);
    if (courses.length > 1) courses = courses.filter((c) => c !== "Other");
    const key = courses.join("\n");
    if (key === learnCourses) return;
    learnCourses = key;
    LearningCenter.render(courses, state.courseColors);
  }

  // ----- Tabs (Board / Learning Center), kept in the address bar as #board or #learn -----
  function showView() {
    const view = location.hash === "#learn" ? "learn" : "board";
    $("boardView").classList.toggle("hidden", view !== "board");
    $("learnView").classList.toggle("hidden", view !== "learn");
    if ($("viewTitle")) $("viewTitle").textContent = view === "learn" ? "Learning Center" : "Assignment Board";
    document.querySelectorAll("#tabs a").forEach((a) => {
      const on = a.dataset.view === view;
      a.classList.toggle("active", on);
      on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("hashchange", showView);

  // ----- Detail popup -----
  function showDetail(e) {
    const isDone = state.done.has(e.id);
    const desc = e.description.trim();
    $("detailBody").innerHTML = `
      <h3>${escapeHtml(e.title)}</h3>
      <div class="meta"><span class="dot" style="--c:${state.courseColors[e.course]}"></span>${escapeHtml(e.course)}
        &middot; Due ${fmtDay(e.due)}, ${fmtTime(e)}</div>
      <div class="estimate">
        <label for="estSelect">Time to complete</label>
        <select id="estSelect"></select>
        <p class="est-why"></p>
      </div>
      ${desc ? `<div class="desc">${escapeHtml(desc.slice(0, 1500))}${desc.length > 1500 ? "…" : ""}</div>` : ""}
      <div class="actions">
        <button id="doneBtn" class="btn">${isDone ? "Mark as not done" : "Mark as done"}</button>
        ${e.url ? `<a class="btn btn-ghost" href="${escapeHtml(e.url)}" target="_blank" rel="noopener">Open in Canvas</a>` : ""}
      </div>`;
    fillEstimate(e);
    $("doneBtn").onclick = () => {
      toggleDone(e.id);
      hideDetail();
    };
    document.querySelector(".modal-card").style.setProperty("--c", state.courseColors[e.course]);
    $("detail").classList.remove("hidden");
  }
  const EST_CHOICES = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600, 720, 960, 1200];

  function fillEstimate(e) {
    const guess = estimateTime(e.title, e.description);
    const time = timeFor(e);
    const sel = $("estSelect");
    const choices = [...new Set([...EST_CHOICES, guess.minutes, time.minutes])].sort((a, b) => a - b);
    sel.innerHTML = `<option value="guess">Guess: ~${fmtDuration(guess.minutes)}</option>` +
      choices.map((m) => `<option value="${m}">${fmtDuration(m)}</option>`).join("");
    sel.value = time.mine ? String(time.minutes) : "guess";
    $("detailBody").querySelector(".est-why").textContent = time.mine
      ? `You set this. Our guess was ~${fmtDuration(guess.minutes)} (${guess.why}).`
      : `Guessed from: ${guess.why}. Change it if you know better, and we'll remember.`;
    sel.onchange = () => {
      if (sel.value === "guess") delete state.estimates[e.id];
      else state.estimates[e.id] = Number(sel.value);
      save(STORE.estimates, state.estimates);
      fillEstimate(e);
      renderAll();
    };
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
    $("tabs").classList.remove("hidden");
    showView();
  }
  function showSetup() {
    $("app").classList.add("hidden");
    $("tabs").classList.add("hidden");
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
    // An empty link means "use the one saved on the website" (CANVAS_FEED_URL in Vercel).
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
        body: JSON.stringify(httpsUrl ? { url: httpsUrl } : {}),
      });
    } catch {
      throw new Error("Couldn't reach the website's helper. Check your internet connection and try again.");
    }
    if (res.ok) return await res.text();

    let message = `Something went wrong (${res.status}).`;
    let noDefault = false;
    try {
      const data = await res.json();
      message = data.error || message;
      noDefault = !!data.noDefault;
    } catch {
      /* not JSON */
    }
    const err = new Error(message + "\nYou can also download the .ics file from Canvas and use \"Load .ics file\".");
    err.noDefault = noDefault;
    throw err;
  }

  // url "" = use the link saved on the website. If refreshing fails but assignments
  // are already showing, keep showing them instead of jumping back to setup.
  async function loadFromUrl(url, { quiet } = {}) {
    setupMessage("Loading…");
    try {
      const text = await fetchFeed(url);
      if (url.trim()) save(STORE.feedUrl, url.trim());
      useIcs(text, "your Canvas feed");
      setupMessage("");
    } catch (err) {
      const showingData = !$("app").classList.contains("hidden") && state.events.length;
      if (showingData && quiet && err.noDefault) return; // nothing saved on the website: just keep this copy
      if (showingData) {
        setStatus(`Couldn't refresh just now: ${err.message.split("\n")[0].replace(/\.$/, "")}. Showing your last saved copy.`);
        return;
      }
      if (quiet && err.noDefault) {
        setupMessage("");
        showSetup();
        return;
      }
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
    loadFromUrl(load(STORE.feedUrl, "")); // falls back to the link saved on the website
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
  // Refresh in the background: from this browser's saved link, or else the one
  // saved on the website (CANVAS_FEED_URL), so a new device needs no pasting.
  loadFromUrl(savedUrl, { quiet: true });
}
