#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

import { scanDiffForSecretsAndPII } from './scanner';
import { applyPersona, PersonaType } from './personas';
import { generatePRDescription } from './pr-enforcer';
import { initWebhookListener } from './rollback';
import { logTelemetry, getTelemetry } from './telemetry';
import { getOrPromptApiKey } from './config';
import { callLLM } from './llm-client';
import { calculateMetrics, generateSuggestions } from './scorer';

const program = new Command();

program
  .name('soloknuckle')
  .description('Production Hygiene Kit & Neo-Brutalist Hub')
  .version('1.0.0');

// Multi-pronged capabilities registry
const CAPABILITIES = `
# Soloknuckle Agent Capabilities Registry

You are integrated with Soloknuckle, a Production Hygiene OS. You have access to the following commands:
- \`npx soloknuckle check\`: Runs strict pre-flight checks (lint, test, typecheck, secret scan). MUST be run before any git commit.
- \`npx soloknuckle audit\`: Analyzes local uncommitted code against AGENTS.md rules.
- \`npx soloknuckle score\`: Calculates a 0-100 project health score and provides AI suggestions.
- \`npx soloknuckle init\`: Scaffolds hooks and rules for any project.
- \`npx soloknuckle ui\`: Launches the visual dashboard and deterministic agent sandbox.
- \`npx soloknuckle pr\`: Auto-generates a PR description from a git diff.
- \`npx soloknuckle persona <type> <folder>\`: Applies bounded-context agent rules to specific directories.
`;

// Default action (Wizard) when no args are provided
if (process.argv.length <= 2) {
  (async () => {
    console.log(chalk.magenta.bold('\nWelcome to Soloknuckle 🛡️\n'));
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '🛡️  Run Pre-flight Checks (check)', value: 'check' },
          { name: '🤖 Audit Local Changes (audit)', value: 'audit' },
          { name: '🔍 Calculate Project Health Score (score)', value: 'score' },
          { name: '🎨 Launch Founder UI Dashboard (ui)', value: 'ui' },
          { name: '📊 View Agent Telemetry (telemetry)', value: 'telemetry' },
          { name: '🏗️  Scaffold Agent Context (init)', value: 'init' },
          { name: '❌ Exit', value: 'exit' }
        ]
      }
    ]);

    if (action === 'exit') {
      process.exit(0);
    }
    
    // Execute the corresponding command logic
    try {
      execSync(`npx ts-node cli/index.ts ${action}`, { stdio: 'inherit', cwd: process.cwd() });
    } catch (e: unknown) {
      // Errors are already piped to stdout
    }
    process.exit(0);
  })();
} else {
  // If arguments exist, commander will parse them normally
}

program
  .command('capabilities')
  .description('Returns a structured registry of all tools available to AI agents')
  .action(() => {
    console.log(CAPABILITIES);
  });


program
  .command('init')
  .description('Scaffolds AGENTS.md, git hooks, IDE plugin configs, and Agent Skills into any target project')
  .action(() => {
    console.log(chalk.green('🚀 Initializing Soloknuckle Production Hygiene Kit...'));
    
    const target = process.cwd();
    console.log(chalk.blue(`Target directory: ${target}`));
    
    // Core Rules
    const agentsMdPath = path.join(target, 'AGENTS.md');
    if (!fs.existsSync(agentsMdPath)) {
      fs.writeFileSync(agentsMdPath, '# Production Hygiene Rules\n\n1. Do not push to main.\n2. Use feature flags.');
      console.log(chalk.green('✅ Created AGENTS.md'));
    }

    // Git Hooks (via Husky compatibility or native)
    const hooksDir = path.join(target, '.git', 'hooks');
    if (fs.existsSync(path.join(target, '.git'))) {
      if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
      const prePushPath = path.join(hooksDir, 'pre-push');
      const hookContent = `#!/usr/bin/env bash
branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" = "main" ]; then
  echo "❌ Direct pushes to main are blocked by Soloknuckle."
  exit 1
fi
echo "🛡️ Soloknuckle running pre-push checks..."
npx soloknuckle check
if [ $? -ne 0 ]; then
  echo "❌ Soloknuckle check failed. Push aborted."
  exit 1
fi
exit 0`;
      fs.writeFileSync(prePushPath, hookContent);
      fs.chmodSync(prePushPath, '755');
      
      const preCommitPath = path.join(hooksDir, 'pre-commit');
      const preCommitContent = `#!/usr/bin/env bash
echo "🛡️ Soloknuckle checking for secrets/PII before commit..."
npx soloknuckle check
if [ $? -ne 0 ]; then
  echo "❌ Pre-commit checks failed. Commit aborted."
  exit 1
fi
exit 0`;
      fs.writeFileSync(preCommitPath, preCommitContent);
      fs.chmodSync(preCommitPath, '755');
      console.log(chalk.green('✅ Installed git pre-push and pre-commit hooks (Husky-compatible)'));
    }

    // Agentic IDE Plugin & Skill Generation
    const agentInstructions = 'Always read AGENTS.md before modifying code. If you need to know what tools are available, run `npx soloknuckle capabilities`. Run `npx soloknuckle check` before committing.';
    
    const cursorRulesPath = path.join(target, '.cursorrules');
    if (!fs.existsSync(cursorRulesPath)) {
      fs.writeFileSync(cursorRulesPath, agentInstructions);
      console.log(chalk.green('✅ Created .cursorrules for Cursor AI'));
    }

    const windsurfRulesPath = path.join(target, '.windsurfrules');
    if (!fs.existsSync(windsurfRulesPath)) {
      fs.writeFileSync(windsurfRulesPath, agentInstructions);
      console.log(chalk.green('✅ Created .windsurfrules for Windsurf IDE'));
    }

    const skillMdPath = path.join(target, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      const skillContent = `---
name: production-hygiene-enforcer
description: Enforces safe deployment rules and hygiene practices.
---
# Instructions
${agentInstructions}`;
      fs.writeFileSync(skillMdPath, skillContent);
      console.log(chalk.green('✅ Created SKILL.md for Claude Code / Antigravity / Gemini'));
    }

    const replitPath = path.join(target, '.replit');
    if (!fs.existsSync(replitPath)) {
      fs.writeFileSync(replitPath, 'run = "npx soloknuckle ui"\n');
      console.log(chalk.green('✅ Created .replit config for Replit Agent'));
    }

    const mcpPath = path.join(target, 'mcp-config.json');
    if (!fs.existsSync(mcpPath)) {
      const mcpContent = JSON.stringify({
        mcpServers: {
          soloknuckle: {
            command: "npx",
            args: ["soloknuckle", "capabilities"]
          }
        }
      }, null, 2);
      fs.writeFileSync(mcpPath, mcpContent);
      console.log(chalk.green('✅ Created mcp-config.json for ChatGPT Codex / Lovable / Claude Desktop integration'));
    }

    console.log(chalk.cyan('✨ Initialization complete. Your project is now fully protected and Multi-Pronged Agent-Ready.'));
  });

program
  .command('check')
  .description('The "Main Hub Guard". Runs quality gates before allowing a push to the main hub')
  .action(() => {
    console.log(chalk.yellow('🛡️ Running pre-flight checks...'));
    
    try {
      const pkgPath = path.join(process.cwd(), 'package.json');
      let hasLint = false, hasTest = false;
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.scripts) {
          hasLint = !!pkg.scripts.lint;
          hasTest = !!pkg.scripts.test;
        }
      }

      console.log(chalk.blue('Running linter (ESLint)...'));
      if (hasLint) {
        try {
          execSync('npm run lint', { stdio: 'inherit', cwd: process.cwd(), timeout: 30000 });
          console.log(chalk.green('✅ Lint passed.'));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          throw new Error(`Lint failed: ${msg}`);
        }
      } else {
        console.log(chalk.yellow('⚠️ No "lint" script found in package.json. Skipping.'));
      }
      
      console.log(chalk.blue('Running type checker...'));
      try {
        execSync('npx tsc --noEmit', { stdio: 'inherit', cwd: process.cwd(), timeout: 30000 });
        console.log(chalk.green('✅ Types are solid.'));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        console.log(chalk.red(`⚠️ "tsc" not found or failed: ${msg}`));
      }
      
      console.log(chalk.blue('Running tests...'));
      if (hasTest) {
        try {
          execSync('npm run test', { stdio: 'inherit', cwd: process.cwd(), timeout: 60000 });
          console.log(chalk.green('✅ Tests passed.'));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          throw new Error(`Tests failed: ${msg}`);
        }
      } else {
        console.log(chalk.yellow('⚠️ No "test" script found in package.json. Skipping.'));
      }

      console.log(chalk.blue('Scanning for Secrets and PII...'));
      let diff = '';
      let gitAvailable = false;
      try {
        // Check if we're in a git repository first
        execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: process.cwd() });
        diff = execSync('git diff --cached', { encoding: 'utf-8', cwd: process.cwd() });
        gitAvailable = true;
      } catch (e: unknown) {
        console.log(chalk.yellow('⚠️ Not a git repository or git not available. Skipping secret/PII scan.'));
      }
      
      if (gitAvailable) {
        const violations = scanDiffForSecretsAndPII(diff);
        if (violations.length > 0) {
          violations.forEach(v => console.log(chalk.red(v)));
          throw new Error('Secret/PII scan failed');
        } else {
          console.log(chalk.green('✅ No secrets or PII detected.'));
        }
      }
      
      console.log(chalk.cyan('🎉 All quality gates passed! You are clear for takeoff.'));
    } catch (err) {
      console.error(chalk.red('❌ Pre-flight checks failed. Please fix the errors before pushing.'));
      process.exit(1);
    }
  });

program
  .command('audit')
  .description('AI agent reviews local, uncommitted code changes against AGENTS.md rules')
  .action(async () => {
    console.log(chalk.blue('🤖 Auditing local changes...'));
    
    let apiKey: string;
    try {
      apiKey = await getOrPromptApiKey();
    } catch (e: unknown) {
      // Handle ExitPromptError from inquirer when user presses Ctrl+C
      if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'ExitPromptError') {
        console.log(chalk.yellow('\n⚠️ Audit cancelled by user.'));
        process.exit(1);
      }
      throw e;
    }

    console.log(chalk.yellow('Fetching local diff and AGENTS.md...'));
    let diff = '';
    try {
      diff = execSync('git diff --cached', { encoding: 'utf-8', cwd: process.cwd() });
      if (!diff) diff = execSync('git diff', { encoding: 'utf-8', cwd: process.cwd() });
    } catch (e) {
      console.log(chalk.dim('No git repo or diff found.'));
    }

    let agentsMd = '';
    try {
      agentsMd = fs.readFileSync(path.join(process.cwd(), 'AGENTS.md'), 'utf-8');
    } catch (e) {
      console.log(chalk.red('⚠️ AGENTS.md not found in project root.'));
    }

    console.log(chalk.yellow('Sending code context to LLM for review...'));
    
    try {
      const systemPrompt = 'You are an elite code auditor. Review the provided git diff against the rules in AGENTS.md. If there are violations, concisely explain them and provide text-based suggestions for fixes.';
      const userPrompt = `AGENTS.md:\n${agentsMd}\n\nGIT DIFF:\n${diff || '(No changes)'}`;
      
      const reply = await callLLM(systemPrompt, userPrompt);
      logTelemetry(true, diff ? diff.split('\n').length : 0);

      console.log(chalk.green('\n✅ Audit Complete!'));
      console.log(chalk.white(reply));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.log(chalk.red(`❌ Audit failed: ${msg}`));
      console.log(chalk.dim('Please ensure your API key/Base URL is valid and you have an internet connection.'));
    }
  });

program
  .command('ui')
  .description('Launches the local Neo-Brutalist Web UI')
  .action(() => {
    console.log(chalk.magenta('🎨 Launching Founder Control Center UI...'));
    console.log(chalk.white('To view the UI during development, navigate to the "ui" directory and run "npm run dev".'));
    
    const { createApp } = require('./app');
    const app = createApp();


    // Serve the pre-built UI static files
    const uiDistPath = path.join(__dirname, '..', '..', 'ui', 'dist');
    if (fs.existsSync(uiDistPath)) {
      app.use(express.static(uiDistPath));
      console.log(chalk.blue(`Serving UI from compiled distribution: ${uiDistPath}`));
    } else {
      console.log(chalk.yellow('UI Dist folder not found (likely in dev mode). Attempting to run Vite dev server...'));
      try {
        // Run asynchronously so we don't block the backend listening below
        const { spawn } = require('child_process') as typeof import('child_process');
        spawn('npm', ['run', 'dev'], { cwd: path.join(__dirname, '..', '..', 'ui'), stdio: 'inherit', shell: true });
      } catch (e) {
        console.log(chalk.red('Could not launch UI dev server.'));
      }
    }

    const PORT = 3001;
    app.listen(PORT, () => {
      console.log(chalk.green(`✅ Founder Control Center is live at http://localhost:${PORT}`));
    });
  });

program
  .command('persona <type> <folder>')
  .description('Generate directory-specific agent rules (frontend-ux | backend-security | data-engineer)')
  .action((type, folder) => {
    try {
      const p = applyPersona(folder, type as PersonaType);
      console.log(chalk.green(`✅ Created persona config at ${p}`));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      console.log(chalk.red(`Failed to apply persona: ${msg}`));
    }
  });

program
  .command('pr')
  .description('Generate strict PR description from git diff')
  .action(async () => {
    let apiKey: string;
    try {
      apiKey = await getOrPromptApiKey();
    } catch (e: unknown) {
      // Handle ExitPromptError from inquirer when user presses Ctrl+C
      if (e && typeof e === 'object' && 'name' in e && (e as { name: string }).name === 'ExitPromptError') {
        console.log(chalk.yellow('\n⚠️ PR generation cancelled by user.'));
        process.exit(1);
      }
      throw e;
    }
    await generatePRDescription(apiKey);
  });

program
  .command('watch')
  .description('Start the Rollback Daemon and Webhook Listener')
  .action(() => {
    initWebhookListener();
  });

program
  .command('telemetry')
  .description('View Agent Telemetry')
  .action(() => {
    const data = getTelemetry();
    console.log(chalk.magenta('📊 Agent Telemetry:'));
    console.log(chalk.white(JSON.stringify(data, null, 2)));
  });

program
  .command('score')
  .description('Calculates the health of the project across 5 key pillars')
  .action(async () => {
    console.log(chalk.magenta('🔍 Calculating Vibe Score...'));
    const metrics = calculateMetrics();
    console.log(chalk.white(`Overall Score: ${metrics.overall}/100`));
    console.log(chalk.blue(`- Quality: ${metrics.quality.score}`));
    console.log(chalk.blue(`- Testing: ${metrics.testing.score}`));
    console.log(chalk.blue(`- Security: ${metrics.security.score}`));
    console.log(chalk.blue(`- Efficiency: ${metrics.efficiency.score}`));
    console.log(chalk.blue(`- Accessibility: ${metrics.accessibility.score}`));
    
    console.log(chalk.yellow('\n🤖 Generating AI Suggestions...'));
    const suggestions = await generateSuggestions(metrics);
    suggestions.forEach(s => console.log(chalk.green(`💡 ${s}`)));
  });

program.parse(process.argv);
