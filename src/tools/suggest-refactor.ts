import { z } from "zod";

const goalValues = [
  "readability",
  "performance",
  "testability",
  "solid_principles",
  "reduce_complexity",
] as const;
type GoalArea = (typeof goalValues)[number];

export const suggestRefactorSchema = {
  code: z.string().min(1).describe("Code block to refactor"),
  language: z.string().min(1).describe("Programming language"),
  goal: z.array(z.enum(goalValues)).optional().describe("Refactoring goals (default: all)"),
  max_suggestions: z.number().int().min(1).max(10).default(3).describe("Max suggestions"),
};

type SuggestRefactorInput = z.infer<z.ZodObject<typeof suggestRefactorSchema>>;

type Effort = "low" | "medium" | "high";
type Impact = "low" | "medium" | "high";

interface Suggestion {
  title: string;
  rationale: string;
  technique: string;
  before: string;
  after: string;
  effort: Effort;
  impact: Impact;
}

interface SuggestRefactorOutput {
  original_complexity_score: number;
  suggestions: Suggestion[];
  priority_order: number[];
}

const EFFORT_NUM: Record<Effort, number> = { low: 1, medium: 2, high: 3 };
const IMPACT_NUM: Record<Impact, number> = { low: 1, medium: 2, high: 3 };

function impactEffortRatio(s: Suggestion): number {
  return IMPACT_NUM[s.impact] / EFFORT_NUM[s.effort];
}

function estimateCyclomaticComplexity(code: string): number {
  const patterns: RegExp[] = [
    /\bif\b/g,
    /\belse\s+if\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bdo\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /\?\?/g,
    /\?\s/g,
    /&&/g,
    /\|\|/g,
  ];
  let complexity = 1;
  for (const p of patterns) {
    const m = code.match(p);
    if (m) complexity += m.length;
  }
  return complexity;
}

function maxBraceDepth(code: string): number {
  let max = 0;
  let current = 0;
  for (const ch of code) {
    if (ch === "{") {
      current++;
      if (current > max) max = current;
    } else if (ch === "}") {
      current = Math.max(0, current - 1);
    }
  }
  return max;
}

function countLines(code: string): number {
  return code.split("\n").length;
}

function extractSnippet(code: string, startLine: number, endLine: number): string {
  return code
    .split("\n")
    .slice(startLine - 1, endLine)
    .join("\n");
}

function findDeepNestingLine(code: string): number {
  let max = 0;
  let current = 0;
  let maxLine = 1;
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const ch of lines[i] ?? "") {
      if (ch === "{") {
        current++;
        if (current > max) {
          max = current;
          maxLine = i + 1;
        }
      } else if (ch === "}") {
        current = Math.max(0, current - 1);
      }
    }
  }
  return maxLine;
}

function findMagicNumbers(code: string): Array<{ line: number; value: string }> {
  const results: Array<{ line: number; value: string }> = [];
  const lines = code.split("\n");
  const MAGIC_NUMBER =
    /(?<![.\w])(?![-]?[01]\b)(-?\d{2,}(?:\.\d+)?)\b(?!\s*[,)}\]]?\s*(?:const|let|var|=))/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*\/\//.test(line) || /const\s+\w+\s*=\s*\d/.test(line)) continue;
    const m = MAGIC_NUMBER.exec(line);
    if (m) results.push({ line: i + 1, value: m[1] ?? m[0] });
  }
  return results;
}

function hasAwaitInLoop(code: string): boolean {
  return /for\s*\([^)]*\)[\s\S]{0,200}await\b|while\s*\([^)]*\)[\s\S]{0,200}await\b/.test(code);
}

function countElseIfChain(code: string): number {
  const matches = code.match(/\belse\s+if\b/g);
  return matches ? matches.length : 0;
}

function hasHardcodedDependencies(code: string): boolean {
  return /new\s+\w+(?:Service|Client|Repository|Manager|Provider)\s*\((?!\s*\w+\s*\))/.test(code);
}

function hasMixedConcerns(code: string): boolean {
  const hasDB = /(?:query|insert|update|delete|findOne|findAll|save|fetch)\s*\(/.test(code);
  const hasUI = /(?:render|innerHTML|document\.|\.style\.|\.classList)/.test(code);
  const hasHTTP = /(?:fetch\(|axios\.|http\.|res\.send|res\.json)/.test(code);
  const concerns = [hasDB, hasUI, hasHTTP].filter(Boolean).length;
  return concerns >= 2;
}

function buildSuggestions(code: string, goals: GoalArea[], language: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const depth = maxBraceDepth(code);
  const lines = countLines(code);
  const complexity = estimateCyclomaticComplexity(code);
  const elseIfCount = countElseIfChain(code);

  // 1. Deep nesting → guard clauses
  if (depth > 3 && (goals.includes("reduce_complexity") || goals.includes("readability"))) {
    const nestLine = findDeepNestingLine(code);
    const before = extractSnippet(code, Math.max(1, nestLine - 3), nestLine + 3);
    suggestions.push({
      title: "Replace nested conditionals with guard clauses",
      rationale: `Nesting depth of ${depth} makes control flow hard to follow. Early returns flatten the structure and reveal the happy path.`,
      technique: "Replace Nested Conditional with Guard Clauses",
      before,
      after:
        "// Invert conditions and return early\nif (!condition1) return;\nif (!condition2) throw new Error(...);\n// Happy path continues here without nesting",
      effort: "low",
      impact: "high",
    });
  }

  // 2. Long function → extract method
  if (lines > 50 && (goals.includes("readability") || goals.includes("testability"))) {
    const before = extractSnippet(code, 1, Math.min(15, lines));
    const funcMatch = /(?:function\s+(\w+)|const\s+(\w+)\s*=)/.exec(code);
    const funcName = funcMatch?.[1] ?? funcMatch?.[2] ?? "thisFunction";
    const lang = language.toLowerCase();
    const isTs = ["typescript", "tsx", "ts"].includes(lang);
    suggestions.push({
      title: "Extract helper functions to reduce function length",
      rationale: `At ${lines} lines this function is doing too much. Smaller functions are easier to name, test, and understand.`,
      technique: "Extract Method",
      before,
      after: isTs
        ? `function ${funcName}(input: Input): Output {\n  const step1Result = performStep1(input);\n  const step2Result = performStep2(step1Result);\n  return finalise(step2Result);\n}\n\nfunction performStep1(input: Input): Intermediate { ... }\nfunction performStep2(data: Intermediate): Intermediate { ... }`
        : `def ${funcName}(input):\n    step1_result = perform_step1(input)\n    step2_result = perform_step2(step1_result)\n    return finalise(step2_result)`,
      effort: "medium",
      impact: "high",
    });
  }

  // 3. Magic numbers → named constants
  const magicNumbers = findMagicNumbers(code);
  if (magicNumbers.length > 0 && goals.includes("readability")) {
    const first = magicNumbers[0];
    const lineContent = (code.split("\n")[first.line - 1] ?? "").trim();
    suggestions.push({
      title: "Replace magic numbers with named constants",
      rationale: `Numbers like ${first.value} have no inherent meaning. Named constants communicate intent and make changes easier.`,
      technique: "Replace Magic Number with Constant",
      before: lineContent,
      after: `const MEANINGFUL_NAME = ${first.value};\n// ...\n${lineContent.replace(first.value, "MEANINGFUL_NAME")}`,
      effort: "low",
      impact: "low",
    });
  }

  // 4. await in loop → Promise.all
  if (hasAwaitInLoop(code) && goals.includes("performance")) {
    suggestions.push({
      title: "Replace sequential awaits in loop with Promise.all",
      rationale:
        "Awaiting inside a loop processes items serially. Promise.all processes them concurrently, dramatically reducing total time.",
      technique: "Loop Optimization",
      before:
        "for (const item of items) {\n  const result = await process(item);\n  results.push(result);\n}",
      after: "const results = await Promise.all(items.map(item => process(item)));",
      effort: "low",
      impact: "high",
    });
  }

  // 5. Long else-if chain → lookup / strategy
  if (
    elseIfCount >= 3 &&
    (goals.includes("reduce_complexity") || goals.includes("solid_principles"))
  ) {
    const chainMatch = /if\s*\([^)]+\)[\s\S]{0,300}(?:else\s+if[\s\S]{0,300}){2}/.exec(code);
    const before = chainMatch
      ? chainMatch[0].slice(0, 200)
      : "if (...) { ... } else if (...) { ... } else if (...) { ... }";
    suggestions.push({
      title: "Replace if/else chain with a lookup map or strategy pattern",
      rationale: `A chain of ${elseIfCount + 1} branches is hard to extend and read. A lookup table scales better and is open for extension without modification.`,
      technique: "Strategy Pattern / Lookup Table",
      before,
      after:
        "const handlers: Record<string, () => Result> = {\n  caseA: () => handleA(),\n  caseB: () => handleB(),\n  caseC: () => handleC(),\n};\nreturn (handlers[type] ?? defaultHandler)();",
      effort: "medium",
      impact: "medium",
    });
  }

  // 6. Hardcoded dependencies → dependency injection
  if (hasHardcodedDependencies(code) && goals.includes("testability")) {
    suggestions.push({
      title: "Inject dependencies instead of constructing them internally",
      rationale:
        "Hardcoded dependencies make the function impossible to unit test in isolation. Injecting them allows swapping in fakes/mocks during tests.",
      technique: "Dependency Injection",
      before:
        "function processOrder(id: string) {\n  const db = new OrderRepository();\n  return db.findById(id);\n}",
      after:
        "function processOrder(id: string, db: OrderRepository) {\n  return db.findById(id);\n}\n// Or use constructor injection in a class",
      effort: "medium",
      impact: "high",
    });
  }

  // 7. Mixed concerns → single responsibility
  if (hasMixedConcerns(code) && goals.includes("solid_principles")) {
    suggestions.push({
      title: "Separate concerns into distinct functions or layers",
      rationale:
        "This code mixes data access, business logic, and presentation/transport. Each concern should be owned by a dedicated layer.",
      technique: "Single Responsibility Principle",
      before: extractSnippet(code, 1, Math.min(10, lines)),
      after:
        "// Split into:\n// 1. Repository layer: fetches/stores data\n// 2. Service layer: applies business rules\n// 3. Controller/Presenter: formats output",
      effort: "high",
      impact: "high",
    });
  }

  // 8. High complexity → decompose conditional
  if (
    complexity > 10 &&
    goals.includes("reduce_complexity") &&
    !suggestions.some((s) => s.technique === "Replace Nested Conditional with Guard Clauses")
  ) {
    suggestions.push({
      title: "Decompose complex conditionals into named predicates",
      rationale: `Cyclomatic complexity of ~${complexity} is high. Extracting boolean logic into named functions makes it self-documenting.`,
      technique: "Decompose Conditional",
      before: "if (user.age >= 18 && user.verified && !user.banned && user.subscriptionActive) {",
      after:
        "const isEligible = (u: User) =>\n  u.age >= 18 && u.verified && !u.banned && u.subscriptionActive;\n\nif (isEligible(user)) {",
      effort: "low",
      impact: "medium",
    });
  }

  // 9. Extract pure function from impure one
  if (
    goals.includes("testability") &&
    /(?:global\w*|window\.|process\.env)\s*(?:\[|\.)\w+\s*=/.test(code) &&
    !suggestions.some((s) => s.technique === "Dependency Injection")
  ) {
    suggestions.push({
      title: "Extract pure functions to improve testability",
      rationale:
        "Functions with side effects (global mutation, I/O) are hard to test. Separating pure computation from side effects makes each part independently testable.",
      technique: "Extract Pure Function",
      before:
        "function compute(input: string) {\n  globalCache[input] = expensiveOp(input);\n  return globalCache[input];\n}",
      after:
        "// Pure — easy to test\nfunction compute(input: string): Result {\n  return expensiveOp(input);\n}\n\n// Side effect isolated\nfunction computeAndCache(input: string, cache: Map<string, Result>): Result {\n  const result = compute(input);\n  cache.set(input, result);\n  return result;\n}",
      effort: "medium",
      impact: "medium",
    });
  }

  return suggestions;
}

export async function suggestRefactorHandler(
  args: SuggestRefactorInput,
): Promise<SuggestRefactorOutput> {
  const goals: GoalArea[] = args.goal ?? [...goalValues];
  const complexity = estimateCyclomaticComplexity(args.code);
  const allSuggestions = buildSuggestions(args.code, goals, args.language);

  const limited = allSuggestions.slice(0, args.max_suggestions);

  const priorityOrder = limited
    .map((s, i) => ({ i, ratio: impactEffortRatio(s) }))
    .sort((a, b) => b.ratio - a.ratio)
    .map((x) => x.i);

  return {
    original_complexity_score: complexity,
    suggestions: limited,
    priority_order: priorityOrder,
  };
}
