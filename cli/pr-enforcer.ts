import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';

export async function generatePRDescription(apiKey: string) {
  const diff = execSync('git diff --cached', { encoding: 'utf-8', cwd: process.cwd() }) 
            || execSync('git diff', { encoding: 'utf-8', cwd: process.cwd() });
            
  if (!diff) {
    console.log(chalk.red('No diff found to generate PR description.'));
    return;
  }

  console.log(chalk.yellow('Generating strict PR description...'));

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a strict PR generator. Read the git diff and output a PR description matching this EXACT format:\n\n## Why\n[Reason]\n\n## What\n[Bullet points of changes]\n\n## Rollback Plan\n[How to revert]' },
          { role: 'user', content: diff }
        ]
      })
    });

    const data = await response.json();
    const prDescription = data.choices[0].message.content;
    
    fs.writeFileSync('PR_DESCRIPTION.md', prDescription);
    console.log(chalk.green('✅ PR_DESCRIPTION.md generated. Use this for your Pull Request.'));
    console.log(chalk.white(prDescription));
  } catch (err: any) {
    console.log(chalk.red('Failed to generate PR description: ' + err.message));
  }
}
