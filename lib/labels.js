const COURSE_CODE = /\b([A-Z]{3,4})\s*[- ]?\s*(\d{2,4}[A-Z]?)\b/i;

const KEEP_CAPS = new Set([
  "D2L",
  "PDF",
  "ICS",
  "TBA",
  "MKTG",
  "CPSC",
  "ENGG",
  "MATH",
  "CHEM",
  "PHYS",
  "BIOL",
  "PSYC",
  "STAT",
  "ECON",
  "PHIL",
  "ENGL",
  "HIST",
  "GEOG",
  "ANTH",
  "SOCI",
  "POLI",
  "NURS",
  "KNES",
  "DATA",
  "INTE",
  "FNCE",
  "ACCT",
  "SGMA",
  "OPMA",
  "BTMA",
  "ENTI",
  "OBHR",
  "MGST",
  "GLGY"
]);

const ASSESSMENT =
  /\b(assignments?\s+(?:[A-Z]|one|two|three|[0-9]+)(?:\s*,?\s*part\s+[A-Z0-9]+)?|homework\s+\d+|term tests?\s+\d+|midterms?(?:\s+\d+)?(?:\s+exams?)?|final exams?|quizzes?\s+\d+|group projects?(?:\s*[-–:]\s*part\s+[A-Z0-9]+)?)\b/i;

export function shortCourse(code, name) {
  const blob = `${code || ""} ${name || ""}`;
  const m = blob.match(COURSE_CODE);
  if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  return String(code || name || "Course")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28);
}

function smartCase(text) {
  const letters = text.replace(/[^A-Za-z]/g, "");
  const mostlyCaps = letters.length > 3 && text === text.toUpperCase();
  return String(text)
    .split(/(\s+|[-–—:/])/)
    .map((word, i) => {
      if (!/[A-Za-z]/.test(word)) return word;
      const upper = word.toUpperCase();
      if (KEEP_CAPS.has(upper)) return upper;
      if (/^[A-Z]{3,4}\d/i.test(word)) return upper;
      if (mostlyCaps || (word === word.toUpperCase() && word.length > 3)) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      if (i === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      return word;
    })
    .join("");
}

export function prettyTitle(raw, item = {}) {
  let t = String(raw || "").replace(/\s+/g, " ").trim();
  const conflict = /\(outline date differs\)/i.test(t);
  t = t.replace(/\s*\(outline date differs\)\s*/gi, " ").trim();
  t = t.replace(/^keting mix\b/i, "Marketing Mix");
  t = t.replace(/\bavailable\s+tba\b/gi, " ");
  t = t.replace(/\b2359\b/g, " ");
  t = t.replace(/\b11:?59(?:\s*p\.?m\.?)?\b/gi, " ");
  t = t.replace(/\btba\b/gi, " ");

  if (item.courseCode || item.courseName) {
    const short = shortCourse(item.courseCode, item.courseName);
    t = t.replace(new RegExp(`^${short.replace(/\s+/g, "\\s*")}\\s*[-:]\\s*`, "i"), "");
  }

  if (/\btopic\s+\d+/i.test(t) && ASSESSMENT.test(t)) {
    const m = t.match(ASSESSMENT);
    if (m) t = m[0];
  } else {
    t = t.replace(/^\s*(week\s+\d+\s*)?topic\s+\d+\s*/i, "");
    t = t.replace(/^\s*week\s+\d+\s*[-:]?\s*/i, "");
  }

  t = t.replace(
    /^\d+\s+(?=(midterm|final|exam|quiz|homework|assignment|chapter|group|marketing))/i,
    ""
  );
  t = t.replace(/\s{2,}/g, " ").replace(/^[\s,.;:/-]+|[\s,.;:/-]+$/g, "").trim();

  if (!t || /^[\d.:]+$/.test(t) || /^course deadline$/i.test(t) || /^deadline$/i.test(t)) {
    if (item.type && !/^(outline|calendar|content)$/i.test(item.type)) {
      t = item.type.replace(/_/g, " ");
    } else {
      t = "Deadline";
    }
  }

  t = smartCase(t);
  if (conflict) t += " (outline date differs)";
  return t;
}

export function chipLabel(item) {
  const course = shortCourse(item.courseCode, item.courseName);
  const title = prettyTitle(item.title, item);
  if (title.toLowerCase().startsWith(course.toLowerCase())) return title;
  return `${course} · ${title}`;
}

export function compactChipLabel(item) {
  const course = shortCourse(item.courseCode, item.courseName);
  const title = prettyTitle(item.title, item);
  const num = course.match(/(\d{2,4}[A-Z]?)$/)?.[1] || course;
  if (title.toLowerCase().startsWith(course.toLowerCase())) return title;
  return `${num}  ${title}`;
}

export function courseKey(item) {
  return shortCourse(item.courseCode, item.courseName);
}

export function sourceLabel(item) {
  if (item.source === "d2l") return "D2L";
  return "Outline";
}

export function workKind(item) {
  const blob = `${item.type || ""} ${item.title || ""}`.toLowerCase();
  if (/\b(exam|midterm|final|term tests?|quizzes?|quiz|\btests?\b)\b/.test(blob)) return "exam";
  if (/\b(assignments?|homework|\bhw\b|essay|paper|project|labs?|report|presentation|dropbox)\b/.test(blob)) {
    return "assignment";
  }
  return "other";
}

export function kindClass(item) {
  const kind = workKind(item);
  return kind === "other" ? "" : `kind-${kind}`;
}

export function isPlaceholderTitle(title) {
  const t = prettyTitle(title).toLowerCase();
  return !t || t === "deadline" || /^topic \d+$/.test(t);
}
