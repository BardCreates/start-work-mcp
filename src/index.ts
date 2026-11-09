#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GitHubProvider } from "./github.js";
import { createServer } from "./server.js";

const provider = GitHubProvider.fromEnv();
const server = createServer(provider, { branchPrefix: process.env.START_WORK_BRANCH_PREFIX ?? "" });
await server.connect(new StdioServerTransport());
// stdout carries the protocol; log to stderr only.
console.error(`start-work-mcp ready for ${process.env.GITHUB_REPOSITORY}`);
