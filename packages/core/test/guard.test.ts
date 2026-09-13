import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CASE_LEVEL_CODES, STRUCTURAL_CODES, assertExportableBundle } from '../src/export/guard.js';
import { checkG2Semantic } from '../src/gates/gates.js';
import { validBundle } from './fixtures.js';

/**
 * The classification in `guard.ts` is a hand-written list of codes that live in
 * `gates.ts`. This project has already been bitten by that shape twice -- the
 * help text against the parser, and the CLI reference against the binary -- and
 * `guard.ts` itself opened with two invented code names (`CAUSAL_CHAIN_BROKEN`
 * for the real `CAUSAL_CHAIN_BREAK`, and `ROOT_CAUSE_COMPONENT_MISMATCH`, which
 * does not exist). Neither mistake would have shown up as a failing test: an
 * unknown string in a `Set` is simply never matched, so the guard would have
 * silently treated a structural defect as case-level.
 *
 * So the codes are not compared against a second hand-written list. They are
 * extracted from G2's own source, which is the only thing a drift can be
 * measured against.
 */

/** Every `code:` literal that appears inside `checkG2Semantic`'s body. */
function codesEmittedByG2(): Set<string> {
  const source = readFileSync(new URL('../src/gates/gates.ts', import.meta.url), 'utf8');
  const start = source.indexOf('export function checkG2Semantic(');
  expect(start, 'G2 must be findable by name; this guard is measuring the wrong thing').toBeGreaterThan(-1);

  // Slice from the signature to the closing brace at column 0, which is how the
  // module's top-level functions are delimited.
  const rest = source.slice(start);
  const end = rest.indexOf('\n}\n');
  const body = end === -1 ? rest : rest.slice(0, end);

  const codes = new Set<string>();
  for (const m of body.matchAll(/code: '([A-Z_]+)'/g)) codes.add(m[1] as string);
  return codes;
}

describe('export guard · G2 code classification is total', () => {
  const emitted = codesEmittedByG2();

  it('finds codes to classify at all', () => {
    // A positive control on the extractor. If the slice or the regex stopped
    // matching, every assertion below would pass vacuously over an empty set --
    // the exact failure mode this file exists to prevent.
    expect(emitted.size).toBeGreaterThan(10);
    expect(emitted.has('DANGLING_EDGE_REF')).toBe(true);
  });

  it('classifies every code G2 can emit', () => {
    const unclassified = [...emitted].filter(
      (c) => !STRUCTURAL_CODES.has(c) && !CASE_LEVEL_CODES.has(c),
    );
    // Failing here means a new code reached G2 without a decision about whether
    // an exporter should reject or skip. The fix is to place it in one of the two
    // sets in `guard.ts`, not to relax this assertion.
    expect(unclassified).toEqual([]);
  });

  it('does not classify codes G2 cannot emit', () => {
    // The other drift direction, and the one `guard.ts` actually shipped: a
    // remembered-but-wrong name sits in the set forever, matching nothing.
    const phantom = [...STRUCTURAL_CODES, ...CASE_LEVEL_CODES].filter((c) => !emitted.has(c));
    expect(phantom).toEqual([]);
  });

  it('treats no code as both structural and case-level', () => {
    // The sets are a partition, so a code added to both would make the guard's
    // verdict depend on which lookup ran first.
    const both = [...STRUCTURAL_CODES].filter((c) => CASE_LEVEL_CODES.has(c));
    expect(both).toEqual([]);
  });
});

describe('export guard · structural codes are exactly the graph defects', () => {
  it('rejects a dangling edge and nothing else in a minimal bundle', () => {
    // Ties the classification to an observable outcome: this is the one defect
    // that no per-case skip can work around, because `graph` is shared by every
    // case in the bundle.
    const b = validBundle();
    const broken = {
      ...b,
      graph: { ...b.graph, edges: [{ from: 'service:default/order', to: 'service:default/ghost', relation: 'calls' }] },
    };
    const g2 = checkG2Semantic(broken);
    const structural = g2.violations.filter((v) => STRUCTURAL_CODES.has(v.code));
    expect(structural.map((v) => v.code)).toEqual(['DANGLING_EDGE_REF']);
  });

  it('leaves a consistent bundle with nothing to reject', () => {
    const g2 = checkG2Semantic(validBundle());
    expect(g2.violations.filter((v) => STRUCTURAL_CODES.has(v.code))).toEqual([]);
  });
});

describe('export guard · reporting more than one violation', () => {
  it('counts the remaining violations instead of listing only the first', () => {
    // A bundle can be wrong in more than one place. Reporting just the first
    // would send the operator round the loop once per defect: fix, re-run,
    // discover the next. The count tells them up front how much work is left,
    // and `rca-bench gate` is named for the full list.
    const b = validBundle();
    const broken = {
      ...b,
      graph: {
        entities: b.graph.entities,
        edges: [
          { from: 'service:default/order', to: 'service:default/ghost', relation: 'calls' },
          { from: 'service:default/cart', to: 'service:default/phantom', relation: 'calls' },
        ],
      },
    };
    expect(() => assertExportableBundle(broken)).toThrow(/\(and 1 more\)/);
  });

  it('adds no count when a single violation is all there is', () => {
    // The counting suffix must not appear for one defect, or the message would
    // read as if something had been withheld.
    const b = validBundle();
    const broken = {
      ...b,
      graph: { ...b.graph, edges: [{ from: 'service:default/order', to: 'service:default/ghost', relation: 'calls' }] },
    };
    let message = '';
    try {
      assertExportableBundle(broken);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/DANGLING_EDGE_REF/);
    expect(message).not.toMatch(/and \d+ more/);
  });
});
