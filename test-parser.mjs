import { parseDeadlines } from "./lib/parse-deadlines.js";

const course = {
  id: 1,
  name: "CPSC 331",
  code: "CPSC 331",
  start: "2026-09-08T06:00:00Z",
  end: "2026-12-09T07:00:00Z"
};

const text = [
  "CLASS SCHEDULE",
  "Week Topic Learning Activity Assessment and due dates",
  "September 8-12 Introduction Review module Peer feedback on discussion posts by September 12",
  "October 6 Midterm 1 in class",
  "ASSESSMENT COMPONENTS",
  "Assignment 2 due Friday, November 7",
  "Final exam December 12 9:00 a.m.",
  "Office hours Monday 2pm",
  "Assignments must be submitted by 11:59pm on their due date."
].join("\n");

const items = parseDeadlines(text, course, "CPSC_331_Course_Outline.pdf");
console.log(JSON.stringify(items.map((i) => ({
  title: i.title,
  due: i.dueAt,
  conf: i.confidence,
  type: i.type
})), null, 2));

const titles = items.map((i) => i.title.toLowerCase()).join(" | ");
if (!/midterm/.test(titles)) throw new Error("missing midterm");
if (!/assignment 2/.test(titles)) throw new Error("missing assignment 2");
if (!/exam/.test(titles)) throw new Error("missing final exam");
if (/office hours/.test(titles)) throw new Error("office hours should be skipped");
if (/11:59/.test(titles) && items.length > 5) throw new Error("policy line leaked");
console.log("parser ok", items.length, "items");
