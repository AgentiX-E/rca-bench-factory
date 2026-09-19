import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_DEFAULT_BASE_URL,
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_MESSAGES_PATH,
  ANTHROPIC_VERSION,
  buildAnthropicRequest,
  createAnthropicProvider,
  parseAnthropicResponse,
} from '../src/llm/anthropic.js';
import type { AnthropicOptions } from '../src/llm/anthropic.js';

/**
 * Anthropic provider adapter tests.
 *
 * Anthropic uses the Messages API (not the OpenAI-compatible wire format), so
 * the request builder, the `content`-block response parser and the HTTP factory
 * are all exercised here. The request builder and parser are pure; the HTTP
 * path runs against a real local HTTP server (no mocking library, no stubbed
 * fetch).
 */

async function withServer(
  status: number,
  body: string,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('constants', () => {
  it('exposes the Anthropic defaults', () => {
    expect(ANTHROPIC_DEFAULT_MODEL).toBe('claude-3-5-sonnet-latest');
    expect(ANTHROPIC_DEFAULT_BASE_URL).toBe('https://api.anthropic.com');
    expect(ANTHROPIC_MESSAGES_PATH).toBe('/v1/messages');
    expect(ANTHROPIC_VERSION).toBe('2023-06-01');
    expect(ANTHROPIC_DEFAULT_MAX_TOKENS).toBe(4096);
  });
});

describe('buildAnthropicRequest', () => {
  it('builds a Messages request with deterministic temperature and max tokens', () => {
    expect(buildAnthropicRequest('map these columns', 'claude-3-5-sonnet-latest', 4096)).toEqual({
      model: 'claude-3-5-sonnet-latest',
      max_tokens: 4096,
      messages: [{ role: 'user', content: 'map these columns' }],
      temperature: 0,
    });
  });

  it('carries the requested model and max tokens verbatim', () => {
    const req = buildAnthropicRequest('p', 'claude-3-opus-latest', 8192);
    expect(req.model).toBe('claude-3-opus-latest');
    expect(req.max_tokens).toBe(8192);
  });
});

describe('parseAnthropicResponse', () => {
  it('extracts the text from the first text block', () => {
    const body = JSON.stringify({ content: [{ type: 'text', text: 'generated' }] });
    expect(parseAnthropicResponse(body)).toBe('generated');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseAnthropicResponse('not json')).toThrow(/JSON/i);
  });

  it('throws on a JSON array', () => {
    expect(() => parseAnthropicResponse('[1,2,3]')).toThrow(/object/i);
  });

  it('throws on a JSON null', () => {
    expect(() => parseAnthropicResponse('null')).toThrow(/object/i);
  });

  it('throws when content is missing', () => {
    expect(() => parseAnthropicResponse('{"id":"x"}')).toThrow(/content/i);
  });

  it('throws when content is empty', () => {
    expect(() => parseAnthropicResponse('{"content":[]}')).toThrow(/content/i);
  });

  it('throws when the first block is not a text block', () => {
    expect(() => parseAnthropicResponse('{"content":[{"type":"tool_use","name":"x"}]}')).toThrow(/text/i);
  });

  it('throws when the text block has no string text', () => {
    expect(() => parseAnthropicResponse('{"content":[{"type":"text"}]}')).toThrow(/text/i);
  });
});

/**
 * Measured against the shipped build before the fix; each case quotes the value
 * that came back, so the defect is a number and not an opinion.
 */
describe('parseAnthropicResponse - the completion is not always the first block', () => {
  it('reads the text block when a tool_use block precedes it', () => {
    // Measured before the fix: threw 'Anthropic response content has no string
    // text' while a usable text block sat at index 1.
    const body = JSON.stringify({
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'lookup', input: {} }, { type: 'text', text: 'answer' }],
    });
    expect(parseAnthropicResponse(body)).toBe('answer');
  });

  it('reads the text block when a thinking block precedes it', () => {
    // Measured before the fix: threw, same message, with the answer behind a
    // reasoning block -- a shape the current API returns by default.
    const body = JSON.stringify({
      content: [{ type: 'thinking', thinking: 'working through it' }, { type: 'text', text: 'answer' }],
    });
    expect(parseAnthropicResponse(body)).toBe('answer');
  });

  it('joins multiple text blocks instead of returning only the first', () => {
    // Measured before the fix: returned 'first', silently dropping ' second'.
    // A response split across blocks is one completion, and returning half of it
    // gives a truncated JSON body that the caller then reports as malformed.
    const body = JSON.stringify({
      content: [{ type: 'text', text: 'first' }, { type: 'text', text: 'second' }],
    });
    expect(parseAnthropicResponse(body)).toBe('firstsecond');
  });

  it('skips blocks that carry no usable text and keeps the rest', () => {
    const body = JSON.stringify({
      content: [{ type: 'thinking' }, { type: 'text' }, { type: 'text', text: 'kept' }, { type: 'text', text: ' too' }],
    });
    expect(parseAnthropicResponse(body)).toBe('kept too');
  });

  it('rejects a whitespace-only completion', () => {
    const body = JSON.stringify({ content: [{ type: 'text', text: '   \n  ' }] });
    expect(() => parseAnthropicResponse(body)).toThrow(/no usable/i);
  });

  it('accepts a completion with meaningful surrounding whitespace preserved', () => {
    const body = JSON.stringify({ content: [{ type: 'text', text: '  { "a": 1 }  ' }] });
    expect(parseAnthropicResponse(body)).toBe('  { "a": 1 }  ');
  });
});

describe('parseAnthropicResponse - malformed shapes get this module\'s diagnostics', () => {
  it('names the response shape for a null content block instead of leaking a TypeError', () => {
    // Measured before the fix: 'TypeError: Cannot read properties of null
    // (reading \'type\')' -- a JavaScript operation, not a response shape.
    let thrown: unknown;
    try {
      parseAnthropicResponse('{"content":[null]}');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).name).not.toBe('TypeError');
    expect((thrown as Error).message).toMatch(/block 0/);
  });

  it('names the position of the offending block', () => {
    const body = JSON.stringify({ content: [{ type: 'text', text: 'ok' }, null] });
    expect(() => parseAnthropicResponse(body)).toThrow(/block 1/);
  });

  it('names the shape for a non-object, non-array content field', () => {
    expect(() => parseAnthropicResponse('{"content":"a plain string"}')).toThrow(/not an array/i);
  });

  it('accepts an empty text block alongside a usable one', () => {
    // The empty block is a real shape (a suppressed segment), not a corruption,
    // so it must not be reported as one while text is available elsewhere.
    const body = JSON.stringify({ content: [{ type: 'text', text: '' }, { type: 'text', text: 'answer' }] });
    expect(parseAnthropicResponse(body)).toBe('answer');
  });

  it('reports a response whose every text block is empty as having no usable text', () => {
    const body = JSON.stringify({ content: [{ type: 'text', text: '' }, { type: 'text' }] });
    expect(() => parseAnthropicResponse(body)).toThrow(/no usable/i);
  });
});

describe('createAnthropicProvider', () => {
  it('defaults to the Anthropic model and base URL', () => {
    const provider = createAnthropicProvider({ apiKey: 'k' });
    expect(typeof provider.generate).toBe('function');
  });

  it('returns the completion text over a real HTTP round trip', async () => {
    await withServer(200, JSON.stringify({ content: [{ type: 'text', text: 'generated' }] }), async (baseUrl) => {
      const provider = createAnthropicProvider({ apiKey: 'secret', baseUrl });
      expect(await provider.generate('map columns')).toBe('generated');
    });
  });

  it('throws a status-bearing error on a non-2xx response', async () => {
    await withServer(429, JSON.stringify({ error: { message: 'rate limited' } }), async (baseUrl) => {
      const provider = createAnthropicProvider({ apiKey: 'secret', baseUrl });
      await expect(provider.generate('map columns')).rejects.toThrow(/Anthropic API error 429/);
    });
  });

  it('propagates a parse failure on a 200 response with a bad body', async () => {
    await withServer(200, 'not json', async (baseUrl) => {
      const provider = createAnthropicProvider({ apiKey: 'secret', baseUrl });
      await expect(provider.generate('map columns')).rejects.toThrow(/JSON/i);
    });
  });

  it('accepts an explicit model, max tokens, base URL and fetch implementation', async () => {
    await withServer(200, JSON.stringify({ content: [{ type: 'text', text: 'explicit' }] }), async (baseUrl) => {
      const options: AnthropicOptions = {
        apiKey: 'secret',
        model: 'claude-3-opus-latest',
        maxTokens: 8192,
        baseUrl,
        fetchImpl: globalThis.fetch,
      };
      const provider = createAnthropicProvider(options);
      expect(await provider.generate('p')).toBe('explicit');
    });
  });
});
