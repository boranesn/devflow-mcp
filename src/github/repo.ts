import { GitHubNotFoundError } from "../lib/errors.js";
import { getOctokit } from "./client.js";

export async function fetchFileContents(
  owner: string,
  repo: string,
  path: string,
  branch?: string,
): Promise<string> {
  const octokit = getOctokit();

  try {
    const params: Parameters<typeof octokit.repos.getContent>[0] = { owner, repo, path };
    if (branch !== undefined) params.ref = branch;

    const response = await octokit.repos.getContent(params);
    const data = response.data;

    if (!Array.isArray(data) && data.type === "file" && "content" in data) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }

    throw new GitHubNotFoundError(`File ${path} is not a regular file in ${owner}/${repo}`);
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 404) {
      throw new GitHubNotFoundError(`File ${path} in ${owner}/${repo}`);
    }
    throw err;
  }
}
