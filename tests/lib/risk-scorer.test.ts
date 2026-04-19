import { describe, it, expect } from "vitest";
import { scoreRisk } from "../../src/lib/risk-scorer.js";
import type { RiskInput } from "../../src/lib/risk-scorer.js";

function makeInput(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    files: [],
    baseBranch: "feature/my-feature",
    totalAdditions: 10,
    totalDeletions: 5,
    ...overrides,
  };
}

describe("scoreRisk", () => {
  it("returns low risk for a small, safe PR", () => {
    const result = scoreRisk(makeInput());
    expect(result.risk_score).toBe(15); // only "no test files" penalty
    expect(result.risk_level).toBe("low");
  });

  it("adds +20 for large diff (>500 lines)", () => {
    const result = scoreRisk(makeInput({ totalAdditions: 400, totalDeletions: 150 }));
    expect(result.factors).toContain("Large diff (>500 lines changed)");
    expect(result.risk_score).toBeGreaterThanOrEqual(20);
  });

  it("adds +25 for auth/security file changes", () => {
    const result = scoreRisk(
      makeInput({
        files: [{ file: "src/middleware/auth.ts", additions: 5, deletions: 0, hunks: [] }],
      }),
    );
    expect(result.factors).toContain("Changes to auth/middleware/security files");
    expect(result.risk_score).toBeGreaterThanOrEqual(25);
  });

  it("adds +40 for hardcoded secret patterns", () => {
    const result = scoreRisk(
      makeInput({
        files: [
          {
            file: "src/config.ts",
            additions: 1,
            deletions: 0,
            hunks: [
              {
                header: "@@ -1 +1 @@",
                startLine: 1,
                lines: ['+const API_KEY = "sk-abcdefghijklmnopqrstuvwxyz123456"'],
              },
            ],
          },
        ],
      }),
    );
    expect(result.factors).toContain("Possible hardcoded secrets detected");
    expect(result.risk_score).toBeGreaterThanOrEqual(40);
  });

  it("adds +15 when no test files changed", () => {
    const result = scoreRisk(makeInput({ files: [] }));
    expect(result.factors).toContain("No test files changed");
    expect(result.risk_score).toBeGreaterThanOrEqual(15);
  });

  it("does NOT add no-test penalty when test file is present", () => {
    const result = scoreRisk(
      makeInput({
        files: [{ file: "src/foo.test.ts", additions: 3, deletions: 0, hunks: [] }],
      }),
    );
    expect(result.factors).not.toContain("No test files changed");
  });

  it("adds +10 for main/master target branch", () => {
    const result = scoreRisk(makeInput({ baseBranch: "main" }));
    expect(result.factors).toContain("Direct merge to main/master");
    expect(result.risk_score).toBeGreaterThanOrEqual(10);
  });

  it("adds +10 for master branch too", () => {
    const result = scoreRisk(makeInput({ baseBranch: "master" }));
    expect(result.factors).toContain("Direct merge to main/master");
  });

  it("does not penalize for non-main branches", () => {
    const result = scoreRisk(makeInput({ baseBranch: "develop" }));
    expect(result.factors).not.toContain("Direct merge to main/master");
  });

  it("adds +10 for package.json changes", () => {
    const result = scoreRisk(
      makeInput({
        files: [{ file: "package.json", additions: 2, deletions: 1, hunks: [] }],
      }),
    );
    expect(result.factors).toContain("New dependencies added");
  });

  it("clamps score to 100 at maximum", () => {
    const result = scoreRisk(
      makeInput({
        baseBranch: "main",
        totalAdditions: 400,
        totalDeletions: 200,
        files: [
          {
            file: "src/auth/middleware.ts",
            additions: 5,
            deletions: 0,
            hunks: [
              {
                header: "@@ -1 +1 @@",
                startLine: 1,
                lines: ['+const PASSWORD = "super-secret-password-123"'],
              },
            ],
          },
          { file: "package.json", additions: 1, deletions: 0, hunks: [] },
        ],
      }),
    );
    expect(result.risk_score).toBeLessThanOrEqual(100);
    expect(result.risk_level).toBe("critical");
  });

  it("maps score 0-25 to low", () => {
    const result = scoreRisk(
      makeInput({
        files: [{ file: "src/foo.test.ts", additions: 1, deletions: 0, hunks: [] }],
      }),
    );
    expect(result.risk_level).toBe("low");
  });

  it("maps score 26-50 to medium", () => {
    const result = scoreRisk(makeInput({ baseBranch: "main" }));
    // base: 15 (no tests) + 10 (main) = 25 → low. Need more to hit medium.
    const result2 = scoreRisk(
      makeInput({
        baseBranch: "main",
        totalAdditions: 400,
        totalDeletions: 150,
        files: [{ file: "src/app.test.ts", additions: 1, deletions: 0, hunks: [] }],
      }),
    );
    // 20 (large diff) + 10 (main) = 30 → medium
    expect(result2.risk_level).toBe("medium");
  });

  it("maps score 51-75 to high", () => {
    const result = scoreRisk(
      makeInput({
        baseBranch: "main",
        totalAdditions: 400,
        totalDeletions: 150,
        files: [
          { file: "src/auth/login.ts", additions: 5, deletions: 0, hunks: [] },
          { file: "src/app.test.ts", additions: 1, deletions: 0, hunks: [] },
        ],
      }),
    );
    // 20 (large) + 25 (auth) + 10 (main) = 55 → high
    expect(result.risk_level).toBe("high");
  });
});
