import { describe, expect, it } from 'vitest';
import {
  ISO_UTC_PATTERN,
  epochMsToIsoUtc,
  isWithinWindow,
  isoUtcToEpochMs,
  isoUtcToOffsetIso,
  parseTimestamp,
  TimeParseError,
} from '../src/util/time.js';

describe('parseTimestamp', () => {
  it('parses ISO-8601 with an explicit Z offset', () => {
    const r = parseTimestamp('2026-09-06T04:05:06.000Z', 'iso8601');
    expect(r.isoUtc).toBe('2026-09-06T04:05:06.000Z');
    expect(r.offsetMinutes).toBe(0);
    expect(r.offsetWasAssumed).toBe(false);
  });

  it('shifts a +08:00 wall clock into UTC', () => {
    const r = parseTimestamp('2026-09-06T12:05:06+08:00', 'iso8601');
    expect(r.isoUtc).toBe('2026-09-06T04:05:06.000Z');
    expect(r.offsetMinutes).toBe(480);
  });

  it('accepts the compact +0800 offset form', () => {
    const r = parseTimestamp('2026-09-06T12:05:06+0800', 'iso8601');
    expect(r.isoUtc).toBe('2026-09-06T04:05:06.000Z');
  });

  it('refuses to guess an offset when none is present', () => {
    expect(() => parseTimestamp('2026-09-06T12:05:06', 'iso8601')).toThrow(TimeParseError);
  });

  it('applies assumeOffsetMinutes when the value carries no offset', () => {
    const r = parseTimestamp('2026-09-06T12:05:06', 'iso8601', 480);
    expect(r.isoUtc).toBe('2026-09-06T04:05:06.000Z');
    expect(r.offsetWasAssumed).toBe(true);
  });

  it('parses unix seconds, milliseconds, microseconds and nanoseconds', () => {
    expect(parseTimestamp('1788669906', 'unix_s').isoUtc).toBe(epochMsToIsoUtc(1788669906_000));
    expect(parseTimestamp('1788669906000', 'unix_ms').isoUtc).toBe(epochMsToIsoUtc(1788669906_000));
    expect(parseTimestamp('1788669906000000', 'unix_us').isoUtc).toBe(epochMsToIsoUtc(1788669906_000));
    expect(parseTimestamp('1788669906000000000', 'unix_ns').isoUtc).toBe(epochMsToIsoUtc(1788669906_000));
  });

  it('parses the java_log layout with millisecond precision', () => {
    const r = parseTimestamp('2026-09-06 12:05:06,123', 'java_log', 480);
    expect(r.isoUtc).toBe('2026-09-06T04:05:06.123Z');
  });

  it('pads short java_log milliseconds correctly (,12 means 120ms)', () => {
    const r = parseTimestamp('2026-09-06 12:05:06,12', 'java_log', 480);
    expect(r.isoUtc).toBe('2026-09-06T04:05:06.120Z');
  });

  it('rejects an empty value', () => {
    expect(() => parseTimestamp('   ', 'iso8601')).toThrow(TimeParseError);
  });

  it('rejects a non-integer epoch', () => {
    expect(() => parseTimestamp('17.5', 'unix_s')).toThrow(TimeParseError);
  });

  it('rejects a value that does not match the declared layout', () => {
    expect(() => parseTimestamp('not-a-date', 'java_log', 480)).toThrow(TimeParseError);
    expect(() => parseTimestamp('not-a-date', 'iso8601', 480)).toThrow(TimeParseError);
  });

  it('handles a negative epoch (pre-1970)', () => {
    expect(parseTimestamp('-86400', 'unix_s').isoUtc).toBe('1969-12-31T00:00:00.000Z');
  });

  it('parses rfc3339 identically to iso8601', () => {
    expect(parseTimestamp('2026-09-06T12:05:06Z', 'rfc3339').isoUtc).toBe(
      parseTimestamp('2026-09-06T12:05:06Z', 'iso8601').isoUtc,
    );
  });
});

describe('ISO helpers', () => {
  it('round-trips epoch milliseconds', () => {
    const iso = epochMsToIsoUtc(1788669906123);
    expect(ISO_UTC_PATTERN.test(iso)).toBe(true);
    expect(isoUtcToEpochMs(iso)).toBe(1788669906123);
  });

  it('rejects a non-canonical ISO string', () => {
    expect(() => isoUtcToEpochMs('2026-09-06T04:05:06+08:00')).toThrow(TimeParseError);
  });

  it('shifts UTC into the UTC+8 form used by OpenRCA', () => {
    expect(isoUtcToOffsetIso('2026-09-06T04:05:06.000Z', 480)).toBe('2026-09-06T12:05:06+08:00');
  });

  it('formats a negative offset with a minus sign', () => {
    expect(isoUtcToOffsetIso('2026-09-06T04:05:06.000Z', -330)).toBe('2026-09-05T22:35:06-05:30');
  });
});

describe('isWithinWindow', () => {
  const start = '2026-09-06T00:00:00.000Z';
  const end = '2026-09-06T01:00:00.000Z';

  it('is inclusive on both bounds', () => {
    expect(isWithinWindow(start, start, end)).toBe(true);
    expect(isWithinWindow(end, start, end)).toBe(true);
  });

  it('excludes values outside the window', () => {
    expect(isWithinWindow('2026-09-05T23:59:59.000Z', start, end)).toBe(false);
    expect(isWithinWindow('2026-09-06T01:00:01.000Z', start, end)).toBe(false);
  });
});
