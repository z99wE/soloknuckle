import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, saveConfig, getOrPromptApiKey, SoloknuckleConfig } from '../cli/config';

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}));

import inquirer from 'inquirer';
const mockPrompt = vi.mocked(inquirer.prompt);

const CONFIG_DIR = path.join(os.homedir(), '.soloknuckle');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

describe('config', () => {
  const ORIGINAL_ENV = process.env.LLM_API_KEY;
  let savedConfigBackup: string | null = null;

  beforeEach(() => {
    mockPrompt.mockReset();
    delete process.env.LLM_API_KEY;
    if (fs.existsSync(CONFIG_FILE)) {
      savedConfigBackup = fs.readFileSync(CONFIG_FILE, 'utf-8');
      fs.unlinkSync(CONFIG_FILE);
    }
  });

  afterEach(() => {
    if (ORIGINAL_ENV !== undefined) process.env.LLM_API_KEY = ORIGINAL_ENV;
    if (savedConfigBackup !== null) {
      if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(CONFIG_FILE, savedConfigBackup);
      savedConfigBackup = null;
    } else if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
  });

  describe('loadConfig', () => {
    it('should return empty object when no config file exists', () => {
      const config = loadConfig();
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });
  });

  describe('saveConfig', () => {
    it('should be callable without throwing', () => {
      const testConfig: SoloknuckleConfig = {
        LLM_PROVIDER: 'OpenAI',
        LLM_API_KEY: 'test-key-1234',
        LLM_MODEL: 'gpt-4o'
      };
      expect(() => saveConfig(testConfig)).not.toThrow();
    });
  });

  describe('getOrPromptApiKey', () => {
    it('should return env var if LLM_API_KEY is set', async () => {
      process.env.LLM_API_KEY = 'env-key-123';
      const key = await getOrPromptApiKey();
      expect(key).toBe('env-key-123');
      expect(mockPrompt).not.toHaveBeenCalled();
    });

    it('should return from saved config if no env var', async () => {
      saveConfig({ LLM_API_KEY: 'saved-key-456', LLM_PROVIDER: 'OpenAI' });
      const key = await getOrPromptApiKey();
      expect(key).toBe('saved-key-456');
      expect(mockPrompt).not.toHaveBeenCalled();
    });

    it('should prompt user if neither env nor config exists', async () => {
      mockPrompt.mockResolvedValue({ provider: 'Gemini', key: 'prompted-key-789' });
      const key = await getOrPromptApiKey();
      expect(key).toBe('prompted-key-789');
      expect(mockPrompt).toHaveBeenCalledTimes(1);
    });

    it('should handle Ollama selection without key prompt', async () => {
      mockPrompt.mockResolvedValue({ provider: 'Ollama (Local)', baseUrl: 'http://localhost:11434/api/chat' });
      const key = await getOrPromptApiKey();
      expect(key).toBe('');
      expect(mockPrompt).toHaveBeenCalledTimes(1);
    });
  });

  describe('SoloknuckleConfig interface', () => {
    it('should accept valid config shape', () => {
      const config: SoloknuckleConfig = {
        LLM_PROVIDER: 'Anthropic',
        LLM_API_KEY: 'sk-ant-xxx',
        LLM_BASE_URL: 'http://localhost:11434',
        LLM_MODEL: 'claude-3-5-sonnet-20240620'
      };
      expect(config.LLM_PROVIDER).toBe('Anthropic');
    });

    it('should accept empty config', () => {
      const config: SoloknuckleConfig = {};
      expect(config.LLM_PROVIDER).toBeUndefined();
    });
  });
});
