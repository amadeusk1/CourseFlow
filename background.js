import { AuthError } from "./lib/d2l.js";
import { icsFilename, toIcs } from "./lib/ics.js";
import { runScan } from "./lib/scan.js";

let state = {
  status: "idle",
  message: "",
  error: "",
  user: null,
  term: null,
  courses: [],
  items: [],
  warnings: []
};

async function persist() {
  await chrome.storage.local.set({ scanState: state });
}

async function restore() {
  const stored = await chrome.storage.local.get("scanState");
  if (stored.scanState) state = stored.scanState;
}

const restored = restore();

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("calendar.html") });
});

function emit(update) {
  if (update.type === "PROGRESS") {
    state.message = update.message;
    persist();
  }
  chrome.runtime.sendMessage(update).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "PARSE_PDF") return false;

  if (msg?.type === "GET_STATE") {
    restored.then(() => sendResponse(state));
    return true;
  }

  if (msg?.type === "SET_INCLUDED") {
    restored.then(() => {
      const item = state.items.find((row) => row.id === msg.id);
      if (item) item.included = Boolean(msg.included);
      persist();
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg?.type === "SET_ALL") {
    restored.then(() => {
      const source = msg.source;
      for (const item of state.items) {
        if (!source || item.source === source) item.included = Boolean(msg.included);
      }
      persist();
      sendResponse({ ok: true, items: state.items });
    });
    return true;
  }

  if (msg?.type === "SCAN") {
    (async () => {
        state = {
          status: "scanning",
          message: "Starting scan…",
          error: "",
          user: null,
          term: null,
          courses: [],
          items: [],
          warnings: []
        };
      await persist();
      try {
        const result = await runScan(emit);
        state = {
          status: "ready",
          message: `Found ${result.items.length} dated item${result.items.length === 1 ? "" : "s"}`,
          error: "",
          user: result.user,
          term: result.term,
          courses: result.courses,
          items: result.items,
          warnings: result.warnings
        };
      } catch (err) {
        const needLogin = err instanceof AuthError || err?.code === "AUTH";
        state = {
          ...state,
          status: needLogin ? "need_login" : "error",
          error: needLogin
            ? "Log into D2L in this browser, then scan again."
            : err.message || "Scan failed",
          message: ""
        };
      }
      await persist();
      emit({ type: "SCAN_DONE", state });
    })();
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === "DOWNLOAD_ICS") {
    restored
      .then(async () => {
        const selected = (state.items || []).filter((item) => item.included);
        if (!selected.length) {
          sendResponse({
            ok: false,
            error: state.status === "ready"
              ? "Nothing selected."
              : "Scan D2L first, then download."
          });
          return;
        }
        const ics = toIcs(selected);
        const filename = icsFilename();
        const url = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
        try {
          await chrome.downloads.download({
            url,
            filename,
            saveAs: false,
            conflictAction: "uniquify"
          });
          sendResponse({ ok: true, count: selected.length, filename, ics });
        } catch (err) {
          sendResponse({
            ok: false,
            error: err.message || "Download failed.",
            filename,
            ics
          });
        }
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message || "Could not build calendar file." });
      });
    return true;
  }

  return false;
});
