import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { auditDependenciesHandler } from "../../src/tools/audit-dependencies.js";

vi.mock("../../src/github/repo.js", () => ({
  fetchFileContents: vi.fn(),
}));

import { fetchFileContents } from "../../src/github/repo.js";
const mockFetch = vi.mocked(fetchFileContents);

const PACKAGE_JSON = JSON.stringify({
  name: "my-app",
  dependencies: {
    express: "4.17.1",
    lodash: "4.17.20",
    "safe-dep": "2.0.0",
  },
  devDependencies: {
    jest: "27.0.0",
  },
});

const REQUIREMENTS_TXT = `
requests==2.25.0
flask>=1.1.2
numpy==1.21.0
safe-package==3.0.0
`.trim();

const OSV_RESPONSE_WITH_VULNS = {
  results: [
    {
      vulns: [
        {
          id: "GHSA-xxxx-0001-xxxx",
          summary: "Prototype pollution vulnerability in express",
          aliases: ["CVE-2021-12345"],
          database_specific: { severity: "HIGH" },
          affected: [
            {
              ranges: [
                {
                  type: "SEMVER",
                  events: [{ introduced: "0" }, { fixed: "4.18.0" }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      vulns: [
        {
          id: "GHSA-xxxx-0002-xxxx",
          summary: "Critical RCE in lodash",
          aliases: ["CVE-2021-23337"],
          database_specific: { severity: "CRITICAL" },
          affected: [
            {
              ranges: [
                {
                  type: "SEMVER",
                  events: [{ introduced: "0" }, { fixed: "4.17.21" }],
                },
              ],
            },
          ],
        },
      ],
    },
    { vulns: [] }, // safe-dep
    { vulns: [] }, // jest
  ],
};

const OSV_CRITICAL_ONLY = {
  results: [
    { vulns: [] }, // express — clean in this scenario
    {
      vulns: [
        {
          id: "GHSA-xxxx-0002-xxxx",
          summary: "Critical RCE in lodash",
          aliases: ["CVE-2021-23337"],
          database_specific: { severity: "CRITICAL" },
          affected: [
            {
              ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, { fixed: "4.17.21" }] }],
            },
          ],
        },
      ],
    },
    { vulns: [] },
    { vulns: [] },
  ],
};

// MSW server for OSV HTTP interception
const mswServer = setupServer();

beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  mswServer.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => mswServer.close());

describe("auditDependenciesHandler", () => {
  it("detects npm ecosystem and returns vulnerabilities", async () => {
    mockFetch.mockResolvedValue(PACKAGE_JSON);
    mswServer.use(
      http.post("https://api.osv.dev/v1/querybatch", () =>
        HttpResponse.json(OSV_RESPONSE_WITH_VULNS),
      ),
    );

    const result = await auditDependenciesHandler({
      owner: "org1",
      repo: "repo1",
      ecosystem: "npm",
      severity_threshold: "low",
    });

    expect(result.ecosystem).toBe("npm");
    expect(result.total_dependencies).toBe(4);
    expect(result.vulnerabilities.length).toBeGreaterThanOrEqual(1);
    expect(result.osv_query_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns vulnerability details including CVE IDs and fix info", async () => {
    mockFetch.mockResolvedValue(PACKAGE_JSON);
    mswServer.use(
      http.post("https://api.osv.dev/v1/querybatch", () =>
        HttpResponse.json(OSV_RESPONSE_WITH_VULNS),
      ),
    );

    const result = await auditDependenciesHandler({
      owner: "org2",
      repo: "repo2",
      ecosystem: "npm",
      severity_threshold: "low",
    });

    const expressVuln = result.vulnerabilities.find((v) => v.package === "express");
    expect(expressVuln).toBeDefined();
    expect(expressVuln?.cve_ids).toContain("CVE-2021-12345");
    expect(expressVuln?.fix_version).toBe("4.18.0");
    expect(expressVuln?.fix_command).toContain("npm install express@4.18.0");
    expect(expressVuln?.severity).toBe("high");
  });

  it("filters vulnerabilities by severity_threshold", async () => {
    mockFetch.mockResolvedValue(PACKAGE_JSON);
    mswServer.use(
      http.post("https://api.osv.dev/v1/querybatch", () =>
        HttpResponse.json(OSV_CRITICAL_ONLY),
      ),
    );

    const result = await auditDependenciesHandler({
      owner: "org3",
      repo: "repo3",
      ecosystem: "npm",
      severity_threshold: "critical",
    });

    for (const v of result.vulnerabilities) {
      expect(v.severity).toBe("critical");
    }
  });

  it("sets audit_passed=true when no vulnerabilities above threshold", async () => {
    mockFetch.mockResolvedValue(PACKAGE_JSON);
    mswServer.use(
      http.post("https://api.osv.dev/v1/querybatch", () =>
        HttpResponse.json({ results: [{ vulns: [] }, { vulns: [] }, { vulns: [] }, { vulns: [] }] }),
      ),
    );

    const result = await auditDependenciesHandler({
      owner: "org4",
      repo: "repo4",
      ecosystem: "npm",
      severity_threshold: "low",
    });

    expect(result.audit_passed).toBe(true);
    expect(result.vulnerabilities).toHaveLength(0);
  });

  it("sets audit_passed=false when vulnerabilities are found", async () => {
    mockFetch.mockResolvedValue(PACKAGE_JSON);
    mswServer.use(
      http.post("https://api.osv.dev/v1/querybatch", () =>
        HttpResponse.json(OSV_RESPONSE_WITH_VULNS),
      ),
    );

    const result = await auditDependenciesHandler({
      owner: "org5",
      repo: "repo5",
      ecosystem: "npm",
      severity_threshold: "low",
    });

    expect(result.audit_passed).toBe(false);
  });

  it("builds stats with counts per severity level", async () => {
    mockFetch.mockResolvedValue(PACKAGE_JSON);
    mswServer.use(
      http.post("https://api.osv.dev/v1/querybatch", () =>
        HttpResponse.json(OSV_RESPONSE_WITH_VULNS),
      ),
    );

    const result = await auditDependenciesHandler({
      owner: "org6",
      repo: "repo6",
      ecosystem: "npm",
      severity_threshold: "low",
    });

    expect(result.stats.high).toBeGreaterThanOrEqual(1);
    expect(result.stats.critical).toBeGreaterThanOrEqual(1);
    expect(typeof result.stats.moderate).toBe("number");
    expect(typeof result.stats.low).toBe("number");
  });

  it("handles pypi ecosystem with requirements.txt", async () => {
    mockFetch.mockResolvedValue(REQUIREMENTS_TXT);
    mswServer.use(
      http.post("https://api.osv.dev/v1/querybatch", () =>
        HttpResponse.json({
          results: [{ vulns: [] }, { vulns: [] }, { vulns: [] }, { vulns: [] }],
        }),
      ),
    );

    const result = await auditDependenciesHandler({
      owner: "org7",
      repo: "repo7",
      ecosystem: "pypi",
      severity_threshold: "low",
    });

    expect(result.ecosystem).toBe("pypi");
    expect(result.total_dependencies).toBe(4);
  });

  it("auto-detects npm when package.json exists", async () => {
    mockFetch.mockImplementation((_owner, _repo, path) => {
      if (path === "package.json") return Promise.resolve(PACKAGE_JSON);
      return Promise.reject(Object.assign(new Error("not found"), { status: 404 }));
    });
    mswServer.use(
      http.post("https://api.osv.dev/v1/querybatch", () =>
        HttpResponse.json({ results: [{ vulns: [] }, { vulns: [] }, { vulns: [] }, { vulns: [] }] }),
      ),
    );

    const result = await auditDependenciesHandler({
      owner: "org8",
      repo: "repo8",
      ecosystem: "auto",
      severity_threshold: "low",
    });

    expect(result.ecosystem).toBe("npm");
  });

  it("generates pypi fix commands with pip install syntax", async () => {
    mockFetch.mockResolvedValue(REQUIREMENTS_TXT);
    mswServer.use(
      http.post("https://api.osv.dev/v1/querybatch", () =>
        HttpResponse.json({
          results: [
            {
              vulns: [
                {
                  id: "PYSEC-2021-0001",
                  summary: "Vuln in requests",
                  aliases: [],
                  database_specific: { severity: "HIGH" },
                  affected: [
                    {
                      ranges: [
                        {
                          type: "SEMVER",
                          events: [{ introduced: "0" }, { fixed: "2.26.0" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            { vulns: [] },
            { vulns: [] },
            { vulns: [] },
          ],
        }),
      ),
    );

    const result = await auditDependenciesHandler({
      owner: "org9",
      repo: "repo9",
      ecosystem: "pypi",
      severity_threshold: "low",
    });

    const reqVuln = result.vulnerabilities.find((v) => v.package === "requests");
    expect(reqVuln).toBeDefined();
    expect(reqVuln?.fix_command).toContain("pip install");
    expect(reqVuln?.fix_command).toContain("2.26.0");
  });

  it("parses semver operators from package.json versions", async () => {
    const pkg = JSON.stringify({
      dependencies: {
        "dep-a": "^1.2.3",
        "dep-b": "~2.0.1",
        "dep-c": ">=3.0.0",
      },
    });
    mockFetch.mockResolvedValue(pkg);
    mswServer.use(
      http.post("https://api.osv.dev/v1/querybatch", async ({ request }) => {
        const body = (await request.json()) as {
          queries: Array<{ version: string; package: { name: string } }>;
        };
        for (const q of body.queries) {
          expect(q.version).toMatch(/^\d/);
        }
        return HttpResponse.json({
          results: [{ vulns: [] }, { vulns: [] }, { vulns: [] }],
        });
      }),
    );

    await auditDependenciesHandler({
      owner: "org10",
      repo: "repo10",
      ecosystem: "npm",
      severity_threshold: "low",
    });
  });
});
