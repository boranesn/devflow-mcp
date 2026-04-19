import type { ParsedFileDiff } from "./diff-parser.js";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskResult {
  risk_score: number;
  risk_level: RiskLevel;
  factors: string[];
}

export interface RiskInput {
  files: ParsedFileDiff[];
  baseBranch: string;
  totalAdditions: number;
  totalDeletions: number;
}

const AUTH_FILE_PATTERN =
  /(auth|middleware|security|permission|access|jwt|oauth|login|password|credentials|secret)/i;

const TEST_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$|[/\\]__tests__[/\\]|[/\\]test[/\\]/;

const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}/i,
  /(?:password|passwd|secret)\s*[:=]\s*['"][^'"]{8,}/i,
  /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]/i,
  /(?:private[_-]?key)\s*[:=]\s*['"][^'"]{10,}/i,
];

export function scoreRisk(input: RiskInput): RiskResult {
  let score = 0;
  const factors: string[] = [];

  const totalLines = input.totalAdditions + input.totalDeletions;
  if (totalLines > 500) {
    score += 20;
    factors.push("Large diff (>500 lines changed)");
  }

  if (input.files.some((f) => AUTH_FILE_PATTERN.test(f.file))) {
    score += 25;
    factors.push("Changes to auth/middleware/security files");
  }

  const secretsFound = input.files.some((f) =>
    f.hunks.some((h) =>
      h.lines.some((line) => line.startsWith("+") && SECRET_PATTERNS.some((p) => p.test(line))),
    ),
  );
  if (secretsFound) {
    score += 40;
    factors.push("Possible hardcoded secrets detected");
  }

  if (!input.files.some((f) => TEST_FILE_PATTERN.test(f.file))) {
    score += 15;
    factors.push("No test files changed");
  }

  if (/^(main|master)$/.test(input.baseBranch)) {
    score += 10;
    factors.push("Direct merge to main/master");
  }

  if (
    input.files.some(
      (f) => f.file === "package.json" || f.file === "requirements.txt" || f.file === "Pipfile",
    )
  ) {
    score += 10;
    factors.push("New dependencies added");
  }

  const clamped = Math.min(100, Math.max(0, score));

  const risk_level: RiskLevel =
    clamped <= 25 ? "low" : clamped <= 50 ? "medium" : clamped <= 75 ? "high" : "critical";

  return { risk_score: clamped, risk_level, factors };
}
