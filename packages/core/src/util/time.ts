/**
 * Timestamp normalization utilities.
 *
 * Design rules (non-negotiable):
 *  1. All timestamps are stored internally as UTC ISO-8601 with an explicit `Z` suffix.
 *  2. The original UTC offset is never guessed silently. When a source has no offset,
 *     the caller MUST pass `assumeOffsetMinutes`; otherwise parsing fails loudly.
 *  3. Parsing is pure and deterministic - no dependency on the system clock.
 */

/** Canonical output format: `YYYY-MM-DDTHH:mm:ss.sssZ`. */
export const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/** Supported textual input layouts. */
export type TimeLayout =
  | 'iso8601'
  | 'rfc3339'
  | 'unix_s'
  | 'unix_ms'
  | 'unix_us'
  | 'unix_ns'
  | 'java_log';

const JAVA_LOG_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})$/;

const ISO_LIKE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?\s*(Z|[+-]\d{2}:?\d{2})?$/;

export interface ParsedTime {
  /** UTC ISO-8601 with millisecond precision and `Z` suffix. */
  isoUtc: string;
  /** Offset that was present in (or assumed for) the input, in minutes east of UTC. */
  offsetMinutes: number;
  /** True when the offset was supplied by the caller rather than read from the input. */
  offsetWasAssumed: boolean;
}

export class TimeParseError extends Error {
  constructor(
    message: string,
    readonly input: string,
  ) {
    super(message);
    this.name = 'TimeParseError';
  }
}

/**
 * Normalize the offset token (`Z`, `+08:00`, `+0800`) into minutes east of UTC.
 * Returns `null` when the token is absent.
 */
function parseOffsetToken(token: string | undefined): number | null {
  if (token === undefined || token === '') return null;
  if (token === 'Z' || token === 'z') return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(token);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/** Build the canonical UTC ISO string from an epoch in milliseconds. */
function epochToIsoUtc(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.toISOString().slice(0, 23)}Z`;
}

/** Convert a wall-clock breakdown plus offset into epoch milliseconds (UTC). */
function wallClockToEpochMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millis: number,
  offsetMinutes: number,
): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  return asUtc - offsetMinutes * 60_000;
}

/**
 * Parse a timestamp string into canonical UTC form.
 *
 * @param raw                 raw source value
 * @param layout              declared layout of the source value
 * @param assumeOffsetMinutes offset to apply when the value carries no offset
 * @throws {TimeParseError} when the value does not match the declared layout,
 *         or when it carries no offset and no offset was supplied.
 */
export function parseTimestamp(
  raw: string,
  layout: TimeLayout = 'iso8601',
  assumeOffsetMinutes?: number,
): ParsedTime {
  const value = raw.trim();
  if (value === '') {
    throw new TimeParseError('empty timestamp', raw);
  }

  switch (layout) {
    case 'unix_s':
    case 'unix_ms':
    case 'unix_us':
    case 'unix_ns': {
      if (!/^-?\d+$/.test(value)) {
        throw new TimeParseError(`not an integer epoch for layout ${layout}`, raw);
      }
      const n = Number(value);
      const multiplier =
        layout === 'unix_s' ? 1e3 : layout === 'unix_ms' ? 1 : layout === 'unix_us' ? 1e-3 : 1e-6;
      return { isoUtc: epochToIsoUtc(n * multiplier), offsetMinutes: 0, offsetWasAssumed: false };
    }
    case 'java_log': {
      const m = JAVA_LOG_PATTERN.exec(value);
      if (!m) throw new TimeParseError('value does not match the java_log layout', raw);
      const offset = assumeOffsetMinutes ?? 0;
      const epochMs = wallClockToEpochMs(
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6]),
        Number((m[7] ?? '').padEnd(3, '0')),
        offset,
      );
      return { isoUtc: epochToIsoUtc(epochMs), offsetMinutes: offset, offsetWasAssumed: assumeOffsetMinutes !== undefined };
    }
    case 'iso8601':
    case 'rfc3339': {
      const m = ISO_LIKE_PATTERN.exec(value);
      if (!m) throw new TimeParseError('value does not match the iso8601/rfc3339 layout', raw);
      const fracRaw = m[7] ?? '0';
      const millis = Number(fracRaw.slice(0, 3).padEnd(3, '0'));
      const offset = parseOffsetToken(m[8]) ?? assumeOffsetMinutes;
      if (offset === null || offset === undefined) {
        throw new TimeParseError(
          'timestamp carries no UTC offset and no assumeOffsetMinutes was provided',
          raw,
        );
      }
      const epochMs = wallClockToEpochMs(
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6]),
        millis,
        offset,
      );
      return {
        isoUtc: epochToIsoUtc(epochMs),
        offsetMinutes: offset,
        offsetWasAssumed: assumeOffsetMinutes !== undefined && parseOffsetToken(m[8]) === null,
      };
    }
    default: {
      const never: never = layout;
      throw new TimeParseError(`unsupported layout ${String(never)}`, raw);
    }
  }
}

/** Convert an epoch in milliseconds to the canonical UTC ISO string. */
export function epochMsToIsoUtc(epochMs: number): string {
  return epochToIsoUtc(epochMs);
}

/** Convert a canonical UTC ISO string back to epoch milliseconds. */
export function isoUtcToEpochMs(isoUtc: string): number {
  if (!ISO_UTC_PATTERN.test(isoUtc)) {
    throw new TimeParseError('value is not a canonical UTC ISO-8601 timestamp', isoUtc);
  }
  return Date.parse(isoUtc);
}

/**
 * Convert a UTC ISO timestamp into the timezone used by a target benchmark.
 * OpenRCA 1.0 records all faults in UTC+8, so exporters need this shift.
 */
export function isoUtcToOffsetIso(isoUtc: string, offsetMinutes: number): string {
  const epochMs = isoUtcToEpochMs(isoUtc) + offsetMinutes * 60_000;
  const shifted = new Date(epochMs).toISOString().slice(0, 19);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${shifted}${sign}${hh}:${mm}`;
}

/** True when `ts` falls inside the inclusive `[start, end]` window. */
export function isWithinWindow(ts: string, start: string, end: string): boolean {
  const t = isoUtcToEpochMs(ts);
  return t >= isoUtcToEpochMs(start) && t <= isoUtcToEpochMs(end);
}
