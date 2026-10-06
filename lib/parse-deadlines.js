import { DEFAULT_DUE_HOUR, DEFAULT_DUE_MINUTE } from "./config.js";
import { isPlaceholderTitle, prettyTitle } from "./labels.js";
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

const MONTH_ALT = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|");
const MONTH_BOUND = String.raw`(?<![A-Za-z])(?:${MONTH_ALT})(?![A-Za-z])`;

const KEEP =
  /\b(due|deadline|submit|submission|exam|midterm|final|quiz|test|assignment|lab\b|presentation|essay|paper|project|dropbox|homework|report|assessment|discuss|feedback|posts?|term test)\b/i;

const SKIP =
  /\b(office hours?|academic integrity|deferred exams?|land acknowledgement|wellness|copyright|add\/drop|withdraw|term break|no class|holiday|thanksgiving|reading week|student success|integrity and conduct|keep a copy|11:59\s*p\.?m\.? on their due date|email policy|instructor email|ucalgary\.ca\/pubs|library\.ucalgary|truth and reconciliation|national day for truth|labour day|canada day|good friday|remembrance day|family day)\b/i;

const SECTION_HEADER =
  /^(class schedule|weekly schedule|course schedule|assessment components|assessments?|evaluation|grade breakdown|grading|important dates|due date)/i;

const SECTION_END =
  /^(course description|learning outcomes?|required (text|reading)|acknowledg|university policies|copyright|letter grades?|grading scale|course outline)\b/i;

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

  const monthsHit = new Set();
  const re1 = new RegExp(
    String.raw`(${MONTH_BOUND})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*[–-]\s*(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s+(\d{4}))?`,
    "gi"
  );
  let m;
  while ((m = re1.exec(line))) {
    const month = monthIndex(m[1]);
    const startDay = Number(m[2]);
    const endDay = m[3] ? Number(m[3]) : startDay;
    const year = m[4] ? Number(m[4]) : null;
    monthsHit.add(month);
    push(year, month, endDay, line);
  }

  const re2 = new RegExp(
    String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_BOUND})\.?(?:,?\s+(\d{4}))?`,
    "gi"
  );
  while ((m = re2.exec(line))) {
    const month = monthIndex(m[2]);
    if (monthsHit.has(month)) continue;
    push(m[3] ? Number(m[3]) : null, month, Number(m[1]), line);
  }

  const iso = line.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g);
  for (const hit of iso) {
    push(Number(hit[1]), Number(hit[2]) - 1, Number(hit[3]), line);
  }

  return found;
}

function cleanTitle(line) {
  let title = line
    .replace(
      new RegExp(
        String.raw`${MONTH_BOUND}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*[–-]\s*\d{1,2})?(?:,?\s+\d{4})?`,
        "gi"
      ),
      " "
    )
    .replace(
      new RegExp(
        String.raw`\b\d{1,2}(?:st|nd|rd|th)?\s+${MONTH_BOUND}\.?(?:,?\s+\d{4})?`,
        "gi"
      ),
      " "
    )
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?\b/gi, " ")
    .replace(/\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)\b/gi, " ")
    .replace(/\b23:?59\b/g, " ")
    .replace(/\b11:?59(?:\s*p\.?m\.?)?\b/gi, " ")
    .replace(/\b(due(?:\s+date)?|deadline|submit(?:ted)? by|on|by|out-of-class|in-class|location|weight)\b/gi, " ")
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ")
    .replace(/\(\s*\d{1,3}\s*%\s*\)/g, " ")
    .replace(/\b\d{1,3}\s*%/g, " ")
    .replace(/\s*[|•·]+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.;:]+|[\s,.;:]+$/g, "")
    .trim();
  return prettyTitle(title);
}

function looksLikeAssessmentName(line) {
  return (
    /\b(assignment|term test|midterm|final|quiz|exam|essay|paper|project|lab\b|presentation|report|homework|participation)\b/i.test(
      line
    ) && !/due date|weight|location|assessment components|^assessment$/i.test(line)
  );
}

function isMostlyDate(line, dates) {
  if (!dates.length) return false;
  const leftover = cleanTitle(line);
  if (!leftover || leftover === "Deadline") return true;
  return /^(out-of-class|in-class|online|d2l|zoom|take-home)$/i.test(leftover);
}

function stitchTableRows(lines, termStart, termEnd) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const next = lines[i + 1] || "";
    const curDates = extractDates(cur, termStart, termEnd);
    const nextDates = extractDates(next, termStart, termEnd);
    if (!curDates.length && looksLikeAssessmentName(cur) && nextDates.length && isMostlyDate(next, nextDates)) {
      out.push(`${cur} ${next}`);
      i += 1;
      continue;
    }
    if (isMostlyDate(cur, curDates) && out.length && looksLikeAssessmentName(out[out.length - 1])) {
      out[out.length - 1] = `${out[out.length - 1]} ${cur}`;
      continue;
    }
    out.push(cur);
  }
  return out;
}

function tagSections(lines) {
  let section = "other";
  return lines.map((line) => {
    const head = line.replace(/[^a-zA-Z /]/g, " ").replace(/\s+/g, " ").trim();
    if (SECTION_HEADER.test(head) || /\bdue date\b/i.test(line)) {
      section = /assessment|evaluation|grading|important dates|due date/i.test(head + " " + line)
        ? "assessment"
        : "schedule";
    } else if (SECTION_END.test(head)) {
      section = "other";
    }
    return { line, section };
  });
}

function confidenceFor(line, section) {
  const hasKeep = KEEP.test(line);
  if (SKIP.test(line) && !hasKeep) return null;
  if (section === "assessment" && hasKeep) return "high";
  if (section === "schedule" && hasKeep) return "high";
  if (section === "assessment") return "medium";
  if (section === "schedule" && /\b(week|topic|lab|quiz|exam|assignment|discuss|feedback|post|test)\b/i.test(line)) {
    return "medium";
  }
  if (hasKeep) return "medium";
  return null;
}

export function parseDeadlines(text, course, fileTitle) {
  const termStart = course.start ? Date.parse(course.start) : null;
  const termEnd = course.end ? Date.parse(course.end) : Date.parse(course.start || "") + 120 * 86400000;
  const end = Number.isFinite(termEnd) ? termEnd : null;
  const rawLines = String(text || "")
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 2 && l.length < 400);

  const lines = stitchTableRows(rawLines, termStart, end);
  const tagged = tagSections(lines);
  const items = [];
  const seen = new Set();

  for (const { line, section } of tagged) {
    if (SKIP.test(line) && !KEEP.test(line)) continue;
    const dates = extractDates(line, termStart, end);
    if (!dates.length) continue;
    const confidence = confidenceFor(line, section);
    if (!confidence) continue;
    const title = cleanTitle(line);
    if (/^(week|topic|date|assessment and due dates|due date|weight)$/i.test(title)) continue;
    if (/^participation$/i.test(title) && !/\b(due|deadline)\b/i.test(line)) continue;
    if (isPlaceholderTitle(title) && !/\b(assignment|homework|quiz|exam|midterm|test|project)\b/i.test(line)) {
      continue;
    }

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
        url: courseHome(course.id),
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
  if (/\b(term test|exam|midterm|final)\b/.test(t)) return "exam";
  if (/\b(discuss|post)\b/.test(t)) return "discussion";
  if (/\blab\b/.test(t)) return "lab";
  if (/\b(assignment|essay|paper|report|project|presentation)\b/.test(t)) return "assignment";
  return "outline";
}

function courseHome(id) {
  return `https://d2l.ucalgary.ca/d2l/home/${id}`;
}
