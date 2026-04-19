import { getOctokit } from "./client.js";
import { GitHubNotFoundError } from "../lib/errors.js";
import type { CommitData } from "../types/index.js";

type OctokitCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { name?: string; date?: string } | null;
  };
  author?: { login?: string } | null;
};

function mapCommit(c: OctokitCommit): CommitData {
  return {
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name ?? c.author?.login ?? "unknown",
    date: c.commit.author?.date ?? "",
    url: c.html_url,
  };
}

export async function fetchCommitsBetweenRefs(
  owner: string,
  repo: string,
  fromRef: string,
  toRef: string,
): Promise<CommitData[]> {
  const octokit = getOctokit();

  try {
    const response = await octokit.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${fromRef}...${toRef}`,
    });

    return response.data.commits.map(mapCommit);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) {
      throw new GitHubNotFoundError(`refs ${fromRef}...${toRef} in ${owner}/${repo}`);
    }
    throw err;
  }
}

export async function fetchBranchCommits(
  owner: string,
  repo: string,
  options: {
    branch?: string;
    since?: string;
    until?: string;
    author?: string;
    limit: number;
  },
): Promise<CommitData[]> {
  const octokit = getOctokit();
  const perPage = Math.min(options.limit, 100);

  // Build params without undefined properties (required by exactOptionalPropertyTypes)
  const params: Parameters<typeof octokit.repos.listCommits>[0] = {
    owner,
    repo,
    per_page: perPage,
  };
  if (options.branch !== undefined) params.sha = options.branch;
  if (options.since !== undefined) params.since = options.since;
  if (options.until !== undefined) params.until = options.until;
  if (options.author !== undefined) params.author = options.author;

  try {
    const commits = await octokit.paginate(octokit.repos.listCommits, params);
    return commits.slice(0, options.limit).map(mapCommit);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) {
      throw new GitHubNotFoundError(`repository ${owner}/${repo}`);
    }
    throw err;
  }
}
