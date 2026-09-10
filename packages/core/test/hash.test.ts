import { describe, expect, it } from 'vitest';
import { sha256, sha256Bytes } from '../src/util/hash.js';

/**
 * Hashing tests.
 *
 * The digests are the anchors the whole verification story rests on, so the
 * vectors are the published NIST test values rather than values produced by this
 * implementation.
 */

describe('sha256', () => {
  it('matches the published empty-string vector', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('matches the published "abc" vector', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes non-ASCII text as UTF-8 bytes, not as code units', () => {
    expect(sha256('✓')).toBe(sha256Bytes(Buffer.from('✓', 'utf8')));
    expect(sha256('✓')).not.toBe(sha256('✓'.charCodeAt(0).toString()));
  });
});

describe('sha256Bytes', () => {
  it('matches the published empty-input vector', () => {
    expect(sha256Bytes(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('agrees with sha256 for the UTF-8 encoding of a string', () => {
    expect(sha256Bytes(Buffer.from('abc', 'utf8'))).toBe(sha256('abc'));
  });

  it('distinguishes byte sequences that no string can express', () => {
    const invalidUtf8 = new Uint8Array([0xff, 0xfe]);
    expect(sha256Bytes(invalidUtf8)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Bytes(invalidUtf8)).not.toBe(sha256Bytes(new Uint8Array([0xfe, 0xff])));
  });
});
