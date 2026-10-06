import { HOST, MAX_OUTLINE_BYTES } from "./config.js";
import { downloadTopicFile, downloadUrl } from "./d2l.js";
import { parseTermFromText, sameTerm } from "./term.js";

const SKIP_TITLE =
  /\b(week\s*\d+|lecture slides|lecture notes|chapter\s+\d+|lab manual|assignment\s+\d+|quiz\s+\d+|topic\s+\d+)\b/i;

const OUTLINE_MODULE =
  /\b(course\s*outline|outline|syllabus|course\s*information)\b/i;

const APPROVED_OUTLINE =
  /\b(?:f|w|sp|su)\d{2}\b.+\b(?:lec|lab|sem|tut|b0\d)\b.+\bapproved\b/i;

function asModules(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node;
  if (Array.isArray(node.Modules)) return node.Modules;
  if (Array.isArray(node.modules)) return node.modules;
  return [];
}

function asTopics(node) {
  if (!node) return [];
  if (Array.isArray(node.Topics)) return node.Topics;
  if (Array.isArray(node.topics)) return node.topics;
  return [];
}

export function walkTopics(node, acc = [], parentTitle = "") {
  for (const topic of asTopics(node)) {
    acc.push({
      ...topic,
      parentTitle: parentTitle || node?.Title || "",
      lastModified: topic.LastModifiedDate || node?.LastModifiedDate || null
    });
  }
  for (const mod of asModules(node)) {
    const title = mod.Title || parentTitle;
    walkTopics(mod, acc, title);
  }
  return acc;
}

function isPdfish(topic) {
  const url = `${topic.Url || ""} ${topic.Title || ""}`;
  return /\.pdf(\b|$)/i.test(url) || /pdf/i.test(topic.TypeIdentifier || "");
}

export function scoreTopic(topic, term) {
  if (topic.IsHidden) return -1;
  const parent = topic.parentTitle || "";
  const title = topic.Title || "";
  const url = topic.Url || "";
  const blob = `${title} ${parent} ${url}`.toLowerCase();

  if (/\.(pptx?|mp4|mov|zip|jpe?g|png|gif|m4a|mp3)$/i.test(url)) return -1;
  if (SKIP_TITLE.test(title) && !OUTLINE_MODULE.test(parent) && !APPROVED_OUTLINE.test(title)) {
    return -1;
  }

  let score = 0;
  if (OUTLINE_MODULE.test(parent)) score += 120;
  if (/course\s*outline/.test(blob) || /course[_-]?outline/.test(blob)) score += 100;
  if (/(^|[^a-z])outline([^a-z]|$)/.test(blob)) score += 80;
  if (/\bsyllabus\b/.test(blob)) score += 70;
  if (APPROVED_OUTLINE.test(`${title} ${url}`)) score += 130;
  if (/\bapproved\b/i.test(title) && isPdfish(topic)) score += 60;
  if (/[_-]co[_-]/.test(blob) || /_co_/.test(blob)) score += 90;
  if (isPdfish(topic)) score += 20;

  const labeled = parseTermFromText(`${title} ${url}`);
  if (term && labeled && sameTerm(labeled, term)) score += 40;
  if (term && labeled && !labeled.combined && !sameTerm(labeled, term)) score -= 80;

  return score;
}

export function pickOutlineTopic(toc, term) {
  const tocs = Array.isArray(toc) ? toc : [toc];
  const topics = tocs.flatMap((tree) => walkTopics(tree));
  const ranked = topics
    .map((topic) => ({ topic, score: scoreTopic(topic, term) }))
    .filter((row) => row.score >= 50)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ta = Date.parse(a.topic.lastModified || 0) || 0;
      const tb = Date.parse(b.topic.lastModified || 0) || 0;
      return tb - ta;
    });
  return ranked[0]?.topic || null;
}

function looksLikePdf(buffer) {
  if (!buffer || buffer.byteLength < 5) return false;
  const head = new Uint8Array(buffer.slice(0, 5));
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
}

export async function downloadOutlinePdf(le, course, topic) {
  const topicId = topic.TopicId || topic.Identifier || topic.Id;
  let buffer = null;
  if (topicId) {
    try {
      buffer = await downloadTopicFile(le, course.id, topicId);
      if (!looksLikePdf(buffer)) buffer = null;
    } catch {
      buffer = null;
    }
  }
  if (!buffer && topic.Url) {
    const url = topic.Url.startsWith("http") ? topic.Url : `${HOST}${topic.Url}`;
    try {
      buffer = await downloadUrl(url);
      if (!looksLikePdf(buffer)) buffer = null;
    } catch {
      buffer = null;
    }
  }
  if (!buffer) return null;
  if (buffer.byteLength > MAX_OUTLINE_BYTES) return null;
  return {
    buffer,
    title: topic.Title || "Course Outline",
    url: topic.Url || "",
    topicId
  };
}
