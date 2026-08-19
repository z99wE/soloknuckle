# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Soloknuckle, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: [INSERT YOUR EMAIL HERE]

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 1 week
- **Resolution timeline:** Depends on severity

### What We Promise

- We will respond to your report within 48 hours
- We will work with you to understand and address the issue
- We will credit you in the release notes (unless you prefer to remain anonymous)
- We will not take legal action against researchers who report vulnerabilities in good faith

### What We Ask

- Do not publicly disclose the vulnerability until we have released a fix
- Do not exploit the vulnerability beyond what is necessary to demonstrate it
- Do not access or modify data that does not belong to you

## Security Best Practices for Users

### Installation

```bash
# Verify package integrity
npm audit signatures

# Check for known vulnerabilities
npm audit

# Install with provenance verification
npm install soloknuckle --provenance
```

### Configuration

- API keys are stored locally in `~/.soloknuckle/config.json`
- Never commit this file to version control
- Use environment variables when possible (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.)
- Rotate API keys regularly

### Runtime

- Soloknuckle runs locally — code is not sent to external services unless you explicitly enable LLM features
- LLM features send code to third-party providers (OpenAI, Anthropic, etc.) — review their privacy policies
- The command firewall blocks destructive commands but is not foolproof — always review changes before committing

### Network

- The Express API server binds to `localhost` only by default
- CORS is restricted to localhost origins
- Rate limiting prevents abuse of LLM endpoints
- Body size limits prevent memory exhaustion attacks

## Dependency Security

- We use `npm audit` to check for known vulnerabilities
- Dependencies are pinned to specific versions in `package-lock.json`
- CI runs security audits on every pull request
- We do not use `--ignore-scripts` during development (but recommend it for production installs)

## Data Handling

- **No telemetry by default** — Soloknuckle does not phone home
- **Local storage only** — all data stays in `~/.soloknuckle/`
- **No PII collection** — we do not collect names, emails, or usage data
- **Optional LLM features** — only enabled if you configure an API key

## Supply Chain Security

- Package provenance via npm `--provenance` flag
- CI runs on GitHub Actions with pinned action versions
- No automated publishing — manual release only
- `npm audit signatures` verifies registry signatures

## Contact

For security inquiries, contact: [INSERT YOUR EMAIL HERE]
