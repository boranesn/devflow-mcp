# Demo Workflow

A realistic end-to-end session using all 6 devflow-mcp tools together on a typical feature branch.

## Scenario

Your team has a PR open that adds a new payment integration. Before merging, you want to:
1. Understand what the PR changes
2. Check for security issues in the new code
3. Audit the new dependencies it introduces
4. Summarize what's been shipping lately
5. Generate a changelog for the upcoming release
6. Get refactoring suggestions for the most complex function

---

## Step 1 — Analyze the PR

```
Use analyze_pr on owner=acme-corp repo=api pr_number=247
```

**Example response:**
```json
{
  "pr": {
    "title": "feat: add Stripe payment processing",
    "author": "alice",
    "base": "main",
    "head": "feature/stripe-payments",
    "changed_files": 8,
    "additions": 312,
    "deletions": 14
  },
  "risk_score": 68,
  "risk_level": "high",
  "findings": [
    {
      "rule": "secret-pattern",
      "severity": "high",
      "message": "Possible hardcoded secret in src/payment/config.ts line 12",
      "line": 12,
      "file": "src/payment/config.ts"
    },
    {
      "rule": "auth-path-changed",
      "severity": "medium",
      "message": "Authentication-related file modified: src/middleware/auth.ts"
    }
  ],
  "change_summary": "8 files changed (+312/-14). Auth paths touched. Large diff.",
  "merge_recommendation": "request_changes"
}
```

The high risk score and hardcoded secret finding tell you to look closer before merging.

---

## Step 2 — Review the Suspicious Code

Copy the contents of `src/payment/config.ts` and review it:

```
Use review_code with the contents of src/payment/config.ts, language=typescript
```

**Example response:**
```json
{
  "language": "typescript",
  "overall_score": 5.2,
  "issues": [
    {
      "severity": "high",
      "category": "security",
      "message": "Hardcoded API key detected — use environment variable instead",
      "line": 12,
      "suggestion": "Replace with process.env.STRIPE_SECRET_KEY"
    },
    {
      "severity": "medium",
      "category": "security",
      "message": "eval() usage detected",
      "line": 34
    }
  ],
  "positive_observations": [
    "Function names are descriptive",
    "Error handling present in most paths"
  ],
  "refactor_priority": "high"
}
```

Two security issues confirmed. The hardcoded key needs to go before merge.

---

## Step 3 — Audit New Dependencies

The PR added `stripe` and `axios` to package.json. Check for vulnerabilities:

```
Use audit_dependencies on owner=acme-corp repo=api ecosystem=npm severity_threshold=moderate
```

**Example response:**
```json
{
  "ecosystem": "npm",
  "total_dependencies": 47,
  "vulnerabilities": [
    {
      "package": "axios",
      "version": "0.21.1",
      "severity": "high",
      "osv_id": "GHSA-42xw-2xvc-qx8m",
      "summary": "Server-Side Request Forgery in axios",
      "cve_ids": ["CVE-2021-3749"],
      "fix_version": "0.21.2",
      "fix_command": "npm install axios@0.21.2"
    }
  ],
  "audit_passed": false,
  "stats": { "critical": 0, "high": 1, "moderate": 0, "low": 0 },
  "osv_query_timestamp": "2024-03-15T10:30:00Z"
}
```

One high-severity vuln in axios. The fix command is ready to paste.

---

## Step 4 — Summarize Recent Activity

Before writing the changelog, get a quick picture of recent work:

```
Use summarize_commits on owner=acme-corp repo=api since=7d output_style=standup
```

**Example response:**
```json
{
  "repo": "acme-corp/api",
  "commit_count": 23,
  "summary": "23 commits over 7 days: 6 features, 4 fixes, 8 chores, 3 refactors, 2 docs. Active contributors: alice, bob, charlie.",
  "authors": ["alice", "bob", "charlie"],
  "categories": {
    "features": [
      { "sha": "a1b2c3", "message": "feat: add Stripe payment processing", "author": "alice" },
      { "sha": "d4e5f6", "message": "feat: add webhook endpoint for payment events", "author": "alice" }
    ],
    "fixes": [
      { "sha": "g7h8i9", "message": "fix: handle declined card edge case", "author": "bob" }
    ],
    "refactors": [],
    "docs": [],
    "chores": []
  }
}
```

Good standup summary — 6 features shipped this week.

---

## Step 5 — Generate the Release Changelog

Time to cut v1.3.0. Generate the changelog from the last tag:

```
Use generate_changelog on owner=acme-corp repo=api from_ref=v1.2.0 to_ref=HEAD format=markdown
```

**Example response:**
```json
{
  "from_ref": "v1.2.0",
  "to_ref": "HEAD",
  "commit_count": 23,
  "changelog": "## What's Changed\n\n### Features\n- Add Stripe payment processing (alice)\n- Add webhook endpoint for payment events (alice)\n- Add idempotency key support (bob)\n\n### Bug Fixes\n- Handle declined card edge case (bob)\n- Fix race condition in session middleware (charlie)\n\n### Refactors\n- Extract payment utilities into shared module (alice)\n\n### Chores\n- Update Node.js to 20 LTS\n- Upgrade typescript to 5.4\n",
  "stats": { "features": 6, "fixes": 4, "refactors": 3, "docs": 2, "chores": 8 },
  "breaking_changes": []
}
```

Ready to paste into your GitHub release notes.

---

## Step 6 — Get Refactoring Suggestions

The payment processing function is complex. Get suggestions before the next sprint:

```
Use suggest_refactor with the contents of src/payment/processor.ts language=typescript goals=["testability","readability"]
```

**Example response:**
```json
{
  "original_complexity_score": 24,
  "suggestions": [
    {
      "type": "extract-function",
      "title": "Extract card validation into a separate function",
      "rationale": "Lines 45-78 handle validation independently — extracting makes it unit-testable",
      "effort": "low",
      "impact": "high",
      "example": "function validateCard(card: CardInput): ValidationResult { ... }"
    },
    {
      "type": "reduce-nesting",
      "title": "Flatten nested conditionals in processPayment()",
      "rationale": "5 levels of nesting detected — early returns improve readability",
      "effort": "medium",
      "impact": "high"
    }
  ],
  "priority_order": ["extract-function", "reduce-nesting"],
  "estimated_complexity_after": 12
}
```

Two targeted suggestions with effort/impact estimates — enough to plan the refactor sprint.

---

## Summary

In a single session you:
1. Caught a hardcoded secret before it merged (`analyze_pr` + `review_code`)
2. Found and fixed a vulnerable dependency (`audit_dependencies`)
3. Got a standup-ready activity summary (`summarize_commits`)
4. Generated release notes ready to publish (`generate_changelog`)
5. Identified the highest-value refactoring targets (`suggest_refactor`)

All without leaving your AI assistant.
