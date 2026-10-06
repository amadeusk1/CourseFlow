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

const table = [
  "Assessment Due Date / Location Weight",
  "Participation marks will be obtained by attending and performing activities in lectures and tutorials, providing peer feedback about the course to the instructor.",
  "Assignment One, Part One",
  "Sep 23 2026",
  "5%",
  "Assignment One, Part Two",
  "Oct 09 2026",
  "10%",
  "Term Test 1",
  "Oct 14 2026 Out-of-class",
  "15%",
  "Term Test 2",
  "Nov 04 2026 Out-of-class",
  "Assignment Two, Part One",
  "Nov 06 2026",
  "Assignment Two, Part Two",
  "Nov 20 2026"
].join("\n");

const tableItems = parseDeadlines(table, course, "F26 PHIL 314 LEC 02 APPROVED.pdf");
const tableTitles = tableItems.map((i) => i.title.toLowerCase()).join(" | ");
console.log("table", JSON.stringify(tableItems.map((i) => ({ title: i.title, due: i.dueAt.slice(0, 10) })), null, 2));
if (!/assignment one, part one/.test(tableTitles)) throw new Error("missing assignment one part one");
if (!/assignment one, part two/.test(tableTitles)) throw new Error("missing assignment one part two");
if (!/term test 1/.test(tableTitles)) throw new Error("missing term test 1");
if (!/term test 2/.test(tableTitles)) throw new Error("missing term test 2");
if (!/assignment two, part one/.test(tableTitles)) throw new Error("missing assignment two part one");
if (!/assignment two, part two/.test(tableTitles)) throw new Error("missing assignment two part two");
if (/participation/.test(tableTitles)) throw new Error("participation should not be a deadline");
console.log("table parser ok", tableItems.length, "items");

const messy = [
  "CLASS SCHEDULE",
  "Week 5 Marketing Mix - Price Chapter 10 Group Learning Activity October 23",
  "Topic 5 available TBA Assignment C October 7",
  "Topic 6 available TBA October 9",
  "National Day for Truth and Reconciliation September 30",
  "Homework 5 due October 2 2359"
].join("\n");
const messyItems = parseDeadlines(messy, course, "MKTG_341.pdf");
const messyTitles = messyItems.map((i) => i.title);
if (messyTitles.some((t) => /^keting/i.test(t))) throw new Error("Marketing Mix was split on Mar");
if (!messyTitles.some((t) => /marketing mix/i.test(t))) throw new Error("missing Marketing Mix");
if (messyTitles.filter((t) => /^assignment c$/i.test(t)).length !== 1) {
  throw new Error("Assignment C should appear once");
}
if (messyItems.some((i) => i.dueAt.startsWith("2359"))) {
  throw new Error("2359 must not be parsed as a year");
}
if (messyTitles.some((t) => /topic 6/i.test(t))) throw new Error("TBA-only topic should be skipped");
if (messyTitles.some((t) => /truth/i.test(t))) throw new Error("holiday should be skipped");
if (messyTitles.some((t) => /2359/.test(t))) throw new Error("2359 should not be a title");
if (!messyTitles.some((t) => /homework 5/i.test(t))) throw new Error("missing Homework 5");
console.log("messy titles ok", messyTitles);
