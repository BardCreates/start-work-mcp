/** Pure helpers: branch naming, the agent's work brief, and the PR description. */
import type { TicketContext, TicketRef } from "./provider.js";

/** `42-add-csv-export-to-reports`: ticket number first so branches sort and link back. */
export function branchName(ticket: { number: number; title: string }, prefix = ""): string {
  const slug = ticket.title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return `${prefix}${ticket.number}${slug ? `-${slug}` : ""}`;
}

/**
 * Pull "acceptance criteria" out of a ticket body: a heading containing the words,
 * followed by its list. Falls back to every checklist item in the body.
 */
export function acceptanceCriteria(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\s*(#{1,6}\s*|\*\*)?\s*acceptance criteria/i.test(l));
  const item = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.+?)\s*$/;
  if (start >= 0) {
    const out: string[] = [];
    for (const l of lines.slice(start + 1)) {
      if (/^\s*#{1,6}\s/.test(l)) break;
      const m = l.match(item);
      if (m) out.push(m[1]);
    }
    if (out.length) return out;
  }
  return lines.flatMap((l) => {
    const m = l.match(/^\s*[-*+]\s+\[[ xX]\]\s+(.+?)\s*$/);
    return m ? [m[1]] : [];
  });
}

const refLine = (t: TicketRef) => `#${t.number} ${t.title} (${t.status})`;

/** The brief the agent works from: everything it needs, nothing it doesn't. */
export function workBrief(ctx: TicketContext, branch: string): string {
  const { ticket, parent, children } = ctx;
  const criteria = acceptanceCriteria(ticket.body);
  const parts = [
    `# #${ticket.number}: ${ticket.title}`,
    `Branch: \`${branch}\``,
    ticket.url,
    parent ? `\n## Parent ticket (the bigger goal)\n${refLine(parent)}` : "",
    children.length ? `\n## Child tickets\n${children.map((c) => `- ${refLine(c)}`).join("\n")}` : "",
    `\n## Description\n${ticket.body.trim() || "(no description)"}`,
    criteria.length ? `\n## Acceptance criteria (the definition of done)\n${criteria.map((c) => `- [ ] ${c}`).join("\n")}` : "\n## Acceptance criteria\nNone written. Infer them from the description and state your assumptions in the PR.",
    ticket.comments.length
      ? `\n## Discussion\n${ticket.comments.map((c) => `**${c.author}** (${c.createdAt.slice(0, 10)}): ${c.body.trim()}`).join("\n\n")}`
      : "",
  ];
  return parts.filter(Boolean).join("\n");
}

/** PR body: links the ticket so merging closes it, and leaves room for the human reviewer. */
export function pullRequestBody(args: { ticket: TicketRef; summary: string; testing: string; notes?: string }): string {
  return [
    `Closes #${args.ticket.number}`,
    `## What changed\n${args.summary.trim()}`,
    `## How it was tested\n${args.testing.trim()}`,
    args.notes?.trim() ? `## Notes for the reviewer\n${args.notes.trim()}` : "",
    "_Drafted by an AI agent via start-work-mcp. A human reviews before merge._",
  ]
    .filter(Boolean)
    .join("\n\n");
}
