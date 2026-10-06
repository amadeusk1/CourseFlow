import { currentTerm } from "./lib/term.js";
import { prettyTitle, shortCourse, sourceLabel } from "./lib/labels.js";

const scanBtn = document.getElementById("scan");
const downloadBtn = document.getElementById("download");
const statusEl = document.getElementById("status");
const banner = document.getElementById("banner");
const toolbar = document.getElementById("toolbar");
const lists = document.getElementById("lists");
const d2lList = document.getElementById("d2l-list");
const outlineList = document.getElementById("outline-list");
const warnings = document.getElementById("warnings");
const allD2l = document.getElementById("all-d2l");
const allOutline = document.getElementById("all-outline");

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function termLabel(state) {
  return state.term?.label || currentTerm().label;
}

function formatDue(iso) {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", {
    timeZone: "America/Edmonton",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function row(item) {
  const li = document.createElement("li");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = Boolean(item.included);
  box.addEventListener("change", async () => {
    await send({ type: "SET_INCLUDED", id: item.id, included: box.checked });
  });

  const body = document.createElement("div");
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = prettyTitle(item.title, item);
  const tag = document.createElement("span");
  tag.className = `tag ${item.source === "d2l" ? "official" : item.confidence || "medium"}`;
  tag.textContent = sourceLabel(item);
  title.appendChild(tag);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${shortCourse(item.courseCode, item.courseName)} · ${formatDue(item.dueAt)}`;

  body.append(title, meta);
  if (item.evidence) {
    const ev = document.createElement("div");
    ev.className = "evidence";
    ev.textContent = item.evidence;
    body.append(ev);
  }
  li.append(box, body);
  return li;
}

function fillList(el, items, emptyText) {
  el.replaceChildren();
  if (!items.length) {
    const p = document.createElement("li");
    p.className = "empty";
    p.textContent = emptyText;
    el.append(p);
    return;
  }
  for (const item of items) el.append(row(item));
}

function render(state) {
  const scanning = state.status === "scanning";
  scanBtn.disabled = scanning;
  scanBtn.textContent = scanning ? "Scanning…" : "Scan";
  document.getElementById("term-label").textContent = termLabel(state);

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
    statusEl.textContent = `${termLabel(state)} · ${state.items.length} dated items · ${n} selected for export`;
  } else {
    statusEl.textContent = `Log into D2L, then scan ${currentTerm().label} courses.`;
  }

  const ready = state.status === "ready";
  toolbar.classList.toggle("hidden", !ready);
  lists.classList.toggle("hidden", !ready);
  downloadBtn.disabled = !ready;

  if (ready) {
    const d2l = state.items.filter((i) => i.source === "d2l");
    const outline = state.items.filter((i) => i.source === "outline");
    fillList(d2lList, d2l, `No ${termLabel(state)} D2L due dates.`);
    fillList(outlineList, outline, `No ${termLabel(state)} outline deadlines.`);
    allD2l.checked = d2l.length ? d2l.every((i) => i.included) : true;
    allOutline.checked = outline.filter((i) => i.confidence !== "low").every((i) => i.included);
  }

  warnings.replaceChildren();
  for (const w of state.warnings || []) {
    const li = document.createElement("li");
    li.textContent = w;
    warnings.append(li);
  }
}

scanBtn.addEventListener("click", async () => {
  render({ status: "scanning", message: "Starting scan…", items: [], warnings: [] });
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
    downloadBtn.disabled = false;
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

allD2l.addEventListener("change", async () => {
  const res = await send({ type: "SET_ALL", source: "d2l", included: allD2l.checked });
  if (res?.items) render({ ...(await send({ type: "GET_STATE" })) });
});

allOutline.addEventListener("change", async () => {
  const res = await send({ type: "SET_ALL", source: "outline", included: allOutline.checked });
  if (res?.items) render({ ...(await send({ type: "GET_STATE" })) });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "PROGRESS") {
    statusEl.textContent = msg.message;
  }
  if (msg?.type === "SCAN_DONE" && msg.state) render(msg.state);
});

send({ type: "GET_STATE" }).then((state) => {
  if (state) render(state);
});
