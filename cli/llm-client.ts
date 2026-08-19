import { loadConfig, getActiveProvider, PROVIDER_REGISTRY } from './config';

const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2_000;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

const rateTimestamps: number[] = [];

export function resetRateLimit(): void {
  rateTimestamps.length = 0;
}

function checkRateLimit(): void {
  const now = Date.now();
  while (rateTimestamps.length > 0 && rateTimestamps[0] <= now - RATE_LIMIT_WINDOW_MS) {
    rateTimestamps.shift();
  }
  if (rateTimestamps.length >= RATE_LIMIT_MAX) {
    throw new Error(`Rate limit exceeded: max ${RATE_LIMIT_MAX} LLM calls per minute. Try again later.`);
  }
  rateTimestamps.push(now);
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true;
  if (error instanceof TypeError) return true;
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 429 || status >= 500;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callWithRetry(fn: () => Promise<Response>): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const config = loadConfig();
  const activeProvider = getActiveProvider(config);

  if (!activeProvider) {
    throw new Error('No LLM provider configured. Add a provider in the UI or set LLM_PROVIDER in your config.');
  }

  const providerType = activeProvider.type;
  const providerInfo = PROVIDER_REGISTRY[providerType];
  if (!providerInfo) {
    throw new Error(`Unsupported LLM Provider type: ${providerType}`);
  }

  const apiKey = process.env.LLM_API_KEY || activeProvider.apiKey || '';
  if (providerInfo.needsApiKey && !apiKey) {
    throw new Error(`${providerInfo.name} requires an API key. Please configure it in the UI.`);
  }

  const model = activeProvider.model || providerInfo.defaultModel;
  const { url, init } = providerInfo.formatRequest(systemPrompt, userPrompt, model, apiKey, activeProvider.baseUrl);

  checkRateLimit();

  try {
    const response = await callWithRetry(() => fetchWithTimeout(url, init, FETCH_TIMEOUT_MS));
    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`${providerInfo.name} API Error (${response.status}): ${response.statusText}${errorBody ? ` — ${errorBody.slice(0, 200)}` : ''}`);
    }
    const data = await response.json();
    return providerInfo.extractContent(data);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${providerInfo.name} API request timed out after retries. Check your internet connection.`);
    }
    throw error;
  }
}
