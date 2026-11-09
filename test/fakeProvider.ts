import type { PullRequest, Ticket, TicketContext, TicketProvider, TicketRef, TicketStatus } from "../src/provider.js";

/** In-memory ticket system for tests and demos. */
export class FakeProvider implements TicketProvider {
  tickets = new Map<number, Ticket>();
  parents = new Map<number, number>();
  comments: { number: number; body: string }[] = [];
  prs: { branch: string; title: string; body: string; draft: boolean }[] = [];

  constructor(public me = "hannah") {}

  add(t: Partial<Ticket> & { number: number; title: string }, parent?: number) {
    this.tickets.set(t.number, {
      status: "todo",
      url: `https://example.test/issues/${t.number}`,
      body: "",
      labels: [],
      assignees: [this.me],
      comments: [],
      ...t,
    });
    if (parent) this.parents.set(t.number, parent);
    return this;
  }

  private ref(n: number): TicketRef {
    const t = this.tickets.get(n);
    if (!t) throw new Error(`#${n} not found`);
    return { number: t.number, title: t.title, status: t.status, url: t.url };
  }

  async currentUser() {
    return this.me;
  }
  async listMyTickets(opts: { status?: TicketStatus } = {}) {
    return [...this.tickets.values()]
      .filter((t) => t.assignees.includes(this.me) && t.status !== "done" && (!opts.status || t.status === opts.status))
      .map((t) => this.ref(t.number));
  }
  async getContext(n: number): Promise<TicketContext> {
    const ticket = this.tickets.get(n);
    if (!ticket) throw new Error(`#${n} not found`);
    const p = this.parents.get(n);
    const children = [...this.parents].filter(([, parent]) => parent === n).map(([c]) => this.ref(c));
    return { ticket: { ...ticket }, parent: p ? this.ref(p) : null, children };
  }
  async setStatus(n: number, status: TicketStatus) {
    this.tickets.get(n)!.status = status;
  }
  async assignToMe(n: number) {
    const t = this.tickets.get(n)!;
    if (!t.assignees.includes(this.me)) t.assignees.push(this.me);
  }
  async comment(number: number, body: string) {
    this.comments.push({ number, body });
  }
  async openPullRequest(args: { branch: string; title: string; body: string; draft?: boolean }): Promise<PullRequest> {
    this.prs.push({ ...args, draft: args.draft ?? false });
    const number = 100 + this.prs.length;
    return { number, url: `https://example.test/pull/${number}`, draft: args.draft ?? false };
  }
}
