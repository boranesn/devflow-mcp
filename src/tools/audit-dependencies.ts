import { z } from "zod";
import { LRUCache } from "../lib/cache.js";
import { fetchVulnerabilities } from "../providers/osv.js";
import { fetchFileContents } from "../github/repo.js";
import { GitHubNotFoundError } from "../lib/errors.js";
import type { OsvEcosystem, VulnSeverity, OsvPackage } from "../providers/osv.js";

const OSV_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export const auditDependenciesSchema = {
  owner: z.string().min(1).describe("GitHub repository owner"),
  repo: z.string().min(1).describe("GitHub repository name"),
  branch: z.string().optional().describe("Branch (default: repo's default branch)"),
  ecosystem: z
    .enum(["npm", "pypi", "auto"])
    .default("auto")
    .describe("Dependency ecosystem (auto-detects from repo)"),
  severity_threshold: z
    .enum(["low", "moderate", "high", "critical"])
    .default("low")
    .describe("Minimum severity to report"),
};

type AuditDependenciesInput = z.infer<z.ZodObject<typeof auditDependenciesSchema>>;

interface VulnerabilityEntry {
  package: string;
  installed_version: string;
  severity: VulnSeverity;
  cve_ids: string[];
  summary: string;
  fix_version?: string;
  fix_command?: string;
}

interface AuditStats {
  critical: number;
  high: number;
  moderate: number;
  low: number;
}

interface AuditDependenciesOutput {
  ecosystem: OsvEcosystem;
  total_dependencies: number;
  vulnerabilities: VulnerabilityEntry[];
  stats: AuditStats;
  audit_passed: boolean;
  osv_query_timestamp: string;
}

const SEVERITY_ORDER: Record<VulnSeverity, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

function meetsThreshold(severity: VulnSeverity, threshold: VulnSeverity): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[threshold];
}

function parseNpmDependencies(content: string): OsvPackage[] {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return [];
  }

  const allDeps: Record<string, unknown> = {
    ...((pkg["dependencies"] ?? {}) as Record<string, unknown>),
    ...((pkg["devDependencies"] ?? {}) as Record<string, unknown>),
  };

  const packages: OsvPackage[] = [];
  for (const [name, version] of Object.entries(allDeps)) {
    if (typeof version !== "string") continue;
    // Strip semver operators (^, ~, >=, >, =) and pre-release
    const clean = version.replace(/^[^0-9]*/, "").split(/[\s<>=!,]/)[0] ?? "";
    if (clean && /^\d/.test(clean)) {
      packages.push({ name, version: clean });
    }
  }
  return packages;
}

function parsePypiDependencies(content: string): OsvPackage[] {
  const packages: OsvPackage[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    // Match: package==1.0.0, package>=1.0.0, package~=1.0.0, etc.
    const match = line.match(
      /^([a-zA-Z0-9_\-\.]+)\s*(?:==|>=|~=|!=|<=|>|<)\s*([0-9][^,\s;]*)/,
    );
    if (match && match[1] && match[2]) {
      packages.push({ name: match[1], version: match[2] });
    }
  }
  return packages;
}

async function detectEcosystem(
  owner: string,
  repo: string,
  branch?: string,
): Promise<{ ecosystem: OsvEcosystem; content: string }> {
  // Try npm first
  try {
    const content = await fetchFileContents(owner, repo, "package.json", branch);
    return { ecosystem: "npm", content };
  } catch (err) {
    if (!(err instanceof GitHubNotFoundError)) throw err;
  }

  // Try pypi
  try {
    const content = await fetchFileContents(owner, repo, "requirements.txt", branch);
    return { ecosystem: "pypi", content };
  } catch (err) {
    if (!(err instanceof GitHubNotFoundError)) throw err;
  }

  throw new GitHubNotFoundError(
    "No package.json or requirements.txt found in repository root",
  );
}

async function fetchDependencyFile(
  owner: string,
  repo: string,
  ecosystem: OsvEcosystem,
  branch?: string,
): Promise<string> {
  const path = ecosystem === "npm" ? "package.json" : "requirements.txt";
  return fetchFileContents(owner, repo, path, branch);
}

const cache = new LRUCache<AuditDependenciesOutput>(100);

export async function auditDependenciesHandler(
  args: AuditDependenciesInput,
): Promise<AuditDependenciesOutput> {
  const cacheKey = `audit:${args.owner}/${args.repo}@${args.branch ?? "default"}:${args.ecosystem}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Resolve ecosystem and fetch manifest file
  let resolvedEcosystem: OsvEcosystem;
  let fileContent: string;

  if (args.ecosystem === "auto") {
    const detected = await detectEcosystem(args.owner, args.repo, args.branch);
    resolvedEcosystem = detected.ecosystem;
    fileContent = detected.content;
  } else {
    resolvedEcosystem = args.ecosystem;
    fileContent = await fetchDependencyFile(
      args.owner,
      args.repo,
      args.ecosystem,
      args.branch,
    );
  }

  // Parse packages
  const packages =
    resolvedEcosystem === "npm"
      ? parseNpmDependencies(fileContent)
      : parsePypiDependencies(fileContent);

  // Query OSV
  const allVulns = await fetchVulnerabilities(packages, resolvedEcosystem);

  // Filter by severity threshold
  const filtered = allVulns.filter((v) =>
    meetsThreshold(v.severity, args.severity_threshold),
  );

  // Build stats (across all vulns, not just filtered)
  const stats: AuditStats = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const v of allVulns) {
    stats[v.severity]++;
  }

  const result: AuditDependenciesOutput = {
    ecosystem: resolvedEcosystem,
    total_dependencies: packages.length,
    vulnerabilities: filtered,
    stats,
    audit_passed: allVulns.filter((v) => meetsThreshold(v.severity, args.severity_threshold)).length === 0,
    osv_query_timestamp: new Date().toISOString(),
  };

  cache.set(cacheKey, result, OSV_CACHE_TTL);
  return result;
}
