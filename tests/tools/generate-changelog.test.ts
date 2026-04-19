import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateChangelogHandler } from "../../src/tools/generate-changelog.js";

vi.mock("../../src/github/commits.js", () => ({
  fetchCommitsBetweenRefs: vi.fn(),
}));

import { fetchCommitsBetweenRefs } from "../../src/github/commits.js";
const mockFetch = vi.mocked(fetchCommitsBetweenRefs);

const FIXTURE_COMMITS = [
  {
    sha: "aaa1111",
    message: "feat: add user login\n\nImplemented JWT-based auth.",
    author: "alice",
    date: "2024-03-01T10:00:00Z",
    url: "https://github.com/org/repo/commit/aaa1111",
  },
  {
    sha: "bbb2222",
    message: "fix: resolve null pointer in auth handler",
    author: "bob",
    date: "2024-03-02T12:00:00Z",
    url: "https://github.com/org/repo/commit/bbb2222",
  },
  {
    sha: "ccc3333",
    message: "chore: bump typescript to 5.4",
    author: "alice",
    date: "2024-03-03T09:00:00Z",
    url: "https://github.com/org/repo/commit/ccc3333",
  },
  {
    sha: "ddd4444",
    message: "feat!: redesign API — BREAKING CHANGE: old endpoints removed",
    author: "charlie",
    date: "2024-03-04T15:00:00Z",
    url: "https://github.com/org/repo/commit/ddd4444",
  },
];

describe("generateChangelogHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured changelog output", async () => {
    mockFetch.mockResolvedValue(FIXTURE_COMMITS);

    const result = await generateChangelogHandler({
      owner: "myorg",
      repo: "myrepo",
      from_ref: "v1.0.0",
      to_ref: "v1.1.0",
      format: "markdown",
      include_authors: true,
      group_by: "type",
    });

    expect(result.from_ref).toBe("v1.0.0");
    expect(result.to_ref).toBe("v1.1.0");
    expect(result.commit_count).toBe(4);
    expect(result.changelog).toBeTypeOf("string");
    expect(result.stats.features).toBe(2);
    expect(result.stats.fixes).toBe(1);
    expect(result.stats.chores).toBe(1);
    expect(result.stats.breaking_changes).toBe(1);
  });

  it("generates markdown with correct sections", async () => {
    mockFetch.mockResolvedValue(FIXTURE_COMMITS);

    const result = await generateChangelogHandler({
      owner: "myorg",
      repo: "myrepo",
      from_ref: "v1.0.0",
      to_ref: "v1.1.0",
      format: "markdown",
      include_authors: true,
      group_by: "type",
    });

    expect(result.changelog).toContain("### Features");
    expect(result.changelog).toContain("### Bug Fixes");
    expect(result.changelog).toContain("### Chores");
    expect(result.changelog).toContain("### Breaking Changes");
  });

  it("includes authors in markdown when include_authors is true", async () => {
    mockFetch.mockResolvedValue(FIXTURE_COMMITS);

    const result = await generateChangelogHandler({
      owner: "myorg",
      repo: "myrepo",
      from_ref: "v1.0.0",
      to_ref: "v1.1.0",
      format: "markdown",
      include_authors: true,
      group_by: "type",
    });

    expect(result.changelog).toContain("alice");
  });

  it("omits authors when include_authors is false", async () => {
    mockFetch.mockResolvedValue([FIXTURE_COMMITS[0]!]);

    const result = await generateChangelogHandler({
      owner: "myorg",
      repo: "myrepo",
      from_ref: "v1.0.0",
      to_ref: "v1.1.0",
      format: "markdown",
      include_authors: false,
      group_by: "type",
    });

    expect(result.changelog).not.toContain("(alice)");
  });

  it("generates valid JSON format", async () => {
    mockFetch.mockResolvedValue(FIXTURE_COMMITS);

    const result = await generateChangelogHandler({
      owner: "myorg",
      repo: "myrepo",
      from_ref: "v1.0.0",
      to_ref: "v1.1.0",
      format: "json",
      include_authors: true,
      group_by: "type",
    });

    expect(() => JSON.parse(result.changelog)).not.toThrow();
    const parsed = JSON.parse(result.changelog) as Record<string, unknown>;
    expect(parsed).toHaveProperty("features");
  });

  it("groups by author when group_by is author", async () => {
    mockFetch.mockResolvedValue(FIXTURE_COMMITS);

    const result = await generateChangelogHandler({
      owner: "myorg",
      repo: "myrepo",
      from_ref: "v1.0.0",
      to_ref: "v1.1.0",
      format: "markdown",
      include_authors: true,
      group_by: "author",
    });

    expect(result.changelog).toContain("### alice");
    expect(result.changelog).toContain("### bob");
  });

  it("groups by date when group_by is date", async () => {
    mockFetch.mockResolvedValue(FIXTURE_COMMITS);

    const result = await generateChangelogHandler({
      owner: "myorg",
      repo: "myrepo",
      from_ref: "v1.0.0",
      to_ref: "v1.1.0",
      format: "markdown",
      include_authors: true,
      group_by: "date",
    });

    expect(result.changelog).toContain("### 2024-03-01");
  });

  it("returns empty changelog for no commits", async () => {
    mockFetch.mockResolvedValue([]);

    const result = await generateChangelogHandler({
      owner: "myorg",
      repo: "myrepo",
      from_ref: "v1.0.0",
      to_ref: "v1.0.1",
      format: "markdown",
      include_authors: true,
      group_by: "type",
    });

    expect(result.commit_count).toBe(0);
    expect(result.stats.features).toBe(0);
  });
});
