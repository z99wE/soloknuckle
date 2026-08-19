# Changelog

All notable changes to Soloknuckle will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-08-19

### Added

- **10-dimension production scoring** — security, testing, quality, efficiency, accessibility, dependencies, documentation, git hygiene, CI/CD, feature flags
- **Human-friendly CLI** — `soloknuckle check` with expandable `--fix` commands
- **AI Watcher** — detects AI-authored commits, scans diffs, creates approval/quarantine branches
- **Budget system** — enforce limits on AI agent actions (commits, edits, deploys, API calls)
- **Sentry integration** — auto-detect AI commits as incident culprits, auto-revert, create reports
- **MCP Server** — stdio-based server with 8 tools for AI agent integration
- **Express API** — REST endpoints for scoring and health checks
- **React dashboard** — neo-brutalist UI for visualizing scores
- **Secret scanner** — detects API keys, passwords, tokens, PII in code
- **Agent guardrails** — requires AGENTS.md, .cursorrules, or SKILL.md for AI coding
- **Configurable weights** — customize dimension importance via `.soloknuckle/score-weights.json`
- **Zero-config setup** — `npx soloknuckle init` just works
- **Landing page** — SEO-optimized, deployable to Netlify/Vercel/GitHub Pages/Render
- **CI pipeline** — GitHub Actions with Node 20/22 matrix, security audit, typecheck, lint, tests
- **291 tests** across 18 test files
- **ISC license** — free forever, no accounts, no cloud

### Security

- No secrets in code
- No PII in logs
- Input validation on all endpoints
- Webhook signature verification
- Timing-safe comparison for secrets
