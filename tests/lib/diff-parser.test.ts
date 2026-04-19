import { describe, it, expect } from "vitest";
import { parseFilePatch, parseFullDiff } from "../../src/lib/diff-parser.js";

const SIMPLE_PATCH = `@@ -1,4 +1,5 @@
 line 1
-old line
+new line
+added line
 line 3
 line 4`;

const MULTI_HUNK_PATCH = `@@ -1,3 +1,3 @@
 line 1
-old a
+new a
@@ -10,3 +10,4 @@
 line 10
+inserted
 line 11
-removed
+replaced`;

describe("parseFilePatch", () => {
  it("parses additions and deletions", () => {
    const result = parseFilePatch("src/foo.ts", SIMPLE_PATCH);
    expect(result.file).toBe("src/foo.ts");
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(1);
  });

  it("parses multiple hunks", () => {
    const result = parseFilePatch("src/bar.ts", MULTI_HUNK_PATCH);
    expect(result.hunks).toHaveLength(2);
    expect(result.additions).toBe(3);
    expect(result.deletions).toBe(2);
  });

  it("extracts hunk start line from header", () => {
    const result = parseFilePatch("src/foo.ts", SIMPLE_PATCH);
    expect(result.hunks[0]?.startLine).toBe(1);
  });

  it("returns correct hunk headers", () => {
    const result = parseFilePatch("src/bar.ts", MULTI_HUNK_PATCH);
    expect(result.hunks[0]?.header).toContain("@@");
    expect(result.hunks[1]?.header).toContain("@@ -10");
  });

  it("returns empty hunks for empty patch", () => {
    const result = parseFilePatch("src/empty.ts", "");
    expect(result.hunks).toHaveLength(0);
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it("handles patch with only additions", () => {
    const patch = "@@ -0,0 +1,3 @@\n+line 1\n+line 2\n+line 3";
    const result = parseFilePatch("new-file.ts", patch);
    expect(result.additions).toBe(3);
    expect(result.deletions).toBe(0);
  });

  it("handles patch with only deletions", () => {
    const patch = "@@ -1,3 +1,0 @@\n-line 1\n-line 2\n-line 3";
    const result = parseFilePatch("deleted-file.ts", patch);
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(3);
  });
});

describe("parseFullDiff", () => {
  const FULL_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index abc..def 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,2 +1,3 @@
 existing
+added
-removed
diff --git a/src/bar.ts b/src/bar.ts
new file mode 100644
--- /dev/null
+++ b/src/bar.ts
@@ -0,0 +1,2 @@
+new file line 1
+new file line 2`;

  it("parses multiple files from full diff", () => {
    const result = parseFullDiff(FULL_DIFF);
    expect(result).toHaveLength(2);
  });

  it("extracts correct filenames", () => {
    const result = parseFullDiff(FULL_DIFF);
    expect(result[0]?.file).toBe("src/foo.ts");
    expect(result[1]?.file).toBe("src/bar.ts");
  });

  it("counts additions and deletions per file", () => {
    const result = parseFullDiff(FULL_DIFF);
    expect(result[0]?.additions).toBe(1);
    expect(result[0]?.deletions).toBe(1);
    expect(result[1]?.additions).toBe(2);
  });

  it("returns empty array for empty diff", () => {
    expect(parseFullDiff("")).toHaveLength(0);
  });
});
