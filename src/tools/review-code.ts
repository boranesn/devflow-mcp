import { z } from "zod";

export const reviewCodeSchema = {
  code: z.string().min(1).describe("Raw code to review"),
  language: z.string().min(1).describe('Programming language, e.g. "typescript", "python"'),
  context: z.string().optional().describe("What the code is supposed to do"),
  rules: z.array(z.string()).optional().describe("Specific rules to enforce"),
};

type ReviewCodeInput = z.infer<z.ZodObject<typeof reviewCodeSchema>>;

type IssueType = "bug" | "smell" | "complexity" | "style" | "security";
type Severity = "low" | "medium" | "high";
type RefactorPriority = "none" | "low" | "medium" | "high";

interface ReviewIssue {
  type: IssueType;
  severity: Severity;
  line_hint?: string;
  description: string;
  fix_suggestion: string;
  example?: string;
}

interface ReviewCodeOutput {
  language: string;
  overall_score: number;
  summary: string;
  issues: ReviewIssue[];
  positive_observations: string[];
  refactor_priority: RefactorPriority;
}

interface IssueRule {
  type: IssueType;
  severity: Severity;
  languages?: string[];
  pattern: RegExp;
  description: string;
  fix_suggestion: string;
  example?: string;
}

const JS_LANGS = ["typescript", "javascript", "tsx", "jsx", "ts", "js"];
const PY_LANGS = ["python", "py"];

const ISSUE_RULES: IssueRule[] = [
  {
    type: "security",
    severity: "high",
    languages: JS_LANGS,
    pattern: /:\s*any\b/,
    description: "Use of 'any' type bypasses TypeScript's type system",
    fix_suggestion: "Replace 'any' with a specific type or 'unknown'",
    example: "// Before: function process(data: any)\n// After:  function process(data: unknown)",
  },
  {
    type: "bug",
    severity: "high",
    pattern: /catch\s*(?:\(\s*\w+\s*\))?\s*\{\s*\}/,
    description: "Empty catch block silently swallows errors",
    fix_suggestion: "Log the error or rethrow it with additional context",
    example: "catch (err) {\n  console.error('Operation failed:', err);\n  throw err;\n}",
  },
  {
    type: "security",
    severity: "high",
    pattern: /\beval\s*\(/,
    description: "eval() executes arbitrary code and is a critical security risk",
    fix_suggestion:
      "Replace eval() with JSON.parse() for data, or refactor to eliminate dynamic execution",
  },
  {
    type: "bug",
    severity: "medium",
    languages: JS_LANGS,
    pattern: /(?<![=!])==(?!=)\s*null\b|\bnull\s*==(?!=)/,
    description: "Loose null comparison (== null) instead of strict (=== null)",
    fix_suggestion: "Use === null for strict equality checks",
    example: "// Before: if (value == null)\n// After:  if (value === null || value === undefined)",
  },
  {
    type: "security",
    severity: "medium",
    languages: JS_LANGS,
    pattern: /\.innerHTML\s*=/,
    description: "Direct innerHTML assignment can lead to XSS vulnerabilities",
    fix_suggestion:
      "Use textContent for plain text, or sanitize input before assigning to innerHTML",
  },
  {
    type: "style",
    severity: "low",
    languages: JS_LANGS,
    pattern: /\bconsole\.log\s*\(/,
    description: "console.log() left in source code",
    fix_suggestion: "Remove debug logging or replace with a structured logger",
  },
  {
    type: "style",
    severity: "low",
    pattern: /\/\/\s*(TODO|FIXME|HACK|XXX)\b/i,
    description: "Unresolved TODO/FIXME comment",
    fix_suggestion: "Create a tracked ticket and remove the inline comment",
  },
  {
    type: "style",
    severity: "low",
    pattern: /['"]https?:\/\/(?!example\.com)[a-zA-Z0-9.\-]+(?::[0-9]+)?[^'"]{5,}['"]/,
    description: "Hardcoded URL found in source",
    fix_suggestion: "Move URLs to environment variables or a configuration module",
  },
  {
    type: "bug",
    severity: "medium",
    languages: PY_LANGS,
    pattern: /\bexcept\s*:/,
    description: "Bare except clause catches all exceptions including SystemExit",
    fix_suggestion: "Catch specific exception types: except ValueError as e:",
    example: "# Before: except:\n# After:  except (ValueError, TypeError) as e:",
  },
  {
    type: "bug",
    severity: "medium",
    languages: PY_LANGS,
    pattern: /(?:==|!=)\s*None\b|\bNone\s*(?:==|!=)/,
    description: "Use 'is None' / 'is not None' instead of == None in Python",
    fix_suggestion: "Replace '== None' with 'is None' and '!= None' with 'is not None'",
  },
  {
    type: "style",
    severity: "low",
    languages: PY_LANGS,
    pattern: /\bprint\s*\(/,
    description: "print() statement left in code",
    fix_suggestion: "Remove debug print() calls or replace with the logging module",
  },
  {
    type: "security",
    severity: "high",
    languages: PY_LANGS,
    pattern: /\bexec\s*\(/,
    description: "exec() executes arbitrary code and is a critical security risk",
    fix_suggestion: "Avoid exec() — restructure the code to avoid dynamic execution",
  },
  {
    type: "smell",
    severity: "medium",
    pattern: /\bvar\s+\w/,
    languages: JS_LANGS,
    description: "Use of 'var' instead of 'const' or 'let'",
    fix_suggestion: "Prefer 'const' for values that don't change and 'let' for variables that do",
  },
];

function normalizeLanguage(lang: string): string {
  return lang.toLowerCase().trim();
}

function isRuleApplicable(rule: IssueRule, lang: string): boolean {
  if (!rule.languages) return true;
  return rule.languages.includes(lang);
}

function detectIssues(code: string, language: string, rules?: string[]): ReviewIssue[] {
  const lang = normalizeLanguage(language);
  const lines = code.split("\n");
  const issues: ReviewIssue[] = [];
  const seenDescriptions = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    for (const rule of ISSUE_RULES) {
      if (!isRuleApplicable(rule, lang)) continue;
      if (rules && rules.length > 0) {
        const typeMatch = rules.some(
          (r) => r.toLowerCase().includes(rule.type) || rule.type.includes(r.toLowerCase()),
        );
        if (!typeMatch) continue;
      }

      if (rule.pattern.test(line)) {
        const key = `${rule.description}:${i}`;
        if (!seenDescriptions.has(key)) {
          seenDescriptions.add(key);
          const issue: ReviewIssue = {
            type: rule.type,
            severity: rule.severity,
            line_hint: `Line ${i + 1}: ${line.trim().slice(0, 60)}`,
            description: rule.description,
            fix_suggestion: rule.fix_suggestion,
          };
          if (rule.example !== undefined) issue.example = rule.example;
          issues.push(issue);
        }
      }
    }
  }

  // Complexity checks
  const nestingResult = maxNestingDepth(code);
  if (nestingResult.depth > 4) {
    issues.push({
      type: "complexity",
      severity: "high",
      line_hint: nestingResult.lineHint,
      description: `Nesting depth of ${nestingResult.depth} exceeds the recommended maximum of 4`,
      fix_suggestion: "Use early returns / guard clauses to flatten nesting depth",
      example:
        "// Instead of deeply nested ifs, return early:\nif (!condition) return;\n// continue with main logic",
    });
  }

  const longFunctions = detectLongFunctions(code);
  for (const fn of longFunctions) {
    issues.push({
      type: "complexity",
      severity: "medium",
      line_hint: `Line ${fn.startLine}: function '${fn.name}'`,
      description: `Function '${fn.name}' is ${fn.lines} lines long (threshold: 50)`,
      fix_suggestion: "Break this function into smaller, focused helper functions",
    });
  }

  return issues;
}

interface NestingResult {
  depth: number;
  lineHint?: string;
}

function maxNestingDepth(code: string): NestingResult {
  let maxDepth = 0;
  let current = 0;
  let maxLine = 0;
  const lines = code.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const ch of line) {
      if (ch === "{") {
        current++;
        if (current > maxDepth) {
          maxDepth = current;
          maxLine = i + 1;
        }
      } else if (ch === "}") {
        current = Math.max(0, current - 1);
      }
    }
  }

  return {
    depth: maxDepth,
    lineHint: maxDepth > 4 ? `Line ${maxLine} (depth ${maxDepth})` : undefined,
  };
}

interface FunctionInfo {
  name: string;
  lines: number;
  startLine: number;
}

function detectLongFunctions(code: string): FunctionInfo[] {
  const lines = code.split("\n");
  const results: FunctionInfo[] = [];
  const FUNC_PATTERN =
    /(?:(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{)/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const match = FUNC_PATTERN.exec(line);
    if (match) {
      const name = match[1] ?? match[2] ?? match[3] ?? "anonymous";
      const startLine = i + 1;
      let depth = 0;
      let started = false;
      let j = i;

      for (; j < lines.length; j++) {
        const l = lines[j] ?? "";
        for (const ch of l) {
          if (ch === "{") {
            depth++;
            started = true;
          } else if (ch === "}" && started) {
            depth--;
            if (depth === 0) break;
          }
        }
        if (started && depth === 0) break;
      }

      const length = j - i + 1;
      if (length > 50) {
        results.push({ name, lines: length, startLine });
      }
      i = j + 1;
    } else {
      i++;
    }
  }

  return results;
}

function detectPositives(code: string, language: string, issues: ReviewIssue[]): string[] {
  const lang = normalizeLanguage(language);
  const observations: string[] = [];

  if (JS_LANGS.includes(lang)) {
    if (!/:\s*any\b/.test(code)) observations.push("No use of the 'any' type");
    if (/\bconst\b/.test(code) && !/\bvar\b/.test(code))
      observations.push("Consistently uses 'const' over 'var'");
    if (/:\s*\w+(?:\[\])?(?:\s*[|&]\s*\w+)*\s*[=;,)>]/.test(code))
      observations.push("Type annotations present");
  }

  if (/try\s*\{/.test(code) && !issues.some((i) => i.description.includes("Empty catch"))) {
    observations.push("Includes error handling with try/catch");
  }

  if (/\/\*\*[\s\S]*?\*\/|\/\/[^\n]{20,}/.test(code)) {
    observations.push("Code is documented with comments");
  }

  const lines = code.split("\n").filter((l) => l.trim() !== "");
  if (lines.length <= 30 && issues.filter((i) => i.severity === "high").length === 0) {
    observations.push("Short and focused — easy to reason about");
  }

  if (observations.length === 0) {
    observations.push("No obvious anti-patterns detected");
  }

  return observations;
}

function calculateScore(issues: ReviewIssue[]): number {
  let score = 10;
  for (const issue of issues) {
    if (issue.severity === "high") score -= 2;
    else if (issue.severity === "medium") score -= 1;
    else score -= 0.3;
  }
  return Math.round(Math.max(0, Math.min(10, score)) * 10) / 10;
}

function deriveRefactorPriority(issues: ReviewIssue[]): RefactorPriority {
  const high = issues.filter((i) => i.severity === "high").length;
  const medium = issues.filter((i) => i.severity === "medium").length;
  if (high >= 2) return "high";
  if (high === 1 || medium >= 3) return "medium";
  if (medium >= 1 || issues.length >= 3) return "low";
  return "none";
}

function buildSummary(
  language: string,
  score: number,
  issues: ReviewIssue[],
  context?: string,
): string {
  const ctx = context ? ` (${context})` : "";
  if (issues.length === 0) {
    return `This ${language} code${ctx} is clean with no detected issues (score: ${score}/10).`;
  }
  const highCount = issues.filter((i) => i.severity === "high").length;
  const categories = [...new Set(issues.map((i) => i.type))].join(", ");
  const mainConcern =
    highCount > 0
      ? `${highCount} high-severity issue${highCount > 1 ? "s" : ""} require immediate attention.`
      : "Issues are minor and low risk.";
  return `This ${language} code${ctx} has ${issues.length} issue${issues.length !== 1 ? "s" : ""} across ${[...new Set(issues.map((i) => i.type))].length} categor${categories.includes(",") ? "ies" : "y"} (score: ${score}/10). ${mainConcern}`;
}

export async function reviewCodeHandler(args: ReviewCodeInput): Promise<ReviewCodeOutput> {
  const issues = detectIssues(args.code, args.language, args.rules);
  const positives = detectPositives(args.code, args.language, issues);
  const score = calculateScore(issues);

  return {
    language: args.language,
    overall_score: score,
    summary: buildSummary(args.language, score, issues, args.context),
    issues,
    positive_observations: positives,
    refactor_priority: deriveRefactorPriority(issues),
  };
}
