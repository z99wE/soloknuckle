---
name: production-hygiene
description: Enforces production safety, feature flags, staging-only deploys, accessibility, and security for solo-founder apps. Auto-loads when user mentions building/shipping/adding/pushing/deploying code, feature flags, staging, or production.
metadata:
  type: skill
---

# Production Hygiene — Auto-Enforced

This skill loads automatically. If the user is asking you to build, ship, push, or deploy anything to a live app, you MUST follow every rule below. Do not ask whether to follow them. Just follow them.

## When to activate

Trigger on any of:
- "build", "add", "ship", "deploy", "push", "fix", "create" — combined with code/app/feature/website/API
- "feature flag", "rollout", "A/B test", "kill switch"
- "staging", "production", "rollback", "hotfix"
- "users will see", "live app", "real users"

If unsure, read the project's `AGENTS.md` — if it exists, the rules apply.

## The non-negotiable rules

### Branch discipline
- Work only on `feature/*` branches. Never edit `main` or `develop` directly.
- One feature = one branch = one PR.
- Branch name format: `feature/<verb>-<noun>` (e.g. `feature/export-csv`, `fix/login-redirect`).

### Feature flags (default OFF)
- Every new feature, change, or experiment MUST be wrapped in a flag.
- Default state: OFF for everyone. ON only for the founder's email allowlist.
- Use the project's `FeatureFlag` component / `useFeatureFlag` hook / `isEnabled` helper.
- Never ship raw new behavior to production.

### Quality gates (run before committing)
Every commit must pass:
1. **Lint:** `npm run lint` (or `pnpm lint` / `yarn lint`)
2. **Typecheck:** `npm run typecheck` (TypeScript projects)
3. **Tests:** `npm test` — all passing
4. **Accessibility (web only):** no new images without `alt`, no `<button>` without accessible name, color contrast ≥ 4.5:1
5. **Security:** no hardcoded secrets, no `dangerouslySetInnerHTML` without escaping, no `eval`, dependencies from a known registry only

If any gate fails, **block the commit** and tell the user what's broken.

### Security & data
- Never log tokens, passwords, PII, or session cookies.
- Never commit `.env`, `*.pem`, `*.key`, or credentials.
- Auth, payments, data deletion, schema migrations → **ask the user explicitly before touching**.
- Dependencies: prefer well-known packages (≥10k weekly downloads, maintained within last 6 months). If you must add an obscure dep, flag it and explain why.

### Accessibility (a11y) baseline for web
- All images: `alt` text (empty `alt=""` only for decorative).
- All interactive elements: keyboard accessible, visible focus ring.
- Form inputs: associated `<label>`, error messages tied via `aria-describedby`.
- Color is never the only signal (e.g. error + icon + text, not just red).
- Target size ≥ 44×44px on touch.
- Run `axe` or Lighthouse a11y audit before merging. Target score ≥ 95.

### Performance
- Bundle size per route: ≤ 200KB gzipped. Warn at 150KB.
- No N+1 queries. No unbounded loops on user-controlled arrays.
- Images: prefer `next/image` or equivalent, with `width`/`height` set.
- API responses: paginate anything that could grow beyond 100 rows.

### Staging → Production flow
1. `feature/*` branch → push → open PR to `develop`
2. Wait for staging URL in PR comments → click through manually
3. PR to `main` → smoke test on production URL with incognito
4. Flag stays OFF for everyone until user flips it in `flags.json`

### Communication
- User is a non-coder solo founder. Explain tradeoffs in plain English.
- Before risky actions (auth, payments, data, schema): surface the risk, propose the safer path, wait for confirmation.
- After every change: report what you did, what you tested, what the rollback plan is.

## Quick reference commands

```bash
# Run all quality gates
./hygiene check

# Flip a feature on for yourself only
./hygiene flag-on <flag-name> --founder-email you@email.com

# Flip a feature on for everyone
./hygiene flag-on <flag-name> --rollout 100

# Kill switch
./hygiene flag-off <flag-name>

# Open a properly-named branch
./hygiene branch export-csv

# See the current state
./hygiene status
```

## What you must NEVER do
- `git push origin main` or `git push origin develop`
- Edit code in `main` or `develop` branch
- Ship a feature without a flag
- Touch auth/payments/data without asking
- Add an unfamiliar dependency without explaining
- Skip the staging step

## What you MUST do
- Read `AGENTS.md` first if it exists
- Read the project's existing patterns before adding new ones
- Ask when requirements are ambiguous
- Surface risks before taking them
- Test as a real user would

**Your job is not to ship code fast. Your job is to ship code that doesn't wake the founder at 3am.**
