---
name: start-work
description: Pick up the next ticket and take it to a pull request ready for human review. Use when the user says "start work", "pick up a ticket", "work on #N", or "what's next".
---

# Start work

Take one ticket from the queue to a pull request that's ready for human review. You need the `start-work` MCP server (tools: `list_my_tickets`, `get_ticket_context`, `start_ticket`, `open_pull_request`, `set_ticket_status`).

## 1. Pick the ticket
- If the user named a ticket (`#42`), use it.
- Otherwise call `list_my_tickets`. Prefer anything already `in-progress` (finish before starting), then the first `todo`. Tell the user which ticket you picked and why in one line.
- Skip tickets that are blocked or too vague to act on; say so instead of guessing.

## 2. Claim it and read the brief
- Call `start_ticket` with the number. It assigns the ticket, marks it in progress, and returns the branch name and the work brief.
- Read the brief closely: the **parent** ticket explains the goal, **child** tickets show scope that belongs to other tickets (don't do their work), and the **discussion** often changes the requirements.
- If the acceptance criteria are missing or contradictory, ask the user before writing code.

## 3. Branch
```bash
git switch <default-branch> && git pull --ff-only
git switch -c <branch-from-brief>
```
Never work on the default branch. If the branch already exists, switch to it and continue.

## 4. Do the work
- Follow the repo's own rules first (CLAUDE.md, AGENTS.md, contributing docs).
- Make the smallest change that meets every acceptance criterion. No drive-by refactors.
- Add or update tests for the behavior you changed.
- Run the project's tests, typecheck and linter. Do not continue with failures you caused.

## 5. Check before you push
Go through the acceptance criteria one by one and confirm each is met, pointing to the code or test that proves it. Note anything you assumed.

## 6. Open the pull request
```bash
git push -u origin <branch>
```
Then call `open_pull_request` with:
- `summary`: what changed and why, in plain language
- `testing`: exactly what you ran and checked
- `notes`: assumptions, trade-offs, and anything the reviewer should look at closely
- `draft: true` if any acceptance criterion isn't fully met

It links the PR to the ticket, moves the ticket to **in review**, and comments the PR link on the ticket.

## 7. Hand off
Tell the user the PR link and the one or two things most worth their attention in review. Do not merge: a human reviews and merges.

## If you stop partway
Call `set_ticket_status` with `todo` and tell the user where you stopped, so the ticket doesn't sit in progress with nobody on it.
