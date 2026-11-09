/**
 * GitHub Issues as a ticket system.
 *
 * - Status lives in labels: `status: in progress`, `status: in review`. No status label = todo; closed = done.
 * - Parent/child use GitHub sub-issues, with a fallback to "Parent: #12" in the body
 *   and "- [ ] #34" task-list references for repos that don't use sub-issues.
 * - Priority comes from labels like `priority: high` or `P1`, so "my tickets" come back in work order.
 */
import { Octokit } from "@octokit/rest";
import type { PullRequest, Ticket, TicketContext, TicketProvider, TicketRef, TicketStatus } from "./provider.js";

export const STATUS_LABELS: Record<Exclude<TicketStatus, "todo" | "done">, string> = {
  "in-progress": "status: in progress",
  "in-review": "status: in review",
};

type GhIssue = {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  html_url: string;
  labels: (string | { name?: string })[];
  assignees?: { login: string }[] | null;
  pull_request?: unknown;
};

const labelNames = (i: GhIssue) => i.labels.map((l) => (typeof l === "string" ? l : l.name ?? "")).filter(Boolean);

export function statusOf(i: GhIssue): TicketStatus {
  if (i.state === "closed") return "done";
  const names = labelNames(i).map((n) => n.toLowerCase());
  if (names.includes(STATUS_LABELS["in-review"])) return "in-review";
  if (names.includes(STATUS_LABELS["in-progress"])) return "in-progress";
  return "todo";
}

/** Lower is more urgent. P0/critical first, unlabelled after low. */
export function priorityRank(labels: string[]): number {
  for (const raw of labels) {
    const l = raw.toLowerCase().replace(/^priority[:\s/-]*/, "");
    const p = l.match(/^p([0-4])$/);
    if (p) return Number(p[1]);
    const words: Record<string, number> = { critical: 0, urgent: 0, high: 1, medium: 2, normal: 2, low: 3 };
    if (l in words) return words[l];
  }
  return 5;
}

const toRef = (i: GhIssue): TicketRef => ({ number: i.number, title: i.title, status: statusOf(i), url: i.html_url });

/** Fallback parent/child discovery from the issue body. */
export function bodyLinks(body: string): { parent: number | null; children: number[] } {
  const parent = body.match(/^\s*(?:parent|part of|epic)\s*:?\s*#(\d+)/im);
  const children = [...body.matchAll(/^\s*[-*+]\s+\[[ xX]\]\s+#(\d+)\b/gm)].map((m) => Number(m[1]));
  return { parent: parent ? Number(parent[1]) : null, children: [...new Set(children)] };
}

export class GitHubProvider implements TicketProvider {
  private user: string | null = null;

  constructor(
    private readonly gh: Octokit,
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  static fromEnv(env = process.env): GitHubProvider {
    const token = env.GITHUB_TOKEN;
    const full = env.GITHUB_REPOSITORY;
    if (!token) throw new Error("Set GITHUB_TOKEN to a token with Issues and Pull requests read/write access.");
    if (!full || !/^[\w.-]+\/[\w.-]+$/.test(full)) throw new Error('Set GITHUB_REPOSITORY to "owner/repo".');
    const [owner, repo] = full.split("/");
    return new GitHubProvider(new Octokit({ auth: token, userAgent: "start-work-mcp" }), owner, repo);
  }

  private get r() {
    return { owner: this.owner, repo: this.repo };
  }

  async currentUser(): Promise<string> {
    this.user ??= (await this.gh.rest.users.getAuthenticated()).data.login;
    return this.user;
  }

  async listMyTickets(opts: { status?: TicketStatus } = {}): Promise<TicketRef[]> {
    const assignee = await this.currentUser();
    const issues = (await this.gh.paginate(this.gh.rest.issues.listForRepo, {
      ...this.r,
      assignee,
      state: opts.status === "done" ? "closed" : "open",
      per_page: 100,
    })) as GhIssue[];
    return issues
      .filter((i) => !i.pull_request)
      .filter((i) => !opts.status || statusOf(i) === opts.status)
      .sort((a, b) => priorityRank(labelNames(a)) - priorityRank(labelNames(b)) || a.number - b.number)
      .map(toRef);
  }

  private async issue(number: number): Promise<GhIssue> {
    return (await this.gh.rest.issues.get({ ...this.r, issue_number: number })).data as GhIssue;
  }

  async getContext(number: number): Promise<TicketContext> {
    const issue = await this.issue(number);
    if (issue.pull_request) throw new Error(`#${number} is a pull request, not an issue.`);
    const comments = (await this.gh.paginate(this.gh.rest.issues.listComments, { ...this.r, issue_number: number, per_page: 100 })) as {
      user?: { login: string } | null;
      body?: string;
      created_at: string;
    }[];

    const ticket: Ticket = {
      ...toRef(issue),
      body: issue.body ?? "",
      labels: labelNames(issue),
      assignees: (issue.assignees ?? []).map((a) => a.login),
      comments: comments.map((c) => ({ author: c.user?.login ?? "unknown", body: c.body ?? "", createdAt: c.created_at })),
    };

    // Sub-issues first; the body conventions fill in when the repo doesn't use them.
    const links = bodyLinks(ticket.body);
    let parent: TicketRef | null = null;
    try {
      const res = await this.gh.request("GET /repos/{owner}/{repo}/issues/{issue_number}/parent", { ...this.r, issue_number: number });
      parent = toRef(res.data as GhIssue);
    } catch (err) {
      if (!isNotFound(err)) throw err;
      if (links.parent) parent = toRef(await this.issue(links.parent));
    }

    let children: TicketRef[] = [];
    try {
      const res = await this.gh.request("GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues", { ...this.r, issue_number: number, per_page: 100 });
      children = (res.data as GhIssue[]).map(toRef);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    if (!children.length && links.children.length) children = await Promise.all(links.children.map(async (n) => toRef(await this.issue(n))));

    return { ticket, parent, children };
  }

  async setStatus(number: number, status: TicketStatus): Promise<void> {
    const issue = await this.issue(number);
    const all = Object.values(STATUS_LABELS);
    const keep = labelNames(issue).filter((l) => !all.includes(l.toLowerCase()));
    if (status === "in-progress" || status === "in-review") {
      await this.ensureLabel(STATUS_LABELS[status]);
      keep.push(STATUS_LABELS[status]);
    }
    await this.gh.rest.issues.update({
      ...this.r,
      issue_number: number,
      labels: keep,
      state: status === "done" ? "closed" : "open",
    });
  }

  private async ensureLabel(name: string) {
    try {
      await this.gh.rest.issues.getLabel({ ...this.r, name });
    } catch (err) {
      if (!isNotFound(err)) throw err;
      await this.gh.rest.issues.createLabel({ ...this.r, name, color: name.includes("review") ? "8250df" : "0969da" });
    }
  }

  async assignToMe(number: number): Promise<void> {
    await this.gh.rest.issues.addAssignees({ ...this.r, issue_number: number, assignees: [await this.currentUser()] });
  }

  async comment(number: number, body: string): Promise<void> {
    await this.gh.rest.issues.createComment({ ...this.r, issue_number: number, body });
  }

  async openPullRequest(args: { branch: string; base?: string; title: string; body: string; draft?: boolean }): Promise<PullRequest> {
    const base = args.base ?? (await this.gh.rest.repos.get(this.r)).data.default_branch;
    const pr = await this.gh.rest.pulls.create({ ...this.r, head: args.branch, base, title: args.title, body: args.body, draft: args.draft ?? false });
    return { number: pr.data.number, url: pr.data.html_url, draft: pr.data.draft ?? false };
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 404;
}
