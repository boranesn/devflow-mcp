import { describe, it, expect } from "vitest";
import { suggestRefactorHandler } from "../../src/tools/suggest-refactor.js";

const DEEPLY_NESTED_CODE = `
function validate(user) {
  if (user) {
    if (user.active) {
      if (user.role) {
        if (user.role === 'admin') {
          if (user.permissions) {
            return user.permissions.includes('write');
          }
        }
      }
    }
  }
  return false;
}
`.trim();

const LONG_FUNCTION = Array.from(
  { length: 60 },
  (_, i) => `  const step${i} = doSomething${i}();`,
).join("\n");
const LONG_FUNCTION_CODE = `function processAll() {\n${LONG_FUNCTION}\n  return step0;\n}`;

const AWAIT_LOOP_CODE = `
async function fetchAll(ids) {
  const results = [];
  for (const id of ids) {
    const item = await fetchItem(id);
    results.push(item);
  }
  return results;
}
`.trim();

const MAGIC_NUMBERS_CODE = `
function calculateDiscount(price) {
  if (price > 100) {
    return price * 0.15;
  }
  return price * 0.05;
}
`.trim();

const ELSE_IF_CHAIN = `
function getLabel(type) {
  if (type === 'a') {
    return 'Alpha';
  } else if (type === 'b') {
    return 'Beta';
  } else if (type === 'c') {
    return 'Gamma';
  } else if (type === 'd') {
    return 'Delta';
  }
  return 'Unknown';
}
`.trim();

const HARDCODED_DEP = `
function processOrder(orderId) {
  const db = new OrderRepository();
  const order = db.findById(orderId);
  return order;
}
`.trim();

describe("suggestRefactorHandler", () => {
  it("returns structured output", async () => {
    const result = await suggestRefactorHandler({
      code: DEEPLY_NESTED_CODE,
      language: "javascript",
      max_suggestions: 3,
    });

    expect(result.original_complexity_score).toBeTypeOf("number");
    expect(result.original_complexity_score).toBeGreaterThanOrEqual(1);
    expect(result.suggestions).toBeInstanceOf(Array);
    expect(result.priority_order).toBeInstanceOf(Array);
  });

  it("suggests guard clauses for deeply nested code", async () => {
    const result = await suggestRefactorHandler({
      code: DEEPLY_NESTED_CODE,
      language: "javascript",
      goal: ["reduce_complexity"],
      max_suggestions: 3,
    });

    const guardSuggestion = result.suggestions.find((s) =>
      s.technique.includes("Guard Clauses"),
    );
    expect(guardSuggestion).toBeDefined();
    expect(guardSuggestion?.before).toBeTypeOf("string");
    expect(guardSuggestion?.after).toBeTypeOf("string");
  });

  it("suggests extract method for long functions", async () => {
    const result = await suggestRefactorHandler({
      code: LONG_FUNCTION_CODE,
      language: "javascript",
      goal: ["readability"],
      max_suggestions: 3,
    });

    const extractSuggestion = result.suggestions.find((s) => s.technique === "Extract Method");
    expect(extractSuggestion).toBeDefined();
    expect(extractSuggestion?.effort).toMatch(/^(low|medium|high)$/);
    expect(extractSuggestion?.impact).toMatch(/^(low|medium|high)$/);
  });

  it("suggests Promise.all for await-in-loop", async () => {
    const result = await suggestRefactorHandler({
      code: AWAIT_LOOP_CODE,
      language: "javascript",
      goal: ["performance"],
      max_suggestions: 3,
    });

    const promiseSuggestion = result.suggestions.find((s) =>
      s.technique.includes("Loop Optimization"),
    );
    expect(promiseSuggestion).toBeDefined();
    expect(promiseSuggestion?.after).toContain("Promise.all");
  });

  it("suggests named constants for magic numbers", async () => {
    const result = await suggestRefactorHandler({
      code: MAGIC_NUMBERS_CODE,
      language: "javascript",
      goal: ["readability"],
      max_suggestions: 3,
    });

    const constantSuggestion = result.suggestions.find((s) =>
      s.technique.includes("Magic Number"),
    );
    expect(constantSuggestion).toBeDefined();
  });

  it("suggests strategy pattern for long else-if chain", async () => {
    const result = await suggestRefactorHandler({
      code: ELSE_IF_CHAIN,
      language: "javascript",
      goal: ["reduce_complexity"],
      max_suggestions: 5,
    });

    const strategySuggestion = result.suggestions.find((s) =>
      s.technique.includes("Strategy") || s.technique.includes("Lookup"),
    );
    expect(strategySuggestion).toBeDefined();
  });

  it("suggests dependency injection for hardcoded deps", async () => {
    const result = await suggestRefactorHandler({
      code: HARDCODED_DEP,
      language: "typescript",
      goal: ["testability"],
      max_suggestions: 3,
    });

    const diSuggestion = result.suggestions.find((s) =>
      s.technique === "Dependency Injection",
    );
    expect(diSuggestion).toBeDefined();
    expect(diSuggestion?.impact).toBe("high");
  });

  it("respects max_suggestions limit", async () => {
    const result = await suggestRefactorHandler({
      code: LONG_FUNCTION_CODE,
      language: "javascript",
      max_suggestions: 1,
    });

    expect(result.suggestions.length).toBeLessThanOrEqual(1);
  });

  it("priority_order has valid indices", async () => {
    const result = await suggestRefactorHandler({
      code: DEEPLY_NESTED_CODE,
      language: "javascript",
      max_suggestions: 3,
    });

    for (const idx of result.priority_order) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(result.suggestions.length);
    }
  });

  it("priority_order sorts high-impact/low-effort first", async () => {
    const result = await suggestRefactorHandler({
      code: AWAIT_LOOP_CODE + "\n" + DEEPLY_NESTED_CODE,
      language: "javascript",
      goal: ["performance", "reduce_complexity"],
      max_suggestions: 5,
    });

    if (result.suggestions.length >= 2 && result.priority_order.length >= 2) {
      const first = result.suggestions[result.priority_order[0]!]!;
      const last =
        result.suggestions[result.priority_order[result.priority_order.length - 1]!]!;
      const firstRatio =
        { low: 1, medium: 2, high: 3 }[first.impact] /
        { low: 1, medium: 2, high: 3 }[first.effort];
      const lastRatio =
        { low: 1, medium: 2, high: 3 }[last.impact] /
        { low: 1, medium: 2, high: 3 }[last.effort];
      expect(firstRatio).toBeGreaterThanOrEqual(lastRatio);
    }
  });

  it("estimates cyclomatic complexity for complex code", async () => {
    const result = await suggestRefactorHandler({
      code: ELSE_IF_CHAIN,
      language: "javascript",
      max_suggestions: 3,
    });

    expect(result.original_complexity_score).toBeGreaterThan(1);
  });

  it("each suggestion has all required fields", async () => {
    const result = await suggestRefactorHandler({
      code: DEEPLY_NESTED_CODE,
      language: "javascript",
      max_suggestions: 3,
    });

    for (const s of result.suggestions) {
      expect(s.title).toBeTypeOf("string");
      expect(s.rationale).toBeTypeOf("string");
      expect(s.technique).toBeTypeOf("string");
      expect(s.before).toBeTypeOf("string");
      expect(s.after).toBeTypeOf("string");
      expect(s.effort).toMatch(/^(low|medium|high)$/);
      expect(s.impact).toMatch(/^(low|medium|high)$/);
    }
  });

  it("handles clean simple code gracefully", async () => {
    const result = await suggestRefactorHandler({
      code: "const add = (a: number, b: number): number => a + b;",
      language: "typescript",
      max_suggestions: 3,
    });

    expect(result.suggestions).toBeInstanceOf(Array);
    expect(result.original_complexity_score).toBe(1);
  });
});
