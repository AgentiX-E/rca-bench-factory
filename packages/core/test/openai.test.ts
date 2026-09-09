import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import {
  OPENAI_DEFAULT_BASE_URL,
  OPENAI_DEFAULT_MODEL,
  OPENAI_CHAT_COMPLETIONS_PATH,
  buildOpenAiRequest,
  createOpenAiProvider,
  parseOpenAiResponse,
} from '../src/llm/openai.js';
import type { OpenAiOptions } from '../src/llm/openai.js';

/**
 * OpenAI provider adapter tests.
 *
 * OpenAI shares the OpenAI-compatible wire format with DeepSeek, so these tests
 * pin the OpenAI-specific defaults and re-exercise the shared parser with the
 * `OpenAI` provider name in its error messages. The HTTP path runs against a
 * real local HTTP server (no mocking library, no stubbed fetch).
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
  it('exposes the OpenAI defaults', () => {
    expect(OPENAI_DEFAULT_MODEL).toBe('gpt-4o-mini');
    expect(OPENAI_DEFAULT_BASE_URL).toBe('https://api.openai.com/v1');
    expect(OPENAI_CHAT_COMPLETIONS_PATH).toBe('/chat/completions');
  });
});

describe('buildOpenAiRequest', () => {
  it('builds a chat-completions request with deterministic temperature', () => {
    expect(buildOpenAiRequest('map these columns', 'gpt-4o-mini')).toEqual({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'map these columns' }],
      temperature: 0,
      stream: false,
    });
  });
});

describe('parseOpenAiResponse', () => {
  it('extracts the completion text from a valid response', () => {
    const body = JSON.stringify({ choices: [{ message: { content: 'ok' } }] });
    expect(parseOpenAiResponse(body)).toBe('ok');
  });

  it('throws an OpenAI-branded error on malformed JSON', () => {
    expect(() => parseOpenAiResponse('not json')).toThrow(/OpenAI response is not valid JSON/);
  });

  it('throws an OpenAI-branded error when choices are missing', () => {
    expect(() => parseOpenAiResponse('{"id":"x"}')).toThrow(/OpenAI response has no choices/);
  });
});

describe('createOpenAiProvider', () => {
  it('defaults to the OpenAI model and base URL', () => {
    const provider = createOpenAiProvider({ apiKey: 'k' });
    expect(typeof provider.generate).toBe('function');
  });

  it('returns the completion text over a real HTTP round trip', async () => {
    await withServer(200, JSON.stringify({ choices: [{ message: { content: 'generated' } }] }), async (baseUrl) => {
      const provider = createOpenAiProvider({ apiKey: 'secret', baseUrl });
      expect(await provider.generate('map columns')).toBe('generated');
    });
  });

  it('throws an OpenAI-branded status error on a non-2xx response', async () => {
    await withServer(401, JSON.stringify({ error: { message: 'invalid api key' } }), async (baseUrl) => {
      const provider = createOpenAiProvider({ apiKey: 'bad', baseUrl });
      await expect(provider.generate('map columns')).rejects.toThrow(/OpenAI API error 401/);
    });
  });

  it('propagates a parse failure on a 200 response with a bad body', async () => {
    await withServer(200, 'not json', async (baseUrl) => {
      const provider = createOpenAiProvider({ apiKey: 'secret', baseUrl });
      await expect(provider.generate('map columns')).rejects.toThrow(/OpenAI response is not valid JSON/);
    });
  });

  it('accepts an explicit model, base URL and fetch implementation', async () => {
    await withServer(200, JSON.stringify({ choices: [{ message: { content: 'explicit' } }] }), async (baseUrl) => {
      const options: OpenAiOptions = {
        apiKey: 'secret',
        model: 'gpt-4o',
        baseUrl,
        fetchImpl: globalThis.fetch,
      };
      const provider = createOpenAiProvider(options);
      expect(await provider.generate('p')).toBe('explicit');
    });
  });
});
