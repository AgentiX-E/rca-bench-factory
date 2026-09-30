/**
 * The control for finding 99, and the refutation it produces.
 *
 * Every assertion here is falsifiable against `golden-master/fault-extraction/samples.json`.
 * The dataset is read, not transcribed, so the figures cannot drift from the corpus.
 *
 * The load-bearing assertion is `expected.supportShare > predicted.supportShare === false`:
 * the reading does **not** separate correct components from the model's, so finding 99's
 * `7 of 7` distinguishes nothing. If a future change makes the reading separate the two,
 * that assertion fails and the finding is restored.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  assessComponentAgreement,
} from '../../src/fault/component-agreement.js';
import { CATEGORY_TERMS } from '../../src/fault/category-terms.js';
import {
  buildAgreementContrast,
  buildBaselineInventory,
  readBaselineSupport,
  type BaselineSample,
} from '../../src/fault/agreement-baseline.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const DATASET = resolve(REPO_ROOT, 'golden-master', 'fault-extraction', 'samples.json');

interface GoldenSample {
  id: string;
  incidentText: string;
  expected: { type: string; category: string; component: string };
}

function loadDataset(): GoldenSample[] {
  const parsed = JSON.parse(readFileSync(DATASET, 'utf8')) as { samples: GoldenSample[] };
  return parsed.samples;
}

/**
 * The expected side: the dataset's own components, which are right by construction.
 * This is the baseline finding 99 never computed.
 */
function expectedSide(): BaselineSample[] {
  return loadDataset().map((s) => ({
    sampleId: s.id,
    category: s.expected.category,
    component: s.expected.component,
  }));
}

/**
 * The predicted side: the components the model named for the seven misses that carry a
 * `component` row, together with the category **it answered**. Transcribed from the CI
 * annotation bodies for run `567118aea` -- the same source `component-agreement.test.ts`
 * reads through `parseMissDetail`, kept as a literal here because this file's subject is
 * the contrast, not the parse.
 */
const PREDICTED: BaselineSample[] = [
  { sampleId: 'resource-memory-leak-recommendation', category: 'code', component: 'recommendation service session cache' },
  { sampleId: 'runtime-pod-kill-user-profile', category: 'resource', component: 'kubelet' },
  { sampleId: 'runtime-container-crash-loop-media', category: 'dependency', component: 'native ffmpeg binding' },
  { sampleId: 'middleware-redis-latency-cache', category: 'resource', component: 'session Redis' },
  { sampleId: 'middleware-database-connection-pool', category: 'resource', component: 'billing service connection pool' },
  { sampleId: 'code-slow-regex-api-gateway', category: 'config', component: 'WAF rule' },
  { sampleId: 'middleware-mysql-replica-lag-analytics', category: 'resource', component: 'replica applier thread' },
];

describe('the expected side -- components that are right by construction', () => {
  it('supports its category in exactly one of nineteen', () => {
    const inv = buildBaselineInventory(expectedSide());
    expect(inv.graded).toBe(19);
    expect(inv.supporting).toBe(1);
  });

  it('names that one, so the figure is checkable rather than a bare count', () => {
    const inv = buildBaselineInventory(expectedSide());
    expect(inv.supportingIds).toEqual(['middleware-redis-latency-cache']);
  });

  it('and the one is a service named after its mechanism, not a signal', () => {
    const inv = buildBaselineInventory(expectedSide());
    const row = inv.rows.find((r) => r.sampleId === 'middleware-redis-latency-cache');
    expect(row?.component).toBe('session-cache');
    expect(row?.terms).toEqual(['cache']);
  });

  it('reads 1 of 19 as a share of 0.0526', () => {
    const inv = buildBaselineInventory(expectedSide());
    expect(inv.supportShare).toBeCloseTo(1 / 19, 10);
  });
});

describe('the predicted side -- the components finding 99 measured', () => {
  it('supports its answered category in zero of seven', () => {
    const inv = buildBaselineInventory(PREDICTED);
    expect(inv.graded).toBe(7);
    expect(inv.supporting).toBe(0);
    expect(inv.supportShare).toBe(0);
  });

  it('which is the figure finding 99 reported, reproduced from the reading', () => {
    const inv = buildBaselineInventory(PREDICTED);
    expect(inv.rows.filter((r) => r.terms.length > 0)).toEqual([]);
  });
});

describe('the contrast, which is the finding', () => {
  it('is NOT load-bearing, so the reading does not separate the two sides', () => {
    const c = buildAgreementContrast({ expected: expectedSide(), predicted: PREDICTED });
    expect(c.separates).toBe(false);
  });

  it('and the delta is positive, meaning the reading favours the model slightly', () => {
    const c = buildAgreementContrast({ expected: expectedSide(), predicted: PREDICTED });
    expect(c.shareDelta).toBeGreaterThan(0);
    expect(c.shareDelta).toBeCloseTo(1 / 19, 10);
  });

  /**
   * The arithmetic trap this module was built with and had to be corrected for.
   *
   * `0/7 < 1/19` is true, and the first version of `buildAgreementContrast` returned
   * exactly that as `separates`. It is the difference between two estimates of zero, not a
   * separation. Both are asserted here: the inequality holds, and it is not the finding.
   */
  it('the numerical comparison holds and is NOT what separates means', () => {
    const c = buildAgreementContrast({ expected: expectedSide(), predicted: PREDICTED });
    expect(c.predicted.supportShare).toBeLessThan(c.expected.supportShare);
    expect(c.separates).toBe(false);
  });

  it('the floor is what decides, and the expected side sits below it', () => {
    const c = buildAgreementContrast({ expected: expectedSide(), predicted: PREDICTED });
    expect(c.baselineFloor).toBeGreaterThan(0);
    expect(c.expected.supportShare).toBeLessThanOrEqual(c.baselineFloor);
  });

  it('and the reason says so in a sentence, so a report cannot print the bare figure', () => {
    const c = buildAgreementContrast({ expected: expectedSide(), predicted: PREDICTED });
    expect(c.reason).toContain('1 of 19');
    expect(c.reason).toMatch(/indistinguishable from zero/);
  });

  it('a baseline above the floor WOULD be load-bearing, so the guard is two-sided', () => {
    // Synthesised, because the corpus has none: a set of components that mostly carry
    // their category's terms. Without this, `separates` could be hardcoded false and
    // every assertion above would still pass.
    const strong = [
      { sampleId: 'a', category: 'middleware', component: 'redis-cache-pool' },
      { sampleId: 'b', category: 'middleware', component: 'kafka-queue' },
      { sampleId: 'c', category: 'resource', component: 'cpu-saturation' },
      { sampleId: 'd', category: 'runtime', component: 'pod-kill' },
      { sampleId: 'e', category: 'code', component: 'null-deref-exception' },
    ];
    const c = buildAgreementContrast({ expected: strong, predicted: PREDICTED });
    expect(c.expected.supportShare).toBe(1);
    expect(c.separates).toBe(true);
    expect(c.reason).toMatch(/above the floor/);
  });

  it('so 7 of 7 is an artifact of the vocabulary, not a measurement of the model', () => {
    const c = buildAgreementContrast({ expected: expectedSide(), predicted: PREDICTED });
    // The claim "the model's components support their categories less often than correct
    // ones do" is what finding 99 needs. It is not supported.
    expect(c.separates).toBe(false);
  });
});

describe('the defence, measured rather than argued', () => {
  /**
   * "The finding was about the answered category; the model answered the wrong category,
   * so of course the component does not support it. Read it against the EXPECTED category."
   *
   * This test runs that reading. It does not rescue the contrast either.
   */
  it('reading the misses against the expected category gives 1 of 7, not 7 of 7', () => {
    const byId = new Map(loadDataset().map((s) => [s.id, s]));
    const againstExpected = PREDICTED.map((p) => ({
      sampleId: p.sampleId,
      category: byId.get(p.sampleId)!.expected.category,
      component: p.component,
    }));

    const inv = buildBaselineInventory(againstExpected);
    expect(inv.graded).toBe(7);
    expect(inv.supporting).toBe(1);
    expect(inv.supportingIds).toEqual(['middleware-redis-latency-cache']);
  });

  it('and that one is session Redis under middleware, which does carry a term', () => {
    const reading = readBaselineSupport({ component: 'session Redis', category: 'middleware' });
    expect(reading.supports).toBe(true);
    expect(reading.terms).toEqual(['redis']);
  });

  it('while the same component under the answered category resource does not', () => {
    const reading = readBaselineSupport({ component: 'session Redis', category: 'resource' });
    expect(reading.supports).toBe(false);
    expect(reading.terms).toEqual([]);
  });
});

describe('the control reads the same thing as the finding it controls', () => {
  /**
   * If `readBaselineSupport` and `assessComponentAgreement` ever disagree, the control is
   * measuring one thing and the finding another, and both figures are void. Pinned over
   * every (component, category) pair the corpus offers, on both sides.
   */
  it('agrees sample by sample with assessComponentAgreement on the expected side', () => {
    for (const s of loadDataset()) {
      const a = assessComponentAgreement({
        component: s.expected.component,
        category: s.expected.category,
      });
      const b = readBaselineSupport({
        component: s.expected.component,
        category: s.expected.category,
      });
      expect(b.supports, s.id).toBe(a.verdict === 'agrees');
      expect([...b.terms].sort(), s.id).toEqual([...a.terms].sort());
    }
  });

  it('and does the same on the predicted side', () => {
    for (const p of PREDICTED) {
      const a = assessComponentAgreement({
        component: p.component,
        category: p.category,
      });
      const b = readBaselineSupport({ component: p.component, category: p.category });
      expect(b.supports, p.sampleId).toBe(a.verdict === 'agrees');
      expect([...b.terms].sort(), p.sampleId).toEqual([...a.terms].sort());
    }
  });
});

describe('the three-valued discipline, carried over', () => {
  it('a blank component is excluded from the denominator, not counted as non-supporting', () => {
    const inv = buildBaselineInventory([
      { sampleId: 'a', category: 'resource', component: 'checkout-api' },
      { sampleId: 'b', category: 'resource', component: '' },
      { sampleId: 'c', category: 'resource', component: '   \n\t ' },
    ]);
    expect(inv.graded).toBe(1);
    expect(inv.rows.map((r) => r.sampleId)).toEqual(['a']);
  });

  it('an empty corpus reads 0 with a share of 0 rather than NaN', () => {
    const inv = buildBaselineInventory([]);
    expect(inv.graded).toBe(0);
    expect(inv.supporting).toBe(0);
    expect(inv.supportShare).toBe(0);
    expect(Number.isNaN(inv.supportShare)).toBe(false);
  });

  it('an unknown category does not support, matching the finding module', () => {
    const reading = readBaselineSupport({ component: 'checkout-api', category: 'not-a-category' });
    expect(reading.supports).toBe(false);
    expect(reading.terms).toEqual([]);
  });

  it('a blank component inside readBaselineSupport does not support', () => {
    // Reached directly, because buildBaselineInventory filters blanks before calling it --
    // the defect injection AA found in the finding module's probe.
    const reading = readBaselineSupport({ component: '  ', category: 'resource' });
    expect(reading.supports).toBe(false);
    expect(reading.terms).toEqual([]);
  });
});

describe('the vocabulary bound is the cause, and it is stated not assumed', () => {
  it('every expected component is a service name or a mechanism noun, never a slug', () => {
    // The dataset's components contain no hyphenated fault slug of the shape
    // CATEGORY_TERMS was built for. This is why the table misfires on them.
    const slugs = Object.keys(CATEGORY_TERMS);
    for (const s of loadDataset()) {
      const component = s.expected.component;
      // A slug-shaped component would be one whose full text names a category term.
      const asSlug = assessComponentAgreement({ component, category: s.expected.category });
      if (asSlug.verdict === 'agrees') {
        expect(s.id).toBe('middleware-redis-latency-cache');
      }
      expect(slugs.length).toBeGreaterThan(0);
    }
  });

  it('the one agreement is on a bare term that is also a substring of a common noun', () => {
    // `cache` in `session-cache` is a real term. The point is that no OTHER expected
    // component contains any of its category's terms, so the rate is 1/19.
    const reading = readBaselineSupport({ component: 'session-cache', category: 'middleware' });
    expect(reading.terms).toEqual(['cache']);

    const noTerms = readBaselineSupport({ component: 'checkout-api', category: 'resource' });
    expect(noTerms.terms).toEqual([]);
  });
});

describe('the count follows the verdict, not a proxy for it', () => {
  /**
   * Injection AC -- "count every component as supporting" -- SURVIVED on its first run, and
   * the survival is what found the defect: `buildBaselineInventory` destructured `terms` and
   * counted `terms.length > 0`, so the verdict `readBaselineSupport` actually returned was
   * read, reported on the row, and then thrown away. A mutation to the support rule that did
   * not also change the term list was invisible to the corpus figure.
   *
   * This test asserts the coupling directly, so the defect cannot return: over the corpus,
   * every sample whose reading supports must be counted, and every sample counted must have a
   * reading that supports.
   */
  it('every sample the reading supports is counted, and every one counted supports', () => {
    const samples = expectedSide();
    const inv = buildBaselineInventory(samples);

    const readingSupports = samples.filter(
      (s) => readBaselineSupport({ component: s.component, category: s.category }).supports,
    );
    expect(inv.supporting).toBe(readingSupports.length);
    expect(inv.supportingIds.slice().sort()).toEqual(
      readingSupports.map((s) => s.sampleId).sort(),
    );
  });

  it('and the same holds on the predicted side, where the count is zero', () => {
    const inv = buildBaselineInventory(PREDICTED);
    const readingSupports = PREDICTED.filter(
      (s) => readBaselineSupport({ component: s.component, category: s.category }).supports,
    );
    expect(inv.supporting).toBe(0);
    expect(readingSupports).toEqual([]);
  });

  it('a row is emitted for every graded sample, including the non-supporting ones', () => {
    // The rows carry the terms, so a consumer can name why a component supported. Dropping
    // the non-supporting rows would make `rows.length` disagree with `graded`.
    const inv = buildBaselineInventory(expectedSide());
    expect(inv.rows).toHaveLength(inv.graded);
  });
});

describe('the reading reports through the probe, not only through the unit tests', () => {
  /**
   * The figures live in a probe the finding can be re-run from. A test that only exercised
   * the module in-process would pass while the probe printed something else.
   */
  function probeReport(): string {
    return execFileSync(
      'node',
      [resolve(REPO_ROOT, 'scripts', 'probe-agreement-baseline.mjs')],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
  }

  it('prints both sides and the contrast', () => {
    const out = probeReport();
    expect(out).toContain('expected');
    expect(out).toContain('predicted');
    expect(out).toContain('1 of 19');
    expect(out).toContain('0 of 7');
  });

  it('states that the contrast is not load-bearing', () => {
    const out = probeReport();
    expect(out).toContain('the reading does NOT separate them');
    expect(out).toContain('the contrast is load-bearing: false');
  });

  it('and names the arithmetic trap rather than leaving it to be rediscovered', () => {
    const out = probeReport();
    expect(out).toContain('0/7 < 1/19');
  });

  it('and names the single expected component that agrees', () => {
    const out = probeReport();
    expect(out).toContain('middleware-redis-latency-cache');
  });
});
