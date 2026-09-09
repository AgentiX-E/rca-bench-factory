import type { LlmProvider } from './provider.js';

/**
 * Shared OpenAI-compatible chat-completions core.
 *
 * DeepSeek and OpenAI both expose the OpenAI chat-completions wire format, so
 * the request builder, response parser and HTTP factory live here once and are
 * reused by both adapters. Only the defaults (base URL, model, provider name)
 * differ. Anthropic uses a different Messages API and has its own adapter.
 */

export interface OpenAiCompatibleOptions {
  apiKey: string;
  model: string;
  /** API base URL, without the `/chat/completions` suffix. */
  baseUrl: string;
  /** Provider name used in error messages, e.g. "OpenAI" or "DeepSeek". */
  name: string;
  /** Injectable fetch for real-server tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface OpenAiCompatibleRequest {
  model: string;
  messages: Array<{ role: 'user'; content: string }>;
  /** Zero for reproducible, deterministic rule generation. */
  temperature: number;
  stream: false;
}

/** Build the OpenAI-compatible chat-completions request body. */
export function buildOpenAiCompatibleRequest(prompt: string, model: string): OpenAiCompatibleRequest {
  return {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    stream: false,
  };
}

/**
 * Extract the completion text from an OpenAI-compatible chat-completions
 * response body. Throws on any shape that cannot yield a single completion
 * string, so a malformed or empty response surfaces as an explicit error
 * instead of a silent empty string.
 */
export function parseOpenAiCompatibleResponse(jsonText: string, name: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`${name} response is not valid JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name} response is not a JSON object`);
  }
  const choices = (parsed as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error(`${name} response has no choices`);
  }
  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== 'string') {
    throw new Error(`${name} response choice has no string content`);
  }
  return content;
}

/**
 * Create a `LlmProvider` backed by an OpenAI-compatible chat-completions API.
 *
 * The API key is injected via `options.apiKey` and is never read from the
 * process environment or embedded here - credentials stay out of code and git.
 */
export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions): LlmProvider {
  const { apiKey, model, baseUrl, name } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    async generate(prompt: string): Promise<string> {
      const body = buildOpenAiCompatibleRequest(prompt, model);
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${name} API error ${response.status}: ${text.slice(0, 200)}`);
      }
      return parseOpenAiCompatibleResponse(text, name);
    },
  };
}
