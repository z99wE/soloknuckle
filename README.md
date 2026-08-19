# Soloknuckle

**Production Hygiene Kit for AI-Assisted Development**

A local-first safety layer that prevents AI agents (and humans) from breaking production. Secret scanning, command firewall, pre-flight checks, and a visual dashboard — zero configuration, zero cost.

---

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Commands Reference](#commands-reference)
- [IDE Integration](#ide-integration)
- [LLM Configuration](#llm-configuration)
- [Security Model](#security-model)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SOLOKNUCKLE CLI                              │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │  init    │  │  check   │  │  score   │  │   audit  │           │
│  │ (scaffold│  │(pre-     │  │(health   │  │  (LLM    │           │
│  │  hooks)  │  │ flight)  │  │  0-100)  │  │  review) │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │              │              │              │                 │
│       ▼              ▼              ▼              ▼                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    CORE MODULES                              │   │
│  │                                                              │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐            │   │
│  │  │ scanner    │  │ interceptor│  │  scorer    │            │   │
│  │  │ (secret    │  │ (command   │  │ (project   │            │   │
│  │  │  detection)│  │  firewall) │  │  health)   │            │   │
│  │  └────────────┘  └────────────┘  └────────────┘            │   │
│  │                                                              │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐            │   │
│  │  │ config     │  │ telemetry  │  │  rollback  │            │   │
│  │  │ (provider  │  │ (AI vs     │  │ (auto      │            │   │
│  │  │  registry) │  │  human)    │  │  revert)   │            │   │
│  │  └────────────┘  └────────────┘  └────────────┘            │   │
│  │                                                              │   │
│  │  ┌────────────┐  ┌────────────┐                             │   │
│  │  │ personas   │  │ llm-client │                             │   │
│  │  │ (bounded   │  │ (multi-    │                             │   │
│  │  │  context)  │  │  provider) │                             │   │
│  │  └────────────┘  └────────────┘                             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     EXPRESS API                              │   │
│  │                                                              │   │
│  │  GET  /api/config         →  Provider configuration          │   │
│  │  POST /api/config         →  Save provider settings          │   │
│  │  POST /api/sandbox        →  Safe command execution          │   │
│  │  POST /api/score          →  Project health analysis         │   │
│  │  POST /api/audit          →  LLM code review                │   │
│  │  POST /api/pr/description →  Auto PR description             │   │
│  │  GET  /api/telemetry      →  AI vs human stats               │   │
│  │  POST /api/persona/write  →  Write persona files             │   │
│  │  POST /api/persona/delete →  Delete persona files            │   │
│  │  POST /api/capabilities   →  Machine-readable tool list      │   │
│  │                                                              │   │
│  │  Security: Rate limiting, CORS, body size limits             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  VITE + REACT DASHBOARD                     │   │
│  │                                                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │   │
│  │  │ Provider │  │ Project  │  │ Command  │                  │   │
│  │  │ Settings │  │ Health   │  │ Firewall │                  │   │
│  │  └──────────┘  └──────────┘  └──────────┘                  │   │
│  │                                                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                  │   │
│  │  │ LLM      │  │ PR       │  │ Telemetry│                  │   │
│  │  │ Audit    │  │ Describer│  │ Dashboard│                  │   │
│  │  └──────────┘  └──────────┘  └──────────┘                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────┐
                         │   DATA FLOW     │
                         └─────────────────┘

User/Agent ──▶ CLI Command ──▶ Core Module ──▶ Express API ──▶ Dashboard
                  │                │                │
                  ▼                ▼                ▼
              Git Hooks      File System      Browser UI
              (pre-commit)   (~/.soloknuckle/)  (localhost:3000)
```

---

## Quick Start

```bash
# Install and initialize (adds git hooks + IDE rules)
cd your-project
npx soloknuckle init

# Run pre-flight checks before pushing
npx soloknuckle check

# Launch visual dashboard
npx soloknuckle ui
```

---

## Commands Reference

### Core Commands (Free, No API Key)

| Command | Description | Output |
|---------|-------------|--------|
| `npx soloknuckle init` | Scaffolds AGENTS.md, git hooks, IDE rules, MCP config | Files created in project |
| `npx soloknuckle check` | Pre-flight: lint, test, typecheck, secret scan | Human-friendly score report |
| `npx soloknuckle check --fix` | Auto-fix issues (lint, deps, git, CI, docs) | Fixes applied automatically |
| `npx soloknuckle score` | Project health 0-100 across 5 pillars | Numeric score + breakdown |
| `npx soloknuckle ui` | Launches web dashboard | http://localhost:3000 |
| `npx soloknuckle telemetry` | AI vs human contribution stats | Stats report |
| `npx soloknuckle persona <type> <folder>` | Agent rules for specific directories | Persona files |
| `npx soloknuckle capabilities` | Machine-readable command list for AI agents | JSON output |
| `npx soloknuckle watch` | Rollback daemon + webhook listener | Daemon process |

### LLM Commands (Requires API Key or Ollama)

| Command | Description | Cost |
|---------|-------------|------|
| `npx soloknuckle audit` | LLM reviews your uncommitted code | Free (Ollama) or API |
| `npx soloknuckle pr` | Auto-generates PR description from git diff | Free (Ollama) or API |

---

## IDE Integration

Run `npx soloknuckle init` and it automatically creates the right files for your IDE:

| IDE | File Created | Setup Required |
|-----|--------------|----------------|
| **Cursor** | `.cursorrules` | None — auto-detected |
| **Windsurf** | `.windsurfrules` | None — auto-detected |
| **Claude Code / Gemini CLI** | `SKILL.md` | None — auto-detected |
| **Codex / Lovable / Claude Desktop** | `mcp-config.json` | Import MCP config in settings |
| **Replit** | `.replit` | None — default run command set |
| **Any Other IDE** | Paste prompt in chat | See below |

**Universal Prompt for Any IDE:**

> Before doing anything, read AGENTS.md in the project root. Run `npx soloknuckle capabilities` to see available tools. Always run `npx soloknuckle check` before finishing a task.

---

## LLM Configuration

Only required if you want AI code review (`audit`) or auto PR descriptions (`pr`).

### Option A: Ollama (Free, Local)

```bash
# 1. Install Ollama
brew install ollama  # macOS
# or: https://ollama.com/download

# 2. Pull a model
ollama pull llama3

# 3. Configure Soloknuckle
npx soloknuckle config
# Select: Ollama (Local) — no API key needed
```

### Option B: Cloud API

```bash
# 1. Configure Soloknuckle
npx soloknuckle config
# Select: OpenAI / Anthropic / Gemini
# Enter your API key when prompted
```

**Supported Providers:** OpenAI, Anthropic, Google Gemini, Ollama, Azure OpenAI, DeepSeek, Groq, Mistral, OpenRouter, Together AI, xAI

**Key Storage:** `~/.soloknuckle/config.json` (local only, never uploaded)

---

## Security Model

### What It Protects Against

| Threat | Mitigation |
|--------|------------|
| Secret leakage | Scans for API keys, tokens, credentials in code |
| Destructive commands | Firewall blocks `rm -rf`, `git push --force`, SQL drops |
| Path traversal | Persona system validates directory boundaries |
| API key exposure | Keys stored locally, never committed to git |
| Rate limiting | Prevents abuse of LLM API endpoints |
| CORS attacks | Restricted to localhost origins only |

### Command Firewall Patterns

The interceptor blocks these destructive patterns:

- `sudo rm`, `rm -rf`, `rm -fr`, `rm -r -f`, `rm -f -r`
- `DROP DATABASE`, `DELETE FROM ... WHERE`, `TRUNCATE TABLE`
- `git push --force`, `git push -f`, `git reset --hard`
- `chmod 777`, `chmod -R 777`
- `curl ... | sh`, `wget ... | bash`
- `dd if=... of=/dev/...`
- `mkfs.*`, `mv ... /dev/null`
- Shell redirects (`>>`, `>`, heredoc)

---

## Project Structure

```
soloknuckle/
├── cli/                          # Core CLI modules
│   ├── index.ts                  # Entry point + command router
│   ├── app.ts                    # Express API server
│   ├── config.ts                 # Configuration + provider registry
│   ├── scanner.ts                # Secret detection engine
│   ├── interceptor.ts            # Command firewall
│   ├── scorer.ts                 # Project health scoring
│   ├── llm-client.ts             # Multi-provider LLM client
│   ├── telemetry.ts              # AI vs human tracking
│   ├── rollback.ts               # Auto-rollback daemon
│   ├── personas.ts               # Agent bounded contexts
│   ├── pr-enforcer.ts            # PR description generator
│   └── vite-plugin.ts            # Vite build-time integration
├── ui/                           # React dashboard
│   ├── src/
│   │   ├── App.jsx               # Main dashboard component
│   │   ├── index.css             # Neo-brutalist styling
│   │   └── main.jsx              # React entry point
│   └── index.html                # HTML shell
├── test/                         # Test suite
│   ├── api.test.ts               # API endpoint tests
│   ├── config.test.ts            # Config loading tests
│   ├── interceptor.test.ts       # Firewall pattern tests
│   ├── llm-client.test.ts        # LLM client tests
│   ├── personas.test.ts          # Persona system tests
│   ├── telemetry.test.ts         # Telemetry tests
│   └── ...                       # Additional test files
├── git-hooks/                    # Git hook scripts
│   ├── pre-commit                # Runs checks before commit
│   └── commit-msg                # Validates commit messages
├── templates/                    # Feature flag templates
│   ├── feature-flag.ts
│   ├── feature-flag.api.ts
│   ├── feature-flag.backend.ts
│   ├── feature-flag.tsx
│   └── flags.json
├── scripts/                      # Setup scripts
│   ├── setup-github.sh
│   ├── setup-vercel.sh
│   └── setup-railway.sh
├── AGENTS.md                     # Agent behavior rules
├── SKILL.md                      # Claude Code skill definition
├── package.json
└── tsconfig.json
```

---

## Testing

### Run All Tests

```bash
npm test
```

### Run with Coverage

```bash
npm run test -- --coverage
```

### Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `test/interceptor.test.ts` | 28 | 100% |
| `test/personas.test.ts` | 7 | 100% |
| `test/telemetry.test.ts` | 7 | 100% |
| `test/llm-client.test.ts` | 22 | 86% |
| `test/api.test.ts` | 35 | 79% |
| `test/config.test.ts` | 21 | 88% |
| `test/scorer.test.ts` | 27 | 80% |
| `test/scanner.test.ts` | 15 | 100% |
| `test/pr-enforcer.test.ts` | 4 | 85% |
| `test/rollback.test.ts` | 12 | 0% |
| `test/mcp-server.test.ts` | 17 | 100% |
| `test/e2e.test.ts` | 1 | 100% |
| **Total** | **196** | **78%** |

---

## Can I Keep the Repo Private?

**Yes.** The npm package is self-contained. Users never need access to your GitHub repo. They just run `npx soloknuckle` and everything works locally.

---

## Updating

```bash
# If installed via npx — always gets latest
npx soloknuckle check

# If installed as dev dependency
npm update soloknuckle --save-dev
```

---

## Vite Plugin (Invisible Integration)

Use Soloknuckle as a build-time guardian without running CLI commands:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import soloknucklePlugin from 'soloknuckle/cli/vite-plugin';

export default defineConfig({
  plugins: [
    soloknucklePlugin() // Runs quality gates on every build
  ]
});
```

---

## MCP Server (Model Context Protocol)

Soloknuckle ships with an MCP server that lets AI coding agents (Claude, Cursor, Windsurf, etc.) call Soloknuckle tools directly.

### Setup

Add to your MCP client config:

```json
{
  "mcpServers": {
    "soloknuckle": {
      "command": "soloknuckle-mcp"
    }
  }
}
```

Or for Claude Desktop:

```json
{
  "mcpServers": {
    "soloknuckle": {
      "command": "npx",
      "args": ["soloknuckle-mcp"]
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `soloknuckle_score` | Get project health score (0-100) with per-category breakdown |
| `soloknuckle_telemetry` | Get AI vs human contribution telemetry |
| `soloknuckle_intercept` | Check if a shell command is safe or destructive |
| `soloknuckle_secrets` | Scan a git diff for secrets, API keys, and PII |
| `soloknuckle_flags` | Read all feature flags and their state |
| `soloknuckle_flag_set` | Enable or disable a feature flag |
| `soloknuckle_suggest` | Get AI-powered improvement suggestions |
| `soloknuckle_branches` | List local git branches |

### Example: Agent Checks Score Before Coding

```
Agent: soloknuckle_score
Server: { "overall": 82, "quality": 90, "testing": 100, "security": 70, ... }
Agent: "Security is low. Let me check for secrets..."
Agent: soloknuckle_secrets { "diff": "" }
Server: { "clean": false, "violations": ["Line 5: Potential secret detected"] }
Agent: "Found a secret. Fixing it before proceeding."
```

---

## Security

Soloknuckle is built with security-first principles:

### Package Integrity

| Protection | How It Works |
|------------|--------------|
| **npm Provenance** | Every publish is cryptographically tied to the source commit via OIDC — you can verify the package came from this repo |
| **2FA Required** | Publishing requires two-factor authentication with a hardware security key |
| **Audit Signatures** | `npm audit signatures` verifies registry signatures on every install |
| **No Automated Publishing** | All releases are manual — no CI tokens that could be stolen |

### Install-Time Safety

| Protection | How It Works |
|------------|--------------|
| **`ignore-scripts=true`** | Prevents supply chain attacks via malicious install scripts |
| **`allow-git=none`** | Blocks git operations during install |
| **`min-package-age=72`** | Requires packages to be 72+ hours old before install (prevents typosquatting) |
| **Strict SSL** | All connections use HTTPS with strict certificate validation |

### Runtime Safety

| Protection | How It Works |
|------------|--------------|
| **Local-only** | All data stays in `~/.soloknuckle/` — nothing sent to external services |
| **No telemetry** | Soloknuckle does not phone home |
| **No PII collection** | No names, emails, or usage data collected |
| **Rate limiting** | Prevents abuse of LLM API endpoints |
| **CORS restrictions** | Express API restricted to localhost origins only |
| **Body size limits** | 1mb limit prevents memory exhaustion attacks |

### CI Security

GitHub Actions workflow runs on every PR:
- Security audit (`npm audit`)
- Type checking (`tsc --noEmit`)
- Linting (`eslint`)
- Tests across Node.js 20, 22

Actions are pinned to specific commit SHAs to prevent upstream compromise.

### Responsible Disclosure

If you discover a security vulnerability, please report it privately. See [SECURITY.md](SECURITY.md) for details.

### Supply Chain Attack Prevention

```bash
# Verify package integrity after install
npm audit signatures

# Check for known vulnerabilities
npm audit

# Install with provenance verification
npm install soloknuckle --provenance
```

---

## What It Does NOT Do

- **Not a hosting provider** — manages rollbacks conceptually via Vercel/Railway, doesn't host code
- **Not a CI pipeline** — use GitHub Actions for remote validation
- **Doesn't write your code** — it's a hygiene layer, you write the features
- **Doesn't send your code anywhere** — all checks run locally unless you explicitly enable cloud LLM audit

---

## License

ISC
