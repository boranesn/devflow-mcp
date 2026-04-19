import { GitHubNotFoundError } from "../lib/errors.js";
import type { PRData } from "../types/index.js";
import { getOctokit } from "./client.js";

export async function fetchPR(owner: string, repo: string, prNumber: number): Promise<PRData> {
  const octokit = getOctokit();

  try {
    const [prRes, files] = await Promise.all([
      octokit.pulls.get({ owner, repo, pull_number: prNumber }),
      octokit.paginate(octokit.pulls.listFiles, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      }),
    ]);

    const pr = prRes.data;

    return {
      title: pr.title,
      author: pr.user?.login ?? "unknown",
      base_branch: pr.base.ref,
      head_branch: pr.head.ref,
      files_changed: pr.changed_files,
      lines_added: pr.additions,
      lines_removed: pr.deletions,
      files: files.map((f) => ({
        filename: f.filename,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
        status: f.status,
      })),
    };
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) {
      throw new GitHubNotFoundError(`PR #${prNumber} in ${owner}/${repo}`);
    }
    throw err;
  }
}
