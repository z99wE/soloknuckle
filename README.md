# Soloknuckle — Production Hygiene Kit

Drop this into any project to stop AI agents (and yourself) from breaking production. Pre-flight checks, secret scanning, agent firewall, and a visual dashboard — all local, all free.

## Quick Start (30 seconds)

```bash
# 1. Go to your project
cd your-project

# 2. Initialize (adds git hooks + IDE rules)
npx soloknuckle init

# 3. Run checks before pushing
npx soloknuckle check
```

That's it. Your project is now protected.

## Works 100% Free — No API Key Needed

Most features work with zero configuration and zero cost:

| Feature | Needs API Key? | Cost |
|---------|---------------|------|
| `soloknuckle check` — pre-flight checks | No | Free |
| `soloknuckle init` — scaffold hooks & rules | No | Free |
| `soloknuckle ui` — visual dashboard | No | Free |
| `soloknuckle score` — project health score | No | Free |
| `soloknuckle telemetry` — AI vs human tracking | No | Free |
| `soloknuckle persona` — agent bounded contexts | No | Free |
| `soloknuckle capabilities` — agent self-discovery | No | Free |
| `soloknuckle watch` — rollback daemon | No | Free |
| `soloknuckle audit` — LLM code review | **Yes** | Ollama (free) or OpenAI/Anthropic |
| `soloknuckle pr` — auto PR descriptions | **Yes** | Ollama (free) or OpenAI/Anthropic |

**If you just want the safety net (secret scanning, git hooks, firewall, dashboard) — you need nothing. It just works.**

## All Commands

| Command | What It Does |
|---------|-------------|
| `npx soloknuckle` | Interactive wizard — pick what to do |
| `npx soloknuckle init` | Scaffolds AGENTS.md, git hooks, IDE rules, MCP config |
| `npx soloknuckle check` | Pre-flight: lint, test, typecheck, secret scan |
| `npx soloknuckle score` | Project health 0-100 across 5 pillars |
| `npx soloknuckle audit` | LLM reviews your uncommitted code (needs API key or Ollama) |
| `npx soloknuckle pr` | Auto-generates PR description from git diff |
| `npx soloknuckle ui` | Launches web dashboard at localhost:3000 |
| `npx soloknuckle persona <type> <folder>` | Agent rules for specific directories |
| `npx soloknuckle watch` | Rollback daemon + webhook listener |
| `npx soloknuckle telemetry` | View AI vs human contribution stats |
| `npx soloknuckle capabilities` | Machine-readable command list for AI agents |
| `npx soloknuckle config` | Configure LLM provider (only if using audit/pr) |

## IDE Integration

Run `npx soloknuckle init` and it automatically creates the right files for your IDE:

### Cursor
- **File created**: `.cursorrules` in your project root
- **What it does**: Cursor reads this file and follows the hygiene rules automatically
- **No setup needed** — just run `init` and Cursor picks it up

### Windsurf
- **File created**: `.windsurfrules` in your project root
- **What it does**: Same as Cursor — Windsurf follows the rules automatically
- **No setup needed**

### Claude Code / Antigravity / Gemini CLI
- **File created**: `SKILL.md` in your project root
- **What it does**: Teaches the agent that Soloknuckle is available as a tool
- **No setup needed** — agents read this file automatically

### Codex / Lovable / Claude Desktop (MCP)
- **File created**: `mcp-config.json` in your project root
- **What it does**: Exposes Soloknuckle as MCP tools so the LLM can call them directly
- **Setup**: Import the MCP config in your tool's settings

### Replit
- **File created**: `.replit` config
- **What it does**: Sets `npx soloknuckle ui` as the default run command

### Any Other IDE
Paste this into your LLM chat:
> Before doing anything, read AGENTS.md in the project root. Run `npx soloknuckle capabilities` to see available tools. Always run `npx soloknuckle check` before finishing a task.

## Setting Up LLM (Only for audit + pr commands)

If you want AI code review or auto PR descriptions, you have two options:

### Option A: Ollama (Free, Local)
1. Install Ollama: https://ollama.com
2. Pull a model: `ollama pull llama3`
3. Run: `npx soloknuckle config`
4. Select **Ollama (Local)** — no API key needed

### Option B: Cloud API
1. Run: `npx soloknuckle config`
2. Select your provider (OpenAI / Anthropic / Gemini)
3. Enter your API key

Your key is stored locally in `~/.soloknuckle/config.json`. Never commit this file.

## Can I Keep the Repo Private?

**Yes.** The npm package is self-contained. Users never need access to your GitHub repo. They just run `npx soloknuckle` and everything works locally.

## Security

- API keys stored in `~/.soloknuckle/config.json` (local only, never uploaded)
- You can also use env var `LLM_API_KEY` instead of storing in file
- The tool scans YOUR code for secrets — it never sends your code anywhere unless you enable `audit` with a cloud LLM
- Git hooks block direct pushes to `main`
- Agent firewall blocks destructive commands (`rm -rf`, `git push --force`, etc.)

## Updating

```bash
# If installed via npx — always gets latest
npx soloknuckle check

# If installed as dev dependency
npm update soloknuckle --save-dev
```

## Vite Plugin (Invisible Integration)

Use Soloknuckle as a build-time guardian without running CLI commands:

```bash
npm install soloknuckle --save-dev
```

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

## What It Does NOT Do

- **Not a hosting provider** — it manages rollbacks conceptually via Vercel/Railway, doesn't host code
- **Not a CI pipeline** — use GitHub Actions for remote validation
- **Doesn't write your code** — it's a hygiene layer, you write the features

## License

ISC
