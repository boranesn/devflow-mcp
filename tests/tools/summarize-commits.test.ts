import { describe, it, expect, vi, beforeEach } from "vitest";
import { summarizeCommitsHandler } from "../../src/tools/summarize-commits.js";

vi.mock("../../src/github/commits.js", () => ({
  fetchBranchCommits: vi.fn(),
}));

import { fetchBranchCommits } from "../../src/github/commits.js";
const mockFetch = vi.mocked(fetchBranchCommits);

const FIXTURE_COMMITS = [
  {
    sha: "aaa1111",
    message: "feat: add dashboard widget",
    author: "alice",
    date: "2024-03-01T10:00:00Z",
    url: "https://github.com/org/repo/commit/aaa1111",
  },
  {
    sha: "bbb2222",
    message: "fix: correct off-by-one error in pagination",
    author: "bob",
    date: "2024-03-02T12:00:00Z",
    url: "https://github.com/org/repo/commit/bbb2222",
  },
  {
    sha: "ccc3333",
    message: "docs: update README with new examples",
    author: "alice",
    date: "2024-03-03T09:00:00Z",
    url: "https://github.com/org/repo/commit/ccc3333",
  },
  {
    sha: "ddd4444",
    message: "refactor: extract helper functions from utils",
    author: "charlie",
    date: "2024-03-04T15:00:00Z",
    url: "https://github.com/org/repo/commit/ddd4444",
  },
  {
    sha: "eee5555",
    message: "chore: update CI configuration",
    author: "bob",
    date: "2024-03-05T11:00:00Z",
    url: "https://github.com/org/repo/commit/eee5555",
  },
];

describe("summarizeCommitsHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns structured summary output", async () => {
    mockFetch.mockResolvedValue(FIXTURE_COMMITS);

    const result = await summarizeCommitsHandler({
      owner: "myorg",
      repo: "myrepo",
      limit: 50,
      output_style: "digest",
    });

    expect(result.repo).toBe("myorg/myrepo");
    expect(result.commit_count).toBe(5);
    expect(result.authors).toContain("alice");
    expect(result.authors).toContain("bob");
    expect(result.authors).toContain("charlie");
    expect(result.summary).toBeTypeOf("string");
    expect(result.categories).toBeDefined();
  });

  it("categorizes commits correctly", async () => {
    mockFetch.mockResolvedValue(FIXTURE_COMMITS);

    const result = await summarizeCommitsHandler({
      owner: "myorg",
      repo: "myrepo",
      limit: 50,
      output_style: "digest",
    });

    expect(result.categories.features).toHaveLength(1);
    expect(result.categories.fixes).toHaveLength(1);
    expect(result.categories.docs).toHaveLength(1);
    expect(result.categories.refactors).toHaveLength(1);
    expect(result.categories.chores).toHaveLength(1);
  });

  it("produces standup-style summary", async () => {
    mockFetch.mockResolvedValue(FIXTURE_COMMITS);

    const result = await summarizeCommitsHandler({
      owner: "myorg",
      repo: "myrepo",
      limit: 50,
      output_style: "standup",
    });

    expect(result.summary).toContain("5 commits");
    expect(result.summary).toContain("1 feature");
    expect(result.summary).toContain("1 fix");
  });

  it("produces detailed-style summary with feature names", async () => {
    mockFetch.mockResolvedValue(FIXTURE_COMMITS);

    const result = await summarizeCommitsHandler({
      owner: "myorg",
      repo: "myrepo",
      limit: 50,
      output_style: "detailed",
    });

    expect(result.summary).toContain("dashboard widget");
  });

  it("passes branch parameter to GitHub client", async () => {
    mockFetch.mockResolvedValue([]);

    await summarizeCommitsHandler({
      owner: "myorg",
      repo: "myrepo",
      branch: "develop",
      limit: 10,
      output_style: "digest",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "myorg",
      "myrepo",
      expect.objectContaining({ branch: "develop" }),
    );
  });

  it("converts relative since date (7d) to ISO", async () => {
    mockFetch.mockResolvedValue([]);

    await summarizeCommitsHandler({
      owner: "myorg",
      repo: "myrepo",
      since: "7d",
      limit: 50,
      output_style: "digest",
    });

    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    const opts = call![2];
    expect(opts.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("passes ISO since date through unchanged", async () => {
    mockFetch.mockResolvedValue([]);

    await summarizeCommitsHandler({
      owner: "myorg",
      repo: "myrepo",
      since: "2024-01-01",
      limit: 50,
      output_style: "digest",
    });

    const opts = mockFetch.mock.calls[0]![2];
    expect(opts.since).toBe("2024-01-01");
  });

  it("deduplicates authors", async () => {
    mockFetch.mockResolvedValue(FIXTURE_COMMITS); // alice appears twice

    const result = await summarizeCommitsHandler({
      owner: "myorg",
      repo: "myrepo",
      limit: 50,
      output_style: "digest",
    });

    const aliceCount = result.authors.filter((a) => a === "alice").length;
    expect(aliceCount).toBe(1);
  });

  it("returns empty categories for no commits", async () => {
    mockFetch.mockResolvedValue([]);

    const result = await summarizeCommitsHandler({
      owner: "myorg",
      repo: "myrepo",
      limit: 50,
      output_style: "digest",
    });

    expect(result.commit_count).toBe(0);
    expect(result.categories.features).toHaveLength(0);
    expect(result.authors).toHaveLength(0);
  });
});
