import { describe, expect, it } from 'vitest';
import { ingestFile } from '../src/ingest/file.js';
import { parseTimestamp } from '../src/util/time.js';
import { formatCommandHelp, parseCliArgs } from '../src/cli/args.js';

/**
 * The `source` and `evolve` vocabularies, asserted against what a user can reach.
 *
 * Three vocabularies were declared twice each: a union in the module that owns
 * it (`FileFormat` in `ingest/file.ts`, `TimeLayout` in `util/time.ts`,
 * `EvolveAction` in `cli/args.ts`) and a hand-written `readonly string[]` beside
 * the parser, which was the only thing deciding what the CLI admits. Measured
 * before the fix, with both packages running:
 *
 *   FILE_FORMATS  - tsv  -> caught, incidentally, by one CLI test
 *   FILE_FORMATS  + ghost -> 1750 green, SILENT
 *   TIME_LAYOUTS  - unix_us -> both packages green, SILENT
 *   TIME_LAYOUTS  + ghost -> both packages green, SILENT
 *   EVOLVE_ACTIONS - stale -> caught
 *   EVOLVE_ACTIONS + ghost -> both packages green, SILENT
 *
 * Removing `unix_us` left `parseTimestamp` able to parse it and the CLI refusing
 * it with `invalid --time-layout 'unix_us'`; adding `ghost` left the CLI
 * accepting a value `parseTimestamp` rejects. Neither moved a test.
 *
 * What each assertion here is for:
 *
 *   1. Reachability. Every documented value is admitted, and a value outside the
 *      documented set is refused. This is the direction the compiler cannot see
 *      even after the fix, because the vocabulary the CLI compares against is the
 *      same tuple the core is exhaustive over.
 *   2. Capability. Every declared value is really implemented -- not merely
 *      exhaustively handled. `parseTimestamp` must resolve a sample in each
 *      layout, and `ingestFile` must yield a signal for a body in each format.
 *
 * The `DOCUMENTED_*` constants are deliberately a third copy: an anchor is not a
 * duplicate. They mirror `docs/cli-reference.md`, which is the only place outside
 * the code that states what these options accept.
 */

/** What `docs/cli-reference.md` says `--format` accepts. */
const DOCUMENTED_FORMATS = ['csv', 'tsv', 'jsonl', 'json'];

/** What `docs/cli-reference.md` says `--time-layout` accepts. */
const DOCUMENTED_TIME_LAYOUTS = [
  'iso8601',
  'rfc3339',
  'unix_s',
  'unix_ms',
  'unix_us',
  'unix_ns',
  'java_log',
];

/** What `docs/cli-reference.md` lists as the `evolve` actions, in its own order. */
const DOCUMENTED_EVOLVE_ACTIONS = ['propose', 'approve', 'reject', 'stale'];

/**
 * One sample per layout, all denoting the same instant.
 *
 * Asserting they converge on a single value is stronger than asserting each
 * parses: it pins the unit scaling (seconds vs milliseconds vs microseconds vs
 * nanoseconds) that a switch could get wrong while still being exhaustive.
 */
const TIME_LAYOUT_SAMPLES: Record<string, string> = {
  iso8601: '2026-09-06T04:45:06Z',
  rfc3339: '2026-09-06T04:45:06+00:00',
  unix_s: '1788669906',
  unix_ms: '1788669906000',
  unix_us: '1788669906000000',
  unix_ns: '1788669906000000000',
  java_log: '2026-09-06 04:45:06,000',
};

const THE_SAME_INSTANT = '2026-09-06T04:45:06.000Z';

/** One body per format, each carrying a single metric record. */
const FORMAT_BODIES: Record<string, string> = {
  csv: 'ts,service,metric_name,value\n2025-03-01T00:09:00.000Z,svc,cpu,0.41\n',
  tsv: 'ts\tservice\tmetric_name\tvalue\n2025-03-01T00:09:00.000Z\tsvc\tcpu\t0.41\n',
  jsonl: `${JSON.stringify({ ts: '2025-03-01T00:09:00.000Z', service: 'svc', metric_name: 'cpu', value: 0.41 })}\n`,
  json: JSON.stringify([{ ts: '2025-03-01T00:09:00.000Z', service: 'svc', metric_name: 'cpu', value: 0.41 }]),
};

const METRIC_LAYOUT = {
  timestamp: 'ts',
  service: 'service',
  metricName: 'metric_name',
  metricValue: 'value',
};

/** The values a flag's `--help` entry offers, read back out of the rendered text. */
function placeholder(command: string, flag: string): string[] {
  const line = formatCommandHelp(command)
    .split('\n')
    .find((l) => new RegExp(`^\\s+--${flag}\\s+<`).test(l));
  if (line === undefined) throw new Error(`'${command} --help' does not advertise --${flag}`);
  const match = line.match(/<([^>]+)>/);
  if (match === null) throw new Error(`--${flag} has no bar-separated placeholder`);
  return match[1].split('|');
}

/**
 * The values the parser names when it refuses an out-of-vocabulary one.
 *
 * The refusals are written `(expected a|b|c)`, not `<a|b|c>` -- the placeholder
 * spelling belongs to the help text, the refusal spelling to the error. Parsing
 * the wrong one is how a guard silently asserts nothing, so a missing match is
 * an error rather than an empty list.
 */
function refusalNames(argv: string[]): string[] {
  const result = parseCliArgs(argv);
  if (result.ok) throw new Error(`expected a refusal, got ${JSON.stringify(result.command)}`);
  const match = result.error.match(/\(expected ([^)]+)\)/);
  if (match === null) throw new Error(`the refusal does not name the admitted values: ${result.error}`);
  return match[1].split('|');
}

describe('--time-layout · every documented layout is reachable', () => {
  it.each(DOCUMENTED_TIME_LAYOUTS)('%s is admitted by the parser', (layout) => {
    const result = parseCliArgs(['source', '--path', 'x.csv', '--time-layout', layout]);
    expect(result.ok).toBe(true);
    // Admitted is not enough: the value must reach the command unchanged.
    if (result.ok) expect(result.command).toMatchObject({ timeLayout: layout });
  });

  it('advertises exactly the documented layouts', () => {
    expect(placeholder('source', 'time-layout')).toEqual(DOCUMENTED_TIME_LAYOUTS);
  });

  it('names exactly the documented layouts when it refuses one', () => {
    const argv = ['source', '--path', 'x.csv', '--time-layout', 'not-a-layout'];
    expect(refusalNames(argv)).toEqual(DOCUMENTED_TIME_LAYOUTS);
  });
});

describe('--time-layout · every declared layout is really implemented', () => {
  // `as never` is deliberate. These samples are keyed by the *documented*
  // vocabulary, so the file must be able to name a layout the code has dropped;
  // narrowing it to `TimeLayout` would let the compiler answer, at build time,
  // the question this test exists to ask at run time.
  it.each(DOCUMENTED_TIME_LAYOUTS)('%s resolves to the same instant as the others', (layout) => {
    const sample = TIME_LAYOUT_SAMPLES[layout];
    if (sample === undefined) throw new Error(`no sample declared for layout ${layout}`);
    expect(parseTimestamp(sample, layout as never).isoUtc).toBe(THE_SAME_INSTANT);
  });
});

describe('--format · every documented format is reachable', () => {
  it.each(DOCUMENTED_FORMATS)('%s is admitted by the parser', (format) => {
    const result = parseCliArgs(['source', '--path', 'x.csv', '--format', format]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.command).toMatchObject({ format });
  });

  it('advertises exactly the documented formats', () => {
    expect(placeholder('source', 'format')).toEqual(DOCUMENTED_FORMATS);
  });

  it('names exactly the documented formats when it refuses one', () => {
    const argv = ['source', '--path', 'x.csv', '--format', 'not-a-format'];
    expect(refusalNames(argv)).toEqual(DOCUMENTED_FORMATS);
  });
});

describe('--format · every declared format is really implemented', () => {
  // Same cast, same reason: the bodies are keyed by the documented vocabulary.
  it.each(DOCUMENTED_FORMATS)('%s yields a signal rather than silence', (format) => {
    const body = FORMAT_BODIES[format];
    if (body === undefined) throw new Error(`no body declared for format ${format}`);
    const result = ingestFile(body, {
      format: format as never,
      signalKind: 'metric',
      layout: METRIC_LAYOUT,
      timeLayout: 'iso8601',
    });
    expect(result.signals).toHaveLength(1);
    // A record that is neither a signal nor a quarantine entry is a silent
    // drop, which the module's own contract forbids.
    expect(result.quarantine).toHaveLength(0);
  });
});

/**
 * The argv each action needs to be well-formed.
 *
 * `stale` takes `--cases` and the others reject it, so a single shape cannot
 * serve all four; a shared argv would either fail `stale` or be refused by the
 * rest, and the failure would say nothing about the action itself.
 */
function evolveArgv(action: string): string[] {
  const argv = ['evolve', action, '--input', 'i.json'];
  return action === 'stale' ? [...argv, '--cases', '[]'] : argv;
}

describe('evolve · every documented action is reachable', () => {
  it.each(DOCUMENTED_EVOLVE_ACTIONS)('%s is admitted by the parser', (action) => {
    const result = parseCliArgs(evolveArgv(action));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.command).toMatchObject({ command: 'evolve', action });
  });

  it('names exactly the documented actions, in documented order', () => {
    // Order-sensitive on purpose: the reference enumerates them in its usage
    // block, and that is the order a reader meets. A reordered vocabulary would
    // still contain all four members, so only an ordered comparison sees it.
    expect(refusalNames(['evolve', 'not-an-action', '--input', 'i.json'])).toEqual(
      DOCUMENTED_EVOLVE_ACTIONS,
    );
  });
});
