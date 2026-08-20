import chalk from 'chalk';
import { ScoreMetrics, GateResult, evaluateHardGates, SevenDomainScorecard, calculateSevenDomainScorecard } from './scorer';

export interface GateReport {
  gateResult: GateResult;
  scorecard: SevenDomainScorecard;
}

export function evaluateGates(metrics: ScoreMetrics): GateReport {
  return {
    gateResult: evaluateHardGates(metrics),
    scorecard: calculateSevenDomainScorecard(metrics),
  };
}

export function printGateReport(report: GateReport): void {
  const { gateResult, scorecard } = report;

  console.log(chalk.bold.cyan('\n  🛡️  Hard Gate Results'));
  console.log(chalk.dim('  ' + '─'.repeat(40)));

  for (const gate of gateResult.gates) {
    const icon = gate.passed ? chalk.green('✓') : chalk.red('✗');
    const status = gate.passed ? chalk.green('PASS') : chalk.red('FAIL');
    const scoreStr = `${gate.score}/${gate.threshold}`;
    console.log(`  ${icon} ${chalk.bold(gate.name.padEnd(14))} ${status}  ${chalk.dim(scoreStr)}`);
  }

  console.log('');
  if (gateResult.passed) {
    console.log(chalk.green.bold('  ✓ All gates passed — production-ready'));
  } else {
    const failed = gateResult.gates.filter(g => !g.passed);
    console.log(chalk.red.bold(`  ✗ ${failed.length} gate(s) failed — not production-ready`));
    for (const g of failed) {
      console.log(chalk.red(`    → ${g.name}: needs ${g.threshold}+, got ${g.score}`));
    }
  }
  console.log('');
}

export function printSevenDomainScorecard(scorecard: SevenDomainScorecard): void {
  console.log(chalk.bold.cyan('  📊  7-Domain Scorecard'));
  console.log(chalk.dim('  ' + '─'.repeat(40)));

  const statusColors: Record<string, typeof chalk.green> = {
    'production-ready': chalk.green,
    'almost-there': chalk.yellow,
    'needs-work': chalk.yellow,
    'not-ready': chalk.red,
  };

  for (const domain of scorecard.domains) {
    const color = statusColors[domain.status] || chalk.white;
    const bar = progressBar(domain.score);
    console.log(`  ${color('●')} ${chalk.bold(domain.name.padEnd(28))} ${color(domain.score.toString().padStart(3))}  ${bar}  ${chalk.dim(domain.status)}`);

    for (const dim of domain.dimensions) {
      const dimColor = dim.score >= 80 ? chalk.green : dim.score >= 50 ? chalk.yellow : chalk.red;
      console.log(`    ${chalk.dim('↳')} ${dim.name.padEnd(26)} ${dimColor(dim.score.toString().padStart(3))}`);
    }
  }

  console.log('');
  const overallColor = scorecard.overallScore >= 80 ? chalk.green : scorecard.overallScore >= 50 ? chalk.yellow : chalk.red;
  console.log(`  ${chalk.bold('Overall')}  ${overallColor(scorecard.overallScore + '/100')}  ${chalk.dim(scorecard.overallStatus)}`);
  console.log('');
}

function progressBar(score: number, width = 16): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  const color = score >= 80 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
  return color('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}
