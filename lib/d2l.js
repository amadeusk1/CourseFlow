import { COURSE_TYPE_ID, HOST } from "./config.js";
import { isCourseInTerm, isoRangeForTerm } from "./term.js";
import { listFromD2L } from "./util.js";

export class AuthError extends Error {
  constructor(message = "Not logged in to D2L") {
    super(message);
    this.code = "AUTH";
    this.name = "AuthError";
  }
}

async function d2lFetch(path, { accept = "application/json" } = {}) {
  const url = path.startsWith("http") ? path : `${HOST}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    redirect: "follow",
    headers: { Accept: accept }
  });

  if (res.status === 401 || res.status === 403) {
    throw new AuthError();
  }

  return res;
}

async function d2lJson(path) {
  const res = await d2lFetch(path);
  const type = res.headers.get("content-type") || "";
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`D2L ${res.status} ${path}: ${text.slice(0, 180)}`);
    err.status = res.status;
    throw err;
  }
  if (!type.includes("json")) {
    const text = await res.text();
    if (/login|Sign in|d2l\/login/i.test(text) || text.includes("<html")) {
      throw new AuthError();
    }
    const err = new Error(`Unexpected response from ${path}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export async function getVersions() {
  const versions = await d2lJson("/d2l/api/versions/");
  const pick = (code, fallback) => {
    const row = versions.find((v) => (v.ProductCode || "").toLowerCase() === code);
    return row?.LatestVersion || fallback;
  };
  return {
    lp: pick("lp", "1.43"),
    le: pick("le", "1.51")
  };
}

export async function whoami(lp) {
  return d2lJson(`/d2l/api/lp/${lp}/users/whoami`);
}

async function paginateEnrollments(lp) {
  const items = [];
  let bookmark = "";
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ orgUnitTypeId: String(COURSE_TYPE_ID) });
    if (bookmark) qs.set("bookmark", bookmark);
    const data = await d2lJson(`/d2l/api/lp/${lp}/enrollments/myenrollments/?${qs}`);
    items.push(...listFromD2L(data));
    const info = data.PagingInfo || {};
    if (!info.HasMoreItems) break;
    bookmark = info.Bookmark || "";
    if (!bookmark) break;
  }
  return items;
}

function isCourseOffering(row) {
  const typeId = row.OrgUnit?.Type?.Id;
  const typeCode = row.OrgUnit?.Type?.Code;
  if (typeId !== COURSE_TYPE_ID && typeCode !== "Course Offering") return false;
  if (row.Access?.CanAccess === false) return false;
  return true;
}

export async function listCourses(lp, term) {
  const rows = await paginateEnrollments(lp);
  return rows
    .filter(isCourseOffering)
    .map((row) => ({
      id: row.OrgUnit.Id,
      name: row.OrgUnit.Name,
      code: row.OrgUnit.Code || row.OrgUnit.Name,
      start: row.Access?.StartDate || null,
      end: row.Access?.EndDate || null
    }))
    .filter((course) => isCourseInTerm(course, term));
}

async function collectPaged(firstPath) {
  const out = [];
  let next = firstPath;
  const seen = new Set();
  while (next && !seen.has(next)) {
    seen.add(next);
    const data = await d2lJson(next);
    out.push(...listFromD2L(data));
    next = data.Next || data.next || null;
    if (next && next.startsWith("http")) {
      next = next.replace(HOST, "");
    }
  }
  return out;
}

function asIso(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function itemTypeFromScheduled(item) {
  const raw = `${item.ItemType || item.Type || item.ActivityType || ""} ${item.Location || ""}`.toLowerCase();
  if (/quiz/.test(raw)) return "quiz";
  if (/dropbox|assign/.test(raw)) return "assignment";
  if (/discuss/.test(raw)) return "discussion";
  if (/survey/.test(raw)) return "survey";
  return "content";
}

export async function fetchDueItems(le, courses, term) {
  const ids = courses.map((c) => c.id);
  const byCourse = new Map(courses.map((c) => [c.id, c]));
  const items = [];

  const fromScheduled = (row, fallbackCourse) => {
    const due = asIso(row.DueDate || row.dueDate);
    if (!due) return null;
    const orgId = row.OrgUnit?.Id || row.OrgUnitId || fallbackCourse?.id;
    const course = byCourse.get(orgId) || fallbackCourse;
    const title = row.Title || row.Name || "Untitled";
    const type = itemTypeFromScheduled(row);
    const id = row.Id || row.ScheduledItemId || row.ItemId || title;
    return {
      id: `d2l-${orgId}-${type}-${id}`,
      orgUnitId: orgId,
      courseName: course?.name || row.OrgUnit?.Name || "Course",
      courseCode: course?.code || row.OrgUnit?.Code || "",
      title,
      type,
      dueAt: due,
      url: row.Url ? (row.Url.startsWith("http") ? row.Url : `${HOST}${row.Url}`) : `${HOST}/d2l/home/${orgId}`,
      source: "d2l",
      confidence: "official",
      evidence: "",
      fileTitle: ""
    };
  };

  const range = term ? isoRangeForTerm(term) : null;
  const dateQs = range
    ? { startDateTime: range.startDateTime, endDateTime: range.endDateTime }
    : {};

  try {
    const qs = new URLSearchParams({
      orgUnitIdsCSV: ids.join(","),
      ...dateQs
    });
    const rows = await collectPaged(`/d2l/api/le/${le}/content/myItems/due/?${qs}`);
    for (const row of rows) {
      const item = fromScheduled(row);
      if (item) items.push(item);
    }
  } catch {
    for (const course of courses) {
      try {
        const qs = new URLSearchParams(dateQs);
        const suffix = qs.toString() ? `?${qs}` : "";
        const rows = await collectPaged(`/d2l/api/le/${le}/${course.id}/content/myItems/due/${suffix}`);
        for (const row of rows) {
          const item = fromScheduled(row, course);
          if (item) items.push(item);
        }
      } catch {
        /* some courses hide this endpoint */
      }
    }
  }

  return items;
}

const SKIP_CALENDAR_TYPES = new Set([
  2, 3, 4, 5,
  "AvailabilityStarts",
  "AvailabilityEnds",
  "UnlockStarts",
  "UnlockEnds"
]);

const SKIP_CALENDAR_TITLE =
  /\b(office hours?|availability starts?|availability ends?|unlocks?|content available|truth and reconciliation|national day for truth)\b/i;

function calendarEventType(row) {
  const raw = row.EventType ?? row.Type ?? row.CalendarEventType;
  if (raw == null || raw === "") return "event";
  if (raw === 6 || /duedate/i.test(String(raw))) return "due";
  if (raw === 1 || /reminder/i.test(String(raw))) return "reminder";
  return String(raw);
}

function shouldKeepCalendarEvent(row) {
  const type = row.EventType ?? row.Type ?? row.CalendarEventType;
  if (SKIP_CALENDAR_TYPES.has(type)) return false;
  const title = `${row.Title || ""} ${row.Description || ""}`;
  if (SKIP_CALENDAR_TITLE.test(title)) return false;
  return true;
}

function mapCalendarRow(row, courses, byCourse) {
  if (!shouldKeepCalendarEvent(row)) return null;
  const due = asIso(row.StartDateTime || row.StartDay || row.DueDate || row.EndDateTime || row.EndDay);
  if (!due) return null;
  const orgId = row.OrgUnitId || row.OrgUnit?.Id;
  const course = byCourse.get(orgId) || courses.find((c) => c.id === orgId);
  const title = (row.Title || row.Description || "Calendar event").trim();
  const eventType = calendarEventType(row);
  const idPart = row.CalendarEventId || row.EventId || row.OccurrenceId || title;
  return {
    id: `d2l-${orgId || "cal"}-calendar-${idPart}`,
    orgUnitId: course?.id || orgId,
    courseName: course?.name || row.OrgUnit?.Name || "Course",
    courseCode: course?.code || row.OrgUnit?.Code || "",
    title,
    type: eventType === "due" ? "calendar" : "calendar",
    dueAt: due,
    url: course?.id ? `${HOST}/d2l/le/${course.id}/calendar` : `${HOST}/d2l/home`,
    source: "d2l",
    confidence: "official",
    evidence: "D2L calendar",
    fileTitle: ""
  };
}

async function collectCalendarRows(le, courses, term) {
  const range = isoRangeForTerm(term);
  const ids = courses.map((c) => c.id);
  const rows = [];

  const tryPaged = async (path) => {
    try {
      rows.push(...(await collectPaged(path)));
    } catch {
      /* optional */
    }
  };

  const base = {
    orgUnitIdsCSV: ids.join(","),
    startDateTime: range.startDateTime,
    endDateTime: range.endDateTime
  };
  await tryPaged(`/d2l/api/le/${le}/calendar/events/myEvents/?${new URLSearchParams(base)}`);
  await tryPaged(
    `/d2l/api/le/${le}/calendar/events/myEvents/?${new URLSearchParams({ ...base, eventType: "DueDate" })}`
  );

  for (const course of courses) {
    const per = new URLSearchParams({
      startDateTime: range.startDateTime,
      endDateTime: range.endDateTime
    });
    await tryPaged(`/d2l/api/le/${le}/${course.id}/calendar/events/myEvents/?${per}`);
    try {
      const list = await d2lJson(`/d2l/api/le/${le}/${course.id}/calendar/events/`);
      rows.push(...asList(list));
    } catch {
      /* optional */
    }
    try {
      const occ = await collectPaged(
        `/d2l/api/le/${le}/${course.id}/calendar/events/occurrences/?${per}`
      );
      rows.push(...occ);
    } catch {
      /* optional */
    }
  }

  return rows;
}

export async function fetchCalendarEvents(le, courses, term) {
  const byCourse = new Map(courses.map((c) => [c.id, c]));
  const rows = await collectCalendarRows(le, courses, term);
  return rows.map((row) => mapCalendarRow(row, courses, byCourse)).filter(Boolean);
}

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.Quizzes)) return payload.Quizzes;
  return listFromD2L(payload);
}

export async function fetchDropboxAndQuizzes(le, course) {
  const items = [];

  try {
    const folders = await d2lJson(`/d2l/api/le/${le}/${course.id}/dropbox/folders/`);
    for (const folder of asList(folders)) {
      const due = asIso(folder.DueDate);
      if (!due) continue;
      items.push({
        id: `d2l-${course.id}-assignment-${folder.Id}`,
        orgUnitId: course.id,
        courseName: course.name,
        courseCode: course.code,
        title: folder.Name || "Assignment",
        type: "assignment",
        dueAt: due,
        url: `${HOST}/d2l/lms/dropbox/user/folder_submit_files.d2l?db=${folder.Id}&ou=${course.id}`,
        source: "d2l",
        confidence: "official",
        evidence: "",
        fileTitle: ""
      });
    }
  } catch {
    /* optional */
  }

  try {
    const quizzes = await d2lJson(`/d2l/api/le/${le}/${course.id}/quizzes/`);
    for (const quiz of asList(quizzes)) {
      const due = asIso(quiz.DueDate || quiz.EndDate);
      if (!due) continue;
      const qid = quiz.QuizId || quiz.Id;
      items.push({
        id: `d2l-${course.id}-quiz-${qid}`,
        orgUnitId: course.id,
        courseName: course.name,
        courseCode: course.code,
        title: quiz.Name || quiz.Title || "Quiz",
        type: "quiz",
        dueAt: due,
        url: `${HOST}/d2l/lms/quizzing/user/quizzes.d2l?ou=${course.id}`,
        source: "d2l",
        confidence: "official",
        evidence: "",
        fileTitle: ""
      });
    }
  } catch {
    /* optional */
  }

  return items;
}

export async function fetchToc(le, orgUnitId, title) {
  const qs = title ? `?${new URLSearchParams({ title })}` : "";
  return d2lJson(`/d2l/api/le/${le}/${orgUnitId}/content/toc${qs}`);
}

export async function downloadTopicFile(le, orgUnitId, topicId) {
  const res = await d2lFetch(`/d2l/api/le/${le}/${orgUnitId}/content/topics/${topicId}/file?stream=1`, {
    accept: "*/*"
  });
  if (!res.ok) {
    const err = new Error(`file ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.arrayBuffer();
}

export async function downloadUrl(pathOrUrl) {
  const res = await d2lFetch(pathOrUrl, { accept: "*/*" });
  if (!res.ok) {
    const err = new Error(`download ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.arrayBuffer();
}
