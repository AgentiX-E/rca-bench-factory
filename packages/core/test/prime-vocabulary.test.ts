import { describe, expect, it } from 'vitest';
import { ingestPrimeDataset, PRIME_DATASET_IDS } from '../src/ingest/prime.js';
import type { PrimeCaseSource, PrimeIngestOptions } from '../src/ingest/prime.js';
import { EXPORTERS } from '../src/score/dispatch.js';
import { formatCommandHelp, parseCliArgs } from '../src/cli/args.js';

/**
 * The ingest dataset vocabulary, asserted against the surfaces a user reads.
 *
 * Every guard that existed before this file iterated `PRIME_DATASET_IDS` itself,
 * which is the list under test:
 *
 *   for (const target of PRIME_DATASET_IDS) expect(parseCliArgs([...])).ok
 *
 * Dropping a member shrinks the loop, so the loop passes. This is the same shape
 * iteration 20 closed for the signal-kind vocabulary: "some are present" can
 * never detect "some are missing", because a table missing a row still contains
 * the rows it kept.
 *
 * The assertions here read the vocabulary back out of the CLI instead:
 *
 *   1. the `ingest --help` placeholder, which `COMMAND_SPECS` renders from the
 *      same tuple the parser compares against;
 *   2. the refusal message for an unknown dataset, which names every admitted
 *      member;
 *   3. the `export` side's `EXPORTERS` registry, a genuinely independent surface.
 *
 * None of the three is a second copy of the tuple. Each fails for a different
 * reason, so a member dropped, reordered or invented is caught by at least one.
 */

const METRIC_CSV = [
  'timestamp,service,metric_name,value',
  '2025-03-01T00:09:00.000Z,ts-order-service,cpu_usage,0.41',
].join('\n') + '\n';

const METRIC_FILE = { 'metrics.csv': METRIC_CSV };

const BASE_CASE: PrimeCaseSource = {
  caseId: 'case-001',
  component: 'ts-order-service',
  faultType: 'cpu',
  injectTime: '2025-03-01T00:10:00.000Z',
};

function options(overrides: Partial<PrimeIngestOptions> = {}): PrimeIngestOptions {
  return {
    dataset: 'rcaeval',
    system: 'tt',
    cases: [BASE_CASE],
    leadMs: 5 * 60_000,
    lagMs: 5 * 60_000,
    ...overrides,
  };
}

/**
 * The ingest vocabulary as the CLI advertises it.
 *
 * The placeholder is the one the parser's comparison set is rendered from, so
 * reading it back is what makes a dropped member visible: the two cannot agree
 * on a set that is missing a member only if the member was not there to begin
 * with. A missing placeholder is an error rather than an empty list, because an
 * empty list would make every assertion below vacuously pass.
 */
function ingestPlaceholder(): string[] {
  const line = formatCommandHelp('ingest')
    .split('\n')
    .find((l) => /^\s+--target\s+</.test(l));
  if (line === undefined) throw new Error('ingest help does not advertise a --target placeholder');
  const match = line.match(/<([^>]+)>/);
  if (match === null) throw new Error('ingest --target placeholder is not a bar-separated list');
  return match[1].split('|');
}

/** The members the refusal names, for a target the vocabulary does not admit. */
function refusalNames(): string[] {
  const result = parseCliArgs(['ingest', '--source', './d', '--target', 'not-a-dataset', '--cases', 'c.json']);
  if (result.ok) throw new Error('an unknown dataset was accepted');
  const match = result.error.match(/<([^>]+)>/);
  if (match === null) throw new Error('the refusal does not name the admitted datasets');
  return match[1].split('|');
}

/**
 * The ingest vocabulary, in the order `docs/cli-reference.md` publishes it.
 *
 * This is deliberately a **third copy**, and it is the only way to pin order.
 * `ingestPlaceholder()` above reads the placeholder, which `COMMAND_SPECS`
 * renders from `PRIME_DATASET_IDS` -- so comparing the placeholder to the tuple
 * is a tautology: reordering the tuple moves both sides of the comparison and
 * the assertion stays green. Measured, with a fresh build:
 *
 *   reorder ('openrca-1.0' before 'rcaeval')  ->  1576 passed, SILENT
 *
 * The order therefore needs an anchor outside the code, and the published
 * reference is that anchor: an operator reads the reference, sees `rcaeval`
 * first, and types it. A divergence here means the help output and the manual
 * disagree about which dataset leads.
 *
 * Written by hand rather than parsed out of the markdown, because a parser would
 * read whatever the document currently says -- the same tautology one level up.
 */
const DOCUMENTED_INGEST_ORDER = [
  'rcaeval',
  'openrca-1.0',
  'openrca-2.0',
  'rca100',
  'aiops2025',
  'cloud-opsbench',
  'itbench',
];

describe('PRIME_DATASET_IDS · the vocabulary against the surfaces', () => {
  it('advertises exactly the declared datasets, in declaration order', () => {
    expect(ingestPlaceholder()).toEqual([...PRIME_DATASET_IDS]);
  });

  it('declares them in the order docs/cli-reference.md publishes', () => {
    expect([...PRIME_DATASET_IDS]).toEqual(DOCUMENTED_INGEST_ORDER);
  });

  it('names exactly the declared datasets when it refuses one', () => {
    expect(refusalNames()).toEqual([...PRIME_DATASET_IDS]);
  });

  it('declares every member exactly once', () => {
    expect(new Set(PRIME_DATASET_IDS).size).toBe(PRIME_DATASET_IDS.length);
  });

  it.each(PRIME_DATASET_IDS)('%s is reachable through the parser', (dataset) => {
    const result = parseCliArgs(['ingest', '--source', './d', '--target', dataset, '--cases', 'c.json']);
    expect(result.ok).toBe(true);
    // The parser must hand the ingest path the id it was given, not a fallback.
    if (result.ok) expect(result.command).toMatchObject({ target: dataset });
  });

  it.each(PRIME_DATASET_IDS)('%s is reachable through the ingest path', (dataset) => {
    const result = ingestPrimeDataset(METRIC_FILE, options({ dataset }));
    expect(result.ok).toBe(true);
  });
});

describe('PRIME_DATASET_IDS · agreement with the export side', () => {
  /**
   * The same seven names, one for reading an official dataset and one for
   * writing it.
   *
   * Compared as sets, not as sequences: `ingest` lists `rcaeval` first because
   * it is the primary dataset, while `EXPORTERS` is keyed in the order the
   * exporters were introduced. The contract is that the two surfaces cover the
   * same benchmarks -- the order each one chooses is its own affair.
   *
   * This is the assertion that survives a member being dropped from either side,
   * and it is independent of the placeholder read-back above: that one watches a
   * single surface, this one watches the pair.
   */
  it('covers the same datasets as the exporters registry', () => {
    expect([...PRIME_DATASET_IDS].sort()).toEqual(Object.keys(EXPORTERS).sort());
  });
});
