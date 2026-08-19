import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('../cli/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli/config')>();
  return {
    ...actual,
    loadConfig: vi.fn(),
  };
});

import { callLLM, resetRateLimit } from '../cli/llm-client';
import { loadConfig } from '../cli/config';

const mockLoadConfig = vi.mocked(loadConfig);

function jsonResponse(body: unknown, ok = true, statusText = 'OK') {
  return {
    ok,
    statusText,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

describe('callLLM', () => {
  const ORIGINAL_ENV = process.env.LLM_API_KEY;

  beforeEach(() => {
    resetRateLimit();
    mockFetch.mockReset();
    mockLoadConfig.mockReset();
    mockLoadConfig.mockReturnValue({});
    delete process.env.LLM_API_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_ENV !== undefined) process.env.LLM_API_KEY = ORIGINAL_ENV;
  });

  it('should call OpenAI with correct headers and extract content', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'OpenAI', LLM_API_KEY: 'sk-test-key' });
    mockFetch.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: 'Hello from OpenAI' } }],
      })
    );

    const result = await callLLM('system', 'user');
    expect(result).toBe('Hello from OpenAI');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(opts.headers['Authorization']).toMatch(/^Bearer /);
  });

  it('should throw on OpenAI error response', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'OpenAI', LLM_API_KEY: 'sk-test-key' });
    mockFetch.mockResolvedValue(jsonResponse({}, false, 'Bad Request'));
    await expect(callLLM('sys', 'usr')).rejects.toThrow('OpenAI API Error');
  });

  it('should throw when OpenAI returns no choices', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'OpenAI', LLM_API_KEY: 'sk-test-key' });
    mockFetch.mockResolvedValue(jsonResponse({ choices: [] }));
    await expect(callLLM('sys', 'usr')).rejects.toThrow('OpenAI returned no choices');
  });

  it('should throw when OpenAI returns unexpected shape', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'OpenAI', LLM_API_KEY: 'sk-test-key' });
    mockFetch.mockResolvedValue(jsonResponse({ choices: [{ message: {} }] }));
    await expect(callLLM('sys', 'usr')).rejects.toThrow('OpenAI returned unexpected response shape');
  });

  it('should call Anthropic with correct headers', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Anthropic', LLM_API_KEY: 'sk-ant-key' });
    mockFetch.mockResolvedValue(
      jsonResponse({
        content: [{ text: 'Hello from Anthropic' }],
      })
    );

    const result = await callLLM('system', 'user');
    expect(result).toBe('Hello from Anthropic');
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers['x-api-key']).toBe('sk-ant-key');
    expect(opts.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('should throw on Anthropic error response', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Anthropic', LLM_API_KEY: 'sk-test-key' });
    mockFetch.mockResolvedValue(jsonResponse({}, false, 'Forbidden'));
    await expect(callLLM('sys', 'usr')).rejects.toThrow('Anthropic API Error');
  });

  it('should throw when Anthropic returns no content', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Anthropic', LLM_API_KEY: 'sk-test-key' });
    mockFetch.mockResolvedValue(jsonResponse({ content: [] }));
    await expect(callLLM('sys', 'usr')).rejects.toThrow('Anthropic returned no content');
  });

  it('should throw when Anthropic returns unexpected shape', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Anthropic', LLM_API_KEY: 'sk-test-key' });
    mockFetch.mockResolvedValue(jsonResponse({ content: [{}] }));
    await expect(callLLM('sys', 'usr')).rejects.toThrow('Anthropic returned unexpected response shape');
  });

  it('should call Gemini with x-goog-api-key header', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Gemini', LLM_API_KEY: 'gemini-key-123' });
    mockFetch.mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: 'Hello from Gemini' }] } }],
      })
    );

    const result = await callLLM('system', 'user');
    expect(result).toBe('Hello from Gemini');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(opts.headers['x-goog-api-key']).toBe('gemini-key-123');
  });

  it('should throw on Gemini error response', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Gemini', LLM_API_KEY: 'sk-test-key' });
    mockFetch.mockResolvedValue(jsonResponse({}, false, 'Not Found'));
    await expect(callLLM('sys', 'usr')).rejects.toThrow('Gemini API Error');
  });

  it('should throw when Gemini returns no candidates', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Gemini', LLM_API_KEY: 'sk-test-key' });
    mockFetch.mockResolvedValue(jsonResponse({ candidates: [] }));
    await expect(callLLM('sys', 'usr')).rejects.toThrow('Gemini returned no candidates');
  });

  it('should throw when Gemini returns unexpected shape', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Gemini', LLM_API_KEY: 'sk-test-key' });
    mockFetch.mockResolvedValue(jsonResponse({ candidates: [{ content: { parts: [] } }] }));
    await expect(callLLM('sys', 'usr')).rejects.toThrow('Gemini returned unexpected response shape');
  });

  it('should call Ollama with correct body', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Ollama (Local)' });
    mockFetch.mockResolvedValue(
      jsonResponse({
        message: { content: 'Hello from Ollama' },
      })
    );

    const result = await callLLM('system', 'user');
    expect(result).toBe('Hello from Ollama');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('localhost:11434');
    const body = JSON.parse(opts.body as string);
    expect(body.stream).toBe(false);
  });

  it('should throw on Ollama error response', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Ollama (Local)' });
    mockFetch.mockResolvedValue(jsonResponse({}, false, 'Service Unavailable'));
    await expect(callLLM('sys', 'usr')).rejects.toThrow('Ollama (Local) API Error');
  });

  it('should throw when Ollama returns unexpected shape', async () => {
    mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Ollama (Local)' });
    mockFetch.mockResolvedValue(jsonResponse({}));
    await expect(callLLM('sys', 'usr')).rejects.toThrow('Ollama returned unexpected response shape');
  });

  describe('retry logic', () => {
    it('should retry on network TypeError and succeed', async () => {
      mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'OpenAI', LLM_API_KEY: 'sk-test-key' });
      mockFetch
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'recovered' } }] }));

      const result = await callLLM('sys', 'usr');
      expect(result).toBe('recovered');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on AbortError (timeout) and succeed', async () => {
      mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'OpenAI', LLM_API_KEY: 'sk-test-key' });
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch
        .mockRejectedValueOnce(abortError)
        .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: 'ok after timeout' } }] }));

      const result = await callLLM('sys', 'usr');
      expect(result).toBe('ok after timeout');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw timeout error after exhausting retries on AbortError', async () => {
      mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'OpenAI', LLM_API_KEY: 'sk-test-key' });
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValue(abortError);

      await expect(callLLM('sys', 'usr')).rejects.toThrow('timed out after retries');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    }, 15000);

    it('should throw non-retryable error immediately', async () => {
      mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'OpenAI', LLM_API_KEY: 'sk-test-key' });
      mockFetch.mockRejectedValue(new Error('something broke'));

      await expect(callLLM('sys', 'usr')).rejects.toThrow('something broke');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw HTTP 429 as non-retryable (status checked after callWithRetry)', async () => {
      mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'OpenAI', LLM_API_KEY: 'sk-test-key' });
      mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests', json: () => Promise.resolve({}), text: () => Promise.resolve('') } as Response);

      await expect(callLLM('sys', 'usr')).rejects.toThrow('API Error (429)');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should throw HTTP 500 as non-retryable (status checked after callWithRetry)', async () => {
      mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'OpenAI', LLM_API_KEY: 'sk-test-key' });
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error', json: () => Promise.resolve({}), text: () => Promise.resolve('') } as Response);

      await expect(callLLM('sys', 'usr')).rejects.toThrow('API Error (500)');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('rate limiting', () => {
    it('should throw rate limit error after max calls', async () => {
      mockLoadConfig.mockReturnValue({ LLM_PROVIDER: 'Ollama (Local)' });
      mockFetch.mockResolvedValue(jsonResponse({ message: { content: 'ok' } }));

      for (let i = 0; i < 5; i++) {
        await callLLM('sys', `msg-${i}`);
      }

      await expect(callLLM('sys', 'rate-limited')).rejects.toThrow('Rate limit exceeded');
    });
  });
});
