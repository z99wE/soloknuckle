# Soloknuckle

**Production Hygiene for AI-Assisted Development**

Catches the bugs that AI leaves behind — secrets in code, destructive commands, flaky tests, and 100% coverage that catches 4% of bugs. One command. Zero config. Runs on your machine, not someone else's cloud.

---

## Table of Contents

- [Why Soloknuckle](#why-soloknuckle)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Commands Reference](#commands-reference)
- [7-Domain Scorecard Model](#7-domain-scorecard-model)
- [Hard Gates](#hard-gates)
- [Unique Testing Features](#unique-testing-features)
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

# Enforce hard gates in CI (exits non-zero on failure)
npx soloknuckle check --strict

# Launch visual dashboard
npx soloknuckle ui
```

**Recommended CI setup:** Add `npx soloknuckle check --strict` to your CI pipeline. It enforces minimum thresholds for security (≥70), testing (≥70), reliability (≥60), and supply chain (≥50). Merges that fail these gates are blocked automatically.

---

## Commands Reference

### Core Commands (Free, No API Key)

| Command | Description | Output |
|---------|-------------|--------|
| `npx soloknuckle init` | Scaffolds AGENTS.md, git hooks, IDE rules, MCP config | Files created in project |
| `npx soloknuckle check` | Pre-flight: lint, test, typecheck, secret scan | Human-friendly score report |
| `npx soloknuckle check --fix` | Auto-fix issues (lint, deps, git, CI, docs) | Fixes applied automatically |
| `npx soloknuckle check --strict` | Enforce hard gates (exit code 1 on failure) | Pass/Fail with minimum thresholds |
| `npx soloknuckle score` | Project health 0-100 across 7 domains | Numeric score + breakdown |
| `npx soloknuckle sbom` | Generate CycloneDX SBOM manifest | JSON SBOM file |
| `npx soloknuckle compliance` | Self-audit against Soloknuckle's own standards | Compliance report |
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

## 7-Domain Scorecard Model

Soloknuckle evaluates your project across 7 critical domains:

| Domain | What It Checks | Weight |
|--------|----------------|--------|
| **Code Quality** | Linting, formatting, TypeScript, complexity | 20% |
| **Testing** | Unit tests, E2E tests, coverage | 20% |
| **Security & Compliance** | Secrets, vulnerabilities, auth patterns | 20% |
| **Performance** | Bundle size, lazy loading, optimization | 10% |
| **Reliability** | Error tracking, retries, health checks | 10% |
| **Dependencies & Supply Chain** | Lockfiles, pinned deps, SBOM | 10% |
| **Documentation & Visibility** | README, CHANGELOG, LICENSE | 10% |

### Hard Gates (--strict mode)

When you run `npx soloknuckle check --strict`, Soloknuckle enforces minimum thresholds:

| Gate | Minimum Score | Why It Matters |
|------|---------------|----------------|
| Security | ≥ 70 | No secrets, no critical vulnerabilities |
| Testing | ≥ 70 | Adequate test coverage and quality |
| Reliability | ≥ 60 | Error handling, health checks present |
| Supply Chain | ≥ 50 | Dependencies pinned, lockfile present |

If any gate fails, the command exits with code 1 — perfect for CI/CD pipelines.

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
│   ├── scorer.ts                 # Project health scoring (13 dimensions)
│   ├── gates.ts                  # Hard gate evaluation + scorecard
│   ├── sbom.ts                   # CycloneDX SBOM generation
│   ├── compliance.ts             # Self-compliance audit
│   ├── mutation.ts               # Mutation testing gate
│   ├── context-validator.ts      # Context-aware test validator
│   ├── caller-contract.ts        # Caller contract checker
│   ├── flaky-detector.ts         # Flaky test detector
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
| `test/gates.test.ts` | 12 | 100% |
| `test/sbom.test.ts` | 9 | 100% |
| `test/compliance.test.ts` | 15 | 100% |
| `test/e2e.test.ts` | 1 | 100% |
| **Total** | **383** | **85%** |

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

## Why Soloknuckle? The Gaps Others Leave Open

### The Problem with Existing Tools

| Tool Category | What They Do | The Gap |
|---------------|--------------|---------|
| **Linters (ESLint, Prettier)** | Check code style | No security, no testing, no production readiness |
| **Security Scanners (Snyk, SonarQube)** | Find vulnerabilities | Cloud-based, expensive, require accounts |
| **Test Runners (Jest, Mocha)** | Execute tests | Don't verify test quality or catch flaky tests |
| **Coverage Tools (Istanbul)** | Measure coverage | 98% coverage can mean 4% bug detection |
| **AI Coding Assistants** | Write code + tests | Same model writes both — tests ratify implementation |

### The Coverage Illusion

> "A test suite achieved 100% line coverage and a 4% mutation score. It executed every line. It caught 4% of the bugs."

**What this means:** Coverage measures whether a line executed, not whether the execution validated anything meaningful.

**Soloknuckle's answer:** Mutation Testing Gate that applies mutations to your source code and checks if your tests catch them — proving behavior validation, not just line execution.

### Same-Model Blindness

> "When the same model generates both your implementation and your tests, both artifacts share the same mental model. If the assumptions are wrong, both are wrong in the same direction."

**What this means:** AI tests ratify the implementation rather than validating behavior.

**Soloknuckle's answer:** Context-Aware Test Validator that detects missing mocks, real dependencies, no assertions, and hardcoded values — the telltale signs of tests that ratify rather than validate.

### No Context Awareness

> "AI tools test functions in isolation. They don't know the callers, the incident history, or what downstream services consume the return type."

**What this means:** Tests miss integration points, caller contracts, and production failure modes.

**Soloknuckle's answer:** Caller Contract Checker that extracts function signatures from source code and validates that test calls match the actual signatures — catching parameter mismatches and contract violations.

### Flaky Test Explosion

> "A 500-test suite costs roughly $360,750 a month to maintain manually. Selector changes (32%) and flow changes (27%) drive most failures."

**What this means:** Tests break when UI changes, not when code regresses.

**Soloknuckle's answer:** Flaky Test Detector that identifies intermittent failures by pattern analysis and multi-run detection, with maintenance cost estimation to prioritize fixes.

---

## What Makes Soloknuckle Different

### 1. AI vs Human Telemetry (The Viral Hook)

```bash
npx soloknuckle telemetry
# → "This week: 73% AI-generated, 27% human"
```

**Nobody else tracks this.** In 2026, every team is asking "how much of our code is AI?" Soloknuckle answers that.

### 2. MCP Server for AI Agents (The Integration Moat)

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

**Soloknuckle teaches AI agents to check themselves.** Claude, Cursor, Windsurf can call `soloknuckle_score` before writing code.

### 3. 7-Domain Scorecard (The Social Signal)

```
┌─────────────────────────────────────────┐
│  7-Domain Scorecard                      │
│  Code Quality        ████████░░  85/100  │
│  Testing             ██████████  100/100 │
│  Security            ███████░░░  72/100  │
│  Performance         ████████░░  88/100  │
│  Reliability         ███████░░░  78/100  │
│  Supply Chain        ██████░░░░  65/100  │
│  Documentation       ███████░░░  75/100  │
│                                          │
│  Overall: 82/100 — Production Ready ✓    │
└─────────────────────────────────────────┘
```

**This is shareable.** Teams compete. Open source projects display badges. This is the viral loop.

### 4. Hard Gates (The CI/CD Gatekeeper)

```bash
npx soloknuckle check --strict
# Exit code 1 if any gate fails
```

**Perfect for CI/CD pipelines.** No more merging code that breaks production.

### 5. SBOM Generation (The Supply Chain Guardian)

```bash
npx soloknuckle sbom
# → sbom.json (CycloneDX format)
```

**Know exactly what's in your codebase.** Required for compliance (SOC 2, ISO 27001).

### 6. Self-Compliance Audit (The Mirror Test)

```bash
npx soloknuckle compliance
# → Checks Soloknuckle against its own standards
```

**Does Soloknuckle practice what it preaches?** This command answers that.

---

## Unique Testing Features (The Gaps Nobody Else Fills)

These features address critical testing gaps that no existing tool covers. Each one attacks a specific failure mode that AI-assisted development introduces.

### 1. Mutation Testing Gate (The Coverage Illusion Killer)

```typescript
// cli/mutation.ts
import { runMutationTesting, evaluateMutationGate } from 'soloknuckle/cli/mutation';

const result = await runMutationTesting(['src/**/*.ts']);
// → { totalMutations, killed, survived, score: 0.87 }

if (evaluateMutationGate(result.score).passed) {
  console.log('Tests actually validate behavior, not just coverage');
}
```

**What it does:** Applies 5 mutation types (operator, return, boundary, boolean, string) to your source code and checks if your tests catch the mutations.

**Why it matters:** 100% line coverage can mean 4% bug detection. Mutation testing proves your tests validate behavior, not just execution.

### 2. Context-Aware Test Validator (The Same-Model Blindness Detector)

```typescript
// cli/context-validator.ts
import { validateTestContext, evaluateContextGate } from 'soloknuckle/cli/context-validator';

const result = await validateTestContext(['src/**/*.test.ts']);
// → { totalIssues, issues: [{type, severity, description, file, suggestion}] }

if (!evaluateContextGate(result).passed) {
  console.log('Your tests are ratifying implementation, not validating behavior');
}
```

**What it does:** Detects when AI-generated tests share the same blind spots as the code they test — missing mocks, real dependencies, no assertions, hardcoded values.

**Why it matters:** When the same model writes both implementation and tests, both artifacts share the same mental model. If the assumptions are wrong, both are wrong in the same direction.

### 3. Caller Contract Checker (The Context Awareness Enforcer)

```typescript
// cli/caller-contract.ts
import { validateCallerContracts, evaluateContractGate } from 'soloknuckle/cli/caller-contract';

const result = await validateCallerContracts(['src/**/*.test.ts'], ['src/**/*.ts']);
// → { totalIssues, issues: [{type, severity, description, testFile, sourceFile, suggestion}] }

if (!evaluateContractGate(result).passed) {
  console.log('Your tests are missing caller contract violations');
}
```

**What it does:** Extracts function signatures from source code and validates that test calls match the actual signatures — parameter count, parameter types, return types.

**Why it matters:** AI tools test functions in isolation. They don't know the callers, the incident history, or what downstream services consume the return type.

### 4. Flaky Test Detector (The Maintenance Cost Calculator)

```typescript
// cli/flaky-detector.ts
import { detectFlakyTests, evaluateFlakyGate } from 'soloknuckle/cli/flaky-detector';

const result = await detectFlakyTests(['src/**/*.test.ts'], 3);
// → { totalTests, flakyTests, flakyPatterns, estimatedMonthlyCost, recommendation }

if (!evaluateFlakyGate(result).passed) {
  console.log(`Flaky tests cost ~$${result.estimatedMonthlyCost}/month to maintain`);
}
```

**What it does:** Detects flaky tests by analyzing patterns (setTimeout, Math.random, Date, network calls) and running tests multiple times to catch intermittent failures.

**Why it matters:** A 500-test suite costs roughly $360,750 a month to maintain manually. Selector changes (32%) and flow changes (27%) drive most failures. Flaky tests erode trust in your test suite.

---

## Who Uses This

| Persona | Pain Point | How Soloknuckle Helps |
|---------|-----------|----------------------|
| **Solo Founders** | No QA team, shipping fast with AI | Pre-flight gate catches what AI misses before it ships |
| **AI-Assisted Teams** | Don't know how much code is AI-written | Telemetry tracks AI vs human contributions per week |
| **Open Source Maintainers** | Contributors submit AI-generated code | `--strict` mode enforces quality gates in CI |
| **Agencies & Consultancies** | Client projects need to be production-ready | 7-domain scorecard proves quality with numbers |

---

## One-Liner USP

> **"Soloknuckle is the only tool that tells you if your code is production-ready AND tracks how much of it AI wrote."**

Or even shorter:

> **"Production hygiene for the AI era. Free. Local. One command."**

---

## License

ISC
