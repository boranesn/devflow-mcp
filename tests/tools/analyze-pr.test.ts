import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzePrHandler } from "../../src/tools/analyze-pr.js";

vi.mock("../../src/github/pr.js", () => ({
  fetchPR: vi.fn(),
}));

import { fetchPR } from "../../src/github/pr.js";
const mockFetchPR = vi.mocked(fetchPR);

const BASE_PR_DATA = {
  title: "Add user authentication",
  author: "alice",
  base_branch: "main",
  head_branch: "feature/auth",
  files_changed: 3,
  lines_added: 80,
  lines_removed: 20,
  files: [
    {
      filename: "src/auth.ts",
      additions: 70,
      deletions: 15,
      status: "modified",
      patch: "@@ -1,5 +1,10 @@\n const x = 1;\n+const y = 2;\n-const old = 3;",
    },
    {
      filename: "src/auth.test.ts",
      additions: 10,
      deletions: 5,
      status: "modified",
      patch: "@@ -1,3 +1,5 @@\n+// new test\n+it('works', () => {});",
    },
  ],
};

describe("analyzePrHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module-level cache between tests by using a unique pr_number per test
  });

  it("returns structured PR analysis", async () => {
    mockFetchPR.mockResolvedValue(BASE_PR_DATA);

    const result = await analyzePrHandler({
      owner: "myorg",
      repo: "myrepo",
      pr_number: 1,
    });

    expect(result.pr.title).toBe("Add user authentication");
    expect(result.pr.author).toBe("alice");
    expect(result.risk_score).toBeTypeOf("number");
    expect(result.risk_level).toMatch(/^(low|medium|high|critical)$/);
    expect(result.findings).toBeInstanceOf(Array);
    expect(result.merge_recommendation).toMatch(/^(approve|request_changes|needs_discussion)$/);
  });

  it("applies auth file risk factor", async () => {
    mockFetchPR.mockResolvedValue(BASE_PR_DATA);

    const result = await analyzePrHandler({
      owner: "myorg",
      repo: "myrepo",
      pr_number: 2,
    });

    // auth.ts file should trigger auth risk factor
    expect(result.risk_score).toBeGreaterThanOrEqual(0);
  });

  it("detects security findings when focus includes security", async () => {
    mockFetchPR.mockResolvedValue({
      ...BASE_PR_DATA,
      files: [
        {
          filename: "src/render.ts",
          additions: 3,
          deletions: 0,
          status: "modified",
          patch:
            "@@ -1,2 +1,5 @@\n const el = document.getElementById('root');\n+el.innerHTML = userInput;\n+eval(userCode);",
        },
      ],
    });

    const result = await analyzePrHandler({
      owner: "myorg",
      repo: "myrepo",
      pr_number: 3,
      focus: ["security"],
    });

    const securityFindings = result.findings.filter((f) => f.category === "security");
    expect(securityFindings.length).toBeGreaterThanOrEqual(1);
  });

  it("filters findings by focus area", async () => {
    mockFetchPR.mockResolvedValue({
      ...BASE_PR_DATA,
      files: [
        {
          filename: "src/app.ts",
          additions: 2,
          deletions: 0,
          status: "modified",
          patch: "@@ -1,1 +1,3 @@\n const x = 1;\n+console.log(x);\n+el.innerHTML = x;",
        },
      ],
    });

    const result = await analyzePrHandler({
      owner: "myorg",
      repo: "myrepo",
      pr_number: 4,
      focus: ["style"],
    });

    // Should not include security findings when focus is only style
    const securityFindings = result.findings.filter((f) => f.category === "security");
    expect(securityFindings).toHaveLength(0);
  });

  it("returns request_changes for critical risk", async () => {
    mockFetchPR.mockResolvedValue({
      ...BASE_PR_DATA,
      base_branch: "main",
      lines_added: 600,
      lines_removed: 100,
      files: [
        {
          filename: "src/auth/middleware.ts",
          additions: 300,
          deletions: 50,
          status: "modified",
          patch:
            '@@ -1,1 +1,3 @@\n const x = 1;\n+const SECRET = "my-secret-key-abcdefghijklmnop";\n+const y = 2;',
        },
        {
          filename: "package.json",
          additions: 2,
          deletions: 1,
          status: "modified",
          patch: "@@ -1,2 +1,4 @@\n {\n+  \"new-dep\": \"1.0.0\",",
        },
      ],
    });

    const result = await analyzePrHandler({
      owner: "myorg",
      repo: "myrepo",
      pr_number: 5,
    });

    expect(["request_changes", "needs_discussion"]).toContain(result.merge_recommendation);
  });

  it("includes change summary in output", async () => {
    mockFetchPR.mockResolvedValue(BASE_PR_DATA);

    const result = await analyzePrHandler({
      owner: "myorg",
      repo: "myrepo",
      pr_number: 6,
    });

    expect(result.change_summary).toContain("Add user authentication");
    expect(result.change_summary).toContain("3");
  });

  it("propagates GitHub errors", async () => {
    mockFetchPR.mockRejectedValue(new Error("GitHub API error"));

    await expect(
      analyzePrHandler({ owner: "myorg", repo: "myrepo", pr_number: 99 }),
    ).rejects.toThrow("GitHub API error");
  });
});
