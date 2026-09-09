import {
  buildOpenAiCompatibleRequest,
  createOpenAiCompatibleProvider,
  parseOpenAiCompatibleResponse,
} from './openai-compat.js';
import type { OpenAiCompatibleRequest } from './openai-compat.js';
import type { LlmProvider } from './provider.js';

/**
 * DeepSeek provider adapter.
 *
 * The first concrete `LlmProvider`: it maps a prompt onto the OpenAI-compatible
 * DeepSeek chat-completions API. DeepSeek shares the OpenAI wire format, so the
 * request builder, response parser and HTTP factory are delegated to the shared
 * `openai-compat` core; this adapter only pins the DeepSeek defaults.
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

export type DeepSeekRequest = OpenAiCompatibleRequest;

/** Build the OpenAI-compatible chat-completions request body. */
export function buildDeepSeekRequest(prompt: string, model: string): DeepSeekRequest {
  return buildOpenAiCompatibleRequest(prompt, model);
}

/**
 * Extract the completion text from a DeepSeek chat-completions response body.
 *
 * Throws on any shape that cannot yield a single completion string, so a malformed
 * or empty response surfaces as an explicit error instead of a silent empty string.
 */
export function parseDeepSeekResponse(jsonText: string): string {
  return parseOpenAiCompatibleResponse(jsonText, 'DeepSeek');
}

/** Create a `LlmProvider` backed by the DeepSeek chat-completions API. */
export function createDeepSeekProvider(options: DeepSeekOptions): LlmProvider {
  const model = options.model ?? DEEPSEEK_DEFAULT_MODEL;
  const baseUrl = options.baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL;
  return createOpenAiCompatibleProvider({
    apiKey: options.apiKey,
    model,
    baseUrl,
    name: 'DeepSeek',
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  });
}
