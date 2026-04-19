import { describe, it, expect } from "vitest";
import { categorizeCommit, parseCommits } from "../../src/lib/commit-parser.js";

describe("categorizeCommit — conventional commits", () => {
  it("categorizes feat: as features", () => {
    const result = categorizeCommit("feat: add user login");
    expect(result.category).toBe("features");
    expect(result.isBreaking).toBe(false);
    expect(result.subject).toBe("add user login");
  });

  it("categorizes fix: as fixes", () => {
    const result = categorizeCommit("fix: resolve null pointer");
    expect(result.category).toBe("fixes");
  });

  it("categorizes chore: as chores", () => {
    expect(categorizeCommit("chore: bump deps").category).toBe("chores");
  });

  it("categorizes docs: as docs", () => {
    expect(categorizeCommit("docs: update README").category).toBe("docs");
  });

  it("categorizes refactor: as refactors", () => {
    expect(categorizeCommit("refactor: extract helpers").category).toBe("refactors");
  });

  it("categorizes test: as chores", () => {
    expect(categorizeCommit("test: add unit tests").category).toBe("chores");
  });

  it("categorizes style: as chores", () => {
    expect(categorizeCommit("style: fix indentation").category).toBe("chores");
  });

  it("categorizes perf: as chores", () => {
    expect(categorizeCommit("perf: optimize query").category).toBe("chores");
  });

  it("categorizes ci: as chores", () => {
    expect(categorizeCommit("ci: update workflow").category).toBe("chores");
  });

  it("detects breaking change via ! suffix", () => {
    const result = categorizeCommit("feat!: redesign API");
    expect(result.isBreaking).toBe(true);
    expect(result.category).toBe("features");
  });

  it("detects breaking change via BREAKING CHANGE in body", () => {
    const result = categorizeCommit("feat: new auth\n\nBREAKING CHANGE: old tokens revoked");
    expect(result.isBreaking).toBe(true);
  });

  it("parses subject without scope", () => {
    const result = categorizeCommit("feat: something");
    expect(result.subject).toBe("something");
  });

  it("parses subject with scope", () => {
    const result = categorizeCommit("feat(auth): add oauth");
    expect(result.category).toBe("features");
    expect(result.subject).toBe("add oauth");
  });
});

describe("categorizeCommit — keyword fallback", () => {
  it("classifies 'add X' as feature", () => {
    expect(categorizeCommit("add new dashboard widget").category).toBe("features");
  });

  it("classifies 'new X' as feature", () => {
    expect(categorizeCommit("new export endpoint").category).toBe("features");
  });

  it("classifies 'implement X' as feature", () => {
    expect(categorizeCommit("implement rate limiting").category).toBe("features");
  });

  it("classifies 'create X' as feature", () => {
    expect(categorizeCommit("create admin panel").category).toBe("features");
  });

  it("classifies 'introduce X' as feature", () => {
    expect(categorizeCommit("introduce caching layer").category).toBe("features");
  });

  it("classifies 'fix X' as fixes", () => {
    expect(categorizeCommit("fix broken pagination").category).toBe("fixes");
  });

  it("classifies 'bug X' as fixes", () => {
    expect(categorizeCommit("bug in auth handler").category).toBe("fixes");
  });

  it("classifies 'patch X' as fixes", () => {
    expect(categorizeCommit("patch security vulnerability").category).toBe("fixes");
  });

  it("classifies 'resolve X' as fixes", () => {
    expect(categorizeCommit("resolve memory leak").category).toBe("fixes");
  });

  it("classifies 'refactor X' as refactors", () => {
    expect(categorizeCommit("refactor database layer").category).toBe("refactors");
  });

  it("classifies 'improve X' as refactors", () => {
    expect(categorizeCommit("improve error handling").category).toBe("refactors");
  });

  it("classifies 'optimize X' as refactors", () => {
    expect(categorizeCommit("optimize slow query").category).toBe("refactors");
  });

  it("classifies 'clean X' as refactors", () => {
    expect(categorizeCommit("clean up legacy code").category).toBe("refactors");
  });

  it("classifies 'doc X' as docs", () => {
    expect(categorizeCommit("doc: clarify setup").category).toBe("docs");
  });

  it("classifies 'readme X' as docs", () => {
    expect(categorizeCommit("readme updates").category).toBe("docs");
  });

  it("classifies 'update X' as chores", () => {
    expect(categorizeCommit("update dependencies").category).toBe("chores");
  });

  it("classifies 'bump X' as chores", () => {
    expect(categorizeCommit("bump version to 2.0").category).toBe("chores");
  });

  it("classifies 'release X' as chores", () => {
    expect(categorizeCommit("release v1.2.0").category).toBe("chores");
  });

  it("falls back to 'other' for unrecognized messages", () => {
    expect(categorizeCommit("various miscellaneous things").category).toBe("other");
  });

  it("detects BREAKING CHANGE in fallback path", () => {
    const result = categorizeCommit("some changes\n\nBREAKING CHANGE: old API removed");
    expect(result.isBreaking).toBe(true);
  });
});

describe("parseCommits", () => {
  it("maps raw commits to categorized commits", () => {
    const raw = [
      { sha: "a1", message: "feat: add login", author: "alice", date: "2024-01-01", url: "" },
      { sha: "b2", message: "fix: null pointer", author: "bob", date: "2024-01-02", url: "" },
    ];
    const result = parseCommits(raw);
    expect(result).toHaveLength(2);
    expect(result[0]?.category).toBe("features");
    expect(result[1]?.category).toBe("fixes");
    expect(result[0]?.sha).toBe("a1");
  });

  it("preserves original fields", () => {
    const raw = [
      { sha: "abc", message: "chore: bump", author: "charlie", date: "2024-03-01", url: "https://example.com" },
    ];
    const result = parseCommits(raw);
    expect(result[0]?.author).toBe("charlie");
    expect(result[0]?.url).toBe("https://example.com");
  });
});
