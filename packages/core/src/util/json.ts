/**
 * JSON helpers shared by the structural checks and the official-metric scorer.
 *
 * Both modules read files authored by someone else, so every parse is treated
 * as fallible: a malformed artefact is a failed check, never a thrown exception
 * that takes the whole run down.
 */

/** Parse JSON, returning `undefined` instead of throwing on malformed input. */
export function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** True when the value is a plain object (not `null` and not an array). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read a string field, returning `''` when it is absent or not a string. */
export function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

/** Read a string array field, returning `[]` when it is absent or malformed. */
export function readStringArray(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}
