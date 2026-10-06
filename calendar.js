import { currentTerm } from "./lib/term.js";
import {
  compactChipLabel,
  courseKey,
  isPlaceholderTitle,
  prettyTitle,
  shortCourse,
  sourceLabel
} from "./lib/labels.js";

const TZ = "America/Edmonton";
const scanBtn = document.getElementById("scan");
const downloadBtn = document.getElementById("download");
const statusEl = document.getElementById("status");
const banner = document.getElementById("banner");
const warnings = document.getElementById("warnings");
const grid = document.getElementById("grid");
const monthLabel = document.getElementById("month-label");
const dayHeading = document.getElementById("day-heading");
const dayEmpty = document.getElementById("day-empty");
const dayList = document.getElementById("day-list");

let state = { status: "idle", items: [], warnings: [] };
let view = monthStart(new Date());
let selectedDay = ymdFromDate(new Date());

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function edmontonParts(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function ymdFromDate(date) {
  const { year, month, day } = edmontonParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function ymdFromIso(iso) {
  return ymdFromDate(new Date(iso));
}

function monthStart(date) {
  const { year, month } = edmontonParts(date);
  return { year, month };
}

function shiftMonth(base, delta) {
  const d = new Date(Date.UTC(base.year, base.month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOf(year, month, day) {
  return new Date(year, month - 1, day).getDay();
}

function termLabelText() {
  return state.term?.label || currentTerm().label;
}

function formatDue(iso) {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatMonth({ year, month }) {
  return new Date(year, month - 1, 1).toLocaleString("en-CA", {
    month: "long",
    year: "numeric"
  });
}

function formatDayHeading(ymd) {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function courseClass(item) {
  const key = courseKey(item);
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return `c${h % 8}`;
}

function timeLabel(iso) {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit"
  });
}

function itemsOn(ymd) {
  return (state.items || []).filter((item) => {
    if (!item.dueAt || ymdFromIso(item.dueAt) !== ymd) return false;
    if (/national day for truth|truth and reconciliation/i.test(item.title || "")) return false;
    if (isPlaceholderTitle(item.title) && item.source !== "d2l") return false;
    return true;
  });
}

function row(item) {
  const li = document.createElement("li");
  li.className = courseClass(item);
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = Boolean(item.included);
  box.addEventListener("change", async () => {
    item.included = box.checked;
    await send({ type: "SET_INCLUDED", id: item.id, included: box.checked });
    renderCalendar();
    renderDay();
  });

  const body = document.createElement("div");
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = prettyTitle(item.title, item);
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = sourceLabel(item);
  title.appendChild(tag);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${shortCourse(item.courseCode, item.courseName)} · ${timeLabel(item.dueAt)}`;
  body.append(title, meta);
  li.append(box, body);
  return li;
}

function renderStatus() {
  const scanning = state.status === "scanning";
  scanBtn.disabled = scanning;
  scanBtn.textContent = scanning ? "Scanning…" : "Scan D2L";
  document.getElementById("term-label").textContent = termLabelText();
  downloadBtn.disabled = state.status !== "ready";

  banner.classList.add("hidden");
  banner.replaceChildren();

  if (state.status === "need_login") {
    statusEl.textContent = state.error;
    banner.classList.remove("hidden");
    const a = document.createElement("a");
    a.href = "https://d2l.ucalgary.ca/d2l/home";
    a.target = "_blank";
    a.textContent = "Open D2L and sign in";
    banner.append(a);
  } else if (state.status === "error") {
    statusEl.textContent = state.error || "Scan failed.";
  } else if (state.status === "scanning") {
    statusEl.textContent = state.message || "Scanning…";
  } else if (state.status === "ready") {
    const n = state.items.filter((i) => i.included).length;
    statusEl.textContent = `${termLabelText()} · ${state.items.length} dated items · ${n} selected for .ics`;
  } else {
    statusEl.textContent = `Log into D2L, then scan ${currentTerm().label} courses.`;
  }

  warnings.replaceChildren();
  for (const w of state.warnings || []) {
    const li = document.createElement("li");
    li.textContent = w;
    warnings.append(li);
  }
}

function renderCalendar() {
  const { year, month } = view;
  monthLabel.textContent = formatMonth(view);
  const today = ymdFromDate(new Date());
  const firstWeekday = weekdayOf(year, month, 1);
  const count = daysInMonth(year, month);
  const prev = shiftMonth(view, -1);
  const prevCount = daysInMonth(prev.year, prev.month);
  const cells = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = prevCount - i;
    cells.push({
      year: prev.year,
      month: prev.month,
      day,
      outside: true
    });
  }
  for (let day = 1; day <= count; day++) {
    cells.push({ year, month, day, outside: false });
  }
  let nextDay = 1;
  const next = shiftMonth(view, 1);
  while (cells.length % 7 !== 0) {
    cells.push({ year: next.year, month: next.month, day: nextDay++, outside: true });
  }

  grid.replaceChildren();
  for (const cell of cells) {
    const ymd = `${cell.year}-${String(cell.month).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day";
    const weekday = weekdayOf(cell.year, cell.month, cell.day);
    if (weekday === 0 || weekday === 6) btn.classList.add("weekend");
    if (cell.outside) btn.classList.add("outside");
    if (ymd === today) btn.classList.add("today");
    if (ymd === selectedDay) btn.classList.add("selected");

    const num = document.createElement("div");
    num.className = "day-num";
    num.textContent = String(cell.day);
    btn.append(num);

    const items = itemsOn(ymd);
    const shown = items.slice(0, 4);
    for (const item of shown) {
      const chip = document.createElement("span");
      chip.className = `chip ${courseClass(item)}`;
      if (!item.included) chip.classList.add("excluded");
      chip.textContent = compactChipLabel(item);
      chip.title = `${shortCourse(item.courseCode, item.courseName)}: ${prettyTitle(item.title, item)}`;
      btn.append(chip);
    }
    if (items.length > 3) {
      const more = document.createElement("div");
      more.className = "more";
      more.textContent = `+${items.length - 3} more`;
      btn.append(more);
    }

    btn.addEventListener("click", () => {
      selectedDay = ymd;
      if (cell.outside) view = { year: cell.year, month: cell.month };
      renderCalendar();
      renderDay();
    });
    grid.append(btn);
  }
}

function renderDay() {
  const items = itemsOn(selectedDay);
  dayHeading.textContent = formatDayHeading(selectedDay);
  dayList.replaceChildren();
  if (!items.length) {
    dayEmpty.classList.remove("hidden");
    dayEmpty.textContent = state.status === "ready"
      ? "No deadlines on this day."
      : "Scan D2L to fill the calendar. Click a day for details.";
    return;
  }
  dayEmpty.classList.add("hidden");
  for (const item of items) dayList.append(row(item));
}

function render() {
  renderStatus();
  renderCalendar();
  renderDay();
}

document.getElementById("prev-month").addEventListener("click", () => {
  view = shiftMonth(view, -1);
  renderCalendar();
});

document.getElementById("next-month").addEventListener("click", () => {
  view = shiftMonth(view, 1);
  renderCalendar();
});

document.getElementById("this-month").addEventListener("click", () => {
  view = monthStart(new Date());
  selectedDay = ymdFromDate(new Date());
  renderCalendar();
  renderDay();
});

scanBtn.addEventListener("click", async () => {
  state = { status: "scanning", message: "Starting scan…", items: [], warnings: [] };
  render();
  await send({ type: "SCAN" });
});

downloadBtn.addEventListener("click", async () => {
  const previous = downloadBtn.textContent;
  downloadBtn.disabled = true;
  downloadBtn.textContent = "Saving…";
  try {
    const res = await send({ type: "DOWNLOAD_ICS" });
    if (res?.ok) {
      statusEl.textContent = `Saved ${res.filename} to your Downloads folder (${res.count} events).`;
      return;
    }
    if (res?.ics && res?.filename) {
      saveIcsViaLink(res.ics, res.filename);
      statusEl.textContent = `Saved ${res.filename} to your Downloads folder.`;
      return;
    }
    statusEl.textContent = res?.error || "Download failed.";
  } catch (err) {
    statusEl.textContent = err?.message || "Download failed.";
  } finally {
    downloadBtn.disabled = state.status !== "ready";
    downloadBtn.textContent = previous;
  }
});

function saveIcsViaLink(ics, filename) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "PROGRESS") {
    statusEl.textContent = msg.message;
  }
  if (msg?.type === "SCAN_DONE" && msg.state) {
    state = msg.state;
    render();
  }
});

send({ type: "GET_STATE" }).then((next) => {
  if (next) {
    state = next;
    render();
  }
});
