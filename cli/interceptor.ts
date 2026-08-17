import chalk from 'chalk';

const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bsudo\s+rm\b/, reason: 'Sudo rm detected' },
  { pattern: /\brm\s+(-\w*\s+)*-\w*r\w*f\b/, reason: 'Recursive force delete detected' },
  { pattern: /\brm\s+(-\w*\s+)*-\w*f\w*r\b/, reason: 'Recursive force delete detected (alt flag order)' },
  { pattern: /\brm\s+-\w*r\w*\s+-\w*f\b/, reason: 'Recursive force delete detected (spaced flags)' },
  { pattern: /\brm\s+-\w*f\w*\s+-\w*r\b/, reason: 'Recursive force delete detected (spaced flags)' },
  { pattern: /\brm\s+-rf\b/, reason: 'Recursive force delete detected' },
  { pattern: /\brm\s+-fr\b/, reason: 'Recursive force delete detected' },
  { pattern: /\bdrop\s+(database|table|schema)\b/i, reason: 'Destructive SQL drop detected' },
  { pattern: /\bdelete\s+from\b.*\bwhere\b/i, reason: 'Bulk SQL delete without specific ID' },
  { pattern: /\btruncate\s+(table\s+)?\w/i, reason: 'SQL truncate detected' },
  { pattern: /\bgit\s+push\s+(--force|-f)\b/, reason: 'Force push detected' },
  { pattern: /\bgit\s+push\s+--force-with-lease\b/, reason: 'Force push (with lease) detected' },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: 'Hard reset detected' },
  { pattern: /\bgit\s+clean\s+-fd\b/, reason: 'Git clean (removes untracked files) detected' },
  { pattern: /\bmv\s+.*\s+\/dev\/null\b/, reason: 'Moving to /dev/null (data loss) detected' },
  { pattern: /\bchmod\s+777\b/, reason: 'Overly permissive chmod detected' },
  { pattern: /\bchmod\s+-R\s+777\b/, reason: 'Recursive overly permissive chmod detected' },
  { pattern: /\bcurl\b.*\|\s*(ba)?sh\b/, reason: 'Piping remote script to shell detected' },
  { pattern: /\bwget\b.*\|\s*(ba)?sh\b/, reason: 'Piping remote script to shell detected' },
  { pattern: /\bmkfs\b/, reason: 'Filesystem format command detected' },
  { pattern: /\bdd\s+if=.*of=\/dev\/\w/, reason: 'Raw disk write detected' },
];

export interface InterceptionResult {
  blocked: boolean;
  reason?: string;
  jsonResponse?: string;
}

/**
 * Intercepts shell commands to block destructive actions.
 * Returns a structured JSON error to force agent self-correction.
 */
export function interceptCommand(command: string): InterceptionResult {
  for (const { pattern, reason } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) {
      console.log(chalk.red(`[Firewall Blocked] ${reason}`));

      const jsonResponse = JSON.stringify({
        error: 'ACTION_BLOCKED_BY_SOLOKNUCKLE_FIREWALL',
        message: 'You attempted a destructive action that violates project constraints.',
        attempted_command: command,
        suggestion: 'Please use a safer alternative or request human approval.',
        reason
      }, null, 2);

      return { blocked: true, reason, jsonResponse };
    }
  }

  return { blocked: false };
}
