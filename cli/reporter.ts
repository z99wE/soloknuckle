import chalk from 'chalk';

export interface Issue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  file?: string;
  line?: number;
  fix?: string;
}

export interface CheckResult {
  score: number;
  label: string;
  issues: Issue[];
}

const SEVERITY_ICON: Record<string, string> = {
  critical: '\u{1F534}',
  warning: '\u{1F7E1}',
  info: '\u{1F535}',
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'BLOCKER',
  warning: 'Fix this',
  info: 'FYI',
};

function scoreLabel(score: number): { label: string; color: typeof chalk } {
  if (score >= 90) return { label: 'Production-ready', color: chalk.green };
  if (score >= 70) return { label: 'Almost there', color: chalk.yellow };
  if (score >= 50) return { label: 'Needs work', color: chalk.yellow };
  return { label: 'Not ready', color: chalk.red };
}

function progressBar(score: number, width = 20): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const color = score >= 80 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
  return color('\u{2588}'.repeat(filled)) + chalk.dim('\u{2591}'.repeat(empty));
}

export function printHeader(): void {
  console.log('');
  console.log(chalk.bold.cyan('  Soloknuckle \u{1F6E1}\u{FE0F}  Production Readiness Check'));
  console.log(chalk.dim('  \u{2500}'.repeat(40)));
  console.log('');
}

export function printScoreSummary(score: number): void {
  const { label, color } = scoreLabel(score);
  console.log(`  Your code is ${chalk.bold.cyan(score + '/100')} \u{2014} ${color(label)}`);
  console.log(`  ${progressBar(score)}`);
  console.log('');
}

export function printCheckSection(name: string, emoji: string, result: CheckResult): void {
  const { label, color } = scoreLabel(result.score);
  console.log(`  ${emoji} ${chalk.bold(name)}: ${color(result.score + '/100')} ${chalk.dim(`(${label})`)}`);
  
  if (result.issues.length === 0) {
    console.log(chalk.green('     \u{2713} No issues found'));
  } else {
    result.issues.forEach((issue) => {
      const icon = SEVERITY_ICON[issue.severity];
      const fileRef = issue.file ? chalk.dim(` in ${issue.file}${issue.line ? ':' + issue.line : ''}`) : '';
      console.log(`     ${icon} ${chalk.bold(SEVERITY_LABEL[issue.severity])}: ${issue.message}${fileRef}`);
      if (issue.fix) {
        console.log(chalk.cyan(`       \u{2192} ${issue.fix}`));
      }
    });
  }
  console.log('');
}

export function printSummary(totalScore: number, allIssues: Issue[]): void {
  const criticals = allIssues.filter((i) => i.severity === 'critical');
  const warnings = allIssues.filter((i) => i.severity === 'warning');
  
  console.log(chalk.dim('  \u{2500}'.repeat(40)));
  console.log('');
  
  if (criticals.length === 0 && warnings.length === 0) {
    console.log(chalk.green.bold('  \u{2713} All clear! Your code is ready to ship.'));
  } else {
    if (criticals.length > 0) {
      console.log(chalk.red.bold(`  \u{2717} ${criticals.length} blocker${criticals.length > 1 ? 's' : ''} found \u{2014} fix before shipping`));
    }
    if (warnings.length > 0) {
      console.log(chalk.yellow(`  \u{26A0}\u{FE0F}  ${warnings.length} warning${warnings.length > 1 ? 's' : ''} \u{2014} recommended to fix`));
    }
    console.log('');
    console.log(chalk.dim('  Run with --fix to auto-fix what we can.'));
  }
  console.log('');
}

export function buildIssuesFromScores(scores: Record<string, number>): Issue[] {
  const issues: Issue[] = [];

  if (scores.secrets > 0 && scores.secrets < 50) {
    issues.push({
      severity: 'critical',
      category: 'Security',
      message: 'Potential secrets or API keys detected in your code',
      fix: 'Move secrets to .env file and add .env to .gitignore',
    });
  }

  if (scores.a11y < 70) {
    issues.push({
      severity: 'warning',
      category: 'Accessibility',
      message: 'Your code has accessibility issues that affect users with disabilities',
      fix: 'Add alt text to images and aria-labels to buttons',
    });
  }

  if (scores.testing < 50) {
    issues.push({
      severity: 'warning',
      category: 'Testing',
      message: 'No tests found or tests are failing',
      fix: 'Add a "test" script to package.json and write tests for critical paths',
    });
  }

  if (scores.dependencies < 70) {
    issues.push({
      severity: 'warning',
      category: 'Dependencies',
      message: 'Outdated or vulnerable dependencies detected',
      fix: 'Run npm audit fix and update outdated packages',
    });
  }

  if (scores.featureFlags < 50) {
    issues.push({
      severity: 'info',
      category: 'Feature Flags',
      message: 'No feature flag system detected',
      fix: 'Add a flags.json to safely roll out changes to users gradually',
    });
  }

  if (scores.ci < 50) {
    issues.push({
      severity: 'info',
      category: 'CI/CD',
      message: 'No CI/CD pipeline detected',
      fix: 'Add GitHub Actions or GitLab CI to catch issues automatically',
    });
  }

  if (scores.docs < 40) {
    issues.push({
      severity: 'info',
      category: 'Documentation',
      message: 'Missing README or LICENSE file',
      fix: 'Add a README.md explaining what your project does and how to use it',
    });
  }

  if (scores.git < 60) {
    issues.push({
      severity: 'warning',
      category: 'Git Hygiene',
      message: 'Commit messages don\'t follow best practices',
      fix: 'Use conventional commits: feat:, fix:, docs:, etc.',
    });
  }

  return issues;
}
