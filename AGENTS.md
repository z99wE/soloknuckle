# AGENTS.md — Production Hygiene Rules

> **STOP. Read this file fully before writing a single line of code.**
> You are working on a LIVE app with real users. Treat production like a hospital operating room.

## 1. The Three Environments

| Environment | Branch | URL pattern | Who sees it | When to touch |
|---|---|---|---|---|
| **Local** | `feature/*` | `localhost:3000` | Only the developer | Always — this is your workshop |
| **Staging** | `develop` | `<app>-staging.vercel.app` | Dev + invited testers only | Every PR — test here FIRST |
| **Production** | `main` | `<app>.com` | Real users with logins | NEVER touch directly. Only via merge from `develop` after staging passes. |

**Hard rule:** You may NEVER commit to `main` or `develop` directly. Always work on a `feature/*` branch and open a Pull Request.

## 2. Feature Flag Mandate

Every new feature, change, or experiment MUST be wrapped in a feature flag before it ships to production. No exceptions.

```ts
// ✅ CORRECT — feature behind a flag
if (flags.isEnabled('export-csv', { userId: user.id })) {
  showExportButton();
}

// ❌ WRONG — feature ships to everyone immediately
showExportButton();
```

**Default state of every new flag:** OFF for all users except the developer (matched by email or userId allowlist).

## 3. Workflow Per Task

When asked to build anything, follow this exact sequence. Do not skip steps.

1. **Read** `/workflow/checklist.md` (if it exists) to understand prior decisions.
2. **Branch:** `git checkout develop && git pull && git checkout -b feature/<short-kebab-name>`
3. **Build** on local. Wrap every new behavior in a flag.
4. **Self-test** locally. Run the project's test suite. Run `npm run lint`. Run `npm run typecheck` if it exists.
5. **Commit** with a message that explains *why*, not what:
   ```
   feat(export): add CSV export wrapped in `export-csv` flag

   - Why: users asked for it in #42, founder wants to test on self first
   - Flag: export-csv (default OFF, allowlist: founder@email.com)
   - Tested: locally + staging preview URL pending
   ```
6. **Push & open PR** to `develop`. Wait for the staging deploy URL in the PR comments.
7. **Test on staging.** Click through the feature. Check on mobile. Check logged-out and logged-in.
8. **Only after staging is clean:** merge PR → `develop` → open PR to `main` → merge.
9. **Verify production** by visiting the live URL with an incognito window.

## 4. Rollback Plan (Required for Every Change)

Before merging anything, you must be able to answer:
- How do I turn this off if it breaks? (answer: flip the flag)
- How do I roll back the code? (answer: `git revert` the merge commit, or hit "rollback" in Vercel/Railway dashboard)

If you cannot answer both, do not merge.

## 5. Quality Gates (run on every commit, block if failing)

Before any commit lands, the pre-commit hook runs ALL of these. If any fail, the commit is refused and the developer is told what to fix.

| Gate | Tool | Pass criteria |
|---|---|---|
| Lint | `npm run lint` (or `eslint .`) | 0 errors, 0 warnings |
| Types | `npm run typecheck` (or `tsc --noEmit`) | 0 errors |
| Tests | `npm test` | all passing |
| Secrets scan | `gitleaks` (built into the hook) | no `.env`, `*.pem`, API keys, tokens |
| A11y (web) | grep + axe hint rules | all `<img>` have `alt`, all `<button>` have accessible name |
| Bundle size | size-limit or rollup-plugin-visualizer | route bundle ≤ 200KB gzipped |
| Forbidden imports | grep | no `eval`, no `dangerouslySetInnerHTML` without escape, no `child_process.exec` with user input |

If a project doesn't have `npm run lint` / `npm run typecheck` set up, the AI must add them as part of the first change.

## 6. Security Baseline

Every change must respect these. If you can't, ask first.

- **No secrets in code.** Never hardcode API keys, tokens, DB URIs. Use env vars + a secrets manager.
- **No PII in logs.** Strip emails, IDs, tokens from log lines.
- **No raw SQL.** Use parameterized queries / an ORM. No string concatenation into queries.
- **No `eval` / `new Function` / `dangerouslySetInnerHTML`** without an explicit, commented reason.
- **Input validation at every boundary.** API endpoints validate body shape with zod / yup / class-validator.
- **AuthZ checks on every mutating route.** Authentication ≠ authorization. A logged-in user cannot see another user's data.
- **Dependencies from known registries only.** No `npm install <random-tarball-url>`.
- **HTTPS everywhere.** No `http://` links in production UI.

## 7. Accessibility Baseline (web projects)

- All images have `alt` text. Decorative images use empty `alt=""`.
- All interactive elements keyboard-reachable, with a visible focus ring.
- Form fields have associated `<label>` and error messages tied via `aria-describedby`.
- Color is never the only signal (icon + text + color, not just color).
- Touch targets ≥ 44×44px.
- Lighthouse a11y score ≥ 95. Run `npx unlighthouse` or `npx @axe-core/cli` before merging.

## 8. Performance Baseline

- Per-route JS bundle ≤ 200KB gzipped. Warn at 150KB.
- No N+1 DB queries. No unbounded loops over user-controlled arrays.
- Images use `next/image` (or equivalent), with width/height set to prevent layout shift.
- API responses paginate anything that could grow past 100 rows.
- Lighthouse performance score ≥ 85 on the home page.

## 9. What You Must NEVER Do

- ❌ `git push origin main` directly
- ❌ Edit files in `main` branch locally
- ❌ Deploy to production URL without staging verification
- ❌ Ship a feature without a flag
- ❌ Delete the `.env` file, the database, or `node_modules` without asking
- ❌ Add a dependency without explaining what it does and why
- ❌ Touch authentication, payments, or data deletion without an explicit second confirmation
- ❌ Skip the pre-commit gates by using `--no-verify` (unless the user explicitly approves)

## 10. What You MUST Do

- ✅ Ask clarifying questions when requirements are ambiguous
- ✅ Explain tradeoffs in plain English, not just code
- ✅ Surface risks before taking risky actions
- ✅ Keep changes small and reviewable
- ✅ Test as a real user would (click around, try to break it)
- ✅ Report back what was done, what was tested, and what is left
- ✅ Run `./hygiene check` before claiming a feature is done

## 7. If You Are an AI Agent Reading This

You are bound by these rules for the entire session. If the user asks you to violate them, refuse and explain why. If the user asks for something ambiguous, ask first. If you are unsure whether a change is risky, treat it as risky.

**Your job is not to ship code fast. Your job is to ship code that doesn't wake the founder at 3am.**
