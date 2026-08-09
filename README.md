# Soloknuckle (Production Hygiene Kit)

Soloknuckle is a Production Hygiene CLI & Neo-Brutalist Web Hub that developers drop into any project to enforce production-grade discipline. It prevents you (or your AI coding agents like Cursor, Copilot, Antigravity) from accidentally breaking your live apps.

## What it CAN do

1. **Scaffold Hygiene Rules**: Runs `soloknuckle init` to instantly add `.cursorrules`, `AGENTS.md`, and CI/CD templates into any project, ensuring all AI agents read the master rules first.
2. **Branch Protection & Git Hooks**: Installs Git hooks to block direct pushes to `main`.
3. **Pre-Flight Checks**: Runs `soloknuckle check` to run linters, type checkers, and security scans (gitleaks) before you are allowed to merge or push.
4. **LLM Code Auditing**: Runs `soloknuckle audit` to use any LLM (local Ollama or cloud OpenAI/Anthropic/Gemini keys) to review uncommitted code against your `AGENTS.md` rules.
5. **Founder Control Center (UI)**: Provides a Neo-Brutalist Web UI (`soloknuckle ui`) to visualize and toggle feature flags (`flags.json`), manage allowlists, and view staging rollbacks without touching code.
6. **Agentic IDE Integration**: Designed to be the standard context root for any agentic IDE. Tell your IDE "Read AGENTS.md and use soloknuckle to audit" and it works automatically.

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
