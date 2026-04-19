export interface DiffHunk {
  header: string;
  startLine: number;
  lines: string[];
}

export interface ParsedFileDiff {
  file: string;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export function parseFilePatch(filename: string, patch: string): ParsedFileDiff {
  const lines = patch.split("\n");
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      if (currentHunk) hunks.push(currentHunk);
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      const startLine = match ? Number.parseInt(match[1], 10) : 0;
      currentHunk = { header: line, startLine, lines: [] };
    } else if (currentHunk) {
      currentHunk.lines.push(line);
      if (line.startsWith("+")) additions++;
      else if (line.startsWith("-")) deletions++;
    }
  }

  if (currentHunk) hunks.push(currentHunk);

  return { file: filename, additions, deletions, hunks };
}

export function parseFullDiff(rawDiff: string): ParsedFileDiff[] {
  const sections = rawDiff.split(/^diff --git /m).filter(Boolean);

  return sections.map((section) => {
    const lines = section.split("\n");
    const firstLine = lines[0] ?? "";
    const match = firstLine.match(/^a\/.+ b\/(.+)$/);
    const filename = match?.[1] ?? firstLine;

    const patchStart = lines.findIndex((l) => l.startsWith("@@"));
    if (patchStart === -1) {
      return { file: filename, additions: 0, deletions: 0, hunks: [] };
    }

    return parseFilePatch(filename, lines.slice(patchStart).join("\n"));
  });
}
