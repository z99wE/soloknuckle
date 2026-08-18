import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { scanDiffForSecretsAndPII } from './scanner';
import { callLLM } from './llm-client';

export interface ScoreMetrics {
  quality: { score: number, rawOutput: string };
  testing: { score: number, rawOutput: string };
  security: { score: number, rawOutput: string };
  efficiency: { score: number, rawOutput: string };
  accessibility: { score: number, rawOutput: string };
  overall: number;
}

function getExecErrorOutput(e: unknown): string {
  if (e && typeof e === 'object' && 'stdout' in e) return (e as { stdout?: string }).stdout || '';
  if (e && typeof e === 'object' && 'stderr' in e) return (e as { stderr?: string }).stderr || '';
  if (e instanceof Error) return e.message;
  return String(e);
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function getQualityScore(): { score: number, rawOutput: string } {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts && pkg.scripts.lint) {
        try {
          execSync('npm run lint', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
          return { score: 100, rawOutput: 'Lint passed' };
        } catch (e: unknown) {
          const output = getExecErrorOutput(e);
          const warningCount = (output.match(/warning/ig) || []).length;
          const errorCount = (output.match(/error/ig) || []).length;
          
          let score = 100 - (errorCount * 10) - (warningCount * 5);
          if (score < 0) score = 0;
          return { score, rawOutput: output.substring(0, 1000) };
        }
      }
    }
    return { score: 50, rawOutput: 'No lint script found in package.json' };
  } catch (err: unknown) {
    return { score: 0, rawOutput: `Fatal error analyzing quality: ${getErrorMessage(err)}` };
  }
}

export function getTestingScore(): { score: number, rawOutput: string } {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts && pkg.scripts.test) {
        try {
          const output = execSync('npm run test', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
          return { score: 100, rawOutput: output.substring(0, 1000) };
        } catch (e: unknown) {
          const output = getExecErrorOutput(e);
          const failCount = (output.match(/fail/ig) || []).length;
          let score = 80 - (failCount * 20);
          if (score < 0) score = 0;
          return { score, rawOutput: output.substring(0, 1000) };
        }
      }
    }
    return { score: 0, rawOutput: 'No test script found in package.json' };
  } catch (err: unknown) {
    return { score: 0, rawOutput: `Fatal error analyzing tests: ${getErrorMessage(err)}` };
  }
}

export function getSecurityScore(): { score: number, rawOutput: string } {
  try {
    let diff = '';
    try {
      execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: process.cwd() });
      diff = execSync('git diff --cached', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
      if (!diff) diff = execSync('git diff', { encoding: 'utf-8', cwd: process.cwd(), stdio: 'pipe' });
    } catch (_e) {
      // No git repo or no diff available
    }

    const violations = scanDiffForSecretsAndPII(diff);
    if (violations.length === 0) {
      return { score: 100, rawOutput: 'No secrets or PII detected in diff.' };
    } else {
      let score = 100 - (violations.length * 25);
      if (score < 0) score = 0;
      return { score, rawOutput: violations.join('\n') };
    }
  } catch (err: unknown) {
    return { score: 0, rawOutput: `Fatal error analyzing security: ${getErrorMessage(err)}` };
  }
}

export function getEfficiencyScore(): { score: number, rawOutput: string } {
  try {
    let complexityIssues = 0;
    let report = '';
    
    const scanDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file === 'node_modules' || file === '.git') continue;
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          scanDir(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.js') || fullPath.endsWith('.jsx') || fullPath.endsWith('.tsx')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n').length;
          const nesting = (content.match(/\{/g) || []).length;
          
          if (lines > 500) {
            complexityIssues += 2;
            report += `${file} is extremely long (${lines} lines).\n`;
          }
          if (nesting > 150) {
            complexityIssues++;
            report += `${file} has deep nesting.\n`;
          }
        }
      }
    };
    
    scanDir(path.join(process.cwd(), 'src'));
    scanDir(path.join(process.cwd(), 'cli'));
    
    if (complexityIssues === 0) return { score: 100, rawOutput: 'Code structure appears highly efficient.' };
    
    let score = 100 - (complexityIssues * 10);
    if (score < 0) score = 0;
    return { score, rawOutput: report.substring(0, 1000) };
  } catch (err: unknown) {
    return { score: 0, rawOutput: `Fatal error analyzing efficiency: ${getErrorMessage(err)}` };
  }
}

export function getAccessibilityScore(): { score: number, rawOutput: string } {
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
          
          const hasButton = content.match(/<button[^>]*>/g);
          if (hasButton) {
            hasButton.forEach(btn => {
              const hasAriaLabel = btn.includes('aria-label');
              const hasAriaLabelledBy = btn.includes('aria-labelledby');
              const hasTitle = btn.includes('title=');
              if (!hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
                a11yIssues++;
                report += `Button lacks accessible name in ${file}\n`;
              }
            });
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

export function calculateMetrics(): ScoreMetrics {
  const quality = getQualityScore();
  const testing = getTestingScore();
  const security = getSecurityScore();
  const efficiency = getEfficiencyScore();
  const accessibility = getAccessibilityScore();
  
  const overall = Math.round((quality.score + testing.score + security.score + efficiency.score + accessibility.score) / 5);
  
  return {
    quality,
    testing,
    security,
    efficiency,
    accessibility,
    overall
  };
}

export async function generateSuggestions(metrics: ScoreMetrics): Promise<string[]> {
  const systemPrompt = `You are a Principal Software Architect. You are analyzing the "Vibe Score" metrics of a codebase. The scores are out of 100.
Review the provided metrics and raw output logs for the 5 pillars: Quality, Testing, Security, Efficiency, and Accessibility.
Provide EXACTLY 3-5 highly actionable, plain-English suggestions to improve the lowest scoring areas.
Return the suggestions as a JSON array of strings ONLY. No markdown, no introduction. Just the raw JSON array.
Example: ["Add 'aria-label' to the buttons in App.jsx.", "Fix the invalid hook call on line 34 in App.jsx to pass tests."]`;

  const userPrompt = JSON.stringify(metrics, null, 2);
  
  try {
    const rawReply = await callLLM(systemPrompt, userPrompt);
    let parsed: string[];
    try {
      const cleaned = rawReply.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) throw new Error('Not an array');
    } catch {
      parsed = [rawReply];
    }
    return parsed;
  } catch (e: unknown) {
    return [`Failed to generate AI suggestions: ${getErrorMessage(e)}`];
  }
}
