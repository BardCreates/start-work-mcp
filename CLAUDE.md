# start-work-mcp: notes for Claude

MCP server (TypeScript, `@modelcontextprotocol/sdk`) + Claude Code skill that takes a ticket from "start work" to a PR for human review.

- Run `npm test` and `npm run typecheck` before committing.
- Tools are registered in `src/server.ts` and talk ONLY to the `TicketProvider` interface (`src/provider.ts`). Ticket-system specifics belong in a provider (`src/github.ts`), never in the tools.
- The server must never touch the git working tree, merge, or approve PRs. Git stays with the agent; merging stays with a human.
- stdout is the MCP protocol channel: log with `console.error` only.
- Pure formatting (branch names, work brief, PR body) lives in `src/text.ts` and is unit-tested in `test/text.test.ts`.
- Tool behavior is tested end to end through a real MCP `Client` over `InMemoryTransport` with `test/fakeProvider.ts`. Add a test there for any new tool.
- The workflow itself is the skill in `.claude/skills/start-work/SKILL.md`; keep it in sync with tool names and arguments.
