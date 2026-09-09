import {
  buildOpenAiCompatibleRequest,
  createOpenAiCompatibleProvider,
  parseOpenAiCompatibleResponse,
} from './openai-compat.js';
import type { OpenAiCompatibleRequest } from './openai-compat.js';
import type { LlmProvider } from './provider.js';

/**
 * OpenAI provider adapter.
 *
 * A concrete `LlmProvider` for the OpenAI chat-completions API. It shares the
 * OpenAI wire format with DeepSeek, so the request builder, response parser and
 * HTTP factory are delegated to the shared `openai-compat` core; this adapter
 * only pins the OpenAI defaults.
 *
 * The API key is injected via `options.apiKey` and is never read from the
 * process environment or embedded here - credentials stay out of code and git.
 */

export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const OPENAI_CHAT_COMPLETIONS_PATH = '/chat/completions';

export interface OpenAiOptions {
  apiKey: string;
  /** Model identifier; defaults to `gpt-4o-mini`. */
  model?: string;
  /** API base URL; defaults to the public OpenAI endpoint. */
  baseUrl?: string;
  /** Injectable fetch for real-server tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export type OpenAiRequest = OpenAiCompatibleRequest;

/** Build the OpenAI chat-completions request body. */
export function buildOpenAiRequest(prompt: string, model: string): OpenAiRequest {
  return buildOpenAiCompatibleRequest(prompt, model);
}

/**
 * Extract the completion text from an OpenAI chat-completions response body.
 *
 * Throws on any shape that cannot yield a single completion string, so a malformed
 * or empty response surfaces as an explicit error instead of a silent empty string.
 */
export function parseOpenAiResponse(jsonText: string): string {
  return parseOpenAiCompatibleResponse(jsonText, 'OpenAI');
}

/** Create a `LlmProvider` backed by the OpenAI chat-completions API. */
export function createOpenAiProvider(options: OpenAiOptions): LlmProvider {
  const model = options.model ?? OPENAI_DEFAULT_MODEL;
  const baseUrl = options.baseUrl ?? OPENAI_DEFAULT_BASE_URL;
  return createOpenAiCompatibleProvider({
    apiKey: options.apiKey,
    model,
    baseUrl,
    name: 'OpenAI',
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  });
}
