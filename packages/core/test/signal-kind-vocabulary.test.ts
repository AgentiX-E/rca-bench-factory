/**
 * The signal-kind vocabulary is declared once, and the report shows all of it.
 *
 * The defect this closes: the six-signal vocabulary was written out twice under
 * two different names -- `ALL_KINDS` in `coverage.ts` and `SIGNAL_KINDS` in
 * `report/html.ts` -- with `SignalKind` (`ir/types.ts`) as a third spelling in
 * type position. Dropping `profile` from the report's copy left every one of
 * 1533 tests green, while the rendered coverage table silently lost a modality
 * row that `coverage.ts` still counted.
 *
 * It is not enough to assert that *some* rows are present, which is what the
 * existing `renderCoverage` test did (`metric` and `log`). A table that is
 * missing a row still contains the rows it kept. The assertion has to be about
 * the whole column, read from the vocabulary rather than restated here.
 *
 * `cli/args.ts` also names three of these six, as `readonly string[]`. That is
 * a deliberate narrowing -- `source` can only detect three kinds -- and it is
 * asserted as such below, so that an intentional subset stays distinguishable
 * from a stale copy.
 */

import { describe, expect, it } from 'vitest';

import { SIGNAL_KINDS, type SignalKind } from '../src/ir/types.js';
import { renderCoverage } from '../src/report/html.js';
import { computeCoverage } from '../src/coverage.js';
import { parseCliArgs } from '../src/cli/args.js';
import { validBundle } from './fixtures.js';

const KINDS = [...SIGNAL_KINDS];

/** A bundle carrying at least one signal of every kind, so no row is zero. */
function fullCoverage() {
  const full = validBundle();
  const existing = full.signals['case-001'] ?? [];
  const missing = KINDS.filter((k) => !existing.some((s) => s.signal === k));
  const extra = missing.map((kind, i) => ({
    ...(existing[0] as (typeof existing)[number]),
    id: `synthetic-${kind}-${i}`,
    signal: kind as SignalKind,
  }));
  return computeCoverage(
    validBundle({ signals: { 'case-001': [...existing, ...extra] } }),
  );
}

/** The modality column of the rendered coverage table, in document order. */
function renderedModalities(html: string): string[] {
  const section = html.slice(0, html.indexOf('Evaluability by target'));
  return [...section.matchAll(/<tr[^>]*><td>([a-z]+)<\/td>/g)].map((m) => m[1] as string);
}

describe('the signal-kind vocabulary has one source', () => {
  it('is exactly the six kinds the IR defines', () => {
    expect(KINDS).toEqual(['metric', 'log', 'trace', 'event', 'alert', 'profile']);
  });

  it('lists each kind once', () => {
    expect(new Set(KINDS).size).toBe(KINDS.length);
  });
});

describe('the rendered coverage report shows every kind', () => {
  it('emits exactly one modality row per kind, in vocabulary order', () => {
    // The assertion that makes a dropped row fail. Equality against the
    // vocabulary, not containment, so padding and omission both fail.
    expect(renderedModalities(renderCoverage(fullCoverage()))).toEqual(KINDS);
  });

  it.each(KINDS)('renders a row for %s', (kind) => {
    expect(renderCoverage(fullCoverage())).toContain(`<td>${kind}</td>`);
  });

  it('does not pad the table with a row the vocabulary does not define', () => {
    expect(renderedModalities(renderCoverage(fullCoverage()))).toHaveLength(KINDS.length);
  });
});

describe('coverage counts every kind the vocabulary defines', () => {
  it('reports a key for every kind', () => {
    const report = fullCoverage();
    expect(Object.keys(report.coverage).toSorted()).toEqual(KINDS.toSorted());
  });

  it.each(KINDS)('counts %s as present when it carries a signal', (kind) => {
    // Guards the other half: a kind dropped from the *counting* list would
    // report 0 for a kind that is present, which is a lie in the opposite
    // direction from a missing row.
    expect(fullCoverage().coverage[kind]).toBeGreaterThan(0);
  });
});

describe('the CLI narrows the vocabulary on purpose, and says so', () => {
  it.each(KINDS)('accepts --signal-kind %s only for the kinds source can detect', (kind) => {
    const result = parseCliArgs(['source', '--path', 'p.csv', '--signal-kind', kind]);
    const accepted = ['metric', 'log', 'trace'];
    expect(result.ok, `${kind} acceptance`).toBe(accepted.includes(kind));
  });

  it('rejects a kind outside the vocabulary outright', () => {
    expect(parseCliArgs(['source', '--path', 'p.csv', '--signal-kind', 'bogus']).ok).toBe(false);
  });

  it('accepts a subset of the vocabulary, never a value outside it', () => {
    // The narrowing must be a subset, not a second vocabulary. If the CLI ever
    // accepted a value the IR does not define, this fails.
    for (const kind of KINDS) {
      const ok = parseCliArgs(['source', '--path', 'p.csv', '--signal-kind', kind]).ok;
      if (ok) expect(KINDS).toContain(kind as SignalKind);
    }
  });
});
