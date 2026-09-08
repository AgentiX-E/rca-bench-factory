import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  buildDeepSeekRequest,
  createDeepSeekProvider,
  parseDeepSeekResponse,
} from '../src/llm/deepseek.js';
import type { DeepSeekOptions } from '../src/llm/deepseek.js';

/**
 * DeepSeek provider adapter tests.
 *
 * The adapter is the first concrete `LlmProvider`: it maps a prompt onto the
 * OpenAI-compatible DeepSeek chat-completions API. The request builder and
 * response parser are pure and tested directly; the HTTP path is exercised
 * against a real local HTTP server (no mocking library, no stubbed fetch) so the
 * success and error branches run over genuine network I/O.
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

describe('buildDeepSeekRequest', () => {
  it('builds an OpenAI-compatible request with deterministic temperature', () => {
    expect(buildDeepSeekRequest('map these columns', 'deepseek-chat')).toEqual({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'map these columns' }],
      temperature: 0,
      stream: false,
    });
  });

  it('carries the requested model verbatim', () => {
    expect(buildDeepSeekRequest('p', 'deepseek-reasoner').model).toBe('deepseek-reasoner');
  });
});

describe('parseDeepSeekResponse', () => {
  it('extracts the completion text from a valid response', () => {
    const body = JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
    expect(parseDeepSeekResponse(body)).toBe('ok');
  });

  it('throws on malformed JSON', () => {
    expect(() => parseDeepSeekResponse('not json')).toThrow(/JSON/i);
  });

  it('throws on a JSON array', () => {
    expect(() => parseDeepSeekResponse('[1,2,3]')).toThrow(/object/i);
  });

  it('throws on a JSON null', () => {
    expect(() => parseDeepSeekResponse('null')).toThrow(/object/i);
  });

  it('throws when choices is missing', () => {
    expect(() => parseDeepSeekResponse('{"id":"x"}')).toThrow(/choices/i);
  });

  it('throws when choices is empty', () => {
    expect(() => parseDeepSeekResponse('{"choices":[]}')).toThrow(/choices/i);
  });

  it('throws when the content is missing', () => {
    expect(() => parseDeepSeekResponse('{"choices":[{"message":{"role":"assistant"}}]}')).toThrow(/content/i);
  });

  it('throws when the content is not a string', () => {
    expect(() => parseDeepSeekResponse('{"choices":[{"message":{"content":42}}]}')).toThrow(/content/i);
  });
});

describe('createDeepSeekProvider', () => {
  it('defaults to the DeepSeek model and base URL', () => {
    const provider = createDeepSeekProvider({ apiKey: 'k' });
    // The provider exposes only generate(); the constants are asserted directly.
    expect(DEEPSEEK_DEFAULT_MODEL).toBe('deepseek-chat');
    expect(DEEPSEEK_DEFAULT_BASE_URL).toBe('https://api.deepseek.com');
    expect(typeof provider.generate).toBe('function');
  });

  it('returns the completion text over a real HTTP round trip', async () => {
    await withServer(200, JSON.stringify({ choices: [{ message: { content: 'generated' } }] }), async (baseUrl) => {
      const provider = createDeepSeekProvider({ apiKey: 'secret', baseUrl });
      expect(await provider.generate('map columns')).toBe('generated');
    });
  });

  it('throws a status-bearing error on a non-2xx response', async () => {
    await withServer(429, JSON.stringify({ error: { message: 'quota exhausted' } }), async (baseUrl) => {
      const provider = createDeepSeekProvider({ apiKey: 'secret', baseUrl });
      await expect(provider.generate('map columns')).rejects.toThrow(/429/);
    });
  });

  it('propagates a parse failure on a 200 response with a bad body', async () => {
    await withServer(200, 'not json', async (baseUrl) => {
      const provider = createDeepSeekProvider({ apiKey: 'secret', baseUrl });
      await expect(provider.generate('map columns')).rejects.toThrow(/JSON/i);
    });
  });

  it('accepts an explicit model, base URL and fetch implementation', async () => {
    await withServer(200, JSON.stringify({ choices: [{ message: { content: 'explicit' } }] }), async (baseUrl) => {
      const options: DeepSeekOptions = {
        apiKey: 'secret',
        model: 'deepseek-reasoner',
        baseUrl,
        fetchImpl: globalThis.fetch,
      };
      const provider = createDeepSeekProvider(options);
      expect(await provider.generate('p')).toBe('explicit');
    });
  });
});
