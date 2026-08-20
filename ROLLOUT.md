# Rollout Strategy

## Feature Flags

All new features ship behind feature flags defined in `flags.json`. The rollout process:

1. **Development**: Feature flag is `enabled: false` — only accessible via allowlist
2. **Staging**: Flag is enabled for internal testers and staging environment
3. **Production**: Flag is gradually enabled for all users via percentage rollout
4. **Cleanup**: Once stable, flag is removed and code paths are simplified

## Current Flags

| Flag | Status | Description |
|------|--------|-------------|
| `supply-chain-sentinel` | Active | Detects supply chain compromise signals |
| `ai-agent-guardrails` | Active | Safety constraints on AI-generated code |
| `progressive-delivery` | Planned | Canary deployments and flag-driven rollouts |
| `test-coverage-cli` | Active | Local-first test coverage tracking |

## Deployment Process

1. Changes land on `develop` branch via PR
2. Staging deploy is automatically triggered
3. After staging verification, PR to `main` is merged
4. Production deploy follows with canary rollout for flag-gated features
5. Monitor telemetry for 24h before full rollout

## Rollback

Any feature can be instantly disabled by flipping its flag in `flags.json` and redeploying. No code changes required.
