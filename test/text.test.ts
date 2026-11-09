import { describe, expect, it } from "vitest";
import { bodyLinks, priorityRank, statusOf } from "../src/github.js";
import { acceptanceCriteria, branchName, pullRequestBody } from "../src/text.js";

describe("branchName", () => {
  it("leads with the number and slugs the title", () => {
    expect(branchName({ number: 42, title: "Add CSV export (reports) — v2!" })).toBe("42-add-csv-export-reports-v2");
  });
  it("strips accents, caps length, and applies a prefix", () => {
    const b = branchName({ number: 7, title: "Café menu " + "x".repeat(80) }, "hn/");
    expect(b.startsWith("hn/7-cafe-menu-")).toBe(true);
    expect(b.length).toBeLessThanOrEqual("hn/7-".length + 48);
  });
  it("handles titles with no usable characters", () => {
    expect(branchName({ number: 3, title: "!!!" })).toBe("3");
  });
});

describe("acceptanceCriteria", () => {
  it("reads the list under an acceptance criteria heading", () => {
    const body = "Intro\n### Acceptance Criteria\n1. One\n- [x] Two\n* Three\n### Other\n- Not this";
    expect(acceptanceCriteria(body)).toEqual(["One", "Two", "Three"]);
  });
  it("falls back to checklist items", () => {
    expect(acceptanceCriteria("Do it\n- [ ] A\n- B\n- [X] C")).toEqual(["A", "C"]);
  });
  it("returns nothing when there are none", () => {
    expect(acceptanceCriteria("Just prose.")).toEqual([]);
  });
});

describe("GitHub conventions", () => {
  const issue = (labels: string[], state = "open") => ({ number: 1, title: "t", state, html_url: "", labels });
  it("maps labels and state to status", () => {
    expect(statusOf(issue([]))).toBe("todo");
    expect(statusOf(issue(["Status: In Progress"]))).toBe("in-progress");
    expect(statusOf(issue(["status: in review", "status: in progress"]))).toBe("in-review");
    expect(statusOf(issue(["status: in progress"], "closed"))).toBe("done");
  });
  it("ranks priority labels", () => {
    expect(priorityRank(["P0"])).toBe(0);
    expect(priorityRank(["priority: high"])).toBe(1);
    expect(priorityRank(["bug", "Priority/Low"])).toBe(3);
    expect(priorityRank(["bug"])).toBe(5);
  });
  it("finds parent and child references in a body", () => {
    expect(bodyLinks("Parent: #10\n\n- [ ] #11\n- [x] #12 done\n- [ ] #11\nSee #99")).toEqual({ parent: 10, children: [11, 12] });
    expect(bodyLinks("Part of #5")).toEqual({ parent: 5, children: [] });
  });
});

describe("pullRequestBody", () => {
  it("closes the ticket and keeps sections separated", () => {
    const body = pullRequestBody({ ticket: { number: 9, title: "x", status: "in-progress", url: "" }, summary: "S", testing: "T" });
    expect(body).toBe("Closes #9\n\n## What changed\nS\n\n## How it was tested\nT\n\n_Drafted by an AI agent via start-work-mcp. A human reviews before merge._");
  });
});
