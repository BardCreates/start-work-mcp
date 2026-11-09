import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { FakeProvider } from "./fakeProvider.js";

async function connect(provider: FakeProvider) {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createServer(provider).connect(serverT);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientT);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    return (res.content as { text: string }[])[0].text;
  };
  return { client, call };
}

const board = () =>
  new FakeProvider()
    .add({ number: 10, title: "Reports overhaul", body: "Epic for the reports work." })
    .add(
      {
        number: 42,
        title: "Add CSV export to reports",
        body: "Users need to download reports.\n\n## Acceptance criteria\n- Export button on the report page\n- [ ] File opens in Excel\n\n## Notes\nUse the existing query.",
        comments: [{ author: "pm", body: "UTF-8 with BOM please.", createdAt: "2026-11-01T10:00:00Z" }],
      },
      10,
    )
    .add({ number: 43, title: "Schedule report emails" }, 10);

describe("MCP tools", () => {
  it("exposes the five tools", async () => {
    const { client } = await connect(board());
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_ticket_context", "list_my_tickets", "open_pull_request", "set_ticket_status", "start_ticket"]);
  });

  it("lists my tickets", async () => {
    const { call } = await connect(board());
    const out = await call("list_my_tickets");
    expect(out).toContain("#42 [todo] Add CSV export to reports");
  });

  it("builds a brief with parent, children, criteria and discussion", async () => {
    const { call } = await connect(board());
    const parentBrief = await call("get_ticket_context", { number: 10 });
    expect(parentBrief).toContain("## Child tickets");
    expect(parentBrief).toContain("#42 Add CSV export to reports");

    const brief = await call("get_ticket_context", { number: 42 });
    expect(brief).toContain("## Parent ticket (the bigger goal)\n#10 Reports overhaul");
    expect(brief).toContain("- [ ] Export button on the report page");
    expect(brief).toContain("- [ ] File opens in Excel");
    expect(brief).toContain("**pm** (2026-11-01): UTF-8 with BOM please.");
    expect(brief).toContain("Branch: `42-add-csv-export-to-reports`");
  });

  it("start_ticket assigns, marks in progress and returns the branch", async () => {
    const p = board();
    p.tickets.get(43)!.assignees = [];
    const { call } = await connect(p);
    const out = await call("start_ticket", { number: 43 });
    expect(out).toContain("`43-schedule-report-emails`");
    expect(p.tickets.get(43)!.status).toBe("in-progress");
    expect(p.tickets.get(43)!.assignees).toContain("hannah");
  });

  it("start_ticket refuses closed tickets", async () => {
    const p = board();
    p.tickets.get(43)!.status = "done";
    const { call } = await connect(p);
    expect(await call("start_ticket", { number: 43 })).toContain("already closed");
    expect(p.tickets.get(43)!.status).toBe("done");
  });

  it("open_pull_request links the ticket, moves it to review, and comments", async () => {
    const p = board();
    const { call } = await connect(p);
    await call("start_ticket", { number: 42 });
    const out = await call("open_pull_request", {
      number: 42,
      branch: "42-add-csv-export-to-reports",
      summary: "Adds an Export CSV button.",
      testing: "Unit tests for the CSV writer; opened the file in Excel.",
      notes: "BOM added per PM comment.",
    });
    expect(out).toContain("Opened PR #101");
    expect(p.prs[0].title).toBe("#42: Add CSV export to reports");
    expect(p.prs[0].body).toMatch(/^Closes #42/);
    expect(p.prs[0].body).toContain("## Notes for the reviewer\nBOM added per PM comment.");
    expect(p.tickets.get(42)!.status).toBe("in-review");
    expect(p.comments).toEqual([{ number: 42, body: "Opened PR #101 for review: https://example.test/pull/101" }]);
  });

  it("rejects invalid input", async () => {
    const { client } = await connect(board());
    const res = await client.callTool({ name: "set_ticket_status", arguments: { number: 42, status: "shipped" } });
    expect(res.isError).toBe(true);
  });
});
