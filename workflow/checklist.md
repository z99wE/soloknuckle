# Feature PR Checklist

Copy this into the description of every Pull Request. Tick the boxes. Don't merge until all are ticked.

## Before opening the PR

- [ ] Working on `feature/*` branch (not `develop` or `main`)
- [ ] New behavior is wrapped in a feature flag
- [ ] Flag is OFF in `flags.json` by default
- [ ] Founder email added to the flag's `allowlist`
- [ ] Tested locally — clicked through happy path
- [ ] Tested locally — clicked through sad path (empty state, error state, logged out)
- [ ] Ran the test suite (`npm test` or equivalent)
- [ ] Ran linter (`npm run lint`)
- [ ] No secrets, API keys, or `.env` files in the diff

## In the PR description

- [ ] "Why" is explained in 1–2 sentences
- [ ] Screenshot or screen-recording attached (for UI changes)
- [ ] Flag name listed (e.g. `export-csv`)
- [ ] Rollback plan written in one line: "If this breaks, flip `export-csv` to false in flags.json"
- [ ] Risk level stated: **Low** / **Medium** / **High**
- [ ] Anything touching auth/payments/data deletion is explicitly called out

## After staging deploy URL appears

- [ ] Visited the staging URL in a browser
- [ ] Logged in as a real test user
- [ ] Logged in as the founder (flag should be ON)
- [ ] Tested on phone (real device, not just DevTools mobile view)
- [ ] Tested logged-out experience (if relevant)
- [ ] Checked browser console for errors
- [ ] Checked server logs for 500s
- [ ] Asked 1 other person to click through it

## Before merging to main

- [ ] All above ticked
- [ ] PR approved (or self-approved if solo)
- [ ] "Merge to main" → wait for production deploy
- [ ] Smoke-tested on production URL with an incognito window
- [ ] Confirmed the flag works as expected in production (OFF by default)
- [ ] Posted in your founder log: "Shipped [feature] behind flag [name]"
