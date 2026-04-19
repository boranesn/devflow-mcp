import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export class GitHubNotFoundError extends McpError {
  constructor(resource: string) {
    super(ErrorCode.InvalidRequest, `GitHub resource not found: ${resource}`);
    this.name = "GitHubNotFoundError";
  }
}

export class GitHubAuthError extends McpError {
  constructor(message = "GitHub authentication failed. Check your GITHUB_TOKEN.") {
    super(ErrorCode.InvalidRequest, message);
    this.name = "GitHubAuthError";
  }
}

export class RateLimitError extends McpError {
  constructor(retryAfter?: number) {
    const msg = retryAfter
      ? `Rate limit exceeded. Retry after ${retryAfter} seconds.`
      : "Rate limit exceeded.";
    super(ErrorCode.InvalidRequest, msg);
    this.name = "RateLimitError";
  }
}

export class InvalidInputError extends McpError {
  constructor(message: string) {
    super(ErrorCode.InvalidParams, message);
    this.name = "InvalidInputError";
  }
}
