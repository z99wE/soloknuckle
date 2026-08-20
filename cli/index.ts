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
import { runCheck } from './check';

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

// Extracted init logic — used by both the default handler and the init command
function runInit(target: string): void {
  console.log(chalk.green('🚀 Initializing Soloknuckle Production Hygiene Kit...'));
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
}

// Default action when no args are provided: auto-detect and run the right command
if (process.argv.length <= 2) {
  (async () => {
    const target = process.cwd();
    const agentsMd = path.join(target, 'AGENTS.md');
    const isInitialized = fs.existsSync(agentsMd);

    if (!isInitialized) {
      // First time: auto-init
      console.log(chalk.cyan.bold('\n🛡️  Soloknuckle — First-time setup\n'));
      console.log(chalk.white('No AGENTS.md found. Setting up production hygiene for this project...\n'));
      runInit(target);
      console.log(chalk.green.bold('\n✅ You\'re protected! Run this before every push:\n'));
      console.log(chalk.white('   npx soloknuckle check\n'));
      console.log(chalk.dim('Other commands:'));
      console.log(chalk.dim('   npx soloknuckle audit    — review AI-generated code'));
      console.log(chalk.dim('   npx soloknuckle score    — see your health score'));
      console.log(chalk.dim('   npx soloknuckle ui       — open the dashboard\n'));
    } else {
      // Already initialized: run check
      console.log(chalk.cyan.bold('\n🛡️  Soloknuckle — Production check\n'));
      console.log(chalk.dim('Running pre-flight checks...\n'));
      await runCheck({ fix: false });
      console.log(chalk.dim('\nOther commands:'));
      console.log(chalk.dim('   npx soloknuckle audit    — review AI-generated code'));
      console.log(chalk.dim('   npx soloknuckle score    — see your health score'));
      console.log(chalk.dim('   npx soloknuckle ui       — open the dashboard'));
      console.log(chalk.dim('   npx soloknuckle init     — re-run setup\n'));
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
    runInit(process.cwd());
  });

program
  .command('check')
  .description('Check if your code is production-ready (human-friendly output)')
  .option('--fix', 'Attempt to auto-fix issues')
  .option('--verbose', 'Show detailed output')
  .action(async (options) => {
    await runCheck(options);
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

if (process.argv.length > 2) {
  program.parse(process.argv);
}
