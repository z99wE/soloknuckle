import fs from 'fs';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';
import chalk from 'chalk';

const CONFIG_DIR = path.join(os.homedir(), '.soloknuckle');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export type LLMProviderType =
  | 'OpenAI'
  | 'Anthropic'
  | 'Gemini'
  | 'DeepSeek'
  | 'Mistral'
  | 'Groq'
  | 'xAI (Grok)'
  | 'OpenRouter'
  | 'Cohere'
  | 'OpenAI Compatible'
  | 'Ollama (Local)';

export interface LLMProvider {
  id: string;
  name: string;
  type: LLMProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export interface SoloknuckleConfig {
  LLM_PROVIDER?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_MODEL?: string;
  hooksEnabled?: boolean;
  aiCommitsEnabled?: boolean;
  providers?: LLMProvider[];
  activeProviderId?: string;
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
      choices: Object.keys(PROVIDER_REGISTRY),
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

// ── Provider Registry ───────────────────────────────────────────────────────

export interface ProviderTypeInfo {
  name: string;
  defaultBaseUrl: string;
  defaultModel: string;
  needsApiKey: boolean;
  formatRequest: (systemPrompt: string, userPrompt: string, model: string, apiKey: string, baseUrl?: string) => { url: string; init: RequestInit };
  extractContent: (data: unknown) => string;
}

function extractOpenAIContent(data: unknown): string {
  const d = data as Record<string, unknown>;
  const choices = d.choices as Array<Record<string, unknown>> | undefined;
  if (!choices?.[0]) throw new Error('OpenAI returned no choices');
  const message = choices[0].message as Record<string, unknown> | undefined;
  if (typeof message?.content !== 'string') throw new Error('OpenAI returned unexpected response shape');
  return message.content;
}

function extractAnthropicContent(data: unknown): string {
  const d = data as Record<string, unknown>;
  const content = d.content as Array<Record<string, unknown>> | undefined;
  if (!content?.[0]) throw new Error('Anthropic returned no content');
  if (typeof content[0].text !== 'string') throw new Error('Anthropic returned unexpected response shape');
  return content[0].text;
}

function extractGeminiContent(data: unknown): string {
  const d = data as Record<string, unknown>;
  const candidates = d.candidates as Array<Record<string, unknown>> | undefined;
  if (!candidates?.[0]) throw new Error('Gemini returned no candidates');
  const content = candidates[0].content as Record<string, unknown> | undefined;
  const parts = content?.parts as Array<Record<string, unknown>> | undefined;
  if (!parts?.[0]) throw new Error('Gemini returned unexpected response shape');
  if (typeof parts[0].text !== 'string') throw new Error('Gemini returned unexpected response shape');
  return parts[0].text;
}

function extractOllamaContent(data: unknown): string {
  const d = data as Record<string, unknown>;
  const message = d.message as Record<string, unknown> | undefined;
  if (typeof message?.content !== 'string') throw new Error('Ollama returned unexpected response shape');
  return message.content;
}

function openaiFmt(systemPrompt: string, userPrompt: string, model: string, apiKey: string, baseUrl?: string) {
  return {
    url: baseUrl || 'https://api.openai.com/v1/chat/completions',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
    },
  };
}

function anthropicFmt(systemPrompt: string, userPrompt: string, model: string, apiKey: string) {
  return {
    url: 'https://api.anthropic.com/v1/messages',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, system: systemPrompt, max_tokens: 2000, messages: [{ role: 'user', content: userPrompt }] }),
    },
  };
}

function geminiFmt(systemPrompt: string, userPrompt: string, model: string, apiKey: string) {
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ parts: [{ text: userPrompt }] }] }),
    },
  };
}

function ollamaFmt(systemPrompt: string, userPrompt: string, model: string, _apiKey: string, baseUrl?: string) {
  return {
    url: baseUrl || 'http://localhost:11434/api/chat',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], stream: false }),
    },
  };
}

function groqFmt(systemPrompt: string, userPrompt: string, model: string, apiKey: string) {
  return {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
    },
  };
}

function xaiFmt(systemPrompt: string, userPrompt: string, model: string, apiKey: string) {
  return {
    url: 'https://api.x.ai/v1/chat/completions',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
    },
  };
}

function openrouterFmt(systemPrompt: string, userPrompt: string, model: string, apiKey: string) {
  return {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://soloknuckle.dev', 'X-Title': 'Soloknuckle' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
    },
  };
}

function cohereFmt(systemPrompt: string, userPrompt: string, model: string, apiKey: string) {
  return {
    url: 'https://api.cohere.com/v2/chat',
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] }),
    },
  };
}

export const PROVIDER_REGISTRY: Record<LLMProviderType, ProviderTypeInfo> = {
  'OpenAI':              { name: 'OpenAI',              defaultBaseUrl: 'https://api.openai.com/v1/chat/completions',  defaultModel: 'gpt-4o',                  needsApiKey: true,  formatRequest: openaiFmt,      extractContent: extractOpenAIContent },
  'Anthropic':           { name: 'Anthropic',           defaultBaseUrl: 'https://api.anthropic.com/v1/messages',       defaultModel: 'claude-3-5-sonnet-20240620', needsApiKey: true,  formatRequest: anthropicFmt,   extractContent: extractAnthropicContent },
  'Gemini':              { name: 'Gemini',              defaultBaseUrl: 'generativelanguage.googleapis.com',           defaultModel: 'gemini-1.5-pro',          needsApiKey: true,  formatRequest: geminiFmt,      extractContent: extractGeminiContent },
  'DeepSeek':            { name: 'DeepSeek',            defaultBaseUrl: 'https://api.deepseek.com/v1/chat/completions', defaultModel: 'deepseek-chat',           needsApiKey: true,  formatRequest: openaiFmt,      extractContent: extractOpenAIContent },
  'Mistral':             { name: 'Mistral',             defaultBaseUrl: 'https://api.mistral.ai/v1/chat/completions',  defaultModel: 'mistral-large-latest',    needsApiKey: true,  formatRequest: openaiFmt,      extractContent: extractOpenAIContent },
  'Groq':                { name: 'Groq',                defaultBaseUrl: 'https://api.groq.com/openai/v1/chat/completions', defaultModel: 'llama-3.3-70b-versatile', needsApiKey: true,  formatRequest: groqFmt,        extractContent: extractOpenAIContent },
  'xAI (Grok)':          { name: 'xAI (Grok)',          defaultBaseUrl: 'https://api.x.ai/v1/chat/completions',       defaultModel: 'grok-2-1212',             needsApiKey: true,  formatRequest: xaiFmt,         extractContent: extractOpenAIContent },
  'OpenRouter':          { name: 'OpenRouter',          defaultBaseUrl: 'https://openrouter.ai/api/v1/chat/completions', defaultModel: 'auto',                   needsApiKey: true,  formatRequest: openrouterFmt,  extractContent: extractOpenAIContent },
  'Cohere':              { name: 'Cohere',              defaultBaseUrl: 'https://api.cohere.com/v2/chat',              defaultModel: 'command-r-plus',          needsApiKey: true,  formatRequest: cohereFmt,      extractContent: extractOpenAIContent },
  'OpenAI Compatible':   { name: 'OpenAI Compatible',   defaultBaseUrl: 'http://localhost:1234/v1/chat/completions',   defaultModel: 'default',                 needsApiKey: false, formatRequest: openaiFmt,      extractContent: extractOpenAIContent },
  'Ollama (Local)':      { name: 'Ollama (Local)',      defaultBaseUrl: 'http://localhost:11434/api/chat',             defaultModel: 'llama3',                  needsApiKey: false, formatRequest: ollamaFmt,      extractContent: extractOllamaContent },
};

export function getActiveProvider(config: SoloknuckleConfig): LLMProvider | null {
  const providers = config.providers || [];
  if (config.activeProviderId) {
    return providers.find(p => p.id === config.activeProviderId) || null;
  }
  // Fallback: legacy single-provider fields → synthetic provider
  if (config.LLM_PROVIDER) {
    return {
      id: '__legacy__',
      name: config.LLM_PROVIDER,
      type: config.LLM_PROVIDER as LLMProviderType,
      apiKey: config.LLM_API_KEY,
      baseUrl: config.LLM_BASE_URL,
      model: config.LLM_MODEL,
    };
  }
  return null;
}

export function generateProviderId(): string {
  return `prov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
