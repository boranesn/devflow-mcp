const OSV_API = "https://api.osv.dev/v1/querybatch";
const BATCH_SIZE = 20;

export type OsvEcosystem = "npm" | "pypi";
export type VulnSeverity = "low" | "moderate" | "high" | "critical";

export interface OsvPackage {
  name: string;
  version: string;
}

export interface VulnerabilityResult {
  package: string;
  installed_version: string;
  severity: VulnSeverity;
  cve_ids: string[];
  summary: string;
  fix_version?: string;
  fix_command?: string;
}

// OSV API response types
interface OsvEvent {
  introduced?: string;
  fixed?: string;
}

interface OsvRange {
  type: string;
  events?: OsvEvent[];
}

interface OsvAffected {
  ranges?: OsvRange[];
  ecosystem_specific?: { severity?: string };
}

interface OsvSeverityEntry {
  type: string;
  score: string;
}

interface OsvVuln {
  id: string;
  summary?: string;
  aliases?: string[];
  severity?: OsvSeverityEntry[];
  affected?: OsvAffected[];
  database_specific?: Record<string, unknown>;
}

interface OsvBatchResponse {
  results: Array<{ vulns?: OsvVuln[] }>;
}

const SEVERITY_TEXT_MAP: Record<string, VulnSeverity> = {
  critical: "critical",
  high: "high",
  moderate: "moderate",
  medium: "moderate",
  low: "low",
};

function mapCvssScore(score: number): VulnSeverity {
  if (score >= 9.0) return "critical";
  if (score >= 7.0) return "high";
  if (score >= 4.0) return "moderate";
  return "low";
}

function extractSeverity(vuln: OsvVuln): VulnSeverity {
  // 1. Try database_specific.severity (GitHub Advisory Database, NVD, etc.)
  const dbSev = vuln.database_specific?.["severity"];
  if (typeof dbSev === "string") {
    const mapped = SEVERITY_TEXT_MAP[dbSev.toLowerCase()];
    if (mapped) return mapped;
  }

  // 2. Try ecosystem_specific.severity from affected entries
  for (const affected of vuln.affected ?? []) {
    const ecoSev = affected.ecosystem_specific?.severity;
    if (typeof ecoSev === "string") {
      const mapped = SEVERITY_TEXT_MAP[ecoSev.toLowerCase()];
      if (mapped) return mapped;
    }
  }

  // 3. Try CVSS numeric score from database_specific.cvss
  const cvssObj = vuln.database_specific?.["cvss"];
  if (cvssObj && typeof cvssObj === "object") {
    const baseScore = (cvssObj as Record<string, unknown>)["baseScore"];
    if (typeof baseScore === "number") return mapCvssScore(baseScore);
    const score = (cvssObj as Record<string, unknown>)["score"];
    if (typeof score === "number") return mapCvssScore(score);
  }

  return "moderate";
}

function extractFixVersion(vuln: OsvVuln): string | undefined {
  for (const affected of vuln.affected ?? []) {
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed) return event.fixed;
      }
    }
  }
  return undefined;
}

function buildFixCommand(name: string, fixVersion: string, ecosystem: OsvEcosystem): string {
  if (ecosystem === "npm") return `npm install ${name}@${fixVersion}`;
  return `pip install "${name}==${fixVersion}"`;
}

async function queryBatch(
  batch: OsvPackage[],
  ecosystem: OsvEcosystem,
): Promise<VulnerabilityResult[]> {
  const queries = batch.map((pkg) => ({
    version: pkg.version,
    package: {
      name: pkg.name,
      ecosystem: ecosystem === "npm" ? "npm" : "PyPI",
    },
  }));

  const response = await fetch(OSV_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries }),
  });

  if (!response.ok) {
    throw new Error(`OSV API returned ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as OsvBatchResponse;
  const results: VulnerabilityResult[] = [];

  for (let i = 0; i < batch.length; i++) {
    const pkg = batch[i];
    const queryResult = data.results[i];
    if (!pkg || !queryResult?.vulns || queryResult.vulns.length === 0) continue;

    for (const vuln of queryResult.vulns) {
      const severity = extractSeverity(vuln);
      const cveIds = (vuln.aliases ?? []).filter((a) => a.startsWith("CVE-"));
      const fixVersion = extractFixVersion(vuln);

      results.push({
        package: pkg.name,
        installed_version: pkg.version,
        severity,
        cve_ids: cveIds,
        summary: vuln.summary ?? "No description available",
        fix_version: fixVersion,
        fix_command: fixVersion ? buildFixCommand(pkg.name, fixVersion, ecosystem) : undefined,
      });
    }
  }

  return results;
}

export async function fetchVulnerabilities(
  packages: OsvPackage[],
  ecosystem: OsvEcosystem,
): Promise<VulnerabilityResult[]> {
  const results: VulnerabilityResult[] = [];

  for (let i = 0; i < packages.length; i += BATCH_SIZE) {
    const batch = packages.slice(i, i + BATCH_SIZE);
    const batchResults = await queryBatch(batch, ecosystem);
    results.push(...batchResults);
  }

  return results;
}
