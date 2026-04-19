import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analyzePrSchema, analyzePrHandler } from "./tools/analyze-pr.js";
import { generateChangelogSchema, generateChangelogHandler } from "./tools/generate-changelog.js";
import { summarizeCommitsSchema, summarizeCommitsHandler } from "./tools/summarize-commits.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "devflow-mcp",
    version: "1.0.0",
  });

  server.tool(
    "analyze_pr",
    "Fetch a Pull Request, parse its diff, and return a structured analysis with risk scoring and review findings.",
    analyzePrSchema,
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await analyzePrHandler(args), null, 2) }],
    }),
  );

  server.tool(
    "generate_changelog",
    "Read commit history between two refs and generate a structured, human-readable changelog.",
    generateChangelogSchema,
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(await generateChangelogHandler(args), null, 2) },
      ],
    }),
  );

  server.tool(
    "summarize_commits",
    "Fetch recent commits from a branch and return a clean, categorized summary.",
    summarizeCommitsSchema,
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(await summarizeCommitsHandler(args), null, 2) },
      ],
    }),
  );

  return server;
}
