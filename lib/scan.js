import { HOST } from "./config.js";
import {
  AuthError,
  fetchCalendarDueDates,
  fetchDropboxAndQuizzes,
  fetchDueItems,
  fetchToc,
  getVersions,
  listCourses,
  whoami
} from "./d2l.js";
import { downloadOutlinePdf, pickOutlineTopic } from "./outlines.js";
import { parseDeadlines } from "./parse-deadlines.js";
import { mergeItems } from "./merge.js";
import { currentTerm, isDueInTerm } from "./term.js";
import { bufToBase64, mapLimit } from "./util.js";

async function ensureOffscreen() {
  try {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"]
    });
    if (contexts.length) return;
  } catch {
    /* getContexts not available */
  }
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS"],
      justification: "Parse course outline PDFs with PDF.js"
    });
  } catch (err) {
    if (!/already exists|only a single offscreen/i.test(String(err))) throw err;
  }
}

async function pdfToText(buffer) {
  await ensureOffscreen();
  const b64 = bufToBase64(buffer);
  const res = await chrome.runtime.sendMessage({ type: "PARSE_PDF", b64 });
  if (!res?.ok) throw new Error(res?.error || "PDF parse failed");
  return res.text || "";
}

function progress(emit, message) {
  emit?.({ type: "PROGRESS", message });
}

export async function runScan(emit) {
  const term = currentTerm();
  progress(emit, `${term.label} · checking D2L login…`);
  const versions = await getVersions();
  const me = await whoami(versions.lp);
  progress(emit, `Signed in as ${me.FirstName || me.UniqueName || "student"}`);

  const courses = await listCourses(versions.lp, term);
  if (!courses.length) {
    return {
      user: me,
      term,
      courses: [],
      items: [],
      warnings: [`No ${term.label} courses found.`]
    };
  }

  progress(emit, `${term.label}: ${courses.length} course${courses.length === 1 ? "" : "s"}`);

  let d2lItems = [];
  try {
    d2lItems = await fetchDueItems(versions.le, courses, term);
  } catch (err) {
    if (err instanceof AuthError) throw err;
  }

  try {
    const cal = await fetchCalendarDueDates(versions.le, courses, term);
    d2lItems.push(...cal);
  } catch {
    /* optional */
  }

  const warnings = [];
  const outlineItems = [];

  await mapLimit(courses, 2, async (course) => {
    progress(emit, `${course.code}: D2L tools…`);
    try {
      const extra = await fetchDropboxAndQuizzes(versions.le, course);
      d2lItems.push(...extra);
    } catch {
      /* optional */
    }

    progress(emit, `${course.code}: looking for outline PDF…`);
    try {
      const toc = await fetchToc(versions.le, course.id);
      const topic = pickOutlineTopic(toc);
      if (!topic) {
        warnings.push(`${course.code}: no course outline PDF found in Content.`);
        return;
      }
      const file = await downloadOutlinePdf(versions.le, course, topic);
      if (!file) {
        warnings.push(`${course.code}: could not download “${topic.Title}”.`);
        return;
      }
      progress(emit, `${course.code}: reading ${topic.Title}…`);
      const text = await pdfToText(file.buffer);
      if (!text.trim()) {
        warnings.push(`${course.code}: outline looks like a scan (no text to parse).`);
        return;
      }
      const parsed = parseDeadlines(
        text,
        { ...course, start: term.startIso, end: term.endIso },
        file.title
      ).filter((item) => isDueInTerm(item.dueAt, term));
      outlineItems.push(...parsed);
      if (!parsed.length) {
        warnings.push(`${course.code}: outline PDF found, but no dates were parsed.`);
      }
    } catch (err) {
      if (err instanceof AuthError) throw err;
      warnings.push(`${course.code}: outline scan failed (${err.message || "error"}).`);
    }
  });

  const items = mergeItems(d2lItems, outlineItems)
    .filter((item) => isDueInTerm(item.dueAt, term))
    .map((item) => ({
      ...item,
      included: item.includedDefault !== false,
      url: item.url || `${HOST}/d2l/home/${item.orgUnitId}`
    }));

  return { user: me, term, courses, items, warnings };
}
