import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DENIAL_MARKERS,
  assessCategoryDenial,
  buildDenialInventory,
  type DenialReading,
} from '../../src/fault/denial-inventory.js';

/**
 * Is the answered category present in the incident text, or only denied by it?
 *
 * Finding 96 measured that the recorded `category` misses follow a
 * counter-evidence sentence. It closed with an explicit gap: whether writing
 * such a sentence and then grading a category is a **well-posed task** is a
 * labelling question, and it was not answered there.
 *
 * This file is that answer, measured against the standard the dataset states for
 * itself. `golden-master/fault-extraction/samples.json` carries:
 *
 *   note:          "...naming exactly one fault, so the expected record is
 *                   decidable from the text alone."
 *   authoringRule: "The expected.type must be derivable from the incident text
 *                   by a careful human reader. A sample whose answer needs
 *                   context the text does not carry is a bad sample, not a hard
 *                   one."
 *
 * The claim under test is narrow and falsifiable: **for the five reached misses,
 * the category the model answered appears in the text only inside a denial.** The
 * model is not picking a rival hypothesis the text also supports; it is answering
 * with the one category the text rules out.
 *
 * **That claim is false, and this file is where it was falsified.** The first
 * version of the module and of this file asserted the sentence above. Measured, it
 * holds in **one** of the five: in the other four the answered category has no term
 * in the text at all. The assertion `absentOfFive === 4` is the correction, written
 * as a test so the wrong reading cannot come back by being re-worded more
 * carefully -- which is how it would come back.
 *
 * The control is what keeps this honest. If any category-naming denial were
 * enough, the sole correct carrier -- `resource-cpu-saturation-checkout`, whose
 * denial is about a *load generator* -- would be `denied-only` too. It is not,
 * and that difference is asserted below rather than asserted in prose.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
const PROBE = resolve(REPO_ROOT, 'scripts/probe-type-misses.mjs');

interface GoldenSample {
  id: string;
  incidentText: string;
  expected: { type: string; category: string };
}

function goldenDocument(): { samples: GoldenSample[]; provenance: Record<string, string> } {
  // Four levels up: this file is at `packages/core/test/fault/`. The dataset is at
  // the repository root, so `test/fault/` is two directories deeper than `src/`.
  const path = resolve(HERE, '..', '..', '..', '..', 'golden-master', 'fault-extraction', 'samples.json');
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
    samples: GoldenSample[];
    provenance: Record<string, string>;
  };
  expect(parsed.samples.length).toBe(19);
  return parsed;
}

function goldenSamples(): GoldenSample[] {
  return goldenDocument().samples;
}

/** The five reached misses, with the category the model answered (finding 96). */
const REACHED_MISSES: ReadonlyArray<{ sampleId: string; answered: string }> = [
  { sampleId: 'middleware-database-connection-pool', answered: 'resource' },
  { sampleId: 'middleware-redis-latency-cache', answered: 'resource' },
  { sampleId: 'middleware-mysql-replica-lag-analytics', answered: 'resource' },
  { sampleId: 'runtime-pod-kill-user-profile', answered: 'resource' },
  { sampleId: 'middleware-kafka-consumer-lag', answered: 'code' },
];

/**
 * The three `category` misses finding 96's phrase predictor does not reach.
 *
 * Named, because the claim about them is specific and has to survive a dataset edit
 * that changes which misses are unreached. They are the complement of
 * `REACHED_MISSES` within the recorded misses -- asserted as a partition rather than
 * trusted, since a hand-written complement is exactly the kind of second copy of a
 * fact this repository has been burned by.
 *
 * The answered category is transcribed from the recorded run for the same reason
 * `REACHED_MISSES` carries it: there is no route from the annotation to a category
 * without the vocabulary, so the answer is data and the join is by sample id.
 */
const UNREACHED_CATEGORY_MISSES: ReadonlyArray<{ sampleId: string; answered: string }> = [
  { sampleId: 'resource-memory-leak-recommendation', answered: 'code' },
  { sampleId: 'runtime-container-crash-loop-media', answered: 'dependency' },
  { sampleId: 'code-slow-regex-api-gateway', answered: 'config' },
];

describe('the dataset states the standard this reading measures against', () => {
  it('carries the authoring rule it is held to', () => {
    // The finding quotes the dataset's own words. If the dataset is reworded, the
    // finding must be revisited rather than quietly measuring against a standard
    // that no longer exists -- so the quoted text is an assertion.
    //
    // This is the same discipline finding 95 applied to the docstring in
    // `gates/validity.ts`: a claim about a property is not the property, and the
    // only way to keep them joined is to assert the text.
    const { provenance } = goldenDocument();
    expect(provenance['note']).toContain('decidable from the text alone');
    expect(provenance['authoringRule']).toContain('derivable from the incident text');
    expect(provenance['authoringRule']).toContain('a bad sample, not a hard one');
  });
});

describe('the denial vocabulary is closed and each entry is load-bearing', () => {
  it('is closed and non-empty', () => {
    // Closed rather than a regex, for the reason `NEGATION_PREFIXES` and
    // `COUNTER_EVIDENCE_PHRASES` are closed: a pattern loose enough to catch prose
    // catches prose.
    expect(DENIAL_MARKERS.length).toBeGreaterThan(0);
    expect(new Set(DENIAL_MARKERS).size).toBe(DENIAL_MARKERS.length);
  });

  it.each(DENIAL_MARKERS)('treats %s as a denial marker', (marker) => {
    // Each entry asserted individually: an entry with no test is an entry that can
    // be deleted silently, and the whole point of a closed list is that every
    // member is load-bearing.
    //
    // The probe text must contain a term of the category under test, or the reading
    // is `absent` and `markers` comes back empty for a reason that has nothing to do
    // with the marker -- which is how the first version of this test failed. `memory`
    // is a resource term, so naming it makes the clause eligible for a marker.
    const reading = assessCategoryDenial({
      text: `The node reports memory ${marker}anomaly during the window.`,
      category: 'resource',
    });
    expect(reading.markers).toContain(marker);
  });

  it('scopes a denial to its own clause, not the whole document', () => {
    // The property that makes the reading useful: the five reached misses discuss
    // the denied category in one clause and the real cause in another, so a
    // document-level test would call every one of them `also-asserted` and find
    // nothing. Asserted directly, because it is load-bearing rather than incidental.
    const reading = assessCategoryDenial({
      text: 'Memory was well under the limit. The pod was OOMKilled anyway.',
      category: 'resource',
    });
    // The second clause asserts `memory`'s category without a marker, so the
    // document does support it, and `also-asserted` is the honest reading.
    expect(reading.verdict).toBe('also-asserted');
  });
});

describe('the reading is three-valued, and the third value is reachable', () => {
  it('reports absent when the category never appears', () => {
    // A category that is never mentioned is not the same observation as a category
    // named and ruled out. Collapsing the two would let "the text never says
    // resource" and "the text says resource is fine" produce one figure --
    // finding 94's reason for `undecided`, applied to a different instrument.
    const reading = assessCategoryDenial({
      text: 'The pod was evicted and restarted twice.',
      category: 'resource',
    });
    expect(reading.verdict).toBe('absent');
    expect(reading.markers).toEqual([]);
  });

  it('reports not-assessable for empty and whitespace text', () => {
    // A missing input must not read as a clean one. Same rule as
    // `assessCounterEvidence`'s third value.
    expect(assessCategoryDenial({ text: '', category: 'resource' }).verdict).toBe('not-assessable');
    expect(assessCategoryDenial({ text: '   \n\t ', category: 'resource' }).verdict).toBe(
      'not-assessable',
    );
  });

  it('reports denied-only when every mention sits inside a denial', () => {
    // The property the finding is about. `memory` appears, and it appears under
    // `well under the limit` -- there is no second, affirmative mention.
    const reading = assessCategoryDenial({
      text: 'Node conditions were healthy and memory was well under the limit.',
      category: 'resource',
    });
    expect(reading.verdict).toBe('denied-only');
    expect(reading.markers.length).toBeGreaterThan(0);
  });

  it('reports also-asserted when the category survives somewhere in the text', () => {
    // The control direction. A text that names a category affirmatively *as well*
    // as denying it is a different observation, and reporting it as `denied-only`
    // would overstate the finding by counting ordinary prose.
    const reading = assessCategoryDenial({
      text: 'Memory climbed to the 2Gi limit and the kernel killed the container. Traffic is flat.',
      category: 'resource',
    });
    expect(reading.verdict).toBe('also-asserted');
  });

  it('reports absent for a category the vocabulary does not carry at all', () => {
    // The lookup's fallback, and the reason it is a fallback rather than a throw.
    //
    // `CATEGORY_TERMS` is a closed table of the seven taxonomy categories, but
    // `assessCategoryDenial` takes a `string` and the answer it is asked about comes
    // from a model output -- so an unknown value is reachable input, not an
    // impossible one. Throwing would make a malformed answer crash the instrument
    // that is supposed to report on malformed answers.
    //
    // `absent` rather than `not-assessable` is the correct third value here: the text
    // *was* read, and the reading is that this vocabulary has no term for the
    // category. `not-assessable` means the text was missing, which is a different
    // fact. Folding them would let "unrecognised category" hide inside "no text".
    expect(assessCategoryDenial({ text: 'Anything at all.', category: 'not-a-category' }).verdict).toBe(
      'absent',
    );
    // And the same for the empty category, which is what `probe-type-misses.mjs`
    // passes when a golden sample carries no `expected.category` rather than
    // skipping the sample -- skipping would move the denominator.
    expect(assessCategoryDenial({ text: 'Anything at all.', category: '' }).verdict).toBe('absent');
  });
});

describe('the five reached misses answer with a category the text does not support', () => {
  it('reports the answered category as absent or denied-only, never asserted', () => {
    // The finding, and it is **not** the one the first draft asserted. The expected
    // shape was "the text names the answered category only to deny it"; measured,
    // four of five texts contain **no term of the answered category at all**, and
    // the fifth has the term inside a denial.
    //
    // So the assertion is the honest one: no reached miss carries the answered
    // category as something the text asserts. `also-asserted` would mean the text
    // supports the answer, and that is what must not happen for the finding to hold.
    const samples = goldenSamples();
    const offenders: string[] = [];
    for (const { sampleId, answered } of REACHED_MISSES) {
      const sample = samples.find((s) => s.id === sampleId);
      expect(sample, `${sampleId} must resolve in the dataset`).toBeDefined();
      const reading = assessCategoryDenial({
        text: sample!.incidentText,
        category: answered,
      });
      if (reading.verdict === 'also-asserted' || reading.verdict === 'not-assessable') {
        offenders.push(`${sampleId}:${reading.verdict}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('finds no term of the answered category in four of the five', () => {
    // The correction, stated as a figure. The first draft of this module claimed
    // "the answered category appears only inside a denial" in all five; the
    // measurement says the term is usually **not there at all**, which is a
    // different and stronger statement.
    //
    // Recorded as 4/5 with the denominator, because a bare four is the kind of
    // figure finding 91 refused to report without one.
    const samples = goldenSamples();
    const absent = REACHED_MISSES.filter(({ sampleId, answered }) => {
      const sample = samples.find((s) => s.id === sampleId)!;
      return assessCategoryDenial({ text: sample.incidentText, category: answered }).verdict === 'absent';
    });
    expect(absent.length).toBe(4);
    expect(REACHED_MISSES.length).toBe(5);
  });

  it('is the fifth one whose term sits inside a denial', () => {
    // `runtime-pod-kill-user-profile` is the exception and it is worth naming: its
    // text says "memory was well under the limit", so `memory` -- a resource term --
    // is present, and present under a denial. That is the case the first draft
    // generalised from, and it is one case, not five.
    const samples = goldenSamples();
    const sample = samples.find((s) => s.id === 'runtime-pod-kill-user-profile')!;
    const reading = assessCategoryDenial({ text: sample.incidentText, category: 'resource' });
    expect(reading.verdict).toBe('denied-only');
    expect(reading.markers).toContain('well under');
  });
});

describe('the control is what stops the reading from being trivial', () => {
  it('does not report the only correct carrier as denied-only', () => {
    // `resource-cpu-saturation-checkout` is the one sample that both carries a
    // finding-96 phrase and was answered correctly. Its denial is about **the load
    // generator**, an instrument the category vocabulary has no word for, so there
    // is no category to answer with.
    //
    // Without this control, "every denial predicts a miss" would be unfalsified --
    // and it is false, because this sample carries a denial and is correct. The
    // assertion pins the difference: a denial *of a category* invites the category
    // as an answer; a denial of a non-category does not.
    const samples = goldenSamples();
    const control = samples.find((s) => s.id === 'resource-cpu-saturation-checkout')!;
    const reading = assessCategoryDenial({ text: control.incidentText, category: 'resource' });
    expect(reading.verdict).not.toBe('denied-only');
    // And the reason is structural, not incidental: the text does carry the word
    // "unchanged", which is a finding-96 phrase, but its subject is the load
    // generator rather than a category term.
    expect(control.incidentText).toMatch(/unchanged/i);
    expect(reading.verdict).toBe('also-asserted');
  });
});

describe('the inventory is built over the whole corpus', () => {
  it('reads every sample and partitions them', () => {
    // Read from the dataset rather than counted by hand, so the figure moves with
    // the data. The three verdicts must account for every sample -- a partition
    // that does not sum is the shape of error that turns a partial reading into a
    // confident percentage, which `probe-m1-ceiling` already guards for its own
    // counts.
    const inventory = buildDenialInventory(
      goldenSamples().map((s) => ({ sampleId: s.id, text: s.incidentText, category: s.expected.category })),
    );
    expect(inventory.graded).toBe(19);
    expect(inventory.deniedOnly + inventory.alsoAsserted + inventory.absent).toBe(19);
  });

  it('counts a sample with no text as not-assessable rather than absent', () => {
    // The degenerate input, exercised directly. A blank sample is an input that was
    // never read, and folding it into `absent` would move the partition on the
    // strength of nothing.
    const inventory = buildDenialInventory([
      { sampleId: 'blank', text: '', category: 'resource' },
      { sampleId: 'spaces', text: '   \n\t ', category: 'resource' },
      { sampleId: 'real', text: 'The pod was killed.', category: 'runtime' },
    ]);
    expect(inventory.notAssessable).toBe(2);
    expect(inventory.graded).toBe(1);
    expect(inventory.deniedOnly + inventory.alsoAsserted + inventory.absent).toBe(1);
  });

  it('returns an empty inventory for an empty corpus', () => {
    // The fully degenerate input. Every figure zero, and no division by a zero
    // denominator -- the same guard `counterEvidenceReport` carries, for the same
    // reason: a `NaN` in a report compares false against every threshold.
    const inventory = buildDenialInventory([]);
    expect(inventory).toEqual({
      graded: 0,
      deniedOnly: 0,
      alsoAsserted: 0,
      absent: 0,
      notAssessable: 0,
      deniedOnlyShare: 0,
    });
    expect(Number.isNaN(inventory.deniedOnlyShare)).toBe(false);
  });
});

describe('the verdicts are a closed set', () => {
  it('never returns a verdict outside the declared union', () => {
    // Exhaustiveness, asserted rather than assumed. A fourth verdict added later
    // without being declared would make every downstream `else` branch wrong, and
    // the partition test above would still sum.
    const allowed = new Set<DenialReading['verdict']>([
      'denied-only',
      'also-asserted',
      'absent',
      'not-assessable',
    ]);
    const samples = goldenSamples();
    for (const sample of samples) {
      for (const category of ['resource', 'middleware', 'network', 'runtime', 'code', 'config', 'dependency']) {
        const reading = assessCategoryDenial({ text: sample.incidentText, category });
        expect(allowed.has(reading.verdict)).toBe(true);
      }
    }
  });
});

describe('the shipped probe reports what this module computes', () => {
  // The module has one correct implementation and the probe is a reader of it, so
  // the interesting claim is not the reading -- it is the *wiring*. A block can
  // read the right texts through the right function and still print them against
  // the wrong rows, which is finding 92's defect and the reason a subprocess check
  // exists rather than an import: an import would let the two share a module
  // instance and agree by construction.
  //
  // The block is also read against the category the model **answered** rather than
  // the one expected. That is asserted here as a property rather than trusted,
  // because reading the expected category would make every sample `also-asserted`
  // and the block would report zero unsupported misses while looking correct.

  function probeReport(): {
    denial: {
      misses: number;
      graded: number;
      counts: Record<string, number>;
      deniedOnlyShare: number;
      unsupportedMisses: number;
      answeredCategoryAbsent: number;
      answeredCategoryDeniedOnly: number;
      control: { sampleId: string; expected: string; verdict: string } | null;
      readings: { sampleId: string; expected: string; answered: string; verdict: string }[];
    };
    category: { misses: number; missedWithPhrase: number; missedTotal: number };
  } {
    // Run as a subprocess from the repository root, exactly as the probe is
    // documented to be run. `--json` because the human-readable form is for a
    // person and this is a check.
    const raw = execFileSync(process.execPath, [PROBE, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return JSON.parse(raw);
  }

  it('reads every miss against the category the model answered, not the expected one', () => {
    const report = probeReport();
    const d = report.denial;
    expect(d.misses, 'the block covers every category miss').toBe(8);
    expect(d.readings, 'and carries one reading per miss').toHaveLength(d.misses);

    // The reversal check. If the block read the expected category, the two columns
    // would be equal and every verdict would be `also-asserted` -- because the text
    // does carry what the answer should have been.
    const answeredDiffers = d.readings.filter((r) => r.answered !== r.expected);
    expect(
      answeredDiffers.length,
      'a block that read the expected category would answer every sample and measure nothing',
    ).toBeGreaterThan(0);
    expect(
      d.readings.every((r) => r.verdict === 'also-asserted'),
      'the reading must not be uniform',
    ).toBe(false);
  });

  it('agrees with the module on every figure, cross-checked rather than compared to a literal', () => {
    // Cross-checked against the module, so a figure that moved in both copies in
    // the same direction still fails. Literals would pass there; this does not.
    const report = probeReport();
    const d = report.denial;
    const samples = goldenSamples();
    const byId = new Map(samples.map((s) => [s.id, s]));

    const local = d.readings.map((r) => {
      const sample = byId.get(r.sampleId);
      expect(sample, `${r.sampleId} must resolve in the dataset`).toBeDefined();
      return assessCategoryDenial({ text: sample!.incidentText, category: r.answered }).verdict;
    });

    expect(d.answeredCategoryAbsent, 'absent').toBe(local.filter((v) => v === 'absent').length);
    expect(d.answeredCategoryDeniedOnly, 'denied-only').toBe(
      local.filter((v) => v === 'denied-only').length,
    );
    expect(d.unsupportedMisses, 'unsupported').toBe(
      local.filter((v) => v === 'absent' || v === 'denied-only').length,
    );
    for (const [index, r] of d.readings.entries()) {
      expect(r.verdict, `${r.sampleId}: the printed verdict must be the computed one`).toBe(
        local[index],
      );
    }

    // The corpus partition, on the other denominator. Asserted from the module
    // rather than read off the probe, so the two are independent statements about
    // the same 19 samples.
    const inventory = buildDenialInventory(
      samples.map((s) => ({ sampleId: s.id, text: s.incidentText, category: s.expected.category })),
    );
    expect(d.graded).toBe(inventory.graded);
    expect(d.counts.deniedOnly).toBe(inventory.deniedOnly);
    expect(d.counts.alsoAsserted).toBe(inventory.alsoAsserted);
    expect(d.counts.absent).toBe(inventory.absent);
    expect(d.deniedOnlyShare).toBe(inventory.deniedOnlyShare);
  });

  it('prints the control, and the control is not denied-only', () => {
    // The block is worthless if any denial reads as `denied-only`, and the control
    // is the one sample that can show it does not. Asserted through the probe, so
    // the block cannot omit it: a report that dropped the control would be a report
    // whose central claim is unfalsifiable by its own output.
    const report = probeReport();
    const control = report.denial.control;
    expect(control, 'the probe must carry the control').not.toBeNull();
    expect(control!.sampleId).toBe('resource-cpu-saturation-checkout');
    expect(control!.expected, 'and read it against its own category').toBe('resource');
    expect(
      control!.verdict,
      'a denial of a non-category must not read as a denial of a category',
    ).toBe('also-asserted');
  });

  it('the denial block and the counter-evidence block disagree, which is finding 98', () => {
    // The finding in one assertion. Finding 96's block reports a phrase in 5 of the
    // 8 misses; this block reports an unsupported answered category in 8 of the 8.
    // If the two figures were equal the blocks would be measuring one thing, and the
    // correction this iteration records would not be a correction.
    //
    // Stated as an inequality rather than as two literals on purpose: the claim is
    // that the instruments are independent, not that they hold particular values
    // today.
    const report = probeReport();
    expect(report.category.missedWithPhrase).toBeLessThan(report.denial.unsupportedMisses);
    expect(report.denial.unsupportedMisses).toBe(report.denial.misses);
  });

  it('reaches the three misses the phrase predictor does not, and they read absent', () => {
    // The relation between the two instruments, measured rather than assumed.
    //
    // Finding 96's phrase predictor reaches 5 of the 8 `category` misses and says so,
    // printing the other three by name. It is tempting to read those three as "a
    // different phenomenon" -- an earlier draft of finding 98 said they "are not
    // claimed here" -- and that is false: this reading reaches them, and they read
    // `absent`.
    //
    // They read `absent` *because* the text carries no term of the answered category
    // at all, which is also why the phrase predictor cannot reach them: it looks for a
    // sentence naming a category in order to deny it, and there is no term to deny.
    // So the phrase predictor is a **special case** of this reading rather than a rival
    // to it, and the three it misses are the cases where the absence is total.
    //
    // The three are named here rather than described, so the claim cannot survive a
    // dataset edit that changes which misses are unreached.
    const report = probeReport();
    const reached = new Set(
      report.denial.readings
        .filter((r) => r.verdict !== 'absent' && r.verdict !== 'denied-only')
        .map((r) => r.sampleId),
    );

    // The two lists partition the eight misses. Asserted, because a hand-written
    // complement is a second copy of a fact and this repository has already been
    // burned once by a transcription quoted as the answers of a different run.
    const recorded = new Set(report.denial.readings.map((r) => r.sampleId));
    const named = new Set([
      ...REACHED_MISSES.map((m) => m.sampleId),
      ...UNREACHED_CATEGORY_MISSES.map((m) => m.sampleId),
    ]);
    expect(named.size, 'the two lists must not overlap').toBe(
      REACHED_MISSES.length + UNREACHED_CATEGORY_MISSES.length,
    );
    expect(
      [...recorded].filter((id) => !named.has(id)),
      'every recorded miss must be named in one of the two lists',
    ).toEqual([]);
    expect(
      [...named].filter((id) => !recorded.has(id)),
      'and no list may name a sample that is not a recorded miss',
    ).toEqual([]);

    for (const id of UNREACHED_CATEGORY_MISSES.map((m) => m.sampleId)) {
      const reading = report.denial.readings.find((r) => r.sampleId === id);
      expect(reading, `${id} must be among the readings`).toBeDefined();
      expect(
        reading!.verdict,
        `${id}: the answered category is absent, which is why the phrase predictor finds no phrase`,
      ).toBe('absent');
    }

    // And the reason they are unreached, asserted rather than described: the phrase
    // predictor needs a phrase and these texts carry none. If a future dataset edit
    // gave one of them a phrase, this fails and the two blocks stop being nested --
    // which is a change worth failing for.
    expect(
      report.denial.misses - report.category.missedWithPhrase,
      'the misses the phrase predictor cannot reach are exactly the ones whose answered category is absent with no phrase',
    ).toBe(UNREACHED_CATEGORY_MISSES.length);
  });
});
