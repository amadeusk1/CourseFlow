import { currentTerm, isCourseInTerm, isDueInTerm, parseTermFromText } from "./lib/term.js";

const fall = currentTerm(new Date("2026-10-06T18:00:00Z"));
if (fall.label !== "Fall 2026") throw new Error(`expected Fall 2026, got ${fall.label}`);

const winter = currentTerm(new Date("2026-02-01T18:00:00Z"));
if (winter.label !== "Winter 2026") throw new Error(`expected Winter 2026, got ${winter.label}`);

const parsed = parseTermFromText("CPSC_331_L01_F2026");
if (parsed.season !== "fall" || parsed.year !== 2026) throw new Error("F2026 parse failed");

if (!isCourseInTerm({ code: "CPSC 331 F2026", name: "CPSC 331", start: "2026-09-08" }, fall)) {
  throw new Error("fall course should be included");
}
if (isCourseInTerm({ code: "CPSC 331 W2026", name: "CPSC 331", start: "2026-01-12" }, fall)) {
  throw new Error("winter course should be excluded in fall");
}
if (isCourseInTerm({ code: "MATH 211", name: "Linear Methods", start: "2026-01-12T07:00:00Z", end: "2026-04-14T06:00:00Z" }, fall)) {
  throw new Error("winter-dated course should be excluded in fall");
}
if (!isCourseInTerm({ code: "MATH 271", name: "Discrete Math (Fall 2026)", start: null, end: null }, fall)) {
  throw new Error("named fall course should be included");
}

if (!isDueInTerm("2026-10-07T05:59:00.000Z", fall)) throw new Error("Oct 6 evening due should count as Fall");
if (isDueInTerm("2026-04-10T06:00:00.000Z", fall)) throw new Error("April due should not count as Fall");

console.log("term filter ok", fall.label);
