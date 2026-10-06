import { HOST, MAX_OUTLINE_BYTES } from "./config.js";
import { downloadTopicFile, downloadUrl } from "./d2l.js";

const SKIP_TITLE =
  /\b(week\s*\d+|lecture|slides|chapter|lab manual|assignment\s+\d+|quiz\s+\d+|module\s+\d+)\b/i;

function walkTopics(node, acc = []) {
  const modules = node?.Modules || [];
  for (const mod of modules) {
    if (mod.IsHidden) continue;
    for (const topic of mod.Topics || []) {
      acc.push({
        ...topic,
        parentTitle: mod.Title || "",
        lastModified: topic.LastModifiedDate || mod.LastModifiedDate || null
      });
    }
    walkTopics(mod, acc);
  }
  return acc;
}

function scoreTopic(topic) {
  if (topic.IsHidden || topic.IsLocked) return -1;
  const title = `${topic.Title || ""} ${topic.parentTitle || ""}`;
  const url = topic.Url || "";
  const blob = `${title} ${url}`.toLowerCase();

  if (/\.(pptx?|mp4|mov|zip|jpe?g|png|gif|m4a|mp3)$/i.test(url)) return -1;

  let score = 0;
  if (/course\s*outline/.test(blob) || /course[_-]?outline/.test(blob)) score += 100;
  if (/(^|[^a-z])outline([^a-z]|$)/.test(blob)) score += 80;
  if (/\bsyllabus\b/.test(blob)) score += 70;
  if (/[_-]co[_-]/.test(blob) || /_co_/.test(blob)) score += 90;
  if (/\.pdf(\b|$)/i.test(url) || /\.pdf$/i.test(title)) score += 20;
  if (/\.docx?$/i.test(url)) score += 5;

  if (SKIP_TITLE.test(title) && score < 70) return -1;
  return score;
}

export function pickOutlineTopic(toc) {
  const topics = walkTopics(toc);
  const ranked = topics
    .map((topic) => ({ topic, score: scoreTopic(topic) }))
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
