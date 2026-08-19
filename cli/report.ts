#!/usr/bin/env node

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { calculateMetrics } from './scorer';

interface ReportOptions {
  output?: string;
  format?: 'html' | 'json' | 'markdown';
  open?: boolean;
}

export async function runReport(options: ReportOptions = {}) {
  console.log(chalk.blue.bold('\n📊 Generating Report...\n'));

  const projectRoot = process.cwd();
  const format = options.format || 'html';
  const outputPath = options.output || path.join(projectRoot, `soloknuckle-report.${format}`);

  // Calculate metrics
  const scores = await calculateMetrics();

  // Generate report based on format
  if (format === 'json') {
    generateJsonReport(scores, outputPath);
  } else if (format === 'markdown') {
    generateMarkdownReport(scores, outputPath);
  } else {
    generateHtmlReport(scores, outputPath);
  }

  console.log(chalk.green.bold(`\n✅ Report generated: ${outputPath}\n`));

  if (options.open) {
    const { execSync } = await import('child_process');
    try {
      execSync(`open "${outputPath}"`, { stdio: 'ignore' });
      console.log(chalk.dim('Opened in default viewer.'));
    } catch {
      console.log(chalk.yellow('Could not open automatically.'));
    }
  }
}

function generateJsonReport(scores: Record<string, number>, outputPath: string) {
  const report = {
    timestamp: new Date().toISOString(),
    project: path.basename(process.cwd()),
    scores,
    overall: Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length,
  };
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}

function generateMarkdownReport(scores: Record<string, number>, outputPath: string) {
  const overall = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
  const project = path.basename(process.cwd());

  let md = `# Soloknuckle Report\n\n`;
  md += `**Project:** ${project}  \n`;
  md += `**Generated:** ${new Date().toISOString()}  \n`;
  md += `**Overall Score:** ${overall.toFixed(1)}/100\n\n`;

  md += `## Scores\n\n`;
  md += `| Category | Score |\n`;
  md += `|----------|-------|\n`;
  for (const [category, score] of Object.entries(scores)) {
    const emoji = score >= 80 ? '✅' : score >= 50 ? '⚠️' : '❌';
    md += `| ${category} | ${emoji} ${score} |\n`;
  }

  md += `\n## Recommendations\n\n`;
  const lowScores = Object.entries(scores)
    .filter(([_, score]) => score < 60)
    .sort((a, b) => a[1] - b[1]);

  if (lowScores.length === 0) {
    md += `All categories are above 60. Great job! 🎉\n`;
  } else {
    for (const [category, score] of lowScores) {
      md += `- **${category}** (${score}): Needs improvement\n`;
    }
  }

  fs.writeFileSync(outputPath, md, 'utf-8');
}

function generateHtmlReport(scores: Record<string, number>, outputPath: string) {
  const overall = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
  const project = path.basename(process.cwd());

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Soloknuckle Report - ${project}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #1a1a1a; padding: 40px 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 40px; }
    .header h1 { font-size: 2rem; margin-bottom: 10px; }
    .header .meta { color: #666; }
    .overall { text-align: center; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 30px; }
    .overall .score { font-size: 4rem; font-weight: bold; color: ${overall >= 80 ? '#22c55e' : overall >= 50 ? '#eab308' : '#ef4444'}; }
    .overall .label { color: #666; margin-top: 10px; }
    .scores { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .score-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); text-align: center; }
    .score-card .value { font-size: 1.5rem; font-weight: bold; }
    .score-card .label { color: #666; font-size: 0.9rem; margin-top: 5px; }
    .score-card.good .value { color: #22c55e; }
    .score-card.warn .value { color: #eab308; }
    .score-card.bad .value { color: #ef4444; }
    .footer { text-align: center; color: #999; margin-top: 40px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔧 Soloknuckle Report</h1>
      <div class="meta">${project} • ${new Date().toLocaleDateString()}</div>
    </div>

    <div class="overall">
      <div class="score">${overall.toFixed(1)}</div>
      <div class="label">Overall Health Score</div>
    </div>

    <div class="scores">
      ${Object.entries(scores).map(([category, score]) => {
        const cls = score >= 80 ? 'good' : score >= 50 ? 'warn' : 'bad';
        return `
      <div class="score-card ${cls}">
        <div class="value">${score}</div>
        <div class="label">${category}</div>
      </div>`;
      }).join('')}
    </div>

    <div class="footer">
      Generated by Soloknuckle • ${new Date().toISOString()}
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
}
