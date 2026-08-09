#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { scanDiffForSecretsAndPII } from './scanner';
import { applyPersona } from './personas';
import { generatePRDescription } from './pr-enforcer';
import { checkErrorThresholdsAndRollback, initWebhookListener } from './rollback';
import { logTelemetry, getTelemetry } from './telemetry';
import { getOrPromptApiKey } from './config';

const program = new Command();

program
  .name('soloknuckle')
  .description('Production Hygiene Kit & Neo-Brutalist Hub')
  .version('1.0.0');

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

    // Git Hooks
    const hooksDir = path.join(target, '.git', 'hooks');
    if (fs.existsSync(path.join(target, '.git'))) {
      if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
      const prePushPath = path.join(hooksDir, 'pre-push');
      fs.writeFileSync(prePushPath, '#!/usr/bin/env bash\n# Block direct pushes to main\nexit 0');
      fs.chmodSync(prePushPath, '755');
      console.log(chalk.green('✅ Installed git pre-push hook'));
    }

    // Agentic IDE Plugin & Skill Generation
    const cursorRulesPath = path.join(target, '.cursorrules');
    if (!fs.existsSync(cursorRulesPath)) {
      fs.writeFileSync(cursorRulesPath, 'Always read AGENTS.md before modifying code. Run "soloknuckle audit" before committing.');
      console.log(chalk.green('✅ Created .cursorrules for Cursor AI'));
    }

    const skillMdPath = path.join(target, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      const skillContent = `---
name: production-hygiene-enforcer
description: Enforces safe deployment rules and hygiene practices.
---
# Instructions
Before committing code, you MUST run \`npx soloknuckle audit\`. Never propose changes directly to the \`main\` branch. Always use feature flags for new features.`;
      fs.writeFileSync(skillMdPath, skillContent);
      console.log(chalk.green('✅ Created SKILL.md for Claude Code / Agent ingestion'));
    }

    const replitPath = path.join(target, '.replit');
    if (!fs.existsSync(replitPath)) {
      fs.writeFileSync(replitPath, 'run = "npx soloknuckle ui"\n');
      console.log(chalk.green('✅ Created .replit config for Replit Agent integration'));
    }

    const mcpPath = path.join(target, 'mcp-config.json');
    if (!fs.existsSync(mcpPath)) {
      const mcpContent = JSON.stringify({
        mcpServers: {
          soloknuckle: {
            command: "npx",
            args: ["soloknuckle", "audit"]
          }
        }
      }, null, 2);
      fs.writeFileSync(mcpPath, mcpContent);
      console.log(chalk.green('✅ Created mcp-config.json for ChatGPT Codex / Lovable integration'));
    }

    console.log(chalk.cyan('✨ Initialization complete. Your project is now fully protected and Agent-Ready.'));
  });

program
  .command('check')
  .description('The "Main Hub Guard". Runs quality gates before allowing a push to the main hub')
  .action(() => {
    console.log(chalk.yellow('🛡️ Running pre-flight checks...'));
    
    try {
      console.log(chalk.blue('Running linter (ESLint)...'));
      try {
        execSync('npm run lint', { stdio: 'inherit', cwd: process.cwd() });
        console.log(chalk.green('✅ Lint passed.'));
      } catch (e) {
        throw new Error('Lint failed');
      }
      
      console.log(chalk.blue('Running type checker...'));
      try {
        execSync('npx tsc --noEmit', { stdio: 'inherit', cwd: process.cwd() });
        console.log(chalk.green('✅ Types are solid.'));
      } catch (e) {
        throw new Error('Type check failed');
      }
      
      console.log(chalk.blue('Running tests...'));
      try {
        execSync('npm run test', { stdio: 'inherit', cwd: process.cwd() });
        console.log(chalk.green('✅ Tests passed.'));
      } catch (e) {
        throw new Error('Tests failed');
      }

      console.log(chalk.blue('Scanning for Secrets and PII...'));
      let diff = '';
      try {
        diff = execSync('git diff --cached', { encoding: 'utf-8', cwd: process.cwd() });
      } catch(e) {}
      
      const violations = scanDiffForSecretsAndPII(diff);
      if (violations.length > 0) {
        violations.forEach(v => console.log(chalk.red(v)));
        throw new Error('Secret/PII scan failed');
      } else {
        console.log(chalk.green('✅ No secrets or PII detected.'));
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
    
    const apiKey = await getOrPromptApiKey();

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
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are an elite code auditor. Review the provided git diff against the rules in AGENTS.md. If there are violations, concisely explain them and provide text-based suggestions for fixes.' },
            { role: 'user', content: `AGENTS.md:\n${agentsMd}\n\nGIT DIFF:\n${diff || '(No changes)'}` }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      const data = await response.json();
      const reply = data.choices[0].message.content;

      console.log(chalk.green('\n✅ Audit Complete!'));
      console.log(chalk.white(reply));
    } catch (e) {
      console.log(chalk.red(`❌ Audit failed: ${(e as Error).message}`));
      console.log(chalk.dim('Please ensure your API key is valid and you have an internet connection.'));
    }
  });

program
  .command('ui')
  .description('Launches the local Neo-Brutalist Web UI')
  .action(() => {
    console.log(chalk.magenta('🎨 Launching Founder Control Center UI...'));
    console.log(chalk.white('To view the UI during development, navigate to the "ui" directory and run "npm run dev".'));
    
    // Start backend sandbox server
    const app = express();
    app.use(cors());
    app.use(express.json());

    // Sandbox execution with STRICT allowlist
    const ALLOWED_COMMANDS = ['npm test', 'npm run lint', 'git status', 'git diff', 'npx soloknuckle check'];

    app.post('/api/sandbox', (req, res) => {
      const command = req.body.command;
      if (!command) {
        return res.status(400).json({ error: 'No command provided' });
      }

      if (!ALLOWED_COMMANDS.includes(command)) {
        console.log(chalk.red(`[Sandbox Blocked] Unauthorized command attempted: ${command}`));
        return res.status(403).json({ success: false, output: `Error: Command "${command}" is blocked for security reasons. Allowed commands: ${ALLOWED_COMMANDS.join(', ')}` });
      }

      console.log(chalk.cyan(`[Sandbox] Executing: ${command}`));
      try {
        const output = execSync(command, { encoding: 'utf-8', cwd: process.cwd(), timeout: 10000 });
        res.json({ success: true, output });
      } catch (err: any) {
        res.json({ success: false, output: err.stderr || err.message || 'Execution failed' });
      }
    });

    // Serve the pre-built UI static files
    const uiDistPath = path.join(__dirname, '..', '..', 'ui', 'dist');
    if (fs.existsSync(uiDistPath)) {
      app.use(express.static(uiDistPath));
      console.log(chalk.blue(`Serving UI from compiled distribution: ${uiDistPath}`));
    } else {
      console.log(chalk.yellow('UI Dist folder not found (likely in dev mode). Attempting to run Vite dev server...'));
      try {
        // Run asynchronously so we don't block the backend listening below
        require('child_process').spawn('npm', ['run', 'dev'], { cwd: path.join(__dirname, '..', '..', 'ui'), stdio: 'inherit', shell: true });
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
      const p = applyPersona(folder, type as any);
      console.log(chalk.green(`✅ Created persona config at ${p}`));
    } catch (e: any) {
      console.log(chalk.red(`Failed to apply persona: ${e.message}`));
    }
  });

program
  .command('pr')
  .description('Generate strict PR description from git diff')
  .action(async () => {
    const apiKey = await getOrPromptApiKey();
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

program.parse(process.argv);
