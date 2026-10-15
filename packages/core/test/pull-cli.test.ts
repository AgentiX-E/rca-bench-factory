import { describe, expect, it } from 'vitest';
import {
  formatCommandHelp,
  formatHelp,
  HELP_TOPICS,
  parseCliArgs,
  PULL_BACKEND_IDS,
  type CliCommand,
} from '../src/cli/args.js';
import { findBackend, T2_BACKENDS, type T2BackendId } from '../src/ingest/backends.js';

/**
 * The `pull` command's parser.
 *
 * `pull` is the first command whose flag set is decided by *another* flag: six
 * readers with six different option shapes, behind one command. That makes the
 * table this file guards the interesting part -- `--backend prometheus --token x`
 * has to be refused, because the Prometheus reader takes no token and a silently
 * ignored flag is a configuration the caller believes took effect but did not.
 *
 * The table in `REQUIRED` below is written **independently** of the one the
 * parser holds: it is a statement of what each reader needs, derived by reading
 * the six `*PullOptions` interfaces. If the parser drops a required flag the
 * "refuses it when absent" case fails, and if it invents one the "drives the
 * backend" case in `packages/cli/test/pull.test.ts` fails. Neither can be true
 * while the two disagree.
 */

/** The registry's `implemented` rows, which `pull`'s backend table must equal. */
const IMPLEMENTED = T2_BACKENDS.filter((backend) => backend.status === 'implemented').map(
  (backend) => backend.id,
);

/**
 * Every flag a given backend *must* be given, as `[flag, value]` pairs.
 *
 * A table of pairs rather than of names so that one entry serves both tests --
 * the drive case (join the pairs) and the refusal case (drop one pair) -- and so
 * that the values are the ones a real deployment would take.
 */
const REQUIRED: Record<T2BackendId, readonly (readonly [string, string])[]> = {
  prometheus: [
    ['--base-url', 'http://127.0.0.1:9090'],
    ['--query', 'up'],
    ['--start', '1700000000'],
    ['--end', '1700000060'],
    ['--step', '15s'],
  ],
  jaeger: [
    ['--base-url', 'http://127.0.0.1:16686'],
    ['--service', 'payments'],
    ['--start', '1700000000'],
    ['--end', '1700000060'],
    ['--limit', '20'],
  ],
  loki: [
    ['--base-url', 'http://127.0.0.1:3100'],
    ['--query', '{service_name="payments"}'],
    ['--start', '1700000000'],
    ['--end', '1700000060'],
    ['--limit', '20'],
    ['--direction', 'backward'],
    ['--service-label', 'service_name'],
  ],
  elasticsearch: [
    ['--base-url', 'http://127.0.0.1:9200'],
    ['--index', 'payments-*'],
    ['--start', '1700000000'],
    ['--end', '1700000060'],
    ['--size', '20'],
    ['--timestamp-format', 'iso8601'],
    ['--sort-direction', 'desc'],
    ['--fields', '{"timestamp":"@timestamp","message":"message","service":"service.name"}'],
  ],
  clickhouse: [
    ['--base-url', 'http://127.0.0.1:8123'],
    ['--query', 'SELECT * FROM otel_logs'],
    ['--columns', '{"timestamp":"ts","message":"body","service":"service_name"}'],
    ['--limit', '20'],
    ['--user', 'default'],
  ],
  kubernetes: [
    ['--base-url', 'http://127.0.0.1:6443'],
    ['--service', 'payments'],
    ['--token', 'a-bearer-token'],
    ['--limit', '20'],
    ['--timestamp-field', 'lastTimestamp'],
  ],
};

/** The argv that drives one backend with nothing optional given. */
function requiredArgsFor(backend: T2BackendId): string[] {
  return ['pull', '--backend', backend, ...REQUIRED[backend].flat()];
}

/** Parse an argv that is expected to be a `pull`, or fail loudly. */
function parsePull(argv: string[]): Extract<CliCommand, { command: 'pull' }> {
  const result = parseCliArgs(argv);
  if (!result.ok) throw new Error(`expected a parsed pull command, got: ${result.error}`);
  if (result.command.command !== 'pull') {
    throw new Error(`expected a pull command, got '${result.command.command}'`);
  }
  return result.command;
}

/** The options object of a parsed `pull`, for backends whose options are checked. */
function pullOptions(argv: string[]): Record<string, unknown> {
  return parsePull(argv).options as unknown as Record<string, unknown>;
}

describe('pull - the backend table is the registry', () => {
  it('offers exactly the implemented backends, in the registry order', () => {
    // Both directions at once: `toEqual` on the arrays is false if either side
    // names a backend the other does not, and false if their orders differ.
    expect([...PULL_BACKEND_IDS]).toEqual(IMPLEMENTED);
  });

  it('names no backend the registry does not implement', () => {
    // A backend that is *not* implemented would be a row `pull` advertises and
    // cannot drive. Today the registry has none, so this loop is the guard that
    // keeps a future `unsupported` row out of the command rather than a case it
    // exercises -- and it is written as a loop for exactly that reason: it says
    // the rule, and it is empty only while the rule holds.
    for (const id of PULL_BACKEND_IDS) {
      expect(findBackend(id)?.status, `${id} is in pull's table`).toBe('implemented');
    }
  });

  it('has a registry entry for every backend it offers', () => {
    for (const id of PULL_BACKEND_IDS) {
      expect(findBackend(id), `${id} has no registry entry`).toBeDefined();
    }
  });

  it('accepts every implemented backend', () => {
    for (const id of PULL_BACKEND_IDS) {
      expect(parsePull(requiredArgsFor(id)).backend, `${id} should parse`).toBe(id);
    }
  });
});

describe('pull - the backend decides which flags are legal', () => {
  it('refuses a flag the chosen backend does not accept', () => {
    // `--token` belongs to Kubernetes alone. Before the per-backend table existed
    // it would have been handed to the Prometheus reader and dropped on the floor.
    for (const id of PULL_BACKEND_IDS) {
      if (id === 'kubernetes') continue;
      const result = parseCliArgs([...requiredArgsFor(id), '--token', 'a-bearer-token']);
      expect(result.ok, `${id} should refuse --token`).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/--token/);
    }
  });

  it('accepts --token for the one backend that takes it', () => {
    const options = pullOptions(requiredArgsFor('kubernetes'));
    expect(options['token']).toBe('a-bearer-token');
  });

  it('refuses a label flag the backend has no reader for', () => {
    // The mirror of the previous case, on the flag most likely to be typed at the
    // wrong backend: only Prometheus and Loki read a service *label*.
    for (const id of ['jaeger', 'elasticsearch', 'clickhouse', 'kubernetes'] as const) {
      const result = parseCliArgs([...requiredArgsFor(id), '--service-label', 'svc']);
      expect(result.ok, `${id} should refuse --service-label`).toBe(false);
    }
  });
});

describe('pull - every required flag is required', () => {
  it('refuses each backend when any one of its required flags is missing', () => {
    for (const id of PULL_BACKEND_IDS) {
      const pairs = REQUIRED[id];
      // One case per required flag, so a table that forgets a flag fails on the
      // flag it forgot rather than passing on the ones it remembered.
      for (let drop = 0; drop < pairs.length; drop += 1) {
        const kept = pairs.filter((_, index) => index !== drop).flat();
        const result = parseCliArgs(['pull', '--backend', id, ...kept]);
        const missing = pairs[drop][0];
        expect(result.ok, `${id} should refuse a run without ${missing}`).toBe(false);
        if (!result.ok) expect(result.error).toMatch(new RegExp(missing));
      }
    }
  });

  it('refuses a pull with no --backend at all', () => {
    const result = parseCliArgs(['pull', '--base-url', 'http://127.0.0.1:9090']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--backend/);
  });

  it('refuses a backend the registry does not name', () => {
    const result = parseCliArgs(['pull', '--backend', 'graphite', '--base-url', 'http://127.0.0.1:9090']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--backend/);
  });
});

describe('pull - times, numbers and JSON are read the way the readers take them', () => {
  it('reads a bare integer time as epoch seconds', () => {
    // The reader documents `number | string | Date`, and a `number` means epoch
    // seconds. A CLI that passed the string through would hand `Date.parse`
    // "1700000000", which is **Invalid Date** -- measured, and the reason this
    // conversion exists rather than being left to the reader.
    const options = pullOptions(requiredArgsFor('prometheus'));
    expect(options['start']).toBe(1_700_000_000);
    expect(options['end']).toBe(1_700_000_060);
  });

  it('keeps an ISO-8601 time as the string the reader parses', () => {
    const options = pullOptions([
      'pull',
      '--backend',
      'prometheus',
      '--base-url',
      'http://127.0.0.1:9090',
      '--query',
      'up',
      '--start',
      '2026-01-01T00:00:00Z',
      '--end',
      '2026-01-01T00:10:00Z',
      '--step',
      '15s',
    ]);
    expect(options['start']).toBe('2026-01-01T00:00:00Z');
    expect(options['end']).toBe('2026-01-01T00:10:00Z');
  });

  it('accepts a negative integer time, which is a real instant', () => {
    // An instant before 1970 is expressible in both encodings, so the integer
    // pattern must not be `\d+` and reject it.
    const options = pullOptions([
      'pull',
      '--backend',
      'prometheus',
      '--base-url',
      'http://127.0.0.1:9090',
      '--query',
      'up',
      '--start=-1',
      '--end',
      '60',
      '--step',
      '15s',
    ]);
    expect(options['start']).toBe(-1);
  });

  it('needs the = form for a negative time, because node reads `-1` as an option', () => {
    // Measured, not assumed: `--start -1` answers "Option '--start' argument is
    // ambiguous" rather than taking `-1` as its value. This repository does not
    // re-implement `parseArgs` to paper over it, so the spelling is recorded here
    // as the way to type a pre-1970 instant.
    const spaced = parseCliArgs([
      'pull',
      '--backend',
      'prometheus',
      '--base-url',
      'http://127.0.0.1:9090',
      '--query',
      'up',
      '--start',
      '-1',
      '--end',
      '60',
      '--step',
      '15s',
    ]);
    expect(spaced.ok).toBe(false);
  });

  it('refuses a blank time rather than passing an empty string to Date.parse', () => {
    const result = parseCliArgs([...requiredArgsFor('prometheus'), '--start', '   ']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--start/);
  });

  it('refuses a fractional --limit', () => {
    const result = parseCliArgs([
      'pull',
      '--backend',
      'loki',
      '--base-url',
      'http://127.0.0.1:3100',
      '--query',
      '{service_name="payments"}',
      '--start',
      '0',
      '--end',
      '60',
      '--limit',
      '1.5',
      '--direction',
      'backward',
      '--service-label',
      'service_name',
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--limit/);
  });

  it('refuses a zero --limit, which asks for no telemetry at all', () => {
    const result = parseCliArgs([...requiredArgsFor('jaeger'), '--limit', '0']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--limit/);
  });

  it('refuses a --limit past the safe-integer boundary', () => {
    const result = parseCliArgs([...requiredArgsFor('jaeger'), '--limit', '9007199254740993']);
    expect(result.ok).toBe(false);
  });

  it('refuses a malformed --fields object', () => {
    const result = parseCliArgs([...requiredArgsFor('elasticsearch'), '--fields', '{"timestamp":']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--fields/);
  });

  it('refuses a --fields value that is an array', () => {
    const result = parseCliArgs([...requiredArgsFor('elasticsearch'), '--fields', '["a"]']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--fields/);
  });

  it('refuses malformed --columns JSON', () => {
    const result = parseCliArgs([...requiredArgsFor('clickhouse'), '--columns', 'not json']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--columns/);
  });

  it('carries the parsed --fields object through as an object', () => {
    const options = pullOptions(requiredArgsFor('elasticsearch'));
    expect(options['fields']).toEqual({
      timestamp: '@timestamp',
      message: 'message',
      service: 'service.name',
    });
  });

  it('carries the parsed --columns object through as an object', () => {
    const options = pullOptions(requiredArgsFor('clickhouse'));
    expect(options['columns']).toEqual({ timestamp: 'ts', message: 'body', service: 'service_name' });
  });
});

describe('pull - the enumerations are the readers\u2019 own', () => {
  it('accepts every Loki direction and refuses anything else', () => {
    expect(pullOptions(requiredArgsFor('loki'))['direction']).toBe('backward');
    const bad = parseCliArgs([...requiredArgsFor('loki'), '--direction', 'sideways']);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/--direction/);
  });

  it('accepts every ClickHouse timestamp unit and refuses anything else', () => {
    const ok = pullOptions([...requiredArgsFor('clickhouse'), '--timestamp-unit', 'milliseconds']);
    expect(ok['timestampUnit']).toBe('milliseconds');
    const bad = parseCliArgs([...requiredArgsFor('clickhouse'), '--timestamp-unit', 'fortnights']);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/--timestamp-unit/);
  });

  it('accepts every Elasticsearch timestamp encoding and refuses anything else', () => {
    const ok = pullOptions([...requiredArgsFor('elasticsearch'), '--timestamp-format', 'epoch_millis']);
    expect(ok['timestampFormat']).toBe('epoch_millis');
    const bad = parseCliArgs([...requiredArgsFor('elasticsearch'), '--timestamp-format', 'unix']);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/--timestamp-format/);
  });

  it('accepts every Elasticsearch sort direction and refuses anything else', () => {
    const ok = pullOptions([...requiredArgsFor('elasticsearch'), '--sort-direction', 'asc']);
    expect(ok['sortDirection']).toBe('asc');
    const bad = parseCliArgs([...requiredArgsFor('elasticsearch'), '--sort-direction', 'upward']);
    expect(bad.ok).toBe(false);
  });

  it('accepts every Kubernetes timestamp field and refuses anything else', () => {
    const ok = pullOptions([...requiredArgsFor('kubernetes'), '--timestamp-field', 'eventTime']);
    expect(ok['timestampField']).toBe('eventTime');
    const bad = parseCliArgs([...requiredArgsFor('kubernetes'), '--timestamp-field', 'createdAt']);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/--timestamp-field/);
  });
});

describe('pull - optional flags land in the options object', () => {
  it('carries --output without putting it in the reader options', () => {
    const command = parsePull([...requiredArgsFor('jaeger'), '--output', 'signals.json']);
    expect(command.output).toBe('signals.json');
    expect(command.options).not.toHaveProperty('output');
  });

  it('carries the optional Kubernetes selectors', () => {
    const options = pullOptions([
      ...requiredArgsFor('kubernetes'),
      '--namespace',
      'payments',
      '--field-selector',
      'type=Warning',
    ]);
    expect(options['namespace']).toBe('payments');
    expect(options['fieldSelector']).toBe('type=Warning');
  });

  it('carries the optional ClickHouse credentials and database', () => {
    const options = pullOptions([
      ...requiredArgsFor('clickhouse'),
      '--password',
      'hunter2',
      '--database',
      'otel',
    ]);
    expect(options['password']).toBe('hunter2');
    expect(options['database']).toBe('otel');
  });

  it('carries the optional Prometheus service label', () => {
    const options = pullOptions([...requiredArgsFor('prometheus'), '--service-label', 'app']);
    expect(options['serviceLabel']).toBe('app');
  });

  it('carries the optional Elasticsearch query as an object', () => {
    const options = pullOptions([
      ...requiredArgsFor('elasticsearch'),
      '--query',
      '{"match":{"message":"refused"}}',
    ]);
    expect(options['query']).toEqual({ match: { message: 'refused' } });
  });

  it('omits every optional flag that was not given', () => {
    const options = pullOptions(requiredArgsFor('prometheus'));
    for (const key of ['serviceLabel', 'timeoutMs', 'output']) {
      expect(options, `${key} should be absent, not undefined`).not.toHaveProperty(key);
    }
  });

  it('carries a --timeout-ms on any backend', () => {
    for (const id of PULL_BACKEND_IDS) {
      const options = pullOptions([...requiredArgsFor(id), '--timeout-ms', '2500']);
      expect(options['timeoutMs'], `${id} should take --timeout-ms`).toBe(2500);
    }
  });
});

describe('pull - the object flags must carry what the readers need', () => {
  it('refuses --fields that omits any one of the three keys', () => {
    const full: Record<string, string> = { timestamp: '@timestamp', message: 'message', service: 'service.name' };
    for (const missing of ['timestamp', 'message', 'service']) {
      const partial = { ...full };
      delete partial[missing];
      const result = parseCliArgs([...requiredArgsFor('elasticsearch'), '--fields', JSON.stringify(partial)]);
      expect(result.ok, `--fields without '${missing}' should be refused`).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/--fields/);
    }
  });

  it('refuses --fields whose key is present but blank', () => {
    const result = parseCliArgs([
      ...requiredArgsFor('elasticsearch'),
      '--fields',
      '{"timestamp":"   ","message":"message","service":"service.name"}',
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--fields/);
  });

  it('refuses --columns that omits a required key', () => {
    const result = parseCliArgs([
      ...requiredArgsFor('clickhouse'),
      '--columns',
      '{"timestamp":"ts","message":"body"}',
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--columns/);
  });

  it('refuses an Elasticsearch --query that is not an object', () => {
    const result = parseCliArgs([...requiredArgsFor('elasticsearch'), '--query', '"up"']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--query/);
  });
});

describe('pull - the values that look present but cannot be used', () => {
  it('refuses a blank required flag', () => {
    const result = parseCliArgs([
      'pull',
      '--backend',
      'jaeger',
      '--base-url',
      '   ',
      '--service',
      'payments',
      '--start',
      '0',
      '--end',
      '60',
      '--limit',
      '20',
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--base-url/);
  });

  it('refuses a blank --output', () => {
    const result = parseCliArgs([...requiredArgsFor('jaeger'), '--output', '  ']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--output/);
  });

  it('refuses a blank optional label', () => {
    const result = parseCliArgs([...requiredArgsFor('prometheus'), '--service-label', '  ']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--service-label/);
  });

  it('refuses a blank --database', () => {
    const result = parseCliArgs([...requiredArgsFor('clickhouse'), '--database', '  ']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--database/);
  });

  it('refuses a blank --namespace and a blank --field-selector', () => {
    for (const flag of ['--namespace', '--field-selector']) {
      const result = parseCliArgs([...requiredArgsFor('kubernetes'), flag, '  ']);
      expect(result.ok, `${flag} should be refused when blank`).toBe(false);
      if (!result.ok) expect(result.error).toMatch(new RegExp(flag));
    }
  });

  it('refuses a blank optional --start on kubernetes', () => {
    const result = parseCliArgs([...requiredArgsFor('kubernetes'), '--start', '   ']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--start/);
  });

  it('refuses a zero --timeout-ms', () => {
    const result = parseCliArgs([...requiredArgsFor('jaeger'), '--timeout-ms', '0']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--timeout-ms/);
  });

  it('refuses a --timeout-ms that is not a number', () => {
    const result = parseCliArgs([...requiredArgsFor('jaeger'), '--timeout-ms', 'soon']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--timeout-ms/);
  });

  it('refuses a --size that is not a positive integer', () => {
    const result = parseCliArgs([...requiredArgsFor('elasticsearch'), '--size', '-3']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--size/);
  });
});

describe('pull - each backend refuses its own broken values', () => {
  it('refuses an unreadable window at every backend that requires one', () => {
    // Four backends require both bounds, and each has its own `requiredWindow`
    // call site: one case per backend, because a shared helper returning an error
    // says nothing about the four places that have to notice it.
    for (const id of ['prometheus', 'jaeger', 'loki', 'elasticsearch'] as const) {
      for (const flag of ['--start', '--end'] as const) {
        const result = parseCliArgs([...requiredArgsFor(id), flag, 'the day before yesterday']);
        expect(result.ok, `${id} should refuse ${flag}`).toBe(false);
        if (!result.ok) expect(result.error).toMatch(new RegExp(flag));
      }
    }
  });

  it('refuses a zero --timeout-ms at every backend', () => {
    for (const id of PULL_BACKEND_IDS) {
      const result = parseCliArgs([...requiredArgsFor(id), '--timeout-ms', '0']);
      expect(result.ok, `${id} should refuse --timeout-ms 0`).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/--timeout-ms/);
    }
  });

  it('refuses a zero --size at elasticsearch', () => {
    const result = parseCliArgs([...requiredArgsFor('elasticsearch'), '--size', '0']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--size/);
  });

  it('refuses a zero --limit at clickhouse and kubernetes', () => {
    for (const id of ['clickhouse', 'kubernetes'] as const) {
      const result = parseCliArgs([...requiredArgsFor(id), '--limit', '0']);
      expect(result.ok, `${id} should refuse --limit 0`).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/--limit/);
    }
  });

  it('refuses an unreadable --end at kubernetes, where the bounds are optional', () => {
    const result = parseCliArgs([...requiredArgsFor('kubernetes'), '--end', 'tomorrow']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/--end/);
  });

  it('carries a legal window at kubernetes, where both bounds are optional', () => {
    const options = pullOptions([
      ...requiredArgsFor('kubernetes'),
      '--start',
      '1700000000',
      '--end',
      '2026-01-01T00:10:00Z',
    ]);
    expect(options['start']).toBe(1_700_000_000);
    expect(options['end']).toBe('2026-01-01T00:10:00Z');
  });

  it('refuses an instant past the safe-integer boundary', () => {
    // 2^53 + 1: a number that is no longer the one that was typed, which is what
    // `Number.isSafeInteger` is here to catch rather than pass along.
    const result = parseCliArgs([...requiredArgsFor('prometheus'), '--start', '9007199254740993']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/out of range/);
  });
});

describe('pull - an empty password is not an absent one', () => {
  it('carries an explicitly empty ClickHouse password through', () => {
    // The reader distinguishes "no `X-ClickHouse-Key` header" from "an empty
    // one", so the parser has to as well: a password that came out as `''` is a
    // password the caller typed, not one they left out.
    const withEmpty = pullOptions([...requiredArgsFor('clickhouse'), '--password', '']);
    expect(withEmpty).toHaveProperty('password', '');
    const without = pullOptions(requiredArgsFor('clickhouse'));
    expect(without).not.toHaveProperty('password');
  });
});

describe('pull - help', () => {
  it('is a help topic', () => {
    expect(HELP_TOPICS).toContain('pull');
  });

  it('is listed in the command list', () => {
    expect(formatHelp()).toMatch(/^ {2}pull {5}/m);
  });

  it('renders its own reference, naming every backend', () => {
    const help = formatCommandHelp('pull');
    expect(help).toMatch(/--backend/);
    for (const id of PULL_BACKEND_IDS) {
      expect(help, `${id} should appear in pull's reference`).toContain(id);
    }
  });

  it('answers --help after the command name', () => {
    expect(parseCliArgs(['pull', '--help'])).toEqual({ ok: true, command: { command: 'help', topic: 'pull' } });
  });
});
