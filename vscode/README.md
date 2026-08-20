# Soloknuckle — Production Hygiene for VS Code

Production hygiene for AI-assisted development. Catch secrets, destructive commands, flaky tests, and coverage illusions before they ship.

## Features

- **Health Score** — status bar shows your project's score out of 100 at a glance
- **Dashboard** — sidebar panel with score ring, dimension breakdown, and violation list
- **Violations Tree** — grouped by dimension, click to jump to file and line
- **Diagnostics** — violations appear as squiggly underlines in the editor
- **Auto-Check** — runs health check on every file save (configurable)
- **Auto-Fix** — one-click fix for common violations
- **Full Audit** — deep audit with JSON output in the output panel

## Commands

| Command | Description |
|---|---|
| `Soloknuckle: Run Health Check` | Run the standard health check |
| `Soloknuckle: Initialize` | Set up `.soloknuckle.config.json` in the project |
| `Soloknuckle: Run Full Audit` | Run the comprehensive audit |
| `Soloknuckle: Auto-Fix Violations` | Attempt automatic fixes |
| `Soloknuckle: Open Dashboard` | Focus the sidebar dashboard |
| `Soloknuckle: Show Score` | Quick pick showing current score |
| `Soloknuckle: Refresh` | Force re-run and refresh all views |

## Requirements

- `soloknuckle` CLI installed globally (`npm i -g soloknuckle`) or accessible on PATH
- Node.js 20+

## Configuration

| Setting | Default | Description |
|---|---|---|
| `soloknuckle.autoCheck` | `true` | Run check on file save |
| `soloknuckle.strictMode` | `false` | Warnings become errors |
| `soloknuckle.enableTelemetry` | `true` | Anonymous usage telemetry |
| `soloknuckle.cliPath` | `""` | Custom path to soloknuckle binary |

## Score Dimensions

The extension evaluates 13 dimensions across 7 domains:

- **Quality**: Code Quality, Testing, Security, Efficiency
- **Standards**: Accessibility, Dependencies, Documentation
- **DevOps**: Git Hygiene, CI/CD Pipeline, Feature Flags
- **Operations**: Performance, Reliability, Supply Chain

## License

ISC
