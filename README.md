# devflow-mcp

A production-ready [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI assistants deep GitHub developer tooling — PR analysis, code review, changelog generation, dependency auditing, commit summarization, and refactoring suggestions.

## Features

- **6 MCP tools** covering the full developer workflow
- **Heuristic analysis** — no external LLM calls, fast and deterministic
- **OSV.dev integration** for real vulnerability data (npm and PyPI)
- **LRU cache** with TTL to minimize GitHub API calls
- **Token-bucket rate limiter** to stay within GitHub's limits
- **Zero `any`** — strict TypeScript throughout
- **≥80% test coverage** with MSW-mocked HTTP

## Requirements

- Node.js 18+
- A GitHub Personal Access Token with `repo` scope

## Installation

```bash
npm install -g devflow-mcp
```

Or run directly with `npx`:

```bash
npx devflow-mcp
```

Or clone and build:

```bash
git clone https://github.com/yourorg/devflow-mcp
cd devflow-mcp
npm install
npm run build
```

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "devflow": {
      "command": "npx",
      "args": ["devflow-mcp"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

Config file locations:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

## Tools

### `analyze_pr`

Analyzes a GitHub pull request for risk, security findings, and merge readiness.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `owner` | string | yes | Repository owner |
| `repo` | string | yes | Repository name |
| `pr_number` | number | yes | Pull request number |
| `focus` | string[] | no | Limit analysis to: `security`, `performance`, `logic`, `style` |

**Returns:** `risk_score` (0-100), `risk_level`, `findings[]`, `change_summary`, `merge_recommendation`

---

### `review_code`

Reviews a code snippet for quality, security issues, and improvement opportunities.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `code` | string | yes | Source code to review |
| `language` | string | yes | Programming language |
| `context` | string | no | Optional context about what the code does |

**Returns:** `overall_score` (1-10), `issues[]` with severity + fix suggestions, `positive_observations[]`, `refactor_priority`

---

### `generate_changelog`

Generates a changelog between two Git refs from commit history.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `owner` | string | yes | Repository owner |
| `repo` | string | yes | Repository name |
| `from_ref` | string | yes | Base ref (tag, SHA, branch) |
| `to_ref` | string | yes | Target ref |
| `format` | string | no | `markdown` (default), `json`, `plain` |
| `group_by` | string | no | `type` (default), `author`, `date` |
| `include_authors` | boolean | no | Include author names (default: true) |

**Returns:** `changelog` string, `commit_count`, `stats` per category, `breaking_changes[]`

---

### `audit_dependencies`

Audits project dependencies against the OSV vulnerability database.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `owner` | string | yes | Repository owner |
| `repo` | string | yes | Repository name |
| `ecosystem` | string | yes | `npm`, `pypi`, or `auto` |
| `severity_threshold` | string | no | Minimum severity to report: `low` (default), `moderate`, `high`, `critical` |

**Returns:** `vulnerabilities[]` with CVE IDs, fix versions, and fix commands; `audit_passed`, `stats` per severity level, `osv_query_timestamp`

---

### `summarize_commits`

Summarizes recent commits on a branch into a human-readable digest.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `owner` | string | yes | Repository owner |
| `repo` | string | yes | Repository name |
| `branch` | string | no | Branch name (default: repo default) |
| `since` | string | no | ISO date or relative (`7d`, `24h`, `2w`, `1m`) |
| `limit` | number | no | Max commits (default: 50) |
| `output_style` | string | no | `digest` (default), `standup`, `detailed` |

**Returns:** `summary` string, `categories` (features/fixes/docs/refactors/chores/other), `authors[]`, `commit_count`

---

### `suggest_refactor`

Analyzes code for refactoring opportunities ranked by impact-to-effort ratio.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `code` | string | yes | Source code to analyze |
| `language` | string | yes | Programming language |
| `goals` | string[] | no | Focus areas: `readability`, `performance`, `testability`, `maintainability` |

**Returns:** `suggestions[]` with rationale and effort estimates, `priority_order[]`, `original_complexity_score`

---

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type-check and build
npm run build

# Lint
npm run lint

# Format
npm run format

# Start the server (after build)
npm start
```

### Project Structure

```
src/
  index.ts              # Entry point
  server.ts             # MCP server registration
  tools/                # Tool handlers (one per tool)
  github/               # GitHub API clients
  lib/                  # Shared utilities
    cache.ts            # LRU cache with TTL
    rate-limiter.ts     # Token-bucket rate limiter
    commit-parser.ts    # Conventional commit parser
    diff-parser.ts      # Git diff parser
    risk-scorer.ts      # PR risk scoring heuristics
    errors.ts           # Typed MCP errors
  providers/
    osv.ts              # OSV.dev vulnerability API
tests/
  integration/          # Full MCP server tests via InMemoryTransport
  tools/                # Unit tests per tool handler
  lib/                  # Unit tests for utilities
```

### Test Strategy

- **Unit tests**: each tool handler and library mocked with `vi.mock`
- **Integration tests**: full MCP client↔server round-trip via `InMemoryTransport`, HTTP intercepted with MSW
- **HTTP mocking**: MSW v2 (`msw/node`) — no real network calls in tests
- **Coverage**: ≥80% branches required (`npm run test:coverage`)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new behavior
4. Ensure `npm run build && npm run test:coverage && npm run lint` all pass
5. Open a pull request

## License

MIT
