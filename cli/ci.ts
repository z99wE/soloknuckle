#!/usr/bin/env node

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';

interface CiOptions {
  platform?: 'github' | 'gitlab' | 'circleci' | 'auto';
  yes?: boolean;
}

export async function runCi(options: CiOptions = {}) {
  console.log(chalk.blue.bold('\n🚀 CI/CD Integration Setup\n'));
  console.log(chalk.white('Generate CI configuration for your project.\n'));

  const projectRoot = process.cwd();

  // Detect platform
  let platform = options.platform;
  if (!platform || platform === 'auto') {
    if (fs.existsSync(path.join(projectRoot, '.gitlab-ci.yml'))) {
      platform = 'gitlab';
    } else if (fs.existsSync(path.join(projectRoot, '.circleci'))) {
      platform = 'circleci';
    } else {
      platform = 'github';
    }
  }

  if (!options.yes) {
    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: 'Select CI platform:',
        choices: [
          { name: 'GitHub Actions', value: 'github' },
          { name: 'GitLab CI', value: 'gitlab' },
          { name: 'CircleCI', value: 'circleci' },
        ],
        default: platform,
      },
    ]);
    platform = selected;
  }

  if (platform === 'github') {
    generateGitHubWorkflow(projectRoot);
  } else if (platform === 'gitlab') {
    generateGitlabCi(projectRoot);
  } else if (platform === 'circleci') {
    generateCircleCi(projectRoot);
  }

  console.log(chalk.green.bold(`\n✅ CI configuration generated!\n`));
  console.log(chalk.white('Next steps:'));
  console.log(chalk.dim('  • Commit the generated files'));
  console.log(chalk.dim('  • Push to your repository'));
  console.log(chalk.dim('  • CI will run automatically on PRs'));
  console.log(chalk.dim('  • Add npx soloknuckle check to your CI pipeline\n'));
}

function generateGitHubWorkflow(projectRoot: string) {
  const workflowsDir = path.join(projectRoot, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }

  const workflowContent = `name: Soloknuckle CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run Soloknuckle checks
        run: npx soloknuckle check
      
      - name: Run type checking
        run: npx tsc --noEmit
      
      - name: Run linting
        run: npx eslint . --max-warnings 0
      
      - name: Run tests
        run: npm test
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: soloknuckle-report
          path: |
            soloknuckle-report.html
            soloknuckle-report.json
`;

  fs.writeFileSync(path.join(workflowsDir, 'soloknuckle.yml'), workflowContent, 'utf-8');
}

function generateGitlabCi(projectRoot: string) {
  const gitlabCiContent = `stages:
  - check
  - test
  - build

soloknuckle-check:
  stage: check
  image: node:20
  script:
    - npm ci
    - npx soloknuckle check
    - npx tsc --noEmit
    - npx eslint . --max-warnings 0
  artifacts:
    when: always
    paths:
      - soloknuckle-report.html
      - soloknuckle-report.json

soloknuckle-test:
  stage: test
  image: node:20
  script:
    - npm ci
    - npm test
  artifacts:
    reports:
      junit: junit.xml
`;

  fs.writeFileSync(path.join(projectRoot, '.gitlab-ci.yml'), gitlabCiContent, 'utf-8');
}

function generateCircleCi(projectRoot: string) {
  const circleciDir = path.join(projectRoot, '.circleci');
  if (!fs.existsSync(circleciDir)) {
    fs.mkdirSync(circleciDir, { recursive: true });
  }

  const configContent = `version: 2.1

executors:
  node-executor:
    docker:
      - image: cimg/node:20.0
    working_directory: ~/project

jobs:
  soloknuckle-check:
    executor: node-executor
    steps:
      - checkout
      - restore_cache:
          keys:
            - v1-deps-{{ checksum "package-lock.json" }}
            - v1-deps-
      - run: npm ci
      - save_cache:
          key: v1-deps-{{ checksum "package-lock.json" }}
          paths:
            - node_modules
      - run:
          name: Run Soloknuckle checks
          command: npx soloknuckle check
      - run:
          name: Run type checking
          command: npx tsc --noEmit
      - run:
          name: Run linting
          command: npx eslint . --max-warnings 0
      - store_artifacts:
          path: soloknuckle-report.html
          destination: soloknuckle-report
      - store_test_results:
          path: test-results

workflows:
  check-and-test:
    jobs:
      - soloknuckle-check
`;

  fs.writeFileSync(path.join(circleciDir, 'config.yml'), configContent, 'utf-8');
}
