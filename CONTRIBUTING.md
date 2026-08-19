# Contributing to Soloknuckle

Thanks for wanting to help! Here's how to get started.

## Setup

```bash
# Clone the repo
git clone https://github.com/z99wE/soloknuckle.git
cd soloknuckle

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Development

```bash
# Run in dev mode (ts-node)
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint

# Test with coverage
npm run test:coverage
```

## Project Structure

```
soloknuckle/
├── cli/              # CLI source (TypeScript)
│   ├── index.ts      # Main entry point
│   ├── check.ts      # Human-friendly check command
│   ├── scorer.ts     # 10-dimension scoring engine
│   ├── reporter.ts   # Human-friendly output
│   ├── scanner.ts    # Secret/PII scanner
│   ├── config.ts     # Config loader
│   ├── ai-watcher.ts # AI commit detection
│   ├── budget.ts     # Budget enforcement
│   ├── rollback.ts   # Sentry webhook + auto-rollback
│   ├── mcp-server.ts # MCP server (stdio)
│   └── ...
├── ui/               # React dashboard
├── test/             # Test files (vitest)
└── index.html        # Landing page
```

## Code Style

- TypeScript strict mode
- ESLint with recommended rules
- No comments unless asked
- Follow existing patterns

## Testing

- Tests use vitest
- Run `npm test` before pushing
- Coverage threshold: 80% (currently ~70%, help us get there!)
- Test files go in `test/` directory
- Name test files `*.test.ts`

## Pull Requests

1. Fork the repo
2. Create a branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Run lint: `npm run lint`
6. Run typecheck: `npm run typecheck`
7. Commit with a clear message
8. Push and open a PR

## Commit Messages

Use conventional commits:

- `feat: add new feature`
- `fix: fix a bug`
- `docs: update documentation`
- `test: add tests`
- `refactor: refactor code`
- `chore: maintenance tasks`

## Reporting Issues

Open an issue on GitHub with:

- What you expected
- What actually happened
- Steps to reproduce
- Your OS and Node version

## License

By contributing, you agree your code is licensed under ISC.
