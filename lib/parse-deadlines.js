import { DEFAULT_DUE_HOUR, DEFAULT_DUE_MINUTE } from "./config.js";
import { edmontonToUtcDate, hashId, toIso } from "./util.js";

const MONTHS = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11
};

const MONTH_ALT = Object.keys(MONTHS).join("|");

const KEEP =
  /\b(due|deadline|submit|submission|exam|midterm|final|quiz|test|assignment|lab\b|presentation|essay|paper|project|dropbox|homework|report|assessment|discuss|feedback|posts?)\b/i;

const SKIP =
  /\b(office hours?|academic integrity|deferred exams?|land acknowledgement|wellness|copyright|add\/drop|withdraw|term break|no class|holiday|thanksgiving|reading week|student success|integrity and conduct|keep a copy|11:59\s*p\.?m\.? on their due date|email policy|instructor email|ucalgary\.ca\/pubs|library\.ucalgary)\b/i;

const SECTION_HEADER =
  /^(class schedule|weekly schedule|course schedule|assessment components|assessments?|evaluation|grade breakdown|grading|important dates)/i;

function monthIndex(name) {
  return MONTHS[String(name || "").toLowerCase().replace(/\./g, "")];
}

function parseTime(text) {
  const m =
    text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i) ||
    text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return { hour: DEFAULT_DUE_HOUR, minute: DEFAULT_DUE_MINUTE };
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ap = (m[3] || "").toLowerCase();
  if (ap.startsWith("p") && hour < 12) hour += 12;
  if (ap.startsWith("a") && hour === 12) hour = 0;
  if (!m[3] && hour <= 7) hour += 12;
  return { hour, minute };
}

function inTerm(year, month, day, termStart, termEnd) {
  const t = Date.UTC(year, month, day);
  if (termStart && t < termStart - 14 * 86400000) return false;
  if (termEnd && t > termEnd + 21 * 86400000) return false;
  return true;
}

function resolveYear(month, day, termStart, termEnd, explicitYear) {
  if (explicitYear) return explicitYear;
  const start = termStart ? new Date(termStart) : new Date();
  const y = start.getUTCFullYear();
  for (const year of [y, y + 1, y - 1]) {
    if (inTerm(year, month, day, termStart, termEnd)) return year;
  }
  return y;
}

function extractDates(line, termStart, termEnd) {
  const found = [];
  const seen = new Set();

  const push = (year, month, day, rest) => {
    if (month < 0 || month > 11 || day < 1 || day > 31) return;
    const y = resolveYear(month, day, termStart, termEnd, year);
    if (!inTerm(y, month, day, termStart, termEnd) && year == null) return;
    const key = `${y}-${month}-${day}`;
    if (seen.has(key)) return;
    seen.add(key);
    const { hour, minute } = parseTime(rest || line);
    found.push({ year: y, month, day, hour, minute });
  };

  const re1 = new RegExp(
    String.raw`\b(${MONTH_ALT})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–-]\s*(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s*(\d{4}))?`,
    "gi"
  );
  let m;
  while ((m = re1.exec(line))) {
    const month = monthIndex(m[1]);
    const startDay = Number(m[2]);
    const endDay = m[3] ? Number(m[3]) : startDay;
    const year = m[4] ? Number(m[4]) : null;
    push(year, month, endDay, line);
  }

  const re2 = new RegExp(
    String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_ALT})\.?(?:,?\s*(\d{4}))?`,
    "gi"
  );
  while ((m = re2.exec(line))) {
    push(m[3] ? Number(m[3]) : null, monthIndex(m[2]), Number(m[1]), line);
  }

  const iso = line.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g);
  for (const hit of iso) {
    push(Number(hit[1]), Number(hit[2]) - 1, Number(hit[3]), line);
  }

  return found;
}

function cleanTitle(line) {
  let title = line
    .replace(new RegExp(String.raw`\b(${MONTH_ALT})\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[–-]\s*\d{1,2})?(?:,?\s*\d{4})?`, "gi"), " ")
    .replace(/\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:,?\s*\d{4})?/gi, " ")
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?\b/gi, " ")
    .replace(/\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, " ")
    .replace(/\b(due(?:\s+date)?|deadline|submit(?:ted)? by|on|by)\b/gi, " ")
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ")
    .replace(/\(\s*\d{1,3}\s*%\s*\)/g, " ")
    .replace(/\s*[|•·]+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.;:]+|[\s,.;:]+$/g, "")
    .trim();
  if (title.length > 90) title = title.slice(0, 87).trim() + "…";
  return title || "Course deadline";
}

function sectionForIndex(lines, idx) {
  for (let i = idx; i >= 0 && i >= idx - 12; i--) {
    const head = lines[i].replace(/[^a-zA-Z ]/g, " ").replace(/\s+/g, " ").trim();
    if (SECTION_HEADER.test(head)) {
      if (/assessment|evaluation|grading|important dates/i.test(head)) return "assessment";
      return "schedule";
    }
  }
  return "other";
}

function confidenceFor(line, section) {
  const hasKeep = KEEP.test(line);
  if (SKIP.test(line) && !hasKeep) return null;
  if (section === "assessment" && hasKeep) return "high";
  if (section === "schedule" && hasKeep) return "high";
  if (section === "assessment") return "medium";
  if (section === "schedule" && /\b(week|topic|lab|quiz|exam|assignment|discuss|feedback|post)\b/i.test(line)) return "medium";
  if (hasKeep) return "medium";
  return null;
}

export function parseDeadlines(text, course, fileTitle) {
  const termStart = course.start ? Date.parse(course.start) : null;
  const termEnd = course.end ? Date.parse(course.end) : Date.parse(course.start || "") + 120 * 86400000;
  const lines = String(text || "")
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 3 && l.length < 400);

  const items = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SKIP.test(line) && !KEEP.test(line)) continue;
    const dates = extractDates(line, termStart, Number.isFinite(termEnd) ? termEnd : null);
    if (!dates.length) continue;
    const section = sectionForIndex(lines, i);
    const confidence = confidenceFor(line, section);
    if (!confidence) continue;
    const title = cleanTitle(line);
    if (/^(week|topic|date|assessment and due dates)$/i.test(title)) continue;

    for (const d of dates) {
      const due = edmontonToUtcDate(d.year, d.month, d.day, d.hour, d.minute);
      const dueAt = toIso(due);
      const key = `${normalizeLite(title)}|${dueAt.slice(0, 10)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: `outline-${course.id}-${hashId(key)}`,
        orgUnitId: course.id,
        courseName: course.name,
        courseCode: course.code,
        title,
        type: guessType(line + " " + title),
        dueAt,
        url: `${courseHome(course.id)}`,
        source: "outline",
        confidence,
        evidence: line.slice(0, 180),
        fileTitle: fileTitle || "Course Outline"
      });
    }
  }

  return items;
}

function normalizeLite(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function guessType(text) {
  const t = text.toLowerCase();
  if (/\bquiz\b/.test(t)) return "quiz";
  if (/\b(exam|midterm|final)\b/.test(t)) return "exam";
  if (/\b(discuss|post)\b/.test(t)) return "discussion";
  if (/\blab\b/.test(t)) return "lab";
  if (/\b(assignment|essay|paper|report|project|presentation)\b/.test(t)) return "assignment";
  return "outline";
}

function courseHome(id) {
  return `https://d2l.ucalgary.ca/d2l/home/${id}`;
}
