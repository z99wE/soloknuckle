import fs from 'fs';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';
import chalk from 'chalk';

const CONFIG_DIR = path.join(os.homedir(), '.soloknuckle');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface SoloknuckleConfig {
  LLM_PROVIDER?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  hooksEnabled?: boolean;
  aiCommitsEnabled?: boolean;
}

export function loadConfig(): SoloknuckleConfig {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return {};
}

export function saveConfig(config: SoloknuckleConfig) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function getOrPromptApiKey(): Promise<string> {
  // 1. Check environment variable first
  if (process.env.LLM_API_KEY) {
    return process.env.LLM_API_KEY;
  }

  // 2. Check saved local config
  const config = loadConfig();
  if (config.LLM_API_KEY) {
    return config.LLM_API_KEY;
  }

  // 3. Prompt user if neither exists
  const answers = await inquirer.prompt([
    {
      type: 'select',
      name: 'provider',
      message: 'Select your preferred LLM Provider:',
      choices: ['OpenAI', 'Anthropic', 'Gemini', 'Ollama (Local)'],
      default: 'OpenAI'
    },
    {
      type: 'password',
      name: 'key',
      message: 'Please enter your API Key (Leave blank if using local Ollama):',
      when: (ans) => ans.provider !== 'Ollama (Local)'
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'Enter the base URL for Ollama:',
      default: 'http://localhost:11434/api/chat',
      when: (ans) => ans.provider === 'Ollama (Local)'
    }
  ]);

  // Save for future use
  config.LLM_PROVIDER = answers.provider;
  config.LLM_API_KEY = answers.key || '';
  config.LLM_BASE_URL = answers.baseUrl || '';
  saveConfig(config);
  
  console.log(chalk.green('✅ Configuration saved locally to ~/.soloknuckle/config.json'));
  return config.LLM_API_KEY || '';
}
