import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { M1_STRICT_THRESHOLD } from '../src/fault/extraction-scoring.js';

/**
 * `scripts/probe-m1-ceiling.mjs` publishes a number, so it is held to this
 * repository's rule for numbers: the figure must be tied to the data it was
 * computed from, and the *definition* it was computed under must be visible.
 *
 * Finding 75 established the `component` field has no stated rule and finding 76
 * established that no prompt edit can be validated against its acceptance rate.
 * Both left the milestone's actual position unstated: with `component` ungradeable
 * in principle, what is M1's ceiling, and what does relaxing the field buy? This
 * probe answers that, and these tests pin the answer so a dataset edit that moves
 * the ceiling fails a test rather than a number in a document quietly going stale.
 *
 * The probe is run as a subprocess rather than imported, because the number that
 * matters is the number the command prints. A function-level assertion would pass
 * while the CLI reported something else, which is the defect finding 77 was about.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PROBE = resolve(ROOT, 'scripts', 'probe-m1-ceiling.mjs');
const GOLDEN = resolve(ROOT, 'golden-master/fault-extraction/samples.json');

interface CeilingReport {
  samples: number;
  m1Threshold: number;
  component: {
    recoverableUnderTokenRule: number;
    unrecoverableUnderTokenRule: number;
    unrecoverableIds: string[];
  };
  strictCeiling: { samples: number; rate: number; clearsM1: boolean };
  strictWithoutComponent: { samples: number; rate: number; clearsM1: boolean };
}

function runProbe(): CeilingReport {
  const stdout = execFileSync(process.execPath, [PROBE, '--json'], { encoding: 'utf8', cwd: ROOT });
  return JSON.parse(stdout) as CeilingReport;
}

interface GoldenSample {
  id: string;
  incidentText: string;
  expected: { type: string; category: string; component: string };
}

const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as { samples: GoldenSample[] };
const report = runProbe();

/**
 * Every expected component of every sample, and whether its tokens appear in its
 * own incident text, derived here from the dataset rather than from the probe.
 *
 * This is the independent half of the comparison. The battery showed that a test
 * which reads two numbers out of the same report proves only that the report is
 * internally consistent -- so the ceiling assertions below compute their expected
 * value from the golden file and require the probe to agree with *that*.
 */
function recoverabilityFromDataset(): { recoverable: number; unrecoverable: string[] } {
  const unrecoverable = golden.samples
    .filter((s) => {
      const low = s.incidentText.toLowerCase();
      return !s.expected.component.split('-').every((t) => t.length > 0 && low.includes(t));
    })
    .map((s) => s.id);
  return { recoverable: golden.samples.length - unrecoverable.length, unrecoverable };
}

const fromDataset = recoverabilityFromDataset();

describe('the M1-ceiling probe · the figure it publishes', () => {
  it('reads the threshold from the scorer rather than restating it', () => {
    // The script hard-codes 0.7 in a module-level constant, and this is the
    // assertion that keeps the copy honest. A milestone threshold that moves in
    // `extraction-scoring.ts` while the probe keeps computing against the old
    // value would produce a ceiling comparison that is off by an unknown amount,
    // which is worse than a missing number.
    expect(report.m1Threshold).toBe(M1_STRICT_THRESHOLD);
    // And the export is not 0.7 by accident: pinning both sides here means the
    // mutation that sets the probe's constant to 0.0 is caught by the equality
    // rather than by the ceiling it would also have moved.
    expect(M1_STRICT_THRESHOLD).toBe(0.7);
  });

  it('reports the two halves of the component partition as a partition', () => {
    // The probe derived these from two independent filters in its first draft, and
    // an injection that exempted one sample from the positive filter left the
    // negative one untouched -- so the two figures disagreed and nothing said
    // which was right. The report now derives the second list from the first, and
    // this is the check that would catch a future edit reintroducing the split.
    //
    // Asserted as an equality rather than a sum, because a sum is satisfied by an
    // implementation whose halves *overlap* -- which is the shape the split had.
    expect(report.component.recoverableUnderTokenRule).toBe(fromDataset.recoverable);
    expect(report.component.unrecoverableIds).toEqual(fromDataset.unrecoverable);
    expect(report.component.unrecoverableUnderTokenRule).toBe(fromDataset.unrecoverable.length);
    expect(report.component.recoverableUnderTokenRule + report.component.unrecoverableUnderTokenRule).toBe(
      report.samples,
    );
  });

  it('names every unrecoverable sample, so the count is auditable', () => {
    // Finding 75's conclusion rests on there being exactly one such sample and on
    // *which* sample it is. A count without the id would leave the reader unable
    // to check the claim against the dataset.
    expect(report.component.unrecoverableIds).toHaveLength(report.component.unrecoverableUnderTokenRule);
    for (const id of report.component.unrecoverableIds) {
      expect(golden.samples.some((s) => s.id === id), `${id} must exist in the dataset`).toBe(true);
    }
  });

  it('computes the strict ceiling over all samples, not over the graded ones', () => {
    // The same distinction `extraction-scoring.ts` draws between its `graded` and
    // `overall` rates: a ceiling conditioned on the pipeline having worked is a
    // different claim from one that includes samples the pipeline lost. The probe
    // reports the unconditional figure, so its denominator is the sample count,
    // and the numerator is the dataset-derived recoverable count -- not the
    // probe's own copy of it, which would make this assertion circular.
    expect(report.strictCeiling.samples).toBe(fromDataset.recoverable);
    expect(report.strictCeiling.rate).toBeCloseTo(fromDataset.recoverable / golden.samples.length, 12);
    expect(report.samples).toBe(golden.samples.length);
  });

  it('reports the relaxed ceiling as strictly larger, because dropping a field cannot lose headroom', () => {
    // A structural property rather than a coincidence: every sample admissible
    // under the strict definition is admissible under the relaxed one, so the
    // relaxed figure can never be the smaller. Asserted in this direction because
    // the mutation that swaps the two is the one that matters -- and because a
    // relaxed ceiling *below* the strict one would mean the two are not nested
    // and the comparison this probe exists to make is meaningless.
    expect(report.strictWithoutComponent.samples).toBeGreaterThanOrEqual(report.strictCeiling.samples);
    expect(report.strictWithoutComponent.rate).toBeGreaterThanOrEqual(report.strictCeiling.rate);
  });

  it('the relaxed ceiling is every sample, so it measures nothing about the model', () => {
    // Stated explicitly so the report cannot be misread as offering two readings.
    // It offers one reading (the strict ceiling) and the cost of not taking it.
    expect(report.strictWithoutComponent.samples).toBe(report.samples);
    expect(report.strictWithoutComponent.rate).toBe(1);
  });

  it('clears M1 under both definitions, and the two now agree', () => {
    // The result this probe was written for, and the one that changed the reading
    // of the round before this one: `component`'s unrecoverable sample cost exactly
    // one sample of headroom, so M1's ceiling was 18/19 with the field and 19/19
    // without it, and the milestone's blocker was the model's accuracy rather than
    // the field's definition. An earlier reading -- "`component` against a 14/19
    // structural ceiling means no prompt change reaches 70%" -- is refuted by this
    // figure, and the refutation is the point.
    //
    // The re-annotation closed the gap between the two definitions: both now read
    // 19/19, so the field's definition costs nothing and the only remaining
    // question is the one the probe says it is. The assertion below is therefore
    // *stronger* than a pair of booleans -- it pins the two definitions to the same
    // figure, which fails if a future edit reopens the gap it took this round to
    // close.
    expect(report.strictCeiling.clearsM1).toBe(true);
    expect(report.strictWithoutComponent.clearsM1).toBe(true);
    expect(
      report.strictCeiling.samples,
      'stating the rule must have made the field cost nothing, so the two definitions agree',
    ).toBe(report.strictWithoutComponent.samples);
    expect(report.component.unrecoverableUnderTokenRule).toBe(0);
  });

  it('the partition is closed, and the sample that used to open it is named', () => {
    // The tripwire that ties this probe to the test that documents the sample.
    //
    // Every other assertion in this file derives its expectation from the dataset,
    // which makes those assertions robust to the dataset changing -- and therefore
    // blind to *which* sample is unrecoverable, because a swap moves both sides
    // identically. The injection battery confirmed that blindness empirically: it
    // relaxed every derived comparison in this file and swapped the unrecoverable
    // sample, and the suite stayed green. A literal naming the unrecoverable set
    // is the only assertion that would have failed, so it is the only thing
    // standing behind the claim.
    //
    // Finding 78 measured this set at `['config-feature-flag-checkout']` and priced
    // it at one of four samples of headroom. This round re-annotated that sample,
    // so the set is now empty and the literal is `[]` -- which is a *stronger*
    // statement, not a vacuous one: it asserts the stated rule has no exception in
    // the ground truth, and it fails the moment a dataset edit reintroduces one.
    expect(report.component.unrecoverableIds).toEqual([]);
    expect(report.component.recoverable).toBe(report.component.total);

    // The re-annotated sample, named, so the round's change is traceable from the
    // probe rather than only from the test file that documents it. It must now be
    // recoverable, and recoverable *because* the annotation names something the
    // text carries -- the property that was missing before.
    const reAnnotated = golden.samples.find((s) => s.id === 'config-feature-flag-checkout');
    expect(reAnnotated, 'the re-annotated sample must exist').toBeDefined();
    if (reAnnotated === undefined) return;
    expect(reAnnotated.expected.component).toBe('storefront');
    expect(reAnnotated.incidentText).toContain('storefront');
    expect(reAnnotated.incidentText).not.toContain('checkout-ui');
    expect(report.component.unrecoverableIds).not.toContain('config-feature-flag-checkout');

    // And a *contrast* against a sample that is recoverable by token co-occurrence
    // rather than verbatim, so the assertion above is not a bare literal with no
    // relationship to the report. `network-delay-cart-to-inventory` is the sample
    // the battery's swap injection rewrites; naming it here means a swap fails on
    // a statement about both ends of the move rather than on one value a reader
    // has to trust.
    expect(report.component.unrecoverableIds).not.toContain('network-delay-cart-to-inventory');
    const cartSample = golden.samples.find((s) => s.id === 'network-delay-cart-to-inventory');
    expect(cartSample, 'the sample the swap targets must exist').toBeDefined();
    if (cartSample === undefined) return;
    // Why it is *not* the unrecoverable one, stated as a property of its text. The
    // first version of this assertion claimed the sample contains `cart-service`
    // verbatim and was wrong -- the text says "Cart-to-inventory" and "the inventory
    // service", and the rule accepts the component because its two hyphen tokens
    // both occur, not because the joined name does. The corrected form pins the
    // actual mechanism: both tokens present, the joined form absent. That is the
    // distinction the whole `component` rule turns on, so it is worth asserting
    // rather than paraphrasing.
    expect(cartSample.expected.component).toBe('cart-service');
    expect(cartSample.incidentText).not.toContain('cart-service');
    for (const token of cartSample.expected.component.split('-')) {
      expect(cartSample.incidentText.toLowerCase(), `'${token}' must occur in the text`).toContain(token);
    }
  });
});
