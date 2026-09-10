import { createHash } from 'node:crypto';

/**
 * Content hashing.
 *
 * Kept in `util` because both the scoring anchors and the pack manifest need the
 * same digest: one implementation means an anchor and a manifest entry can never
 * disagree about what a file's checksum is.
 */

/** SHA-256 of a UTF-8 string, hex-encoded. */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** SHA-256 of raw bytes, hex-encoded. Used for whole-archive digests. */
export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
