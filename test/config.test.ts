import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  loadConfig, saveConfig, getOrPromptApiKey, SoloknuckleConfig,
  LLMProviderType, LLMProvider, PROVIDER_REGISTRY, getActiveProvider, generateProviderId
} from '../cli/config';

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

    it('should accept config with providers array', () => {
      const config: SoloknuckleConfig = {
        providers: [
          { id: 'prov_1', name: 'My OpenAI', type: 'OpenAI', apiKey: 'sk-test', model: 'gpt-4' },
          { id: 'prov_2', name: 'My Ollama', type: 'Ollama (Local)', baseUrl: 'http://localhost:11434/v1' },
        ],
        activeProviderId: 'prov_1',
      };
      expect(config.providers).toHaveLength(2);
      expect(config.activeProviderId).toBe('prov_1');
    });
  });

  describe('LLMProviderType', () => {
    it('should contain all 11 provider types via PROVIDER_REGISTRY keys', () => {
      const types = Object.keys(PROVIDER_REGISTRY);
      expect(types).toContain('OpenAI');
      expect(types).toContain('Anthropic');
      expect(types).toContain('Gemini');
      expect(types).toContain('Ollama (Local)');
      expect(types).toContain('Groq');
      expect(types).toContain('OpenRouter');
      expect(types).toContain('DeepSeek');
      expect(types).toContain('Mistral');
      expect(types).toContain('xAI (Grok)');
      expect(types).toContain('Cohere');
      expect(types).toContain('OpenAI Compatible');
      expect(types.length).toBe(11);
    });
  });

  describe('LLMProvider interface', () => {
    it('should accept a minimal provider', () => {
      const provider: LLMProvider = {
        id: 'prov_1',
        name: 'Test Provider',
        type: 'OpenAI',
      };
      expect(provider.id).toBe('prov_1');
      expect(provider.name).toBe('Test Provider');
      expect(provider.type).toBe('OpenAI');
      expect(provider.apiKey).toBeUndefined();
      expect(provider.baseUrl).toBeUndefined();
      expect(provider.model).toBeUndefined();
    });

    it('should accept a provider with all optional fields', () => {
      const provider: LLMProvider = {
        id: 'prov_2',
        name: 'Full Provider',
        type: 'Anthropic',
        apiKey: 'sk-ant-xxx',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-3',
      };
      expect(provider.apiKey).toBe('sk-ant-xxx');
      expect(provider.baseUrl).toBe('https://api.anthropic.com');
      expect(provider.model).toBe('claude-3');
    });
  });

  describe('PROVIDER_REGISTRY', () => {
    it('should have entries for all provider types', () => {
      const types = Object.keys(PROVIDER_REGISTRY);
      for (const t of types) {
        expect(PROVIDER_REGISTRY[t as keyof typeof PROVIDER_REGISTRY]).toBeDefined();
        expect(PROVIDER_REGISTRY[t as keyof typeof PROVIDER_REGISTRY].defaultModel).toBeTruthy();
      }
    });

    it('should flag local providers as not needing API keys', () => {
      expect(PROVIDER_REGISTRY['Ollama (Local)'].needsApiKey).toBe(false);
    });

    it('should flag cloud providers as needing API keys', () => {
      expect(PROVIDER_REGISTRY['OpenAI'].needsApiKey).toBe(true);
      expect(PROVIDER_REGISTRY['Anthropic'].needsApiKey).toBe(true);
      expect(PROVIDER_REGISTRY['Gemini'].needsApiKey).toBe(true);
    });
  });

  describe('getActiveProvider', () => {
    it('should return the active provider when providers array exists', () => {
      const config: SoloknuckleConfig = {
        providers: [
          { id: 'prov_1', name: 'A', type: 'OpenAI' },
          { id: 'prov_2', name: 'B', type: 'Anthropic' },
        ],
        activeProviderId: 'prov_2',
      };
      const active = getActiveProvider(config);
      expect(active?.id).toBe('prov_2');
      expect(active?.name).toBe('B');
    });

    it('should return null when no providers', () => {
      const config: SoloknuckleConfig = {};
      expect(getActiveProvider(config)).toBeNull();
    });

    it('should return null when activeProviderId points to missing provider', () => {
      const config: SoloknuckleConfig = {
        providers: [{ id: 'prov_1', name: 'A', type: 'OpenAI' }],
        activeProviderId: 'nonexistent',
      };
      expect(getActiveProvider(config)).toBeNull();
    });

    it('should return null when activeProviderId is missing', () => {
      const config: SoloknuckleConfig = {
        providers: [{ id: 'prov_1', name: 'A', type: 'OpenAI' }],
      };
      expect(getActiveProvider(config)).toBeNull();
    });
  });

  describe('generateProviderId', () => {
    it('should return a string starting with "prov_"', () => {
      const id = generateProviderId();
      expect(id).toMatch(/^prov_/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 50 }, () => generateProviderId()));
      expect(ids.size).toBe(50);
    });
  });
});
