/**
 * The MCP server: five tools that cover the ticket side of "start work".
 * Git itself (branching, committing, pushing) stays with the agent's normal tools,
 * so this server never touches the working tree.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { STATUSES, type TicketProvider } from "./provider.js";
import { branchName, pullRequestBody, workBrief } from "./text.js";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

export function createServer(provider: TicketProvider, opts: { branchPrefix?: string } = {}): McpServer {
  const server = new McpServer({ name: "start-work-mcp", version: "0.1.0" });
  const status = z.enum(STATUSES as [string, ...string[]]);

  server.registerTool(
    "list_my_tickets",
    {
      title: "List my tickets",
      description: "Open tickets assigned to me, highest priority first. Use this to pick what to work on next.",
      inputSchema: { status: status.optional().describe("Only tickets in this status (default: all open).") },
      annotations: { readOnlyHint: true },
    },
    async ({ status: s }) => {
      const tickets = await provider.listMyTickets({ status: s as never });
      if (!tickets.length) return text("No open tickets are assigned to you.");
      return text(tickets.map((t) => `#${t.number} [${t.status}] ${t.title}\n  ${t.url}`).join("\n"));
    },
  );

  server.registerTool(
    "get_ticket_context",
    {
      title: "Get ticket context",
      description: "A ticket's description, acceptance criteria and discussion, plus its parent and child tickets, as a work brief.",
      inputSchema: { number: z.number().int().positive() },
      annotations: { readOnlyHint: true },
    },
    async ({ number }) => {
      const ctx = await provider.getContext(number);
      return text(workBrief(ctx, branchName(ctx.ticket, opts.branchPrefix)));
    },
  );

  server.registerTool(
    "start_ticket",
    {
      title: "Start ticket",
      description:
        "Claim a ticket: assign it to me, mark it in progress, and return the branch name to create plus the full work brief. Call this before writing any code.",
      inputSchema: { number: z.number().int().positive() },
    },
    async ({ number }) => {
      const ctx = await provider.getContext(number);
      if (ctx.ticket.status === "done") return text(`#${number} is already closed. Pick another ticket.`);
      const branch = branchName(ctx.ticket, opts.branchPrefix);
      await provider.assignToMe(number);
      await provider.setStatus(number, "in-progress");
      return text(
        `Started #${number}. Create and switch to the branch \`${branch}\` from an up-to-date default branch, then work from this brief:\n\n${workBrief(
          { ...ctx, ticket: { ...ctx.ticket, status: "in-progress" } },
          branch,
        )}`,
      );
    },
  );

  server.registerTool(
    "open_pull_request",
    {
      title: "Open pull request",
      description:
        "After the branch is pushed and tests pass: open a PR that closes the ticket, move the ticket to in review, and leave a comment linking the PR. A human reviews before merge.",
      inputSchema: {
        number: z.number().int().positive().describe("The ticket number."),
        branch: z.string().min(1).describe("The pushed branch."),
        summary: z.string().min(1).describe("What changed and why, for the reviewer."),
        testing: z.string().min(1).describe("How it was verified: tests added or run, manual checks."),
        notes: z.string().optional().describe("Assumptions, open questions, anything the reviewer should look at closely."),
        draft: z.boolean().optional().describe("Open as a draft (use when acceptance criteria aren't all met)."),
        base: z.string().optional().describe("Target branch (default: the repo's default branch)."),
      },
    },
    async ({ number, branch, summary, testing, notes, draft, base }) => {
      const { ticket } = await provider.getContext(number);
      const pr = await provider.openPullRequest({
        branch,
        base,
        draft,
        title: `#${number}: ${ticket.title}`,
        body: pullRequestBody({ ticket, summary, testing, notes }),
      });
      await provider.setStatus(number, "in-review");
      await provider.comment(number, `Opened ${pr.draft ? "draft " : ""}PR #${pr.number} for review: ${pr.url}`);
      return text(`Opened ${pr.draft ? "draft " : ""}PR #${pr.number}: ${pr.url}\n#${number} is now in review.`);
    },
  );

  server.registerTool(
    "set_ticket_status",
    {
      title: "Set ticket status",
      description: "Move a ticket to todo, in-progress, in-review or done. Use to put a ticket back if you stop work on it.",
      inputSchema: { number: z.number().int().positive(), status },
    },
    async ({ number, status: s }) => {
      await provider.setStatus(number, s as never);
      return text(`#${number} is now ${s}.`);
    },
  );

  return server;
}
