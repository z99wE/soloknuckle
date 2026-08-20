import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { scanDiffForSecretsAndPII } from './scanner';
import {
  printHeader,
  printScoreSummary,
  printCheckSection,
  printSummary,
  buildIssuesFromScores,
  Issue,
  CheckResult,
} from './reporter';
import {
  getSecurityScore,
  getTestingScore,
  getAccessibilityScore,
  getDependencyScore,
  getDocumentationScore,
  getGitHygieneScore,
  getCIPipelineScore,
  getFeatureFlagsScore,
  getQualityScore,
  getEfficiencyScore,
  getPerformanceScore,
  getReliabilityScore,
  getSupplyChainScore,
  calculateMetrics,
} from './scorer';
import { evaluateGates, printGateReport, printSevenDomainScorecard } from './gates';

interface CheckOptions {
  fix?: boolean;
  verbose?: boolean;
  strict?: boolean;
  format?: string;
}

export async function runCheck(options: CheckOptions = {}): Promise<void> {
  const isJson = options.format === 'json';
  if (!isJson) printHeader();

  const allIssues: Issue[] = [];
  const scores: Record<string, number> = {};

  // 1. Security check
  const security = getSecurityScore();
  scores.secrets = security.score;
  const securityIssues: Issue[] = [];
  if (security.score < 50) {
    securityIssues.push({
      severity: 'critical',
      category: 'Security',
      message: 'Potential secrets or API keys detected',
      fix: 'Move secrets to .env and add .env to .gitignore',
    });
  } else if (security.score < 80) {
    securityIssues.push({
      severity: 'warning',
      category: 'Security',
      message: 'Some security patterns could be improved',
    });
  }
  if (!isJson) printCheckSection('Security', '\u{1F512}', { score: security.score, label: 'Security', issues: securityIssues });
  allIssues.push(...securityIssues);

  // 2. Testing check
  const testing = getTestingScore();
  scores.testing = testing.score;
  const testingIssues: Issue[] = [];
  if (testing.score < 50) {
    testingIssues.push({
      severity: 'warning',
      category: 'Testing',
      message: 'No tests found or tests are failing',
      fix: 'Add a "test" script to package.json and write tests',
    });
  }
  if (!isJson) printCheckSection('Testing', '\u{1F9EA}', { score: testing.score, label: 'Testing', issues: testingIssues });
  allIssues.push(...testingIssues);

  // 3. Quality check
  const quality = getQualityScore();
  scores.quality = quality.score;
  const qualityIssues: Issue[] = [];
  if (quality.score < 70) {
    qualityIssues.push({
      severity: 'warning',
      category: 'Quality',
      message: 'Code quality could be improved',
      fix: 'Run ESLint and fix reported issues',
    });
  }
  if (!isJson) printCheckSection('Code Quality', '\u{2728}', { score: quality.score, label: 'Quality', issues: qualityIssues });
  allIssues.push(...qualityIssues);

  // 4. Dependencies check
  const deps = getDependencyScore();
  scores.dependencies = deps.score;
  const depsIssues: Issue[] = [];
  if (deps.score < 70) {
    depsIssues.push({
      severity: 'warning',
      category: 'Dependencies',
      message: 'Vulnerable or outdated dependencies found',
      fix: 'Run npm audit fix to address known vulnerabilities',
    });
  }
  if (!isJson) printCheckSection('Dependencies', '\u{1F4E6}', { score: deps.score, label: 'Dependencies', issues: depsIssues });
  allIssues.push(...depsIssues);

  // 5. Accessibility check
  const a11y = getAccessibilityScore();
  scores.a11y = a11y.score;
  const a11yIssues: Issue[] = [];
  if (a11y.score < 70) {
    a11yIssues.push({
      severity: 'warning',
      category: 'Accessibility',
      message: 'Your app may be hard to use for people with disabilities',
      fix: 'Add alt text to images and aria-labels to interactive elements',
    });
  }
  if (!isJson) printCheckSection('Accessibility', '\u{1F441}\u{FE0F}', { score: a11y.score, label: 'Accessibility', issues: a11yIssues });
  allIssues.push(...a11yIssues);

  // 6. Documentation check
  const docs = getDocumentationScore();
  scores.docs = docs.score;
  const docsIssues: Issue[] = [];
  if (docs.score < 40) {
    docsIssues.push({
      severity: 'info',
      category: 'Documentation',
      message: 'Missing README or LICENSE',
      fix: 'Add README.md and LICENSE files',
    });
  }
  if (!isJson) printCheckSection('Documentation', '\u{1F4DD}', { score: docs.score, label: 'Documentation', issues: docsIssues });
  allIssues.push(...docsIssues);

  // 7. Git hygiene check
  const git = getGitHygieneScore();
  scores.git = git.score;
  const gitIssues: Issue[] = [];
  if (git.score < 60) {
    gitIssues.push({
      severity: 'warning',
      category: 'Git Hygiene',
      message: 'Commit messages could follow better conventions',
      fix: 'Use conventional commits: feat:, fix:, docs:, etc.',
    });
  }
  if (!isJson) printCheckSection('Git Hygiene', '\u{1F4C1}', { score: git.score, label: 'Git Hygiene', issues: gitIssues });
  allIssues.push(...gitIssues);

  // 8. CI/CD check
  const ci = getCIPipelineScore();
  scores.ci = ci.score;
  const ciIssues: Issue[] = [];
  if (ci.score < 50) {
    ciIssues.push({
      severity: 'info',
      category: 'CI/CD',
      message: 'No CI/CD pipeline detected',
      fix: 'Add GitHub Actions to catch issues before they reach production',
    });
  }
  if (!isJson) printCheckSection('CI/CD Pipeline', '\u{2699}\u{FE0F}', { score: ci.score, label: 'CI/CD', issues: ciIssues });
  allIssues.push(...ciIssues);

  // 9. Feature flags check
  const flags = getFeatureFlagsScore();
  scores.featureFlags = flags.score;
  const flagIssues: Issue[] = [];
  if (flags.score < 50) {
    flagIssues.push({
      severity: 'info',
      category: 'Feature Flags',
      message: 'No feature flag system detected',
      fix: 'Add flags.json to safely roll out changes gradually',
    });
  }
  if (!isJson) printCheckSection('Feature Flags', '\u{1F6A9}', { score: flags.score, label: 'Feature Flags', issues: flagIssues });
  allIssues.push(...flagIssues);

  // 10. Performance check (new dimension)
  const perf = getPerformanceScore();
  scores.performance = perf.score;
  const perfIssues: Issue[] = [];
  if (perf.score < 70) {
    perfIssues.push({
      severity: 'warning',
      category: 'Performance',
      message: 'Performance issues detected',
      fix: 'Review heavy dependencies and add performance budgets',
    });
  }
  if (!isJson) printCheckSection('Performance', '\u{26A1}', { score: perf.score, label: 'Performance', issues: perfIssues });
  allIssues.push(...perfIssues);

  // 11. Reliability check (new dimension)
  const rel = getReliabilityScore();
  scores.reliability = rel.score;
  const relIssues: Issue[] = [];
  if (rel.score < 70) {
    relIssues.push({
      severity: 'warning',
      category: 'Reliability',
      message: 'Reliability issues detected',
      fix: 'Add error tracking, retry logic, and health checks',
    });
  }
  if (!isJson) printCheckSection('Reliability', '\u{1F504}', { score: rel.score, label: 'Reliability', issues: relIssues });
  allIssues.push(...relIssues);

  // 12. Supply chain check (new dimension)
  const supply = getSupplyChainScore();
  scores.supplyChain = supply.score;
  const supplyIssues: Issue[] = [];
  if (supply.score < 50) {
    supplyIssues.push({
      severity: 'warning',
      category: 'Supply Chain',
      message: 'Supply chain integrity issues detected',
      fix: 'Add lock file, Dependabot, and pin dependency versions',
    });
  }
  if (!isJson) printCheckSection('Supply Chain', '\u{1F6E2}\u{FE0F}', { score: supply.score, label: 'Supply Chain', issues: supplyIssues });
  allIssues.push(...supplyIssues);

  // 13. Secrets scan (from staged changes)
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: process.cwd() });
    const diff = execSync('git diff --cached', { encoding: 'utf-8', cwd: process.cwd() });
    if (diff) {
      const violations = scanDiffForSecretsAndPII(diff);
      if (violations.length > 0) {
        violations.forEach((v) => {
          allIssues.push({
            severity: 'critical',
            category: 'Secrets',
            message: v,
            fix: 'Remove secrets from code and use environment variables',
          });
        });
      }
    }
  } catch {
    // Not a git repo or no staged changes - skip
  }

  // Calculate overall score using the unified scoring system
  const metrics = calculateMetrics();
  const totalScore = metrics.overall;

  if (isJson) {
    const jsonOutput = {
      score: totalScore,
      scores,
      issues: allIssues,
      dimensions: {
        quality: metrics.quality.score,
        testing: metrics.testing.score,
        security: metrics.security.score,
        efficiency: metrics.efficiency.score,
        accessibility: metrics.accessibility.score,
        dependencies: metrics.dependencies.score,
        documentation: metrics.documentation.score,
        gitHygiene: metrics.gitHygiene.score,
        ciPipeline: metrics.ciPipeline.score,
        featureFlags: metrics.featureFlags.score,
        performance: metrics.performance.score,
        reliability: metrics.reliability.score,
        supplyChain: metrics.supplyChain.score,
      },
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    if (allIssues.some((i) => i.severity === 'critical')) {
      process.exit(1);
    }
    return;
  }

  printScoreSummary(totalScore);
  printSummary(totalScore, allIssues);

  // 7-Domain Scorecard display
  const report = evaluateGates(metrics);
  printSevenDomainScorecard(report.scorecard);

  // Hard gates in strict mode
  if (options.strict) {
    printGateReport(report);
    if (!report.gateResult.passed) {
      console.log(chalk.red.bold('  Strict mode: blocked by hard gates. Fix failing dimensions above.'));
      process.exit(1);
    }
  }

  if (options.fix && allIssues.length > 0) {
    console.log(chalk.cyan('  \u{1F527} Attempting auto-fixes...\n'));
    await attemptFixes(allIssues);
  }

  if (allIssues.some((i) => i.severity === 'critical')) {
    process.exit(1);
  }
}

async function attemptFixes(issues: Issue[]): Promise<void> {
  let fixedCount = 0;

  for (const issue of issues) {
    if (issue.fix && issue.category === 'Dependencies') {
      try {
        console.log(chalk.dim('     Running npm audit fix...'));
        execSync('npm audit fix', { stdio: 'ignore', cwd: process.cwd() });
        console.log(chalk.green('     \u{2713} Fixed dependency issues'));
        fixedCount++;
      } catch {
        console.log(chalk.yellow('     \u{26A0}\u{FE0F} Could not auto-fix dependencies'));
      }
    }

    if (issue.category === 'Documentation') {
      const readmePath = path.join(process.cwd(), 'README.md');
      if (!fs.existsSync(readmePath)) {
        const projectName = path.basename(process.cwd());
        fs.writeFileSync(
          readmePath,
          `# ${projectName}\n\n> A project built with Soloknuckle production hygiene.\n\n## Getting Started\n\n\`\`\`bash\nnpm install\nnpm start\n\`\`\`\n\n## License\n\nISC\n`
        );
        console.log(chalk.green('     \u{2713} Created README.md'));
        fixedCount++;
      }
    }

    if (issue.category === 'CI/CD') {
      const ciDir = path.join(process.cwd(), '.github', 'workflows');
      const ciPath = path.join(ciDir, 'ci.yml');
      if (!fs.existsSync(ciPath)) {
        fs.mkdirSync(ciDir, { recursive: true });
        fs.writeFileSync(
          ciPath,
          `name: CI\n\non:\n  push:\n    branches: [main, develop]\n  pull_request:\n    branches: [main]\n\njobs:\n  quality:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n      - run: npm ci\n      - run: npm run lint\n      - run: npm test\n`
        );
        console.log(chalk.green('     \u{2713} Created .github/workflows/ci.yml'));
        fixedCount++;
      }
    }

    if (issue.category === 'Feature Flags') {
      const flagsPath = path.join(process.cwd(), 'flags.json');
      if (!fs.existsSync(flagsPath)) {
        fs.writeFileSync(
          flagsPath,
          JSON.stringify(
            {
              $schema: 'https://raw.githubusercontent.com/z99wE/soloknuckle/main/flags-schema.json',
              flags: {},
              version: 1,
            },
            null,
            2
          ) + '\n'
        );
        console.log(chalk.green('     \u{2713} Created flags.json'));
        fixedCount++;
      }
    }

    if (issue.category === 'Quality' || issue.category === 'Code Quality') {
      try {
        const pkgPath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.scripts && pkg.scripts.lint) {
            console.log(chalk.dim('     Running npm run lint -- --fix...'));
            execSync('npm run lint -- --fix', { stdio: 'ignore', cwd: process.cwd() });
            console.log(chalk.green('     \u{2713} Fixed lint issues'));
            fixedCount++;
          }
        }
      } catch {
        console.log(chalk.yellow('     \u{26A0}\u{FE0F} Could not auto-fix lint issues'));
      }
    }

    if (issue.category === 'Git Hygiene') {
      const gitDir = path.join(process.cwd(), '.git');
      if (!fs.existsSync(gitDir)) {
        console.log(chalk.dim('     Initializing git repository...'));
        execSync('git init', { stdio: 'ignore', cwd: process.cwd() });
        console.log(chalk.green('     \u{2713} Initialized git repository'));
        fixedCount++;
      }
    }

    if (issue.category === 'Security' || issue.category === 'Secrets') {
      const gitignorePath = path.join(process.cwd(), '.gitignore');
      if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(
          gitignorePath,
          `# Dependencies\nnode_modules/\n\n# Environment\n.env\n.env.local\n.env.*.local\n\n# Build\ndist/\nbuild/\n\n# IDE\n.vscode/\n.idea/\n\n# OS\n.DS_Store\nThumbs.db\n\n# Soloknuckle\n.soloknuckle/\n`
        );
        console.log(chalk.green('     \u{2713} Created .gitignore with secrets excluded'));
        fixedCount++;
      }
    }
  }

  if (fixedCount === 0) {
    console.log(chalk.dim('     No auto-fixes available for these issues.'));
  }
}
