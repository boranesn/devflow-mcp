import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analyzePrHandler, analyzePrSchema } from "./tools/analyze-pr.js";
import { auditDependenciesHandler, auditDependenciesSchema } from "./tools/audit-dependencies.js";
import { generateChangelogHandler, generateChangelogSchema } from "./tools/generate-changelog.js";
import { reviewCodeHandler, reviewCodeSchema } from "./tools/review-code.js";
import { suggestRefactorHandler, suggestRefactorSchema } from "./tools/suggest-refactor.js";
import { summarizeCommitsHandler, summarizeCommitsSchema } from "./tools/summarize-commits.js";

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

  server.tool(
    "review_code",
    "Accept a raw code snippet and return structured feedback: issues, complexity, best practice violations, and improvement suggestions.",
    reviewCodeSchema,
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(await reviewCodeHandler(args), null, 2) }],
    }),
  );

  server.tool(
    "suggest_refactor",
    "Given a code block, suggest concrete refactoring strategies with before/after examples.",
    suggestRefactorSchema,
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(await suggestRefactorHandler(args), null, 2) },
      ],
    }),
  );

  server.tool(
    "audit_dependencies",
    "Read package.json or requirements.txt from a GitHub repo and audit dependencies for known vulnerabilities using the OSV database.",
    auditDependenciesSchema,
    async (args) => ({
      content: [
        { type: "text", text: JSON.stringify(await auditDependenciesHandler(args), null, 2) },
      ],
    }),
  );

  return server;
}
