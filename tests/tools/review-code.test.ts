import { describe, it, expect } from "vitest";
import { reviewCodeHandler } from "../../src/tools/review-code.js";

const TS_CLEAN = `
export function add(a: number, b: number): number {
  return a + b;
}
`.trim();

const TS_DIRTY = `
function processData(data: any) {
  try {
    var result = eval(data.code);
    console.log(result);
    if (result == null) {
      return null;
    }
    return result;
  } catch (e) {}
}
`.trim();

const PY_DIRTY = `
def process(data):
    try:
        exec(data)
    except:
        pass
    if data == None:
        print("empty")
`.trim();

const DEEPLY_NESTED = `
function validate(user) {
  if (user) {
    if (user.active) {
      if (user.role) {
        if (user.role === 'admin') {
          if (user.permissions) {
            if (user.permissions.includes('write')) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}
`.trim();

describe("reviewCodeHandler", () => {
  it("returns structured output for clean code", async () => {
    const result = await reviewCodeHandler({ code: TS_CLEAN, language: "typescript" });

    expect(result.language).toBe("typescript");
    expect(result.overall_score).toBeTypeOf("number");
    expect(result.overall_score).toBeGreaterThan(0);
    expect(result.overall_score).toBeLessThanOrEqual(10);
    expect(result.issues).toBeInstanceOf(Array);
    expect(result.positive_observations).toBeInstanceOf(Array);
    expect(result.positive_observations.length).toBeGreaterThan(0);
    expect(result.refactor_priority).toMatch(/^(none|low|medium|high)$/);
  });

  it("detects 'any' type as a high severity security issue in TypeScript", async () => {
    const result = await reviewCodeHandler({ code: TS_DIRTY, language: "typescript" });

    const anyIssue = result.issues.find((i) => i.description.includes("any"));
    expect(anyIssue).toBeDefined();
    expect(anyIssue?.severity).toBe("high");
    expect(anyIssue?.type).toBe("security");
  });

  it("detects eval() as a security issue", async () => {
    const result = await reviewCodeHandler({ code: TS_DIRTY, language: "typescript" });

    const evalIssue = result.issues.find((i) => i.description.includes("eval"));
    expect(evalIssue).toBeDefined();
    expect(evalIssue?.severity).toBe("high");
  });

  it("detects empty catch block as a bug", async () => {
    const result = await reviewCodeHandler({ code: TS_DIRTY, language: "typescript" });

    const catchIssue = result.issues.find((i) => i.description.includes("Empty catch"));
    expect(catchIssue).toBeDefined();
    expect(catchIssue?.type).toBe("bug");
    expect(catchIssue?.severity).toBe("high");
  });

  it("detects console.log as a style issue", async () => {
    const result = await reviewCodeHandler({ code: TS_DIRTY, language: "typescript" });

    const logIssue = result.issues.find((i) => i.description.includes("console.log"));
    expect(logIssue).toBeDefined();
    expect(logIssue?.type).toBe("style");
    expect(logIssue?.severity).toBe("low");
  });

  it("detects == null as a bug", async () => {
    const code = "if (value == null) return;";
    const result = await reviewCodeHandler({ code, language: "typescript" });

    const nullIssue = result.issues.find((i) => i.description.includes("null"));
    expect(nullIssue).toBeDefined();
    expect(nullIssue?.type).toBe("bug");
  });

  it("detects Python bare except as a bug", async () => {
    const result = await reviewCodeHandler({ code: PY_DIRTY, language: "python" });

    const exceptIssue = result.issues.find((i) => i.description.includes("Bare except"));
    expect(exceptIssue).toBeDefined();
    expect(exceptIssue?.type).toBe("bug");
  });

  it("detects Python == None as a bug", async () => {
    const result = await reviewCodeHandler({ code: PY_DIRTY, language: "python" });

    const noneIssue = result.issues.find((i) => i.description.includes("is None"));
    expect(noneIssue).toBeDefined();
    expect(noneIssue?.type).toBe("bug");
  });

  it("detects Python exec() as a security issue", async () => {
    const result = await reviewCodeHandler({ code: PY_DIRTY, language: "python" });

    const execIssue = result.issues.find((i) => i.description.includes("exec"));
    expect(execIssue).toBeDefined();
    expect(execIssue?.severity).toBe("high");
  });

  it("detects deeply nested code as a complexity issue", async () => {
    const result = await reviewCodeHandler({ code: DEEPLY_NESTED, language: "javascript" });

    const nestingIssue = result.issues.find((i) => i.type === "complexity" && i.description.includes("Nesting"));
    expect(nestingIssue).toBeDefined();
    expect(nestingIssue?.severity).toBe("high");
  });

  it("applies a lower score to code with multiple high issues", async () => {
    const clean = await reviewCodeHandler({ code: TS_CLEAN, language: "typescript" });
    const dirty = await reviewCodeHandler({ code: TS_DIRTY, language: "typescript" });

    expect(dirty.overall_score).toBeLessThan(clean.overall_score);
  });

  it("returns refactor_priority of high for code with 2+ high severity issues", async () => {
    const result = await reviewCodeHandler({ code: TS_DIRTY, language: "typescript" });
    expect(["medium", "high"]).toContain(result.refactor_priority);
  });

  it("includes line_hint for detected issues", async () => {
    const result = await reviewCodeHandler({ code: TS_DIRTY, language: "typescript" });
    const issueWithHint = result.issues.find((i) => i.line_hint !== undefined);
    expect(issueWithHint).toBeDefined();
    expect(issueWithHint?.line_hint).toMatch(/Line \d+/);
  });

  it("does not apply TypeScript rules to Python code", async () => {
    const tsCode = "const x: any = 5;";
    const result = await reviewCodeHandler({ code: tsCode, language: "python" });

    const anyIssue = result.issues.find((i) => i.description.includes("any"));
    expect(anyIssue).toBeUndefined();
  });

  it("does not apply Python rules to TypeScript code", async () => {
    const pyCode = "except:\n    pass";
    const result = await reviewCodeHandler({ code: pyCode, language: "typescript" });

    const exceptIssue = result.issues.find((i) => i.description.includes("Bare except"));
    expect(exceptIssue).toBeUndefined();
  });

  it("summary includes language and score", async () => {
    const result = await reviewCodeHandler({
      code: TS_CLEAN,
      language: "typescript",
      context: "utility math function",
    });

    expect(result.summary).toContain("typescript");
    expect(result.summary).toContain("/10");
  });

  it("detects 'var' as a code smell in JavaScript", async () => {
    const code = "var x = 5;\nvar y = 10;";
    const result = await reviewCodeHandler({ code, language: "javascript" });

    const varIssue = result.issues.find((i) => i.description.includes("var"));
    expect(varIssue).toBeDefined();
    expect(varIssue?.type).toBe("smell");
  });
});
