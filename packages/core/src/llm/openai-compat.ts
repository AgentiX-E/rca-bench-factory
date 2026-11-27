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
  /** Completion ceiling in tokens; defaults to `OPENAI_COMPATIBLE_DEFAULT_MAX_TOKENS`. */
  maxTokens?: number;
  /** Injectable fetch for real-server tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * The completion ceiling a request states when its caller names none.
 *
 * Same number as `ANTHROPIC_DEFAULT_MAX_TOKENS`, and for the same reason: a call's
 * cost is its prompt tokens plus at most this many output tokens, so a stated ceiling
 * is the difference between a bill that can be computed before a run and one that is
 * discovered after it. Until v3.163 this core stated none, while `Anthropic` stated
 * 4096 -- and `scripts/derive-fault-golden.mjs` justified having no cap of its own by
 * saying the limit belonged to the provider layer, which was true of one adapter out
 * of three.
 */
export const OPENAI_COMPATIBLE_DEFAULT_MAX_TOKENS = 4096;

export interface OpenAiCompatibleRequest {
  model: string;
  messages: Array<{ role: 'user'; content: string }>;
  /** Zero for reproducible, deterministic rule generation. */
  temperature: number;
  stream: false;
  /** The most output tokens this request can be charged for. */
  max_tokens: number;
}

/** Build the OpenAI-compatible chat-completions request body. */
export function buildOpenAiCompatibleRequest(
  prompt: string,
  model: string,
  maxTokens: number = OPENAI_COMPATIBLE_DEFAULT_MAX_TOKENS,
): OpenAiCompatibleRequest {
  return {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    stream: false,
    max_tokens: maxTokens,
  };
}

/**
 * Extract the completion text from an OpenAI-compatible chat-completions
 * response body. Throws on any shape that cannot yield a single completion
 * string, so a malformed or empty response surfaces as an explicit error
 * instead of a silent empty string.
 *
 * The first choice is not the only choice worth reading. An OpenAI-compatible
 * server may return a leading choice that carries no text -- a refusal, a
 * content-filtered turn -- with a usable completion behind it, and reading only
 * `choices[0]` discarded that answer while reporting the response as unusable.
 * Every choice is inspected in order and the first usable text wins.
 *
 * "Usable" excludes the empty string: the declared return type is `string`, so
 * accepting `''` made an empty answer indistinguishable from a real one at every
 * call site. A whitespace-only completion is still accepted, because that is a
 * real answer a model can give.
 *
 * The message for a bare first choice keeps the wording this parser has always
 * used. When there is only one choice, a count would add nothing to the
 * diagnosis, and the long-standing wording is what an operator already greps
 * for; the ranked message is worth its extra words only once position is
 * genuinely ambiguous.
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
  for (const [position, choice] of choices.entries()) {
    // Checked before property access. Without this a `null` element threw a raw
    // `TypeError: Cannot read properties of null (reading 'message')`, escaping
    // as an internal error while every other malformed shape got a named one.
    if (typeof choice !== 'object' || choice === null || Array.isArray(choice)) {
      throw new Error(`${name} response choice ${position} is not an object`);
    }
    const message = (choice as Record<string, unknown>).message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content === 'string' && content !== '') return content;
  }
  if (choices.length === 1) {
    throw new Error(`${name} response choice has no string content`);
  }
  throw new Error(`${name} response has no usable completion text (${choices.length} choice(s))`);
}

/**
 * Create a `LlmProvider` backed by an OpenAI-compatible chat-completions API.
 *
 * The API key is injected via `options.apiKey` and is never read from the
 * process environment or embedded here - credentials stay out of code and git.
 */
export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions): LlmProvider {
  const { apiKey, model, baseUrl, name } = options;
  const maxTokens = options.maxTokens ?? OPENAI_COMPATIBLE_DEFAULT_MAX_TOKENS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    async generate(prompt: string): Promise<string> {
      const body = buildOpenAiCompatibleRequest(prompt, model, maxTokens);
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
