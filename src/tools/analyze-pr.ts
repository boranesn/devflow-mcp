import { z } from "zod";
import { fetchPR } from "../github/pr.js";
import { LRUCache } from "../lib/cache.js";
import { parseFilePatch } from "../lib/diff-parser.js";
import { scoreRisk } from "../lib/risk-scorer.js";

const PR_CACHE_TTL = 2 * 60 * 1000;

const focusValues = ["security", "performance", "logic", "style"] as const;
type FocusArea = (typeof focusValues)[number];

export const analyzePrSchema = {
  owner: z.string().min(1).describe("GitHub repository owner"),
  repo: z.string().min(1).describe("GitHub repository name"),
  pr_number: z.number().int().positive().describe("Pull request number"),
  focus: z.array(z.enum(focusValues)).optional().describe("Areas to focus on (default: all)"),
};

type AnalyzePrInput = z.infer<z.ZodObject<typeof analyzePrSchema>>;

interface Finding {
  severity: "info" | "warning" | "error";
  category: string;
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

interface AnalyzePrOutput {
  pr: {
    title: string;
    author: string;
    base_branch: string;
    head_branch: string;
    files_changed: number;
    lines_added: number;
    lines_removed: number;
  };
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  change_summary: string;
  findings: Finding[];
  merge_recommendation: "approve" | "request_changes" | "needs_discussion";
}

interface FindingRule {
  category: FocusArea;
  severity: "info" | "warning" | "error";
  pattern: RegExp;
  message: string;
  suggestion: string;
}

const FINDING_RULES: FindingRule[] = [
  {
    category: "security",
    severity: "error",
    pattern: /\beval\s*\(/,
    message: "Use of eval() is a security risk and can lead to code injection",
    suggestion: "Replace with a safer alternative such as JSON.parse() or a lookup table",
  },
  {
    category: "security",
    severity: "warning",
    pattern: /\.innerHTML\s*=/,
    message: "Direct innerHTML assignment can lead to XSS vulnerabilities",
    suggestion: "Use textContent or a sanitization library like DOMPurify",
  },
  {
    category: "security",
    severity: "warning",
    pattern: /dangerouslySetInnerHTML/,
    message: "dangerouslySetInnerHTML can lead to XSS vulnerabilities",
    suggestion: "Ensure the content is sanitized before use",
  },
  {
    category: "security",
    severity: "warning",
    pattern: /document\.write\s*\(/,
    message: "document.write() can lead to XSS and blocks page rendering",
    suggestion: "Use DOM manipulation methods instead",
  },
  {
    category: "security",
    severity: "error",
    pattern: /(?:api[_-]?key|password|secret|token)\s*[:=]\s*['"][a-zA-Z0-9_\-!@#$%^&*]{8,}['"]/i,
    message: "Possible hardcoded credential or secret",
    suggestion: "Move secrets to environment variables and use a secrets manager",
  },
  {
    category: "performance",
    severity: "warning",
    pattern: /readFileSync\s*\(/,
    message: "Synchronous file I/O blocks the Node.js event loop",
    suggestion: "Use the async readFile() variant with await",
  },
  {
    category: "performance",
    severity: "warning",
    pattern: /\.forEach\s*\(\s*async/,
    message: "forEach with async callbacks does not await the promises",
    suggestion: "Use Promise.all with .map() or a for...of loop with await",
  },
  {
    category: "performance",
    severity: "info",
    pattern: /JSON\.parse\s*\(\s*JSON\.stringify\s*\(/,
    message: "JSON round-trip for deep cloning is slow and cannot handle non-serializable values",
    suggestion: "Use structuredClone() (Node 17+) or a purpose-built clone library",
  },
  {
    category: "logic",
    severity: "warning",
    pattern: /[^=!<>]={1}={0}(?!=)\s*null\b|null\s*={1}(?!=)[^=]/,
    message: "Loose null comparison with == instead of ===",
    suggestion: "Use === null for strict equality checks",
  },
  {
    category: "logic",
    severity: "error",
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/,
    message: "Empty catch block silently swallows errors",
    suggestion: "Log the error or rethrow it with additional context",
  },
  {
    category: "style",
    severity: "info",
    pattern: /console\.log\s*\(/,
    message: "console.log left in code",
    suggestion: "Remove debug logging or replace with a structured logger",
  },
  {
    category: "style",
    severity: "info",
    pattern: /\/\/\s*(TODO|FIXME|HACK|XXX)\b/i,
    message: "Unresolved TODO/FIXME comment",
    suggestion: "Track this as a ticket and remove the inline comment",
  },
];

function generateFindings(
  files: Array<{ filename: string; patch?: string }>,
  focus: FocusArea[],
): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    if (!file.patch) continue;

    const lines = file.patch.split("\n");
    let currentLine = 0;

    for (const line of lines) {
      if (line.startsWith("@@")) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
        if (match) currentLine = Number.parseInt(match[1], 10) - 1;
        continue;
      }

      if (line.startsWith("-")) continue;
      currentLine++;

      if (!line.startsWith("+")) continue;

      const content = line.slice(1);

      for (const rule of FINDING_RULES) {
        if (!focus.includes(rule.category)) continue;
        if (rule.pattern.test(content)) {
          findings.push({
            severity: rule.severity,
            category: rule.category,
            file: file.filename,
            line: currentLine,
            message: rule.message,
            suggestion: rule.suggestion,
          });
        }
      }
    }
  }

  return findings;
}

function buildChangeSummary(
  prTitle: string,
  filesChanged: number,
  linesAdded: number,
  linesRemoved: number,
  topFiles: string[],
): string {
  const fileList = topFiles.slice(0, 3).join(", ");
  return `"${prTitle}" modifies ${filesChanged} file${filesChanged !== 1 ? "s" : ""} (+${linesAdded} / -${linesRemoved} lines). ${topFiles.length > 0 ? `Key files: ${fileList}.` : ""}`;
}

function toMergeRecommendation(
  riskLevel: "low" | "medium" | "high" | "critical",
  errorCount: number,
): "approve" | "request_changes" | "needs_discussion" {
  if (riskLevel === "critical" || errorCount > 0) return "request_changes";
  if (riskLevel === "high") return "needs_discussion";
  return "approve";
}

const cache = new LRUCache<AnalyzePrOutput>(100);

export async function analyzePrHandler(args: AnalyzePrInput): Promise<AnalyzePrOutput> {
  const focus: FocusArea[] = args.focus ?? [...focusValues];
  const cacheKey = `pr:${args.owner}/${args.repo}#${args.pr_number}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const prData = await fetchPR(args.owner, args.repo, args.pr_number);

  const parsedFiles = prData.files
    .filter((f) => f.patch)
    .map((f) => parseFilePatch(f.filename, f.patch ?? ""));

  const riskResult = scoreRisk({
    files: parsedFiles,
    baseBranch: prData.base_branch,
    totalAdditions: prData.lines_added,
    totalDeletions: prData.lines_removed,
  });

  const findings = generateFindings(prData.files, focus);
  const errorCount = findings.filter((f) => f.severity === "error").length;

  const topFiles = prData.files
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, 5)
    .map((f) => f.filename);

  const result: AnalyzePrOutput = {
    pr: {
      title: prData.title,
      author: prData.author,
      base_branch: prData.base_branch,
      head_branch: prData.head_branch,
      files_changed: prData.files_changed,
      lines_added: prData.lines_added,
      lines_removed: prData.lines_removed,
    },
    risk_score: riskResult.risk_score,
    risk_level: riskResult.risk_level,
    change_summary: buildChangeSummary(
      prData.title,
      prData.files_changed,
      prData.lines_added,
      prData.lines_removed,
      topFiles,
    ),
    findings,
    merge_recommendation: toMergeRecommendation(riskResult.risk_level, errorCount),
  };

  cache.set(cacheKey, result, PR_CACHE_TTL);
  return result;
}
