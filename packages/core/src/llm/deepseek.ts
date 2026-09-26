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

/**
 * The default model, named as DeepSeek's current documentation names it.
 *
 * This was `deepseek-chat` until that alias was disabled on 2026-07-24, and a
 * default pointing at a disabled alias is worse than a wrong one: every run that
 * omitted `RCA_BENCH_LLM_MODEL` failed at the provider instead of at
 * configuration, which reads as a transport fault rather than a stale constant.
 *
 * The replacement is deliberately *not* `deepseek-v4-flash`. That name is itself
 * a legacy alias now -- retired with V4-Flash when V4.1-Flash shipped on
 * 2026-09-10 and still routed only "for compatibility". Pinning a name that is
 * one deprecation away from the same failure would buy a few months and a second
 * identical incident. `deepseek-flash` is the name the vendor asks callers to
 * use, and the one their own curl example uses.
 *
 * Cost note, since it is the reason this constant is worth a comment: the
 * retired `deepseek-chat` and `deepseek-reasoner` both resolved to V4-Flash, so
 * `deepseek-flash` is the migration target as documented. `deepseek-v4-pro` is
 * the tempting-looking successor to `deepseek-reasoner` and costs roughly 3x for
 * the same traffic; it is a capability upgrade, not a rename.
 */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-flash';
export const DEEPSEEK_DEFAULT_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_CHAT_COMPLETIONS_PATH = '/chat/completions';

export interface DeepSeekOptions {
  apiKey: string;
  /** Model identifier; defaults to `deepseek-flash`. */
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
