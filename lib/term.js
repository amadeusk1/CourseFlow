const TIMEZONE = "America/Edmonton";

const SEASONS = {
  winter: { key: "winter", label: "Winter", start: "01-01", end: "04-30" },
  spring: { key: "spring", label: "Spring", start: "05-01", end: "06-30" },
  summer: { key: "summer", label: "Summer", start: "07-01", end: "08-31" },
  fall: { key: "fall", label: "Fall", start: "09-01", end: "12-31" }
};

function edmontonParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day"))
  };
}

export function parseTermFromText(text) {
  const s = String(text || "").replace(/[_/.-]+/g, " ");
  if (/\bspring\s*[/&-]\s*summer\b/i.test(s) || /\bspring summer\b/i.test(s)) {
    return { combined: "spring-summer" };
  }

  const named = s.match(/\b(fall|winter|spring|summer)\s+(20\d{2})\b/i);
  if (named) return { season: named[1].toLowerCase(), year: Number(named[2]) };

  const coded = s.match(/\b(SP|SU|F|W)(?:20)?(\d{2})\b/i);
  if (coded) {
    const token = coded[1].toUpperCase();
    const year = expandYear(coded[2]);
    if (token === "SP") return { season: "spring", year };
    if (token === "SU") return { season: "summer", year };
    if (token === "F") return { season: "fall", year };
    if (token === "W") return { season: "winter", year };
  }

  const summerYear = s.match(/\bS(20\d{2})\b/);
  if (summerYear) return { season: "summer", year: Number(summerYear[1]) };

  return null;
}

function ymd(dateLike) {
  if (!dateLike) return null;
  const t = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(t.getTime())) return null;
  const { year, month, day } = edmontonParts(t);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function seasonFromMonth(month) {
  if (month <= 4) return "winter";
  if (month <= 6) return "spring";
  if (month <= 8) return "summer";
  return "fall";
}

function expandYear(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n >= 2000) return n;
  return 2000 + n;
}

export function buildTerm(season, year) {
  const meta = SEASONS[season];
  const start = `${year}-${meta.start}`;
  const end = `${year}-${meta.end}`;
  return {
    season,
    year,
    label: `${meta.label} ${year}`,
    start,
    end,
    startIso: `${start}T00:00:00.000Z`,
    endIso: `${end}T23:59:59.000Z`
  };
}

export function currentTerm(now = new Date()) {
  const { year, month } = edmontonParts(now);
  return buildTerm(seasonFromMonth(month), year);
}

export function termFromDate(dateLike) {
  const stamp = ymd(dateLike);
  if (!stamp) return null;
  const year = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(5, 7));
  return buildTerm(seasonFromMonth(month), year);
}

export function sameTerm(a, b) {
  if (!a || !b) return false;
  if (a.combined === "spring-summer") {
    return b.season === "spring" || b.season === "summer";
  }
  if (b.combined === "spring-summer") {
    return a.season === "spring" || a.season === "summer";
  }
  return a.season === b.season && a.year === b.year;
}

export function isCourseInTerm(course, term) {
  const blob = `${course.code || ""} ${course.name || ""}`;
  const labeled = parseTermFromText(blob);
  if (labeled) return sameTerm(labeled, term);

  const fromStart = termFromDate(course.start);
  if (fromStart) return sameTerm(fromStart, term);

  const fromEnd = termFromDate(course.end);
  if (fromEnd) return sameTerm(fromEnd, term);

  return false;
}

export function isDueInTerm(iso, term) {
  const day = ymd(iso);
  if (!day || !term) return false;
  return day >= term.start && day <= term.end;
}

export function isoRangeForTerm(term) {
  return {
    startDateTime: `${term.start}T00:00:00.000Z`,
    endDateTime: `${term.end}T23:59:59.000Z`
  };
}
