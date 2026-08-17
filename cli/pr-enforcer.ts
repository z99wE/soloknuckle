import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';
import { callLLM } from './llm-client';
import { logTelemetry } from './telemetry';

export async function generatePRDescription(_apiKey: string) {
  const diff = execSync('git diff --cached', { encoding: 'utf-8', cwd: process.cwd() }) 
            || execSync('git diff', { encoding: 'utf-8', cwd: process.cwd() });
            
  if (!diff) {
    console.log(chalk.red('No diff found to generate PR description.'));
    return;
  }

  console.log(chalk.yellow('Generating strict PR description...'));

  try {
    const systemPrompt = 'You are a strict PR generator. Read the git diff and output a PR description matching this EXACT format:\n\n## Why\n[Reason]\n\n## What\n[Bullet points of changes]\n\n## Rollback Plan\n[How to revert]';
    const prDescription = await callLLM(systemPrompt, diff);
    logTelemetry(true, diff ? diff.split('\n').length : 0);
    
    fs.writeFileSync('PR_DESCRIPTION.md', prDescription);
    console.log(chalk.green('✅ PR_DESCRIPTION.md generated. Use this for your Pull Request.'));
    console.log(chalk.white(prDescription));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red('Failed to generate PR description: ' + msg));
  }
}
