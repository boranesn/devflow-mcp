import { z } from "zod";
import { fetchCommitsBetweenRefs } from "../github/commits.js";
import { LRUCache } from "../lib/cache.js";
import { categorizeCommit, parseCommits } from "../lib/commit-parser.js";

const COMMIT_CACHE_TTL = 5 * 60 * 1000;

export const generateChangelogSchema = {
  owner: z.string().min(1).describe("GitHub repository owner"),
  repo: z.string().min(1).describe("GitHub repository name"),
  from_ref: z.string().min(1).describe("Base tag, branch, or SHA"),
  to_ref: z.string().min(1).describe("Target tag, branch, or SHA"),
  format: z.enum(["markdown", "json"]).default("markdown").describe("Output format"),
  include_authors: z.boolean().default(true).describe("Include author names in changelog"),
  group_by: z
    .enum(["type", "author", "date"])
    .default("type")
    .describe("How to group changelog entries"),
};

type GenerateChangelogInput = z.infer<z.ZodObject<typeof generateChangelogSchema>>;

interface ChangelogStats {
  features: number;
  fixes: number;
  chores: number;
  breaking_changes: number;
}

interface GenerateChangelogOutput {
  from_ref: string;
  to_ref: string;
  commit_count: number;
  date_range: { from: string; to: string };
  changelog: string;
  stats: ChangelogStats;
}

function buildMarkdownChangelog(
  commits: ReturnType<typeof parseCommits>,
  includeAuthors: boolean,
): string {
  const groups: Record<string, string[]> = {
    "Breaking Changes": [],
    Features: [],
    "Bug Fixes": [],
    Refactors: [],
    Documentation: [],
    Chores: [],
    Other: [],
  };

  for (const commit of commits) {
    const authorSuffix = includeAuthors ? ` (${commit.author})` : "";
    const line = `- ${commit.subject}${authorSuffix}`;

    if (commit.isBreaking) {
      groups["Breaking Changes"]?.push(`- ⚠️  ${commit.subject}${authorSuffix}`);
    }

    switch (commit.category) {
      case "features":
        groups.Features?.push(line);
        break;
      case "fixes":
        groups["Bug Fixes"]?.push(line);
        break;
      case "refactors":
        groups.Refactors?.push(line);
        break;
      case "docs":
        groups.Documentation?.push(line);
        break;
      case "chores":
        groups.Chores?.push(line);
        break;
      default:
        groups.Other?.push(line);
    }
  }

  const sections: string[] = [];
  for (const [heading, lines] of Object.entries(groups)) {
    if (lines.length > 0) {
      sections.push(`### ${heading}\n\n${lines.join("\n")}`);
    }
  }

  return sections.join("\n\n");
}

function buildJsonChangelog(
  commits: ReturnType<typeof parseCommits>,
  includeAuthors: boolean,
): string {
  const grouped: Record<string, Array<{ subject: string; sha: string; author?: string }>> = {};

  for (const commit of commits) {
    const key = commit.isBreaking ? "breaking_changes" : commit.category;
    if (!grouped[key]) grouped[key] = [];
    const entry = { subject: commit.subject, sha: commit.sha.slice(0, 7) };
    grouped[key]?.push(includeAuthors ? { ...entry, author: commit.author } : entry);
  }

  return JSON.stringify(grouped, null, 2);
}

function buildAuthorGroupedMarkdown(commits: ReturnType<typeof parseCommits>): string {
  const byAuthor = new Map<string, string[]>();

  for (const commit of commits) {
    const existing = byAuthor.get(commit.author) ?? [];
    existing.push(`- ${commit.subject}`);
    byAuthor.set(commit.author, existing);
  }

  return Array.from(byAuthor.entries())
    .map(([author, lines]) => `### ${author}\n\n${lines.join("\n")}`)
    .join("\n\n");
}

function buildDateGroupedMarkdown(commits: ReturnType<typeof parseCommits>): string {
  const byDate = new Map<string, string[]>();

  for (const commit of commits) {
    const day = commit.date ? commit.date.slice(0, 10) : "unknown";
    const existing = byDate.get(day) ?? [];
    existing.push(`- ${commit.subject}`);
    byDate.set(day, existing);
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, lines]) => `### ${date}\n\n${lines.join("\n")}`)
    .join("\n\n");
}

const cache = new LRUCache<GenerateChangelogOutput>(100);

export async function generateChangelogHandler(
  args: GenerateChangelogInput,
): Promise<GenerateChangelogOutput> {
  const cacheKey = `changelog:${args.owner}/${args.repo}@${args.from_ref}...${args.to_ref}:${args.format}:${args.group_by}:${String(args.include_authors)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const rawCommits = await fetchCommitsBetweenRefs(
    args.owner,
    args.repo,
    args.from_ref,
    args.to_ref,
  );

  const commits = parseCommits(rawCommits);

  const stats: ChangelogStats = {
    features: commits.filter((c) => c.category === "features").length,
    fixes: commits.filter((c) => c.category === "fixes").length,
    chores: commits.filter((c) => c.category === "chores").length,
    breaking_changes: commits.filter((c) => c.isBreaking).length,
  };

  let changelog: string;

  if (args.format === "json") {
    changelog = buildJsonChangelog(commits, args.include_authors);
  } else if (args.group_by === "author") {
    changelog = buildAuthorGroupedMarkdown(commits);
  } else if (args.group_by === "date") {
    changelog = buildDateGroupedMarkdown(commits);
  } else {
    changelog = buildMarkdownChangelog(commits, args.include_authors);
  }

  const dates = commits
    .map((c) => c.date)
    .filter(Boolean)
    .sort();

  const result: GenerateChangelogOutput = {
    from_ref: args.from_ref,
    to_ref: args.to_ref,
    commit_count: commits.length,
    date_range: {
      from: dates[0] ?? "",
      to: dates[dates.length - 1] ?? "",
    },
    changelog,
    stats,
  };

  cache.set(cacheKey, result, COMMIT_CACHE_TTL);
  return result;
}

export { categorizeCommit };
