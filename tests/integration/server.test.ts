import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import { resetClient } from "../../src/github/client.js";

// Fake token — all HTTP is intercepted by MSW
process.env["GITHUB_TOKEN"] = "ghp_integration_test_token";

const OWNER = "testorg";
const REPO = "testrepo";

const PR_METADATA = {
  number: 42,
  title: "Add payment processing",
  state: "open",
  user: { login: "alice" },
  base: { ref: "main", label: "main" },
  head: { ref: "feature/payments", label: "feature/payments" },
  changed_files: 2,
  additions: 45,
  deletions: 12,
};

const PR_FILES = [
  {
    sha: "abc",
    filename: "src/payment.ts",
    status: "modified",
    additions: 35,
    deletions: 8,
    changes: 43,
    blob_url: "",
    raw_url: "",
    contents_url: "",
    patch: "@@ -1,5 +1,10 @@\n const x = 1;\n+const pay = process(amount);",
  },
  {
    sha: "def",
    filename: "src/payment.test.ts",
    status: "modified",
    additions: 10,
    deletions: 4,
    changes: 14,
    blob_url: "",
    raw_url: "",
    contents_url: "",
    patch: "@@ -1,3 +1,5 @@\n+test('pays', () => {});",
  },
];

const COMMITS = [
  {
    sha: "abc123",
    commit: {
      message: "feat: add payment processing\n\nIntegrate Stripe.",
      author: { name: "alice", date: "2024-03-15T10:00:00Z" },
    },
    author: { login: "alice" },
    html_url: `https://github.com/${OWNER}/${REPO}/commit/abc123`,
  },
  {
    sha: "def456",
    commit: {
      message: "fix: handle declined cards",
      author: { name: "bob", date: "2024-03-16T09:00:00Z" },
    },
    author: { login: "bob" },
    html_url: `https://github.com/${OWNER}/${REPO}/commit/def456`,
  },
];

const PACKAGE_JSON_B64 = Buffer.from(
  JSON.stringify({ dependencies: { express: "4.17.1" } }),
).toString("base64");

const mswServer = setupServer(
  http.get(`https://api.github.com/repos/${OWNER}/${REPO}/pulls/42`, () =>
    HttpResponse.json(PR_METADATA),
  ),
  http.get(`https://api.github.com/repos/${OWNER}/${REPO}/pulls/42/files`, () =>
    HttpResponse.json(PR_FILES),
  ),
  http.get(`https://api.github.com/repos/${OWNER}/${REPO}/compare/v1.0.0...v1.1.0`, () =>
    HttpResponse.json({ commits: COMMITS }),
  ),
  http.get(`https://api.github.com/repos/${OWNER}/${REPO}/commits`, () =>
    HttpResponse.json(COMMITS),
  ),
  http.get(`https://api.github.com/repos/${OWNER}/${REPO}/contents/package.json`, () =>
    HttpResponse.json({
      type: "file",
      name: "package.json",
      path: "package.json",
      sha: "xxx",
      size: 50,
      url: "",
      html_url: "",
      git_url: "",
      download_url: "",
      content: PACKAGE_JSON_B64,
      encoding: "base64",
      _links: { self: "", git: "", html: "" },
    }),
  ),
  http.post("https://api.osv.dev/v1/querybatch", () =>
    HttpResponse.json({ results: [{ vulns: [] }] }),
  ),
);

let client: Client;

beforeAll(async () => {
  mswServer.listen({ onUnhandledRequest: "warn" });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  await server.connect(serverTransport);

  client = new Client({ name: "integration-test-client", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterEach(() => mswServer.resetHandlers());

afterAll(() => {
  mswServer.close();
  resetClient();
});

function parseResult(result: { content: Array<{ type: string; text?: string }> }): unknown {
  const text = result.content.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("No text content in MCP result");
  return JSON.parse(text);
}

describe("MCP server integration", () => {
  it("lists all 6 registered tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("analyze_pr");
    expect(names).toContain("review_code");
    expect(names).toContain("generate_changelog");
    expect(names).toContain("audit_dependencies");
    expect(names).toContain("summarize_commits");
    expect(names).toContain("suggest_refactor");
    expect(tools).toHaveLength(6);
  });

  it("analyze_pr — returns structured PR analysis with risk score", async () => {
    const result = await client.callTool({
      name: "analyze_pr",
      arguments: { owner: OWNER, repo: REPO, pr_number: 42 },
    });

    const data = parseResult(result) as Record<string, unknown>;
    expect(data["pr"]).toBeDefined();
    expect((data["pr"] as Record<string, unknown>)["title"]).toBe("Add payment processing");
    expect(data["risk_score"]).toBeTypeOf("number");
    expect(data["risk_level"]).toMatch(/^(low|medium|high|critical)$/);
    expect(Array.isArray(data["findings"])).toBe(true);
    expect(data["change_summary"]).toBeTypeOf("string");
    expect(data["merge_recommendation"]).toMatch(/^(approve|request_changes|needs_discussion)$/);
  });

  it("review_code — returns code quality issues and score", async () => {
    const result = await client.callTool({
      name: "review_code",
      arguments: {
        code: 'function processData(data: any) {\n  try { eval(data); } catch (e) {}\n}',
        language: "typescript",
      },
    });

    const data = parseResult(result) as Record<string, unknown>;
    expect(data["language"]).toBe("typescript");
    expect(typeof data["overall_score"]).toBe("number");
    expect(Array.isArray(data["issues"])).toBe(true);
    const issues = data["issues"] as Array<Record<string, unknown>>;
    expect(issues.length).toBeGreaterThan(0);
    expect(Array.isArray(data["positive_observations"])).toBe(true);
    expect(data["refactor_priority"]).toMatch(/^(none|low|medium|high)$/);
  });

  it("generate_changelog — returns formatted changelog with stats", async () => {
    const result = await client.callTool({
      name: "generate_changelog",
      arguments: {
        owner: OWNER,
        repo: REPO,
        from_ref: "v1.0.0",
        to_ref: "v1.1.0",
      },
    });

    const data = parseResult(result) as Record<string, unknown>;
    expect(data["from_ref"]).toBe("v1.0.0");
    expect(data["to_ref"]).toBe("v1.1.0");
    expect(data["commit_count"]).toBe(2);
    expect(typeof data["changelog"]).toBe("string");
    const stats = data["stats"] as Record<string, number>;
    expect(typeof stats["features"]).toBe("number");
    expect(typeof stats["fixes"]).toBe("number");
  });

  it("audit_dependencies — queries OSV and returns vulnerability report", async () => {
    const result = await client.callTool({
      name: "audit_dependencies",
      arguments: { owner: OWNER, repo: REPO, ecosystem: "npm" },
    });

    const data = parseResult(result) as Record<string, unknown>;
    expect(data["ecosystem"]).toBe("npm");
    expect(typeof data["total_dependencies"]).toBe("number");
    expect(Array.isArray(data["vulnerabilities"])).toBe(true);
    expect(typeof data["audit_passed"]).toBe("boolean");
    expect(typeof data["osv_query_timestamp"]).toBe("string");
    const stats = data["stats"] as Record<string, number>;
    expect(typeof stats["critical"]).toBe("number");
  });

  it("summarize_commits — returns categorized commit summary", async () => {
    const result = await client.callTool({
      name: "summarize_commits",
      arguments: { owner: OWNER, repo: REPO },
    });

    const data = parseResult(result) as Record<string, unknown>;
    expect(data["repo"]).toBe(`${OWNER}/${REPO}`);
    expect(typeof data["commit_count"]).toBe("number");
    expect(Array.isArray(data["authors"])).toBe(true);
    expect(typeof data["summary"]).toBe("string");
    const cats = data["categories"] as Record<string, unknown[]>;
    expect(Array.isArray(cats["features"])).toBe(true);
    expect(Array.isArray(cats["fixes"])).toBe(true);
  });

  it("suggest_refactor — returns ranked refactoring suggestions", async () => {
    const nestedCode = [
      "function check(user) {",
      "  if (user) {",
      "    if (user.active) {",
      "      if (user.role) {",
      "        if (user.permissions) {",
      "          return user.permissions.includes('admin');",
      "        }",
      "      }",
      "    }",
      "  }",
      "  return false;",
      "}",
    ].join("\n");

    const result = await client.callTool({
      name: "suggest_refactor",
      arguments: { code: nestedCode, language: "javascript" },
    });

    const data = parseResult(result) as Record<string, unknown>;
    expect(typeof data["original_complexity_score"]).toBe("number");
    expect(Array.isArray(data["suggestions"])).toBe(true);
    expect(Array.isArray(data["priority_order"])).toBe(true);
  });

  it("returns isError=true for unknown tool name", async () => {
    const result = await client.callTool({ name: "does_not_exist", arguments: {} });
    expect(result.isError).toBe(true);
    const text = result.content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toContain("does_not_exist");
  });
});
