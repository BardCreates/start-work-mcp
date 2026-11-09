# start-work-mcp

**Say "start work" and an AI agent takes your next ticket all the way to a pull request ready for your review.**

This is an [MCP](https://modelcontextprotocol.io) server plus a [Claude Code](https://docs.claude.com/en/docs/claude-code) skill. The server gives the agent safe, narrow access to your tickets. The skill tells it how a good engineer works a ticket: read the parent ticket for the goal, stay out of the child tickets' scope, meet every acceptance criterion, test, and hand the work to a human for review.

```
you: start work

agent: Picking #42 "Add CSV export to reports". It's your highest-priority todo.
       ├─ start_ticket(42)         → assigned to you, status: in progress, brief returned
       ├─ git switch -c 42-add-csv-export-to-reports
       ├─ ...implements, adds tests, runs the suite...
       ├─ git push -u origin 42-add-csv-export-to-reports
       └─ open_pull_request(42, …) → PR #101 "Closes #42", status: in review, PR link commented on the ticket

agent: PR #101 is ready for your review. Worth a close look: the BOM handling the PM asked for in the comments.
```

## Why

I built a version of this workflow with GitHub Copilot at my last job. One command pulled my assigned task, read the parent and child tickets for context, created a branch, did the work, opened a PR for my code review, and updated the ticket's status. It removed most of the clerical work around each ticket and left my attention on design and review. This is a clean, open-source version of the same idea, built on the open MCP standard so it works with any MCP client.

## Tools

| Tool | What it does |
|---|---|
| `list_my_tickets` | Open tickets assigned to you, highest priority first (`P0`–`P4` or `priority: high/medium/low` labels). |
| `get_ticket_context` | The ticket's description, acceptance criteria and discussion, plus its **parent** and **child** tickets, formatted as a work brief. |
| `start_ticket` | Assigns the ticket to you, marks it in progress, and returns the branch name and the brief. |
| `open_pull_request` | Opens a PR that closes the ticket (`Closes #42`) with summary, testing and reviewer notes; moves the ticket to in review; comments the PR link on the ticket. Supports drafts. |
| `set_ticket_status` | Move a ticket between todo, in-progress, in-review and done. |

**Design choices**
- **Git stays with the agent.** The server never touches your working tree. Branching, committing and pushing happen with the agent's normal tools, where you can see and approve them.
- **A human merges.** Nothing in the server can merge or approve a PR.
- **Ticket systems are pluggable.** The tools talk to a small `TicketProvider` interface (`src/provider.ts`). GitHub Issues is the first provider; Jira or Azure DevOps is one new class.
- **Uses real GitHub structure.** Parent and child tickets come from GitHub sub-issues, with a fallback to `Parent: #10` in the body and `- [ ] #11` task lists. Status is tracked with `status: in progress` / `status: in review` labels, which are created on first use.

## Setup

Requirements: Node 20+, and a GitHub [fine-grained token](https://github.com/settings/personal-access-tokens) for the repo with **Issues: read/write**, **Pull requests: read/write**, and **Metadata: read**.

```bash
git clone https://github.com/BardCreates/start-work-mcp
cd start-work-mcp
npm install && npm run build
```

### Claude Code

Add the server to the project you want to work in:

```bash
claude mcp add start-work \
  -e GITHUB_TOKEN=github_pat_... \
  -e GITHUB_REPOSITORY=your-name/your-repo \
  -- node /path/to/start-work-mcp/dist/index.js
```

Copy the skill into that project so Claude knows the workflow:

```bash
mkdir -p .claude/skills && cp -r /path/to/start-work-mcp/.claude/skills/start-work .claude/skills/
```

Then, in Claude Code: **"start work"**, or **"start work on #42"**.

### Other MCP clients (Claude Desktop, Cursor, VS Code)

Use the same command and environment variables in the client's MCP config:

```json
{
  "mcpServers": {
    "start-work": {
      "command": "node",
      "args": ["/path/to/start-work-mcp/dist/index.js"],
      "env": { "GITHUB_TOKEN": "github_pat_...", "GITHUB_REPOSITORY": "your-name/your-repo" }
    }
  }
}
```

### Options

| Variable | Default | |
|---|---|---|
| `GITHUB_TOKEN` | required | Token with the permissions above. |
| `GITHUB_REPOSITORY` | required | `owner/repo` holding the tickets. |
| `START_WORK_BRANCH_PREFIX` | none | e.g. `hn/` gives `hn/42-add-csv-export`. |

## Development

```bash
npm test          # vitest: tool behavior through a real MCP client against an in-memory ticket system
npm run typecheck
npm run dev       # run the server from source
```

The tests connect a real MCP client to the server over an in-memory transport and drive the full flow (list → context → start → open PR) against a fake ticket provider, so they need no network or token.

## Roadmap

- Jira and Azure DevOps providers
- Read CI status on the PR and hand failures back to the agent
- Pick up review comments on an open PR and address them

## License

MIT
