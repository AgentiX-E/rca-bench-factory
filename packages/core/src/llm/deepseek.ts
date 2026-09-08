import type { LlmProvider } from './provider.js';

/**
 * DeepSeek provider adapter.
 *
 * The first concrete `LlmProvider`: it maps a prompt onto the OpenAI-compatible
 * DeepSeek chat-completions API. Keeping the request builder and response parser
 * pure (and IO-free) means the adapter is fully testable without a live account,
 * while the HTTP round trip itself is exercised against a real local server.
 *
 * The API key is injected via `options.apiKey` and is never read from the
 * process environment or embedded here - credentials stay out of code and git.
 */

export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat';
export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_CHAT_COMPLETIONS_PATH = '/chat/completions';

export interface DeepSeekOptions {
  apiKey: string;
  /** Model identifier; defaults to `deepseek-chat`. */
  model?: string;
  /** API base URL; defaults to the public DeepSeek endpoint. */
  baseUrl?: string;
  /** Injectable fetch for real-server tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface DeepSeekRequest {
  model: string;
  messages: Array<{ role: 'user'; content: string }>;
  /** Zero for reproducible, deterministic rule generation. */
  temperature: number;
  stream: false;
}

/** Build the OpenAI-compatible chat-completions request body. */
export function buildDeepSeekRequest(prompt: string, model: string): DeepSeekRequest {
  return {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    stream: false,
  };
}

/**
 * Extract the completion text from a DeepSeek chat-completions response body.
 *
 * Throws on any shape that cannot yield a single completion string, so a malformed
 * or empty response surfaces as an explicit error instead of a silent empty string.
 */
export function parseDeepSeekResponse(jsonText: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('DeepSeek response is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('DeepSeek response is not a JSON object');
  }
  const choices = (parsed as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error('DeepSeek response has no choices');
  }
  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== 'string') {
    throw new Error('DeepSeek response choice has no string content');
  }
  return content;
}

/** Create a `LlmProvider` backed by the DeepSeek chat-completions API. */
export function createDeepSeekProvider(options: DeepSeekOptions): LlmProvider {
  const apiKey = options.apiKey;
  const model = options.model ?? DEEPSEEK_DEFAULT_MODEL;
  const baseUrl = options.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    async generate(prompt: string): Promise<string> {
      const body = buildDeepSeekRequest(prompt, model);
      const response = await fetchImpl(`${baseUrl}${DEEPSEEK_CHAT_COMPLETIONS_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`DeepSeek API error ${response.status}: ${text.slice(0, 200)}`);
      }
      return parseDeepSeekResponse(text);
    },
  };
}
