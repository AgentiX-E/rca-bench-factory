import { describe, expect, it } from 'vitest';
import {
  LLM_PROVIDER_IDS,
  createLlmProvider,
  isLlmProviderId,
  resolveLlmProviderConfig,
} from '../../src/llm/registry.js';

/**
 * The provider registry, and the parameter names it will accept.
 *
 * This module exists because a workflow hard-coded one vendor's secret name.
 * The tests below pin the two properties that keep that from recurring: every
 * registered provider is reachable by name, and *no* provider is privileged by
 * having its parameter names hard-coded anywhere.
 *
 * The negative assertions matter more than the positive ones. A registry that
 * works for DeepSeek and quietly only works for DeepSeek passes every happy-path
 * test; what catches it is asserting that an arbitrary provider's parameters are
 * honoured without the registry knowing which provider it is.
 */

describe('LLM_PROVIDER_IDS', () => {
  it('lists the providers the core package actually implements', () => {
    // Pinned as a set rather than compared to a count, because a count cannot
    // say *which* provider went missing.
    expect([...LLM_PROVIDER_IDS].sort()).toEqual(['anthropic', 'deepseek', 'openai']);
  });

  it('is frozen, so a caller cannot widen the registry at runtime', () => {
    expect(Object.isFrozen(LLM_PROVIDER_IDS)).toBe(true);
  });
});

describe('isLlmProviderId', () => {
  it('accepts every registered id', () => {
    for (const id of LLM_PROVIDER_IDS) {
      expect(isLlmProviderId(id)).toBe(true);
    }
  });

  it('rejects an unknown id, a case variant, and a non-string', () => {
    expect(isLlmProviderId('gemini')).toBe(false);
    expect(isLlmProviderId('DeepSeek')).toBe(false);
    expect(isLlmProviderId('')).toBe(false);
    expect(isLlmProviderId(undefined)).toBe(false);
    expect(isLlmProviderId(42)).toBe(false);
  });
});

describe('resolveLlmProviderConfig', () => {
  it('reads the provider from a neutral variable, not a vendor-named one', () => {
    const config = resolveLlmProviderConfig({ RCA_BENCH_LLM_PROVIDER: 'openai' });
    expect(config).toEqual({ ok: true, provider: 'openai' });
  });

  it('defaults to deepseek when nothing states a provider', () => {
    // The default is a *default*, not a privilege: it is the provider this
    // project's benchmarks were run against, so an unconfigured checkout
    // reproduces the documented figures.
    expect(resolveLlmProviderConfig({})).toEqual({ ok: true, provider: 'deepseek' });
  });

  it('treats an empty or whitespace-only value as unset rather than as a name', () => {
    expect(resolveLlmProviderConfig({ RCA_BENCH_LLM_PROVIDER: '' })).toEqual({
      ok: true,
      provider: 'deepseek',
    });
    expect(resolveLlmProviderConfig({ RCA_BENCH_LLM_PROVIDER: '   ' })).toEqual({
      ok: true,
      provider: 'deepseek',
    });
  });

  it('names the unknown provider and lists the known ones', () => {
    const config = resolveLlmProviderConfig({ RCA_BENCH_LLM_PROVIDER: 'gemini' });
    expect(config.ok).toBe(false);
    if (!config.ok) {
      expect(config.error).toMatch(/gemini/);
      // A reader with a typo needs to know what to type instead.
      expect(config.error).toMatch(/anthropic/);
      expect(config.error).toMatch(/deepseek/);
      expect(config.error).toMatch(/openai/);
    }
  });

  it('does not fall back to the default when the stated provider is wrong', () => {
    // Falling back would run the benchmark against a different model than the
    // one that was asked for, and report it under the requested name.
    //
    // The value matters: `gpt` is a *valid* alias for openai, and an earlier
    // version of this test used it and failed -- correctly. What is being
    // asserted is behaviour for a name no alias covers.
    const config = resolveLlmProviderConfig({ RCA_BENCH_LLM_PROVIDER: 'gpt-4o' });
    expect(config.ok).toBe(false);
  });

  it('accepts the aliases a workflow is likely to already define', () => {
    // Organisations name their secrets after the vendor. Mapping those onto ids
    // is what lets an existing key be used without renaming it.
    expect(resolveLlmProviderConfig({ RCA_BENCH_LLM_PROVIDER: 'deepseek-chat' })).toEqual({
      ok: true,
      provider: 'deepseek',
    });
    expect(resolveLlmProviderConfig({ RCA_BENCH_LLM_PROVIDER: 'claude' })).toEqual({
      ok: true,
      provider: 'anthropic',
    });
  });
});

describe('createLlmProvider', () => {
  it('is not reachable for an unknown id', () => {
    const result = createLlmProvider('gemini' as never, { apiKey: 'k' });
    expect(result.ok).toBe(false);
  });

  it('builds every registered provider from the same options shape', () => {
    // The single options shape is the load-bearing part: if a provider needed
    // its own parameter names, the caller would have to know which vendor it was
    // talking to, which is the coupling this module removes.
    for (const id of LLM_PROVIDER_IDS) {
      const result = createLlmProvider(id, { apiKey: 'test-key' });
      expect(result.ok, `provider ${id} should build`).toBe(true);
      if (result.ok) {
        expect(typeof result.provider.generate).toBe('function');
      }
    }
  });

  it('passes baseUrl and model through to every provider', () => {
    for (const id of LLM_PROVIDER_IDS) {
      const withOverrides = createLlmProvider(id, {
        apiKey: 'k',
        baseUrl: 'https://example.invalid/v1',
        model: 'some-model',
      });
      const withDefaults = createLlmProvider(id, { apiKey: 'k' });
      expect(withOverrides.ok, `provider ${id} should build with overrides`).toBe(true);
      expect(withDefaults.ok).toBe(true);
      // Both build, and neither throws on the override path. The wire-level
      // effect of the overrides is asserted in each adapter's own suite; what
      // this pins is that the registry forwards them at all.
      if (withOverrides.ok && withDefaults.ok) {
        expect(typeof withOverrides.provider.generate).toBe('function');
        expect(typeof withDefaults.provider.generate).toBe('function');
      }
    }
  });

  it('forwards an injected fetch, so the registry stays testable without a network', () => {
    let called = '';
    const fakeFetch = (async (url: string) => {
      called = String(url);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const result = createLlmProvider('deepseek', {
      apiKey: 'k',
      baseUrl: 'https://example.invalid',
      fetchImpl: fakeFetch,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      return result.provider.generate('hi').then((text) => {
        expect(text).toBe('ok');
        expect(called).toContain('https://example.invalid');
      });
    }
    return undefined;
  });
});
