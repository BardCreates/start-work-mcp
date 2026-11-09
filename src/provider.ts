/**
 * The ticket-system boundary. The MCP tools only talk to this interface, so adding
 * Jira or Azure DevOps means writing one new provider, not touching the tools.
 */

export type TicketStatus = "todo" | "in-progress" | "in-review" | "done";

export const STATUSES: readonly TicketStatus[] = ["todo", "in-progress", "in-review", "done"];

export type TicketRef = {
  number: number;
  title: string;
  status: TicketStatus;
  url: string;
};

export type Ticket = TicketRef & {
  body: string;
  labels: string[];
  assignees: string[];
  comments: { author: string; body: string; createdAt: string }[];
};

export type TicketContext = {
  ticket: Ticket;
  parent: TicketRef | null;
  children: TicketRef[];
};

export type PullRequest = { number: number; url: string; draft: boolean };

export interface TicketProvider {
  /** Who the token belongs to; "my tickets" means tickets assigned to this user. */
  currentUser(): Promise<string>;
  /** Open tickets assigned to the current user, highest priority first. */
  listMyTickets(opts?: { status?: TicketStatus }): Promise<TicketRef[]>;
  /** One ticket plus its parent and child tickets. */
  getContext(number: number): Promise<TicketContext>;
  setStatus(number: number, status: TicketStatus): Promise<void>;
  assignToMe(number: number): Promise<void>;
  comment(number: number, body: string): Promise<void>;
  openPullRequest(args: { branch: string; base?: string; title: string; body: string; draft?: boolean }): Promise<PullRequest>;
}
