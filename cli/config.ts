import fs from 'fs';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';
import chalk from 'chalk';

const CONFIG_DIR = path.join(os.homedir(), '.soloknuckle');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface SoloknuckleConfig {
  LLM_API_KEY?: string;
}

function loadConfig(): SoloknuckleConfig {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveConfig(config: SoloknuckleConfig) {
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
      type: 'password',
      name: 'key',
      message: 'Please enter your LLM API Key (OpenAI/Anthropic/Gemini) to perform AI audits (this will be saved securely in ~/.soloknuckle/config.json):',
    }
  ]);

  // Save for future use
  config.LLM_API_KEY = answers.key;
  saveConfig(config);
  
  console.log(chalk.green('✅ API Key saved locally to ~/.soloknuckle/config.json'));
  return answers.key;
}
