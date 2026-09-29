import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assessComponentAgreement,
  buildAgreementInventory,
  type AgreementReading,
} from '../../src/fault/component-agreement.js';
import { CATEGORY_TERMS } from '../../src/fault/category-terms.js';
import { parseMissDetail } from '../../src/fault/miss-detail.js';
import { inferFaultCategory } from '../../src/fault/collector.js';

/**
 * Is the category an answer emitted derivable from the component that same answer named?
 *
 * Finding 98 measured that the answered category has no term in the **incident text**. That
 * is a statement about the dataset's input, and on its own it leaves two explanations open:
 * the model failed to read the incident, or it read it and mislabelled the category. Both
 * produce the same figure.
 *
 * The `component` field closes that gap, because it is the model's **own** output. The
 * category and the component come from the same call over the same text. If the category
 * were read off the mechanism the model itself identified, the answered category's
 * vocabulary would appear in the component it named.
 *
 * It does not, in seven of the seven misses that carry a component row.
 *
 * The eighth (`middleware-kafka-consumer-lag`) has **no** component row because the model
 * answered the component correctly there -- so it is excluded from the denominator rather
 * than counted as a pass, and this file asserts that exclusion rather than trusting it.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const PROBE = resolve(REPO_ROOT, 'scripts/probe-type-misses.mjs');
const FIXTURE = resolve(REPO_ROOT, 'packages', 'core', 'test', 'fixtures', 'miss-detail-567118aea.txt');

/**
 * The recorded miss rows, read from the annotation body.
 *
 * Read rather than transcribed, for the reason finding 92 records: a transcription is a
 * second copy of a fact, exact only against the run it names, and the copy that used to
 * live in a probe was quoted by this repository's own next reading as the answers of a
 * *different* run.
 */
function recordedRows(): ReturnType<typeof parseMissDetail> {
  return parseMissDetail(readFileSync(FIXTURE, 'utf8'));
}

/** The `category` misses, with the component the same run recorded for each. */
function categoryMissesWithComponents(): { sampleId: string; category: string; component: string | null }[] {
  const rows = recordedRows();
  const componentById = new Map<string, string>();
  for (const row of rows) {
    if (row.field === 'component') componentById.set(row.sampleId, row.actual);
  }
  return rows
    .filter((row) => row.field === 'category')
    .map((row) => ({
      sampleId: row.sampleId,
      category: row.actual,
      component: componentById.get(row.sampleId) ?? null,
    }));
}

describe('the reading is three-valued, and the third value is reachable', () => {
  it('agrees when the component carries a term of the category', () => {
    expect(
      assessComponentAgreement({ component: 'session Redis', category: 'middleware' }).verdict,
    ).toBe('agrees');
    expect(
      assessComponentAgreement({ component: 'kubelet', category: 'dependency' }).verdict,
    ).toBe('disagrees');
  });

  it('reports the terms that produced an agreement, so the basis is inspectable', () => {
    // Finding 96's lesson applied here: the instrument names its own basis rather than
    // leaving the reader to infer it from a verdict.
    //
    // The component has to actually carry a term, and `"billing service connection pool"`
    // does not -- `pool` is not in the `middleware` row, which is precisely the finding
    // this file measures. The first version of this test used that string and failed; the
    // failure was the measurement working, not the code being wrong.
    const reading = assessComponentAgreement({
      component: 'the session Redis cache',
      category: 'middleware',
    });
    expect(reading.verdict).toBe('agrees');
    expect(reading.terms.length).toBeGreaterThan(0);
    // The basis is inspectable: every reported term is one of the row's own terms, so a
    // reader can check the verdict against the vocabulary rather than trusting it.
    for (const term of reading.terms) {
      expect(CATEGORY_TERMS['middleware']).toContain(term);
      expect(reading.terms).toContain(term);
    }
    expect(reading.terms).toContain('redis');
  });

  it('reports no terms when it disagrees, so the two states are distinguishable', () => {
    const reading = assessComponentAgreement({ component: 'kubelet', category: 'resource' });
    expect(reading.verdict).toBe('disagrees');
    expect(reading.terms).toEqual([]);
  });

  it('reports not-assessable when there is no component to read', () => {
    // The third value, for finding 94's reason: an answer with no component was not read,
    // and counting it as agreeing would let a missing field *improve* the figure. The real
    // instance is `middleware-kafka-consumer-lag`, which has no component row because it
    // was answered correctly there.
    expect(assessComponentAgreement({ component: '', category: 'middleware' }).verdict).toBe(
      'not-assessable',
    );
    expect(assessComponentAgreement({ component: '   \n\t ', category: 'middleware' }).verdict).toBe(
      'not-assessable',
    );
  });

  it('does not report agreement for a category the vocabulary has no row for', () => {
    // The unknown-category branch, and it resolves the opposite way from `denial-inventory`'s.
    // There, an unknown category is `absent` -- the text was read and carries no such thing.
    // Here it must be `disagrees`, because the question is whether the component *supports*
    // the category, and a vocabulary with no row for the answer cannot support it. Returning
    // `agrees` would make every unknown category look correct, which is the failure mode a
    // reading that only counts positives always has.
    expect(
      assessComponentAgreement({ component: 'session Redis', category: 'not-a-category' }).verdict,
    ).toBe('disagrees');
    expect(assessComponentAgreement({ component: 'session Redis', category: '' }).verdict).toBe(
      'disagrees',
    );
  });
});

describe('the seven misses that carry a component carry none of their answered category', () => {
  it('disagrees on every one of them', () => {
    // The finding. Not one of the seven is a case of the model naming a component that
    // supports the category it emitted.
    const offenders = categoryMissesWithComponents()
      .filter((m) => m.component !== null)
      .filter((m) => assessComponentAgreement({ component: m.component!, category: m.category }).verdict !== 'disagrees')
      .map((m) => `${m.sampleId}: answered ${m.category}, component "${m.component}"`);

    expect(offenders, 'a supported component would falsify the finding').toEqual([]);
  });

  it('states the figure with both denominators, and names the excluded row', () => {
    // Seven of seven, and the eighth is *not* an eighth pass -- it has no component row at
    // all because the model answered the component correctly. Reporting it as a pass is the
    // partial-join defect finding 92 records, so the exclusion is asserted and the id is
    // named rather than the row being dropped silently.
    const misses = categoryMissesWithComponents();
    expect(misses, 'the recorded run carries eight category misses').toHaveLength(8);

    const inventory = buildAgreementInventory(misses);
    expect(inventory.graded, 'the denominator is the rows that carry a component').toBe(7);
    expect(inventory.disagrees).toBe(7);
    expect(inventory.agrees).toBe(0);
    expect(inventory.notAssessable, 'the eighth has no component row').toBe(1);
    expect(inventory.unassessableIds).toEqual(['middleware-kafka-consumer-lag']);
    expect(inventory.disagreeShare).toBe(1);
    expect(Number.isNaN(inventory.disagreeShare)).toBe(false);
  });

  it('the excluded row is excluded because the component was answered correctly, not because it is missing', () => {
    // The distinction that keeps the exclusion honest. `middleware-kafka-consumer-lag` has
    // no `component` row because the run recorded no *miss* there -- the answer was right.
    // That is a different fact from "the field was blank", and it is the reason this row is
    // the counter-case: the model named the mechanism correctly and still got the category
    // wrong, so a category is evidently not always derivable from a component.
    const rows = recordedRows();
    const kafkaComponent = rows.find(
      (r) => r.sampleId === 'middleware-kafka-consumer-lag' && r.field === 'component',
    );
    expect(kafkaComponent, 'no component row is recorded for this sample').toBeUndefined();
    // And it is a miss on `category` only, which is what makes it the counter-case.
    const kafkaFields = rows.filter((r) => r.sampleId === 'middleware-kafka-consumer-lag').map((r) => r.field);
    expect(kafkaFields).toContain('category');
    expect(kafkaFields).not.toContain('component');
  });

  it('names the components, so the claim is readable rather than asserted', () => {
    // The finding is only convincing if the reader can see what the components actually are.
    // `kubelet` is *correct* for `pod-kill`; `session Redis` is *correct* for `redis-latency`.
    // The components are right and the categories are unsupported, which is the whole point.
    const misses = categoryMissesWithComponents().filter((m) => m.component !== null);
    const named = misses.map((m) => [m.sampleId, m.category, m.component] as const);
    expect(named).toEqual([
      ['resource-memory-leak-recommendation', 'code', 'recommendation service session cache'],
      ['runtime-pod-kill-user-profile', 'resource', 'kubelet'],
      ['runtime-container-crash-loop-media', 'dependency', 'native ffmpeg binding'],
      ['middleware-redis-latency-cache', 'resource', 'session Redis'],
      ['middleware-database-connection-pool', 'resource', 'billing service connection pool'],
      ['code-slow-regex-api-gateway', 'config', 'WAF rule'],
      ['middleware-mysql-replica-lag-analytics', 'resource', 'replica applier thread'],
    ]);
  });
});

describe('the vocabulary is shared, and not the classifier', () => {
  it('agrees with the classifier on every category they share', () => {
    // The extraction to `category-terms.ts` joined two readings to one table. This asserts
    // the table has not silently diverged from the classifier's -- not to make the two the
    // same (they must be able to disagree) but so a change to one without the other fails
    // rather than drifts, which is the difference between a copy and a second opinion.
    const categories = ['middleware', 'network', 'resource', 'runtime', 'code', 'config', 'dependency'];
    for (const category of categories) {
      const terms = CATEGORY_TERMS[category];
      expect(terms, `${category} must be in the reading table`).toBeDefined();
      // Every term the reading uses must actually route to that category through the
      // classifier. A term that routes elsewhere would make the reading and the classifier
      // disagree about the word rather than about the answer.
      for (const term of terms) {
        expect(
          inferFaultCategory(term),
          `'${term}' is in ${category}'s row but classifies as something else`,
        ).toBe(category);
      }
    }
  });

  it('the two readings use one table, so they cannot disagree about a word', () => {
    // The reason for the extraction, asserted. If a reading carried its own copy, two
    // readings could disagree about what a word means and the disagreement would present
    // as a difference between the readings.
    const source = readFileSync(
      resolve(REPO_ROOT, 'packages', 'core', 'src', 'fault', 'denial-inventory.ts'),
      'utf8',
    );
    expect(source, 'the denial reading must import the shared table').toMatch(
      /import \{ CATEGORY_TERMS \} from '\.\/category-terms\.js';/,
    );
    expect(source, 'and must not redefine it').not.toMatch(
      /const CATEGORY_TERMS[\s\S]*?= \{/,
    );
  });
});

describe('the verdicts are a closed set', () => {
  it('never returns a verdict outside the declared union', () => {
    const allowed = new Set<AgreementReading['verdict']>(['agrees', 'disagrees', 'not-assessable']);
    const cases = [
      { component: 'session Redis', category: 'middleware' },
      { component: 'kubelet', category: 'resource' },
      { component: '', category: 'code' },
      { component: 'x', category: 'nope' },
    ];
    for (const c of cases) {
      expect(allowed.has(assessComponentAgreement(c).verdict)).toBe(true);
    }
  });
});

describe('an empty denominator is a zero, not a NaN', () => {
  it('returns an empty inventory for an empty corpus', () => {
    expect(buildAgreementInventory([])).toEqual({
      graded: 0,
      agrees: 0,
      disagrees: 0,
      notAssessable: 0,
      unassessableIds: [],
      disagreeShare: 0,
    });
  });

  it('returns a zero share, not a NaN, when every sample lacks a component', () => {
    // The guard both sibling readings carry, for the same reason: a `NaN` compares false
    // against every threshold, so a gate reading it would pass or fail arbitrarily.
    const inventory = buildAgreementInventory([
      { sampleId: 'a', category: 'middleware', component: null },
      { sampleId: 'b', category: 'code', component: null },
    ]);
    expect(inventory.graded).toBe(0);
    expect(inventory.notAssessable).toBe(2);
    expect(inventory.unassessableIds).toEqual(['a', 'b']);
    expect(inventory.disagreeShare).toBe(0);
    expect(Number.isNaN(inventory.disagreeShare)).toBe(false);
  });

  it('counts an agreement, and does not count it as a disagreement', () => {
    // The `agrees` path through `buildAgreementInventory`, which the recorded fixture never
    // reaches because all seven of its components disagree. Without this the counter's
    // agreement branch is unexecuted code, and unexecuted code is a branch the battery
    // cannot defend -- injections Z and AA SURVIVED against the first version of this
    // module's probe block for exactly that reason.
    const inventory = buildAgreementInventory([
      { sampleId: 'supports-it', category: 'middleware', component: 'the session Redis cache' },
      { sampleId: 'does-not', category: 'middleware', component: 'kubelet' },
    ]);
    expect(inventory.graded).toBe(2);
    expect(inventory.agrees).toBe(1);
    expect(inventory.disagrees).toBe(1);
    expect(inventory.notAssessable).toBe(0);
    expect(inventory.disagreeShare).toBe(0.5);
  });

  it('counts a whitespace-only component as not-assessable, not as a disagreement', () => {
    // The third value reached from `buildAgreementInventory` rather than from the null
    // check. A component of `'   '` is *not* `null`, so it passes the null filter and
    // reaches the reading, which refuses it -- and `buildAgreementInventory` must route that
    // refusal to `notAssessable` rather than to `disagrees`. Counting it as a disagreement
    // would let a blank field count as evidence *for* the finding, which is the direction
    // the third value exists to prevent.
    const inventory = buildAgreementInventory([
      { sampleId: 'blank', category: 'middleware', component: '   \n\t ' },
      { sampleId: 'real', category: 'middleware', component: 'kubelet' },
    ]);
    expect(inventory.graded, 'the blank row is not graded').toBe(1);
    expect(inventory.disagrees).toBe(1);
    expect(inventory.notAssessable).toBe(1);
    expect(inventory.unassessableIds).toEqual(['blank']);
  });
});

describe('the shipped probe reports what this module computes', () => {
  // The wiring is a separate claim from the reading: a block can call the right function on
  // the right values and still print them against the wrong rows, which is finding 92's
  // defect. Run as a subprocess rather than imported, so the two cannot agree by
  // construction.

  function probeReport(): {
    agreement: {
      graded: number;
      agrees: number;
      disagrees: number;
      notAssessable: number;
      unassessableIds: string[];
      disagreeShare: number;
      readings: { sampleId: string; answered: string; component: string; verdict: string }[];
      synthetic: { sampleId: string; verdict: string; terms: string[] }[];
      syntheticCounts: { agrees: number; disagrees: number; notAssessable: number };
    };
  } {
    const raw = execFileSync(process.execPath, [PROBE, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return JSON.parse(raw);
  }

  it('cross-checks every figure against the module rather than against a literal', () => {
    const report = probeReport();
    const a = report.agreement;
    const local = buildAgreementInventory(categoryMissesWithComponents());
    expect(a.graded).toBe(local.graded);
    expect(a.agrees).toBe(local.agrees);
    expect(a.disagrees).toBe(local.disagrees);
    expect(a.notAssessable).toBe(local.notAssessable);
    expect(a.unassessableIds).toEqual(local.unassessableIds);
    expect(a.disagreeShare).toBe(local.disagreeShare);
  });

  it('carries one reading per graded sample, and each verdict is the computed one', () => {
    const report = probeReport();
    const a = report.agreement;
    expect(a.readings).toHaveLength(a.graded);
    for (const r of a.readings) {
      expect(
        r.verdict,
        `${r.sampleId}: the printed verdict must be the computed one`,
      ).toBe(assessComponentAgreement({ component: r.component, category: r.answered }).verdict);
    }
  });

  it('the agreement block and the denial block are different measurements', () => {
    // Finding 99 in one assertion. The denial block reads the *incident text*; this block
    // reads the answer's *own component*. If the two figures were identical the blocks
    // would be measuring one thing, and the mechanism this iteration records would not be
    // a mechanism. They are equal by coincidence at these counts (8 and 7 graded, both all
    // unsupported) -- which is exactly why the claim is stated as a *difference in the
    // object read* and asserted structurally rather than as two equal numbers.
    const report = probeReport() as unknown as {
      agreement: { graded: number; unassessableIds: string[] };
      denial: { graded: number };
    };
    expect(report.agreement.unassessableIds).toContain('middleware-kafka-consumer-lag');
    // The denial reading grades all 19 samples against their expected category; the
    // agreement reading grades only the 7 misses that carry a component. Different
    // denominators, different objects.
    expect(report.agreement.graded).not.toBe(report.denial.graded);
  });

  it('exercises the two branches the recorded run cannot reach', () => {
    // The repair injections Z and AA forced. The recorded run has **no** agreeing component
    // and the probe's call path filters out the blank case before the reading sees it, so
    // both the `agrees` branch and the reading's own blank-input branch were unreachable
    // through the probe -- and a branch no input reaches is a branch the battery cannot
    // defend. Z and AA both SURVIVED against the first version of this block, which is how
    // it was found.
    //
    // Reported apart from `inventory`, because folding synthetic rows into `graded` would
    // make the denominator stop describing the annotation.
    const report = probeReport();
    const s = report.agreement;
    expect(s.synthetic, 'the probe must exercise what the fixture cannot reach').toHaveLength(2);
    expect(s.syntheticCounts.agrees, 'the agrees branch must be reachable').toBeGreaterThan(0);
    expect(s.syntheticCounts.notAssessable, 'the blank branch must be reachable').toBeGreaterThan(0);
    // And the synthetic rows are not counted in the inventory, or the denominator would be
    // describing a set that is not the run.
    expect(s.graded).toBe(7);
    expect(s.agrees).toBe(0);
  });
});
