# Soloknuckle (Production Hygiene Kit)

Soloknuckle is a Production Hygiene CLI & Neo-Brutalist Web Hub that developers drop into any project to enforce production-grade discipline. It prevents you (or your AI coding agents like Cursor, Copilot, Antigravity) from accidentally breaking your live apps.

## What it CAN do

1. **Scaffold Hygiene Rules**: Runs `soloknuckle init` to instantly add `.cursorrules`, `AGENTS.md`, and CI/CD templates into any project, ensuring all AI agents read the master rules first.
2. **Branch Protection & Git Hooks**: Installs Git hooks to block direct pushes to `main`.
3. **Pre-Flight Checks**: Runs `soloknuckle check` to rigorously enforce linters, type checkers, tests (`vitest`), and run intelligent PII & Secret Redaction (blocking API keys and dummy data).
4. **LLM Code Auditing**: Runs `soloknuckle audit` to use any LLM (local Ollama or cloud OpenAI/Anthropic/Gemini keys) to review uncommitted code against your `AGENTS.md` rules.
5. **Agent Persona Manager**: Runs `soloknuckle persona <type> <folder>` to enforce bounded contexts by generating directory-specific AI agent rules (e.g. `frontend-ux` vs `backend-security`).
6. **Agent Telemetry Engine**: Tracks AI vs Human code contributions locally and visualizes them to show your team's real reliance on AI tooling.
7. **Strict PR Description Enforcer**: Runs `soloknuckle pr` to fetch the git diff and auto-generate a perfectly formatted `PR_DESCRIPTION.md` using the LLM API.
8. **Automated Rollback Triggers**: Run `soloknuckle watch` to monitor error spikes and automatically toggle feature flags off directly in your codebase.
9. **Founder Control Center (UI)**: Provides a Neo-Brutalist Web UI (`soloknuckle ui`) to visualize feature flags, launch the Agent Sandbox execution environment, apply personas, and view staging rollbacks without touching code.
10. **Agentic IDE Integration**: Designed to be the standard context root for any agentic IDE. Tell your IDE "Read AGENTS.md and use soloknuckle to audit" and it works automatically.
## What it CANNOT do

1. **It is NOT a hosting provider**: It manages your staging URLs and rollbacks conceptually via Vercel/Railway, but it does not host the code itself.
2. **It is NOT a CI pipeline**: It acts as a *local* pre-flight check and rule enforcer. You should still use GitHub Actions or CircleCI for remote validation.
3. **It does NOT write your application code**: It is a hygiene layer. It scaffolds the guardrails, but you or your AI agent still write the actual features.

## Getting Started

```bash
# Initialize inside any existing project
npx soloknuckle init

# Launch the visual Founder Control Center
npx soloknuckle ui

# Run pre-flight checks before pushing
npx soloknuckle check
```

## IDE Integration (The Universal Prompt)

Paste this into Cursor, Replit, or Copilot for any project running Soloknuckle:
> Before doing anything, read AGENTS.md in the project root. Always use `soloknuckle check` before finishing a task.
