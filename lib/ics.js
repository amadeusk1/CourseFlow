import { PRODID, UID_HOST } from "./config.js";

function fold(line) {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length) {
    out += `\r\n ${rest.slice(0, 74)}`;
    rest = rest.slice(74);
  }
  return out;
}

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function utcStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid due date: ${iso}`);
  }
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function uidFor(item) {
  return String(item.id || "item")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function toIcs(items) {
  const now = utcStamp(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:UCalgary D2L due dates"
  ];

  for (const item of items) {
    const start = utcStamp(item.dueAt);
    const descParts = [
      item.courseName,
      item.type,
      item.source === "outline" ? `From outline: ${item.fileTitle || "PDF"}` : "From D2L",
      item.evidence
    ].filter(Boolean);
    const cats = ["D2L"];
    if (item.source === "outline") cats.push("Outline");
    if (item.type) cats.push(item.type);

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uidFor(item)}@${UID_HOST}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${start}`);
    lines.push(fold(`SUMMARY:${escapeIcs(`[${item.courseCode || item.courseName}] ${item.title}`)}`));
    lines.push(fold(`DESCRIPTION:${escapeIcs(descParts.join("\n"))}`));
    if (item.url) lines.push(fold(`URL:${escapeIcs(item.url)}`));
    lines.push(`CATEGORIES:${cats.map(escapeIcs).join(",")}`);
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${escapeIcs(item.title)}`);
    lines.push("TRIGGER:-PT24H");
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

export function icsFilename() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `ucalgary-d2l-due-dates-${y}${m}${day}.ics`;
}
