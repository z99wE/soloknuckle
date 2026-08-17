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
10. **Deterministic Agent Firewall**: Actively intercepts and blocks destructive shell commands (like `rm -rf` or `git push --force`) run by agents in the sandbox, returning a structured JSON error to force the agent to auto-correct.
11. **Zero Cognitive Load Wizard**: Run `npx soloknuckle` with no arguments to launch an interactive, Neo-Brutalist terminal UI that routes you to features instantly.
12. **Agent Capabilities Hook**: Exposes `npx soloknuckle capabilities` to act as a machine-readable directory, allowing AI agents to self-discover all commands.
13. **Agentic IDE Integration**: Instantly transforms your repository into an Agentic OS context root.
    - **Claude Code**: Generates a `SKILL.md` in your `.gemini/config/skills` directory, effectively teaching Claude that "Soloknuckle" is a native skill it can use.
    - **Cursor**: Generates a `.cursorrules` file, which intercepts Cursor's context window and tells it to run the hygiene checks.
    - **Windsurf**: Generates a `.windsurfrules` file with identical context steering.
    - **Codex / Lovable (MCP)**: Generates an `mcp-config.json` (Model Context Protocol standard) to expose Soloknuckle as a set of tools directly to the LLM's tool-calling interface.

## The Commands

- `soloknuckle check` - The enforcer. Evaluates your current git diff against `.soloknuckle/config.json`. If it fails, your pre-commit hook dies.
- `soloknuckle config` - Interactive setup to tune the aggression of your agent and configure your local Ollama or cloud LLM.
- `soloknuckle ui` - Spawns the local web dashboard to manage branch visualizers, toggle features, and test code in a secure sandbox.
- `soloknuckle score` - Performs a Deep Vibe Check and calculates your Project Health Metrics (0-100) across 5 pillars (Quality, Testing, Security, Efficiency, Accessibility), complete with an AI-generated Action Plan.

## What it CANNOT do

1. **It is NOT a hosting provider**: It manages your staging URLs and rollbacks conceptually via Vercel/Railway, but it does not host the code itself.
2. **It is NOT a CI pipeline**: It acts as a *local* pre-flight check and rule enforcer. You should still use GitHub Actions or CircleCI for remote validation.
3. **It does NOT write your application code**: It is a hygiene layer. It scaffolds the guardrails, but you or your AI agent still write the actual features.

## Installation & Setup

You can use Soloknuckle in two distinct ways: as a standalone zero-dependency CLI, or entirely invisibly as a Vite Plugin.

### Option 1: Standalone CLI (Zero-Dependency)

Use `npx` to fetch and run Soloknuckle on the fly without installing it globally. This is perfect for terminal use or CI/CD pipelines.

```bash
# 1. Initialize inside any existing project (scaffolds IDE hooks)
npx soloknuckle init

# 2. Launch the visual Founder Control Center
npx soloknuckle ui

# 3. Run pre-flight checks before pushing
npx soloknuckle check
```

### Option 2: The Vite Plugin (Invisible Integration)

If you want Soloknuckle to act as an invisible build-time guardian without running CLI commands manually, you can use our Vite Plugin!

First, install the package as a dev dependency:
```bash
npm install soloknuckle --save-dev
```

Then, just drop it into your `vite.config.ts` or `vite.config.js`:
```typescript
import { defineConfig } from 'vite';
import soloknucklePlugin from 'soloknuckle/cli/vite-plugin';

export default defineConfig({
  plugins: [
    soloknucklePlugin() // 🛡️ Automatically runs quality gates & secret scans on build!
  ]
});
```
Every time your application builds or spins up a dev server, Soloknuckle will silently scan for secrets, enforce linting, and run the telemetry checks in the background.

## IDE Integration (The Universal Prompt)

If you are using an IDE that doesn't natively support `.cursorrules` or MCP, paste this into your LLM chat:
> Before doing anything, read AGENTS.md in the project root. If you need to know what tools are available, run \`npx soloknuckle capabilities\`. Always use \`npx soloknuckle check\` before finishing a task.
