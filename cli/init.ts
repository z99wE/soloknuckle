#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';

interface InitOptions {
  yes?: boolean;
}

export async function runInit(options: InitOptions = {}) {
  console.log(chalk.blue.bold('\n🔧 Soloknuckle Init\n'));
  console.log(chalk.white('Setting up production hygiene for your project...\n'));

  const projectRoot = process.cwd();
  const configDir = path.join(projectRoot, '.soloknuckle');
  const configFile = path.join(projectRoot, 'soloknuckle.config.js');

  // Check if already initialized
  if (fs.existsSync(configFile)) {
    console.log(chalk.yellow('⚠️ Already initialized!'));
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Overwrite existing config?',
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.dim('Aborted.'));
      return;
    }
  }

  // Ask for project name
  let projectName = path.basename(projectRoot);
  if (!options.yes) {
    const { name } = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Project name:',
        default: projectName,
      },
    ]);
    projectName = name;
  }

  console.log(chalk.dim('\n📁 Creating .soloknuckle directory...'));
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Create config file
  console.log(chalk.dim('📝 Creating soloknuckle.config.js...'));
  const configContent = `// Soloknuckle Configuration
// https://github.com/z99wE/soloknuckle

module.exports = {
  // Project name
  name: '${projectName}',

  // Environment: 'development' | 'staging' | 'production'
  env: process.env.NODE_ENV || 'development',

  // Checks to run (order matters)
  checks: [
    'secrets',      // Secret scanning
    'lint',         // Linting
    'test',         // Tests
    'typecheck',    // TypeScript checking
    'build',        // Build verification
  ],

  // Auto-fix on check failure
  autoFix: false,

  // Feature flags (optional)
  featureFlags: {
    enabled: false,
    // provider: 'launchdarkly', // or 'flagsmith', 'unleash', 'custom'
  },

  // AI audit (requires API key or Ollama)
  audit: {
    enabled: false,
    // provider: 'ollama', // or 'openai', 'anthropic', 'gemini'
  },

  // CI/CD integration
  ci: {
    enabled: true,
    // platforms: ['github'], // or 'gitlab', 'circleci', 'custom'
  },
};
`;

  fs.writeFileSync(configFile, configContent, 'utf-8');

  // Create .gitignore entry if not present
  console.log(chalk.dim('📝 Updating .gitignore...'));
  const gitignorePath = path.join(projectRoot, '.gitignore');
  let gitignore = '';
  if (fs.existsSync(gitignorePath)) {
    gitignore = fs.readFileSync(gitignorePath, 'utf-8');
  }

  const soloknuckleIgnore = `
# Soloknuckle
.soloknuckle/
soloknuckle.local.js
`;

  if (!gitignore.includes('.soloknuckle/')) {
    fs.writeFileSync(gitignorePath, gitignore + soloknuckleIgnore, 'utf-8');
  }

  // Create flags.json if feature flags enabled
  if (!options.yes) {
    const { enableFlags } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'enableFlags',
        message: 'Enable feature flags?',
        default: false,
      },
    ]);

    if (enableFlags) {
      console.log(chalk.dim('📝 Creating flags.json...'));
      const flagsPath = path.join(projectRoot, 'flags.json');
      if (!fs.existsSync(flagsPath)) {
        const flagsContent = {
          flags: {
            example_feature: {
              enabled: false,
              description: 'Example feature flag',
              rollout: {
                percentage: 0,
                startedAt: null,
              },
            },
          },
          overrides: {
            internal: {},
          },
          audit: [],
        };
        fs.writeFileSync(flagsPath, JSON.stringify(flagsContent, null, 2), 'utf-8');
      }
    }
  }

  // Create AGENTS.md if not present
  console.log(chalk.dim('📝 Checking AGENTS.md...'));
  const agentsMdPath = path.join(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsMdPath)) {
    const agentsMdContent = `# AGENTS.md

## Project Rules

This file contains rules for AI coding agents. Edit to customize.

### Code Style
- Use TypeScript for new files
- Follow existing patterns in the codebase
- Run \`npx soloknuckle check\` before committing

### Testing
- Write tests for new features
- Keep test coverage above 80%
- Use the project's existing test framework

### Security
- Never commit secrets or API keys
- Use environment variables for configuration
- Run \`npx soloknuckle check --fix\` to auto-fix issues

### Git
- Use conventional commits
- Keep commits atomic and focused
- Reference issues when applicable
`;

    fs.writeFileSync(agentsMdPath, agentsMdContent, 'utf-8');
  }

  // Summary
  console.log(chalk.green.bold('\n✅ Initialization complete!\n'));
  console.log(chalk.white('Created:'));
  console.log(chalk.dim('  • soloknuckle.config.js'));
  console.log(chalk.dim('  • .soloknuckle/'));
  console.log(chalk.dim('  • .gitignore entry'));
  if (!fs.existsSync(agentsMdPath)) {
    console.log(chalk.dim('  • AGENTS.md'));
  }

  console.log(chalk.cyan('\nNext steps:'));
  console.log(chalk.white('  1. Run ') + chalk.cyan('npx soloknuckle check') + chalk.white(' to see your project health'));
  console.log(chalk.white('  2. Run ') + chalk.cyan('npx soloknuckle check --fix') + chalk.white(' to auto-fix issues'));
  console.log(chalk.white('  3. Run ') + chalk.cyan('npx soloknuckle score') + chalk.white(' for detailed scoring'));
  console.log(chalk.white('  4. Run ') + chalk.cyan('npx soloknuckle ui') + chalk.white(' for the dashboard\n'));
}
