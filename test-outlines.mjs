import { pickOutlineTopic } from "./lib/outlines.js";
import { currentTerm } from "./lib/term.js";

const term = currentTerm(new Date("2026-10-06T18:00:00Z"));
const toc = {
  Modules: [
    {
      Title: "Course Outline (Syllabus)",
      Topics: [
        {
          TopicId: 99,
          Title: "F26 PHIL 314 LEC 02 APPROVED",
          Url: "/content/enforced/123-PHIL314/F26 PHIL 314 LEC 02 APPROVED.pdf",
          IsHidden: false
        }
      ]
    },
    {
      Title: "Topic 1: Introduction to the Course",
      Topics: [
        {
          TopicId: 100,
          Title: "Week 1 slides",
          Url: "/content/week1.pdf",
          IsHidden: false
        }
      ]
    }
  ]
};

const picked = pickOutlineTopic(toc, term);
if (!picked || picked.TopicId !== 99) {
  throw new Error(`should pick approved outline, got ${picked?.Title}`);
}

const byNameOnly = pickOutlineTopic({
  Modules: [
    {
      Title: "Content",
      Topics: [
        {
          TopicId: 7,
          Title: "F26 PHIL 314 LEC 02 APPROVED",
          Url: "/files/outline.pdf"
        }
      ]
    }
  ]
}, term);
if (!byNameOnly || byNameOnly.TopicId !== 7) {
  throw new Error("approved filename should match even outside an Outline folder");
}

console.log("outline picker ok", picked.Title);
