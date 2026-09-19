import { describe, expect, it } from 'vitest';
import {
  buildOpenAiCompatibleRequest,
  createOpenAiCompatibleProvider,
  parseOpenAiCompatibleResponse,
} from '../src/llm/openai-compat.js';

/**
 * OpenAI-compatible transport tests.
 *
 * This module had no test file at all (0 test references for 98 source lines),
 * yet it is the shared transport under both the DeepSeek and OpenAI adapters, so
 * every LLM-dependent path in the factory depends on it. Three defects were
 * reproduced against the shipped build before any of them was fixed:
 *
 *   1. Only `choices[0]` was ever read. An OpenAI-compatible server returns the
 *      *generated* completion first, and refusal/filtered responses can carry a
 *      null-content first choice with a usable one behind it. Measured: two
 *      choices, the first with `content: null` and the second with `"second"`,
 *      threw `X response choice has no string content` — a usable answer
 *      discarded because of a different element.
 *   2. `choices[0]` was read without checking it is an object, so `choices: [null]`
 *      threw a raw `TypeError: Cannot read properties of null (reading 'message')`
 *      instead of this module's own diagnostic. Every other malformed shape gets
 *      a named message; this one escaped as an internal error.
 *   3. The declared return type is `string`, and `''` was accepted as a
 *      completion, so an empty answer was indistinguishable from a real one.
 */

const ok = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  }) as Response;

const fail = (status: number, text: string): Response =>
  ({ ok: false, status, text: async () => text }) as Response;

describe('parseOpenAiCompatibleResponse - choice selection', () => {
  it('reads the first choice when it carries content', () => {
    expect(
      parseOpenAiCompatibleResponse(
        JSON.stringify({ choices: [{ message: { content: 'first' } }, { message: { content: 'second' } }] }),
        'X',
      ),
    ).toBe('first');
  });

  it('falls through to a usable choice when the first carries none', () => {
    // Measured before the fix: this threw, discarding a perfectly good answer.
    expect(
      parseOpenAiCompatibleResponse(
        JSON.stringify({ choices: [{ message: { content: null } }, { message: { content: 'second' } }] }),
        'X',
      ),
    ).toBe('second');
  });

  it('falls through across several unusable choices', () => {
    expect(
      parseOpenAiCompatibleResponse(
        JSON.stringify({
          choices: [
            { message: { content: null } },
            { message: { content: 42 } },
            { message: { content: 'third' } },
          ],
        }),
        'X',
      ),
    ).toBe('third');
  });

  it('reports the choices shape when no choice carries usable content', () => {
    // One choice: the long-standing wording, which needs no count to be useful.
    expect(() =>
      parseOpenAiCompatibleResponse(
        JSON.stringify({ choices: [{ message: { content: null } }] }),
        'X',
      ),
    ).toThrow(/X response choice has no string content/);
    // Several choices: now the count is the diagnosis, so it is reported.
    expect(() =>
      parseOpenAiCompatibleResponse(
        JSON.stringify({ choices: [{ message: { content: null } }, { message: { content: null } }] }),
        'X',
      ),
    ).toThrow(/X response has no usable completion text \(2 choice\(s\)\)/);
  });

  it('names the module in its diagnostic rather than leaking a TypeError', () => {
    // Measured before the fix: `TypeError: Cannot read properties of null`.
    expect(() => parseOpenAiCompatibleResponse(JSON.stringify({ choices: [null] }), 'X')).toThrow(
      /^X response choice 0 is not an object$/,
    );
    expect(() => parseOpenAiCompatibleResponse(JSON.stringify({ choices: [null] }), 'X')).not.toThrow(
      /Cannot read propert/,
    );
  });

  it('rejects a non-object choice at any position', () => {
    expect(() =>
      parseOpenAiCompatibleResponse(
        JSON.stringify({ choices: [{ message: { content: null } }, 'nope'] }),
        'X',
      ),
    ).toThrow(/X response choice 1 is not an object/);
  });
});

describe('parseOpenAiCompatibleResponse - shape rejection', () => {
  it('rejects invalid JSON with a named error', () => {
    expect(() => parseOpenAiCompatibleResponse('not json', 'X')).toThrow('X response is not valid JSON');
  });

  it('rejects a JSON array', () => {
    expect(() => parseOpenAiCompatibleResponse('[]', 'X')).toThrow('X response is not a JSON object');
  });

  it('rejects a JSON scalar', () => {
    expect(() => parseOpenAiCompatibleResponse('42', 'X')).toThrow('X response is not a JSON object');
    expect(() => parseOpenAiCompatibleResponse('null', 'X')).toThrow('X response is not a JSON object');
  });

  it('rejects a missing or empty choices array', () => {
    expect(() => parseOpenAiCompatibleResponse('{}', 'X')).toThrow('X response has no choices');
    expect(() => parseOpenAiCompatibleResponse('{"choices":[]}', 'X')).toThrow('X response has no choices');
    expect(() => parseOpenAiCompatibleResponse('{"choices":"nope"}', 'X')).toThrow('X response has no choices');
  });

  it('rejects an empty completion instead of returning the empty string', () => {
    // Measured before the fix: `''` came back as a successful completion, so a
    // caller could not tell an empty answer from a real one.
    expect(() =>
      parseOpenAiCompatibleResponse(JSON.stringify({ choices: [{ message: { content: '' } }] }), 'X'),
    ).toThrow(/X response choice has no string content/);
  });

  it('keeps a completion that is whitespace, which is a real answer', () => {
    expect(
      parseOpenAiCompatibleResponse(JSON.stringify({ choices: [{ message: { content: ' ' } }] }), 'X'),
    ).toBe(' ');
  });
});

describe('buildOpenAiCompatibleRequest', () => {
  it('asks for a deterministic, non-streamed completion', () => {
    expect(buildOpenAiCompatibleRequest('p', 'm')).toEqual({
      model: 'm',
      messages: [{ role: 'user', content: 'p' }],
      temperature: 0,
      stream: false,
    });
  });

  it('carries the prompt verbatim, including newlines', () => {
    const prompt = 'line 1\nline 2\n\n{"type":"t"}';
    expect(buildOpenAiCompatibleRequest(prompt, 'm').messages[0]?.content).toBe(prompt);
  });
});

describe('createOpenAiCompatibleProvider - transport', () => {
  const options = { apiKey: 'secret-key', model: 'm', baseUrl: 'https://example.test/v1', name: 'X' };

  it('posts the built body to /chat/completions with bearer auth', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const provider = createOpenAiCompatibleProvider({
      ...options,
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push({ url, init });
        return ok({ choices: [{ message: { content: 'answer' } }] });
      }) as unknown as typeof fetch,
    });

    await expect(provider.generate('hello')).resolves.toBe('answer');

    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe('https://example.test/v1/chat/completions');
    expect(seen[0]?.init.method).toBe('POST');
    expect(seen[0]?.init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret-key',
    });
    expect(JSON.parse(String(seen[0]?.init.body))).toEqual({
      model: 'm',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0,
      stream: false,
    });
  });

  it('surfaces a non-2xx status with the provider name and a bounded body', async () => {
    const provider = createOpenAiCompatibleProvider({
      ...options,
      fetchImpl: (async () => fail(429, 'x'.repeat(500))) as unknown as typeof fetch,
    });
    await expect(provider.generate('p')).rejects.toThrow(/^X API error 429: x{200}$/);
  });

  it('reports an error response whose body is JSON, not a completion', async () => {
    const provider = createOpenAiCompatibleProvider({
      ...options,
      fetchImpl: (async () =>
        fail(401, JSON.stringify({ error: { message: 'invalid key' } }))) as unknown as typeof fetch,
    });
    await expect(provider.generate('p')).rejects.toThrow(/X API error 401/);
  });

  it('propagates a transport failure rather than reporting an empty completion', async () => {
    const provider = createOpenAiCompatibleProvider({
      ...options,
      fetchImpl: (async () => {
        throw new Error('socket hang up');
      }) as unknown as typeof fetch,
    });
    await expect(provider.generate('p')).rejects.toThrow('socket hang up');
  });
});
