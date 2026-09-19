import type { LlmProvider } from './provider.js';

/**
 * Anthropic provider adapter.
 *
 * A concrete `LlmProvider` for the Anthropic Messages API, which uses a
 * different wire format from the OpenAI-compatible providers: the endpoint is
 * `/v1/messages`, the credential header is `x-api-key` plus a version header,
 * and the response carries a `content` array of typed blocks instead of
 * `choices[].message.content`. The request builder and response parser are pure
 * (and IO-free), so the adapter is fully testable without a live account, while
 * the HTTP round trip itself is exercised against a real local server.
 *
 * The API key is injected via `options.apiKey` and is never read from the
 * process environment or embedded here - credentials stay out of code and git.
 */

export const ANTHROPIC_DEFAULT_MODEL = 'claude-3-5-sonnet-latest';
export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';
export const ANTHROPIC_MESSAGES_PATH = '/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096;

export interface AnthropicOptions {
  apiKey: string;
  /** Model identifier; defaults to `claude-3-5-sonnet-latest`. */
  model?: string;
  /** API base URL; defaults to the public Anthropic endpoint. */
  baseUrl?: string;
  /** Maximum output tokens; defaults to 4096. */
  maxTokens?: number;
  /** Injectable fetch for real-server tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: Array<{ role: 'user'; content: string }>;
  /** Zero for reproducible, deterministic rule generation. */
  temperature: number;
}

/** Build the Anthropic Messages API request body. */
export function buildAnthropicRequest(prompt: string, model: string, maxTokens: number): AnthropicRequest {
  return {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
  };
}

/**
 * Extract the completion text from an Anthropic Messages API response body.
 *
 * Anthropic returns `content` as an array of typed blocks, and the completion is
 * the concatenation of every `text` block in the array. Reading only
 * `content[0]` was wrong in two ways, both measured:
 *
 *   - a leading non-text block (`tool_use`, `thinking`) threw while a perfectly
 *     usable text block sat behind it, discarding the answer;
 *   - a completion split across several text blocks returned only the first, so
 *     the caller received a truncated answer -- which for a JSON-producing
 *     prompt surfaces later as "malformed JSON", blaming the model's formatting
 *     for a parser that dropped half its output.
 *
 * Blocks that are not text, and text blocks with no usable string, are skipped
 * rather than rejected: an empty text block is a real shape (a suppressed
 * segment), not a corruption. Only a response with no usable text at all is an
 * error, and every malformed shape produces this module's own named diagnostic
 * -- never a `TypeError`, which names a JavaScript operation rather than a
 * response shape.
 */
export function parseAnthropicResponse(jsonText: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Anthropic response is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Anthropic response is not a JSON object');
  }
  const content = (parsed as Record<string, unknown>).content;
  if (!Array.isArray(content)) {
    throw new Error('Anthropic response content is not an array');
  }
  if (content.length === 0) {
    throw new Error('Anthropic response has no content');
  }

  const parts: string[] = [];
  for (const [position, block] of content.entries()) {
    if (typeof block !== 'object' || block === null || Array.isArray(block)) {
      throw new Error(`Anthropic response content block ${position} is not an object`);
    }
    const record = block as Record<string, unknown>;
    if (record.type !== 'text') {
      // A non-text block is a legitimate part of a response (a tool call, a
      // reasoning segment); it simply carries no completion.
      continue;
    }
    const text = record.text;
    if (typeof text === 'string' && text !== '') parts.push(text);
  }

  if (parts.length === 0) {
    throw new Error('Anthropic response has no usable completion text');
  }
  const completion = parts.join('');
  if (completion.trim() === '') {
    throw new Error('Anthropic response has no usable completion text (it is blank)');
  }
  return completion;
}

/** Create a `LlmProvider` backed by the Anthropic Messages API. */
export function createAnthropicProvider(options: AnthropicOptions): LlmProvider {
  const apiKey = options.apiKey;
  const model = options.model ?? ANTHROPIC_DEFAULT_MODEL;
  const baseUrl = options.baseUrl ?? ANTHROPIC_DEFAULT_BASE_URL;
  const maxTokens = options.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    async generate(prompt: string): Promise<string> {
      const body = buildAnthropicRequest(prompt, model, maxTokens);
      const response = await fetchImpl(`${baseUrl}${ANTHROPIC_MESSAGES_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Anthropic API error ${response.status}: ${text.slice(0, 200)}`);
      }
      return parseAnthropicResponse(text);
    },
  };
}
