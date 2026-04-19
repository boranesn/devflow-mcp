import { z } from "zod";
import { fetchBranchCommits } from "../github/commits.js";
import { parseCommits } from "../lib/commit-parser.js";
import type { CommitData } from "../types/index.js";

export const summarizeCommitsSchema = {
  owner: z.string().min(1).describe("GitHub repository owner"),
  repo: z.string().min(1).describe("GitHub repository name"),
  branch: z.string().optional().describe("Branch name (default: repo default branch)"),
  since: z.string().optional().describe('ISO date or relative value like "7d" or "1w"'),
  until: z.string().optional().describe("ISO date (default: now)"),
  author: z.string().optional().describe("Filter by GitHub username"),
  limit: z.number().int().min(1).max(200).default(50).describe("Max commits to fetch"),
  output_style: z
    .enum(["standup", "digest", "detailed"])
    .default("digest")
    .describe("Summary format"),
};

type SummarizeCommitsInput = z.infer<z.ZodObject<typeof summarizeCommitsSchema>>;

interface CommitCategories {
  features: string[];
  fixes: string[];
  refactors: string[];
  docs: string[];
  chores: string[];
  other: string[];
}

interface SummarizeCommitsOutput {
  repo: string;
  branch: string;
  period: { from: string; to: string };
  commit_count: number;
  authors: string[];
  summary: string;
  categories: CommitCategories;
  most_active_files: string[];
}

function parseRelativeDate(input: string): string {
  const match = input.match(/^(\d+)([hdwm])$/);
  if (!match) return input;

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const now = new Date();

  switch (unit) {
    case "h":
      now.setHours(now.getHours() - amount);
      break;
    case "d":
      now.setDate(now.getDate() - amount);
      break;
    case "w":
      now.setDate(now.getDate() - amount * 7);
      break;
    case "m":
      now.setMonth(now.getMonth() - amount);
      break;
  }

  return now.toISOString();
}

function buildSummary(
  repoName: string,
  categorized: ReturnType<typeof parseCommits>,
  style: "standup" | "digest" | "detailed",
): string {
  const total = categorized.length;
  const features = categorized.filter((c) => c.category === "features").length;
  const fixes = categorized.filter((c) => c.category === "fixes").length;
  const breaking = categorized.filter((c) => c.isBreaking).length;

  if (style === "standup") {
    const parts: string[] = [];
    if (features > 0) parts.push(`${features} feature${features !== 1 ? "s" : ""}`);
    if (fixes > 0) parts.push(`${fixes} fix${fixes !== 1 ? "es" : ""}`);
    if (breaking > 0) parts.push(`${breaking} breaking change${breaking !== 1 ? "s" : ""}`);
    return `${total} commits to ${repoName}: ${parts.join(", ") || "miscellaneous changes"}.`;
  }

  if (style === "detailed") {
    const topFeatures = categorized
      .filter((c) => c.category === "features")
      .slice(0, 3)
      .map((c) => c.subject);
    const topFixes = categorized
      .filter((c) => c.category === "fixes")
      .slice(0, 3)
      .map((c) => c.subject);
    const lines = [`${total} commits in ${repoName}.`];
    if (topFeatures.length > 0) lines.push(`Features: ${topFeatures.join("; ")}.`);
    if (topFixes.length > 0) lines.push(`Fixes: ${topFixes.join("; ")}.`);
    if (breaking > 0) lines.push(`⚠️  ${breaking} breaking change(s).`);
    return lines.join(" ");
  }

  // digest (default)
  const parts: string[] = [`${total} commits`];
  if (features > 0) parts.push(`${features} new feature${features !== 1 ? "s" : ""}`);
  if (fixes > 0) parts.push(`${fixes} bug fix${fixes !== 1 ? "es" : ""}`);
  if (breaking > 0) parts.push(`${breaking} breaking change${breaking !== 1 ? "s" : ""}`);
  return `${repoName}: ${parts.join(", ")}.`;
}

function uniqueAuthors(commits: CommitData[]): string[] {
  return [...new Set(commits.map((c) => c.author))].filter(Boolean);
}

export async function summarizeCommitsHandler(
  args: SummarizeCommitsInput,
): Promise<SummarizeCommitsOutput> {
  const sinceIso = args.since ? parseRelativeDate(args.since) : undefined;

  const fetchOptions: Parameters<typeof fetchBranchCommits>[2] = { limit: args.limit };
  if (args.branch !== undefined) fetchOptions.branch = args.branch;
  if (sinceIso !== undefined) fetchOptions.since = sinceIso;
  if (args.until !== undefined) fetchOptions.until = args.until;
  if (args.author !== undefined) fetchOptions.author = args.author;

  const rawCommits = await fetchBranchCommits(args.owner, args.repo, fetchOptions);

  const categorized = parseCommits(rawCommits);

  const categories: CommitCategories = {
    features: categorized.filter((c) => c.category === "features").map((c) => c.subject),
    fixes: categorized.filter((c) => c.category === "fixes").map((c) => c.subject),
    refactors: categorized.filter((c) => c.category === "refactors").map((c) => c.subject),
    docs: categorized.filter((c) => c.category === "docs").map((c) => c.subject),
    chores: categorized.filter((c) => c.category === "chores").map((c) => c.subject),
    other: categorized.filter((c) => c.category === "other").map((c) => c.subject),
  };

  const dates = rawCommits
    .map((c) => c.date)
    .filter(Boolean)
    .sort();

  return {
    repo: `${args.owner}/${args.repo}`,
    branch: args.branch ?? "default",
    period: {
      from: dates[0] ?? sinceIso ?? "",
      to: dates[dates.length - 1] ?? args.until ?? new Date().toISOString(),
    },
    commit_count: rawCommits.length,
    authors: uniqueAuthors(rawCommits),
    summary: buildSummary(args.repo, categorized, args.output_style),
    categories,
    most_active_files: [],
  };
}
