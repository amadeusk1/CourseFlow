import { sameDay, titlesSimilar } from "./util.js";

function dayKey(iso) {
  return String(iso || "").slice(0, 10);
}

export function mergeItems(d2lItems, outlineItems) {
  const official = dedupe(d2lItems);
  const extras = [];

  for (const guessed of outlineItems) {
    const clash = official.find(
      (item) => item.orgUnitId === guessed.orgUnitId && titlesSimilar(item.title, guessed.title)
    );
    if (clash) {
      if (sameDay(clash.dueAt, guessed.dueAt)) continue;
      extras.push({
        ...guessed,
        id: `${guessed.id}-conflict`,
        title: `${guessed.title} (outline date differs)`,
        confidence: "medium",
        evidence: `Outline: ${dayKey(guessed.dueAt)} · D2L: ${dayKey(clash.dueAt)}. ${guessed.evidence || ""}`.trim(),
        includedDefault: false
      });
      continue;
    }
    extras.push({
      ...guessed,
      includedDefault: guessed.confidence === "high" || guessed.confidence === "medium"
    });
  }

  return [
    ...official.map((item) => ({ ...item, includedDefault: true })),
    ...dedupe(extras)
  ];
}

function dedupe(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.orgUnitId}|${dayKey(item.dueAt)}|${(item.title || "").toLowerCase()}`;
    if (seen.has(key) || seen.has(item.id)) continue;
    seen.add(key);
    seen.add(item.id);
    out.push(item);
  }
  return out.sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)));
}
