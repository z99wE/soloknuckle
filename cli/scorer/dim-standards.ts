import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { getErrorMessage, fileExists } from './helpers';
import type { DimensionScore } from './types';
export function getAccessibilityScore(): DimensionScore {
  try {
    let a11yIssues = 0;
    let report = '';

    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === 'node_modules' || file === '.git') continue;
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          scanDir(fullPath);
        } else if (fullPath.endsWith('.html') || fullPath.endsWith('.jsx') || fullPath.endsWith('.tsx')) {
          const content = fs.readFileSync(fullPath, 'utf-8');

          const hasImg = content.match(/<img[^>]*>/g);
          if (hasImg) {
            hasImg.forEach(img => {
              if (!img.includes('alt=')) {
                a11yIssues++;
                report += `Missing alt tag on img in ${file}\n`;
              }
            });
          }

          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('<button')) {
              const windowEnd = Math.min(i + 3, lines.length);
              const btnWindow = lines.slice(i, windowEnd).join(' ');
              const hasAriaLabel = btnWindow.includes('aria-label');
              const hasAriaLabelledBy = btnWindow.includes('aria-labelledby');
              const hasTitle = btnWindow.includes('title=');
              if (!hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
                a11yIssues++;
                report += `Button lacks accessible name in ${file}:${i + 1}\n`;
              }
            }
          }
        }
      }
    };

    scanDir(path.join(process.cwd(), 'ui', 'src'));
    scanDir(path.join(process.cwd(), 'src'));

    if (a11yIssues === 0) return { score: 100, rawOutput: 'No obvious accessibility violations found.' };

    let score = 100 - (a11yIssues * 15);
    if (score < 0) score = 0;
    return { score, rawOutput: report.substring(0, 1000) };
  } catch (err: unknown) {
    return { score: 0, rawOutput: `Fatal error analyzing accessibility: ${getErrorMessage(err)}` };
  }
}

// ─── New 5 Dimensions ──────────────────────────────────────────────────────

export function getDependencyScore(): DimensionScore {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
    const hasLockFile = lockFiles.some(f => fileExists(f));

    if (!fs.existsSync(pkgPath)) {
      return { score: 50, rawOutput: 'No package.json found.' };
    }

    let score = 100;
    let report = '';

    // Check for lock file
    if (!hasLockFile) {
      score -= 30;
      report += 'No lock file found. Reproducible installs are not guaranteed.\n';
    }

    // Check for known vulnerability patterns in package.json
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      const depCount = Object.keys(allDeps || {}).length;

      if (depCount > 100) {
        score -= 15;
        report += `High dependency count (${depCount}). Consider auditing for unused deps.\n`;
      } else if (depCount > 50) {
        score -= 5;
        report += `Moderate dependency count (${depCount}).\n`;
      }

      // Check for deprecated / known problematic packages
      const riskyPkgs = ['request', 'moment', 'lodash', 'webpack-dev-server'];
      for (const pkg of riskyPkgs) {
        if (allDeps && allDeps[pkg]) {
          score -= 5;
          report += `'${pkg}' is deprecated or has known issues. Consider replacing it.\n`;
        }
      }
    } catch {
      // skip
    }

    // Try `npm audit` if available
    try {
      const auditOutput = execSync('npm audit --json 2>/dev/null', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe', timeout: 15000 });
      const audit = JSON.parse(auditOutput);
      const vulnCount = audit.metadata?.vulnerabilities?.total || 0;
      const criticalCount = audit.metadata?.vulnerabilities?.critical || 0;
      const highCount = audit.metadata?.vulnerabilities?.high || 0;

      if (criticalCount > 0) {
        score -= 30;
        report += `${criticalCount} critical vulnerabilities found!\n`;
      }
      if (highCount > 0) {
        score -= 15;
        report += `${highCount} high-severity vulnerabilities found.\n`;
      }
      if (vulnCount === 0) {
        report += 'npm audit: no known vulnerabilities.\n';
      } else {
        report += `npm audit: ${vulnCount} total vulnerabilities.\n`;
      }
    } catch {
      // npm audit failed — might not have lock file or network
    }

    if (score < 0) score = 0;
    return { score, rawOutput: report || 'Dependencies look healthy.' };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking dependencies: ${getErrorMessage(err)}` };
  }
}

export function getDocumentationScore(): DimensionScore {
  try {
    let score = 0;
    let report = '';

    const checks: { file: string; points: number; label: string }[] = [
      { file: 'README.md', points: 30, label: 'README' },
      { file: 'LICENSE', points: 20, label: 'LICENSE' },
      { file: 'CHANGELOG.md', points: 15, label: 'CHANGELOG' },
      { file: 'CONTRIBUTING.md', points: 10, label: 'CONTRIBUTING' },
      { file: 'SECURITY.md', points: 10, label: 'SECURITY' },
      { file: 'DISCLAIMER.md', points: 5, label: 'DISCLAIMER' },
    ];

    for (const check of checks) {
      if (fileExists(check.file)) {
        score += check.points;
        // Check if file has meaningful content (not just stub)
        const content = fs.readFileSync(path.join(process.cwd(), check.file), 'utf-8');
        if (content.length > 100) {
          report += `${check.label}: present and detailed.\n`;
        } else {
          score -= Math.floor(check.points / 2);
          report += `${check.label}: present but minimal (< 100 chars).\n`;
        }
      } else {
        report += `${check.label}: missing.\n`;
      }
    }

    // Check for JSDoc/TSDoc in source
    const srcDirs = ['src', 'cli', 'lib'];
    let docBlocks = 0;
    for (const dir of srcDirs) {
      const fullDir = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullDir)) continue;
      const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(fullDir, file), 'utf-8');
        docBlocks += (content.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
      }
    }
    if (docBlocks > 10) {
      score += 10;
      report += `Good inline documentation (${docBlocks} JSDoc blocks).\n`;
    } else if (docBlocks > 0) {
      score += 5;
      report += `Some inline documentation (${docBlocks} JSDoc blocks).\n`;
    }

    if (score > 100) score = 100;
    return { score, rawOutput: report || 'Documentation status unknown.' };
  } catch (err: unknown) {
    return { score: 50, rawOutput: `Error checking docs: ${getErrorMessage(err)}` };
  }
}
