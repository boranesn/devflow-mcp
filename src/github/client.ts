import { throttling } from "@octokit/plugin-throttling";
import { Octokit } from "@octokit/rest";
import { GitHubAuthError, RateLimitError } from "../lib/errors.js";

const ThrottledOctokit = Octokit.plugin(throttling);

function createClient(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new GitHubAuthError("GITHUB_TOKEN environment variable is not set.");
  }

  return new ThrottledOctokit({
    auth: token,
    throttle: {
      onRateLimit: (
        retryAfter: number,
        options: Record<string, unknown>,
        _octokit: unknown,
        retryCount: number,
      ): boolean => {
        console.error(
          `Rate limit hit for ${String(options.method)} ${String(options.url)}. Retry after ${retryAfter}s (attempt ${retryCount + 1})`,
        );
        if (retryCount < 2) return true;
        throw new RateLimitError(retryAfter);
      },
      onSecondaryRateLimit: (retryAfter: number, options: Record<string, unknown>): boolean => {
        console.error(
          `Secondary rate limit hit for ${String(options.method)} ${String(options.url)}. Retry after ${retryAfter}s`,
        );
        throw new RateLimitError(retryAfter);
      },
    },
  });
}

let _client: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!_client) {
    _client = createClient();
  }
  return _client;
}

export function resetClient(): void {
  _client = null;
}
