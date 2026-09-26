import type { LlmProvider } from './provider.js';
import { createDeepSeekProvider } from './deepseek.js';
import { createOpenAiProvider } from './openai.js';
import { createAnthropicProvider } from './anthropic.js';

/**
 * The registry that makes "provider-agnostic" true at the entry point.
 *
 * The adapters in this directory were already interchangeable -- they all take
 * `{apiKey, model?, baseUrl?}` and return the same `generate(prompt) -> text`.
 * What was *not* interchangeable was the code that chose between them: the
 * derivation script called `createDeepSeekProvider` by name and read a
 * DeepSeek-specific environment variable. So the abstraction held everywhere
 * except the one place a user configures, which is the only place it matters.
 *
 * This module closes that gap. A caller states a provider id -- or nothing, and
 * gets the benchmark default -- and the registry does the mapping. No caller
 * needs to know which vendor it is talking to, and adding a vendor means adding
 * one entry here rather than editing every call site.
 *
 * The provider id comes from configuration, never from code. That is what makes
 * an organisation's existing key usable without renaming it to whatever this
 * repository happened to pick.
 */

export const LLM_PROVIDER_IDS = Object.freeze(['deepseek', 'openai', 'anthropic'] as const);

export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

/**
 * The provider used when configuration says nothing.
 *
 * A default rather than a privilege. It is the provider this project's
 * benchmark figures were produced against, so an unconfigured checkout
 * reproduces the documented numbers instead of silently measuring something
 * else. Every other provider is reachable by saying so.
 */
export const DEFAULT_LLM_PROVIDER: LlmProviderId = 'deepseek';

/**
 * Names a workflow or an operator plausibly already uses for each provider.
 *
 * Configuration is written by people, and people name a secret after the vendor
 * rather than after this repository's internal id. Accepting `claude` for
 * `anthropic` costs one line and removes a rename that would otherwise be the
 * user's problem -- which is the shape of the mistake this module exists to fix.
 */
const PROVIDER_ALIASES: Readonly<Record<string, LlmProviderId>> = Object.freeze({
  deepseek: 'deepseek',
  'deepseek-chat': 'deepseek',
  openai: 'openai',
  'gpt': 'openai',
  anthropic: 'anthropic',
  claude: 'anthropic',
});

/** The options every provider accepts, identically. */
export interface LlmProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export type LlmProviderConfigResult =
  | { ok: true; provider: LlmProviderId }
  | { ok: false; error: string };

export type LlmProviderBuildResult =
  | { ok: true; provider: LlmProvider }
  | { ok: false; error: string };

/** Whether a value is a provider this registry can build. */
export function isLlmProviderId(value: unknown): value is LlmProviderId {
  return typeof value === 'string' && (LLM_PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Decide which provider a run should use, from the environment.
 *
 * An unset or blank value means "use the default". A value that is *set but
 * unrecognised* is an error and never falls back: silently running against
 * DeepSeek when the caller asked for something else would produce a number
 * labelled with a provider it did not come from.
 */
export function resolveLlmProviderConfig(env: Record<string, string | undefined>): LlmProviderConfigResult {
  const stated = (env['RCA_BENCH_LLM_PROVIDER'] ?? '').trim();
  if (stated === '') {
    return { ok: true, provider: DEFAULT_LLM_PROVIDER };
  }
  const resolved = PROVIDER_ALIASES[stated.toLowerCase()];
  if (resolved === undefined) {
    return {
      ok: false,
      error:
        `unknown LLM provider '${stated}'. ` +
        `Known providers: ${LLM_PROVIDER_IDS.join(', ')} ` +
        `(aliases: ${Object.keys(PROVIDER_ALIASES).join(', ')}).`,
    };
  }
  return { ok: true, provider: resolved };
}

/**
 * Build the provider a run should use.
 *
 * One options shape for every vendor. A provider that needed its own parameter
 * names would force the caller to know which vendor it was talking to, which is
 * exactly the coupling the adapters already avoid.
 */
export function createLlmProvider(
  id: unknown,
  options: LlmProviderOptions,
): LlmProviderBuildResult {
  if (!isLlmProviderId(id)) {
    return {
      ok: false,
      error: `unknown LLM provider '${String(id)}'. Known providers: ${LLM_PROVIDER_IDS.join(', ')}.`,
    };
  }

  const forwarded = {
    apiKey: options.apiKey,
    ...(options.model !== undefined ? { model: options.model } : {}),
    ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
    ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}),
  };

  switch (id) {
    case 'deepseek':
      return { ok: true, provider: createDeepSeekProvider(forwarded) };
    case 'openai':
      return { ok: true, provider: createOpenAiProvider(forwarded) };
    case 'anthropic':
      return { ok: true, provider: createAnthropicProvider(forwarded) };
  }
}

/**
 * The environment variable names a workflow must populate, for one provider.
 *
 * Exported so a workflow can be *generated* rather than hand-written, and so the
 * name of a provider's key is stated once here instead of being repeated in
 * YAML, in a script, and in a document.
 */
export const LLM_PROVIDER_ENV_VARS = Object.freeze({
  /** Which provider to use. Unset means the default. */
  provider: 'RCA_BENCH_LLM_PROVIDER',
  /** The key itself. Required by every provider. */
  apiKey: 'RCA_BENCH_LLM_API_KEY',
  /** Optional endpoint override. */
  baseUrl: 'RCA_BENCH_LLM_BASE_URL',
  /** Optional model override. */
  model: 'RCA_BENCH_LLM_MODEL',
} as const);
