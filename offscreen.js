import "./vendor/pdfjs/pdf.min.mjs";

const pdfjsLib = globalThis.pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.mjs");

function b64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function linesFromPage(items) {
  const rows = [];
  for (const item of items) {
    const str = item.str;
    if (!str) continue;
    const t = item.transform || [1, 0, 0, 1, 0, 0];
    const x = t[4];
    const y = Math.round(t[5]);
    let row = rows.find((r) => Math.abs(r.y - y) <= 3);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((row) => {
      row.parts.sort((a, b) => a.x - b.x);
      return row.parts.map((p) => p.str).join(" ").replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
}

async function extractText(bytes) {
  const task = pdfjsLib.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
    disableAutoFetch: true,
    disableStream: true,
    disableFontFace: true
  });
  const pdf = await task.promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent({ includeMarkedContent: false });
    pages.push(linesFromPage(content.items).join("\n"));
    page.cleanup();
  }
  await pdf.destroy();
  return pages.join("\n");
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "PARSE_PDF") return false;
  (async () => {
    try {
      const bytes = b64ToBytes(msg.b64 || "");
      const text = await extractText(bytes);
      sendResponse({ ok: true, text });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();
  return true;
});
