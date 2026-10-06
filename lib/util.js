export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

export function listFromD2L(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.Items)) return payload.Items;
  if (Array.isArray(payload.Objects)) return payload.Objects;
  if (Array.isArray(payload.Modules)) return payload.Modules;
  return [];
}

export function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[#:_-]+/g, " ")
    .replace(/\b(due|deadline|the|a|an)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titlesSimilar(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" ").filter((w) => w.length > 2));
  const tb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return false;
  let overlap = 0;
  for (const w of ta) if (tb.has(w)) overlap += 1;
  const denom = Math.min(ta.size, tb.size);
  return overlap / denom >= 0.7;
}

export function sameDay(isoA, isoB) {
  if (!isoA || !isoB) return false;
  return String(isoA).slice(0, 10) === String(isoB).slice(0, 10);
}

export function hashId(value) {
  let h = 5381;
  const s = String(value);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

export function bufToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function nthSunday(year, monthIndex, n) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const dow = first.getUTCDay();
  const firstSunday = dow === 0 ? 1 : 8 - dow;
  return firstSunday + (n - 1) * 7;
}

export function isMountainDST(year, month, day, hour) {
  const startDay = nthSunday(year, 2, 2);
  const endDay = nthSunday(year, 10, 1);
  const t = month * 10000 + day * 100 + hour;
  const start = 2 * 10000 + startDay * 100 + 2;
  const end = 10 * 10000 + endDay * 100 + 2;
  return t >= start && t < end;
}

export function edmontonToUtcDate(year, month, day, hour, minute) {
  const offsetHours = isMountainDST(year, month, day, hour) ? 6 : 7;
  return new Date(Date.UTC(year, month, day, hour + offsetHours, minute, 0));
}

export function toIso(date) {
  return date.toISOString();
}

export function courseCode(course) {
  return course.code || course.name || `Course ${course.id}`;
}
