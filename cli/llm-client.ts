import { loadConfig } from './config';

const FETCH_TIMEOUT_MS = 30_000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

export async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const config = loadConfig();
  const provider = config.LLM_PROVIDER || 'OpenAI';
  const apiKey = process.env.LLM_API_KEY || config.LLM_API_KEY || '';

  if (provider === 'OpenAI') {
    const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: config.LLM_MODEL || 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    }, FETCH_TIMEOUT_MS);
    if (!response.ok) throw new Error(`OpenAI API Error: ${response.statusText}`);
    const data = await response.json();
    return extractOpenAIContent(data);
  }

  if (provider === 'Anthropic') {
    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.LLM_MODEL || 'claude-3-5-sonnet-20240620',
        system: systemPrompt,
        max_tokens: 2000,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      })
    }, FETCH_TIMEOUT_MS);
    if (!response.ok) throw new Error(`Anthropic API Error: ${response.statusText}`);
    const data = await response.json();
    return extractAnthropicContent(data);
  }

  if (provider === 'Gemini') {
    const model = config.LLM_MODEL || 'gemini-1.5-pro';
    const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }]
      })
    }, FETCH_TIMEOUT_MS);
    if (!response.ok) throw new Error(`Gemini API Error: ${response.statusText}`);
    const data = await response.json();
    return extractGeminiContent(data);
  }

  if (provider === 'Ollama (Local)') {
    const baseUrl = config.LLM_BASE_URL || 'http://localhost:11434/api/chat';
    const response = await fetchWithTimeout(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.LLM_MODEL || 'llama3',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false
      })
    }, FETCH_TIMEOUT_MS);
    if (!response.ok) throw new Error(`Ollama API Error: ${response.statusText}`);
    const data = await response.json();
    return extractOllamaContent(data);
  }

  throw new Error(`Unsupported LLM Provider: ${provider}`);
}
