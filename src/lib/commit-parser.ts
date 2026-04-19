export type CommitCategory = "features" | "fixes" | "refactors" | "docs" | "chores" | "other";

export interface CategorizedCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
  category: CommitCategory;
  isBreaking: boolean;
  subject: string;
}

const CONVENTIONAL_PATTERN =
  /^(feat|fix|chore|docs|refactor|test|style|perf|ci)(\([^)]+\))?(!)?\s*:\s*(.+)/i;
const BREAKING_BODY_PATTERN = /^BREAKING CHANGE:/m;

export function categorizeCommit(message: string): {
  category: CommitCategory;
  isBreaking: boolean;
  subject: string;
} {
  const firstLine = (message.split("\n")[0] ?? "").trim();
  const match = CONVENTIONAL_PATTERN.exec(firstLine);

  if (match) {
    const type = (match[1] ?? "").toLowerCase();
    const isBreaking = match[3] === "!" || BREAKING_BODY_PATTERN.test(message);
    const subject = match[4] ?? firstLine;

    const category: CommitCategory =
      type === "feat"
        ? "features"
        : type === "fix"
          ? "fixes"
          : type === "refactor"
            ? "refactors"
            : type === "docs"
              ? "docs"
              : "chores";

    return { category, isBreaking, subject };
  }

  const lower = firstLine.toLowerCase();
  const isBreaking = BREAKING_BODY_PATTERN.test(message);

  if (/\b(add|new|implement|create|introduce)\b/.test(lower)) {
    return { category: "features", isBreaking, subject: firstLine };
  }
  if (/\b(fix|bug|patch|repair|resolve|correct)\b/.test(lower)) {
    return { category: "fixes", isBreaking, subject: firstLine };
  }
  if (/\b(refactor|improve|enhance|optimize|clean)\b/.test(lower)) {
    return { category: "refactors", isBreaking, subject: firstLine };
  }
  if (/\b(doc|readme|changelog|comment)\b/.test(lower)) {
    return { category: "docs", isBreaking, subject: firstLine };
  }
  if (/\b(update|bump|upgrade|chore|ci|build|release)\b/.test(lower)) {
    return { category: "chores", isBreaking, subject: firstLine };
  }

  return { category: "other", isBreaking, subject: firstLine };
}

export function parseCommits(
  rawCommits: Array<{ sha: string; message: string; author: string; date: string; url: string }>,
): CategorizedCommit[] {
  return rawCommits.map((c) => {
    const { category, isBreaking, subject } = categorizeCommit(c.message);
    return { ...c, category, isBreaking, subject };
  });
}
