import chalk from 'chalk';

const SECRET_PATTERNS = [
  /sk_live_[0-9a-zA-Z]{24}/,  // Stripe live key
  /xoxb-[0-9A-Za-z\-]+/,      // Slack bot token
  /api[_-]?key[_-]?([0-9a-zA-Z]+)/i, // Generic API key pattern
];

const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // Email address
  /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/, // SSN-like
];

export function scanDiffForSecretsAndPII(diff: string): string[] {
  const violations: string[] = [];

  const lines = diff.split('\n');
  lines.forEach((line, index) => {
    // Only scan additions
    if (!line.startsWith('+') || line.startsWith('+++')) return;

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        violations.push(`Line ${index + 1}: Potential secret/API key detected.`);
      }
    }
    for (const pattern of PII_PATTERNS) {
      if (pattern.test(line) && !line.includes('example.com') && !line.includes('test@')) {
        violations.push(`Line ${index + 1}: Potential PII (Email/SSN) detected.`);
      }
    }
  });

  return violations;
}
