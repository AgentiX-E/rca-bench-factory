/**
 * Read the published miss detail back into rows.
 *
 * Finding 90 was a parse failure in the gate battery: the runner's output was
 * read with a pattern that only matched on a developer machine, so 24 real
 * failures were published as 24 survivors. The repair was to read the shape CI
 * actually emits. This file is that repair applied to the *other* published
 * channel, one finding later.
 *
 * The miss detail is a single annotation whose rows are joined by a separator
 * that **changed between runs**. Run `9932e766c` joined rows with a space; run
 * `567118aea` joined them with U+001F. The change was finding 70's fix and it was
 * correct -- a space appears inside values (`order-service ConfigMap`,
 * `tax-calculation provider`, `billing service database client pool`), so
 * splitting on whitespace splits records and manufactures false readings of the
 * scorer.
 *
 * The defect this file pins is not the separator change. It is that the only
 * reader of the channel was `scripts/probe-type-misses.mjs`, which did not read
 * it at all: it carried a hard-coded transcription of run `9932e766c` and named
 * that run in its output, so the figure was honest about its provenance and
 * **stale about its subject**. A later reading quoted the transcription as if it
 * were the current run's answers, and eight of fourteen rows disagreed with the
 * annotation. The transcription itself was exact -- against the run it named.
 *
 * So there are two properties, and they are different:
 *
 *   1. The channel is readable. A reader over the annotation must recover exactly
 *      the rows the scorer printed, for **both** separators that exist in the
 *      record. A reader that handles only today's separator cannot read the runs
 *      that already happened, and those runs are the only evidence there is.
 *   2. A figure carries its run. Every row the reader returns must be traceable
 *      to the run it came from, and a transcription must be checked against the
 *      annotation rather than trusted. `probe-type-misses.mjs` now derives its
 *      default input from the fixture through this reader, so the two cannot
 *      disagree without a test failing.
 *
 * The fixtures are the verbatim annotation bytes of both runs, escapes intact.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SCORED_FIELDS } from '../../src/fault/extraction-scoring.js';
import {
  MISS_DETAIL_TITLE,
  isTruncated,
  parseMissDetail,
  readMissDetail,
  type MissDetailRow,
} from '../../src/fault/miss-detail.js';

// `import.meta.url`, not `__dirname`. The tests are ESM, where `__dirname` is not
// defined; every other test in this repository that needs a path above itself
// resolves it the same way. Written as `__dirname` first and it resolved to a
// plausible-but-wrong ancestor under the runner, which is the failure mode worth
// naming: the fixture read still succeeded -- against the wrong directory in one
// case and by a correct relative path in another -- so only the assertions that
// reached outside `test/` caught it.
//
// Four levels up from `test/fault/` is the repository root:
// `fault` -> `test` -> `core` -> `packages` -> root. Counted from the file's own
// directory rather than assumed, because a wrong depth still resolves (to a
// directory that exists) and only a read that needs a sibling package fails.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const FIXTURES = resolve(ROOT, 'fixtures');
const REPO = resolve(HERE, '..', '..', '..', '..');

/** The verbatim annotation body of a run, read from the recorded bytes. */
function recorded(run: string): string {
  const text = readFileSync(resolve(FIXTURES, `miss-detail-${run}.txt`), 'utf8');
  expect(text.length, `fixture for ${run} must not be empty`).toBeGreaterThan(0);
  return text;
}

function byField(rows: MissDetailRow[], field: string): MissDetailRow[] {
  return rows.filter((r) => r.field === field);
}

describe('the miss detail channel is readable, in both separators that exist', () => {
  it('reads the unit-separated run, which is the current format', () => {
    const rows = parseMissDetail(recorded('567118aea'));
    expect(rows.length, 'run 567118aea published 39 miss rows').toBe(39);
    // The counts are not a second opinion: the same run's per-field annotation
    // says type=5/19, category=11/19, component=2/19 over a 19-sample dataset,
    // and 19 - graded is exactly the row count per field. A reader that dropped
    // or duplicated rows would break this identity, which is why it is asserted
    // rather than the length alone.
    expect(byField(rows, 'type')).toHaveLength(19 - 5);
    expect(byField(rows, 'category')).toHaveLength(19 - 11);
    expect(byField(rows, 'component')).toHaveLength(19 - 2);
  });

  it('reads the space-separated run, which is the format finding 70 repaired', () => {
    const rows = parseMissDetail(recorded('9932e766c'));
    // 9932e766c published 38 rows: type=4/19, category=11/19, component=4/19.
    expect(rows.length, 'run 9932e766c published 38 miss rows').toBe(38);
    expect(byField(rows, 'type')).toHaveLength(19 - 4);
    expect(byField(rows, 'category')).toHaveLength(19 - 11);
    expect(byField(rows, 'component')).toHaveLength(19 - 4);
  });

  it('recovers values that contain spaces, which is the reason the separator changed', () => {
    // The failure mode is exact and worth pinning with its own assertion: splitting
    // on whitespace turns `log-collector -> log-collector-data-volume` and
    // `cart-service -> cart-to-inventory network path` into extra tokens. If the
    // space-separated reader naively split on `\s`, these values would be truncated
    // and the row count would come out high rather than low.
    const rows = parseMissDetail(recorded('9932e766c'));
    const multiline = rows.filter((r) => /\s/.test(r.actual ?? '') || /\s/.test(r.expected));
    expect(
      multiline.length,
      'the space-separated run carries values containing spaces, so it is a real test of the reader',
    ).toBeGreaterThan(0);
    // Every row must still name a scored field; a truncation that left a fragment
    // as a "field" would show up here.
    for (const row of rows) {
      expect(SCORED_FIELDS).toContain(row.field);
    }
    // And the specific value that was observed to be mangled is intact, quoted
    // from the annotation rather than paraphrased.
    expect(rows.map((r) => r.actual)).toContain('cart-to-inventory network path');
    expect(rows.map((r) => r.actual)).toContain('log-collector-data-volume');
  });

  it('round-trips a row that the workflow would publish today', () => {
    // The property is reversibility, so it is tested in the direction the workflow
    // writes: build a row with the scorer's own layout, join it the way the
    // workflow joins, and require the reader to return what went in.
    const SEP = '\u001f';
    const rows = [
      { sampleId: 'resource-cpu-saturation-checkout', field: 'type', expected: 'cpu-saturation', actual: 'cpu-throttling' },
      { sampleId: 'network-delay-cart-to-inventory', field: 'component', expected: 'cart-service', actual: 'cart-to-inventory network path' },
      // `null`, not `(omitted)`: the scorer prints the literal because the report
      // is prose, and the reader normalises it back to the absence it denotes.
      { sampleId: 'network-loss-payment-gateway', field: 'component', expected: 'payment-gateway', actual: null },
    ];
    const published = rows
      .map((r) => `${r.sampleId}.${r.field}:${r.expected}>${r.actual ?? '(omitted)'}`)
      .join(SEP);
    expect(parseMissDetail(published)).toEqual(rows);
  });

  it('reads a single-row body, which would carry no separator at all', () => {
    // The workflow publishes whatever the scorer printed. A run in which exactly
    // one field missed produces a body with no separator in it, and rejecting
    // that for lacking one would fail on a *cleaner* run than the ones tested
    // above -- the failure mode that reads as "no data" instead of "worse".
    const rows = parseMissDetail('x.component:payment-gateway>(omitted)');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actual).toBeNull();
  });

  it('rejects a body that carries no rows instead of returning an empty list', () => {
    // An empty result and an unreadable input are different findings, and the
    // whole point of the channel is that its absence is noticed. A silent empty
    // list would let a broken extraction read as a run with no misses.
    for (const body of ['', '   ', 'not a detail row at all']) {
      expect(() => parseMissDetail(body), `body ${JSON.stringify(body)} must not read as zero misses`).toThrow();
    }
  });

  it('reads the old space-joined form without trusting it, and the record says why', () => {
    // The old form is recovered by an anchor rule -- a row starts with
    // `<slug>.<field>:` and a token that does not is a continuation -- and that
    // rule is decidable but not sound. The boundary is worth an assertion because
    // it is the reason finding 70 changed the separator, and a reader that
    // presented the recovery as exact would hide it.
    //
    // Constructed, not recorded. The boundary needs three things at once: the fake
    // anchor must be a *separate whitespace token*, it must be shaped like a key,
    // and it must itself be a complete row. A fragment containing `q.component:`
    // with no space before it stays inside its row and parses correctly, which is
    // why the recorded run survives the rule -- its answers contain spaces, but no
    // answer contains a space followed by a whole key-shaped row.
    const ambiguous = ['a.type:x>y', 'z.component:looks-like-a-key>fake'].join(' ');
    const rows = parseMissDetail(ambiguous);
    // Two rows where the record held one answer: the reader cannot tell the
    // model's answer `y z.component:looks-like-a-key>fake` from a second row,
    // because the separator it was written with carries no such distinction. The
    // count and both values are asserted exactly, because "the recovery is
    // decidable but not sound" is the claim and a looser assertion -- `> 1`, or a
    // length only -- would not establish it.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ sampleId: 'a', field: 'type', expected: 'x', actual: 'y' });
    expect(rows[1]).toEqual({
      sampleId: 'z',
      field: 'component',
      expected: 'looks-like-a-key',
      actual: 'fake',
    });
    // And the recorded run has none of these, so the limit does not bite on the
    // evidence actually in hand -- which is the other half of the claim and would
    // be dishonest to leave unstated.
    for (const row of parseMissDetail(recorded('9932e766c'))) {
      expect(row.actual ?? '').not.toMatch(/^[a-z0-9-]+\.(?:type|category|component|description):/);
    }
  });

  it('reports a truncated body as incomplete, so a capped list is not read as the whole list', () => {
    // The workflow caps the published rows at 60 and appends
    // `... [N more row(s) omitted; all M are in the step summary]`. A reader that
    // dropped the suffix and returned the rows would present a partial list as a
    // complete one -- and a *short* list of misses reads as a better run, which is
    // the inversion finding 90 was about. So both halves are asserted: the rows
    // survive (the suffix must not be read as the last row's answer) and the
    // reading is labelled incomplete.
    //
    // The suffix is taken from the workflow text rather than paraphrased, so the
    // reader and the producer cannot drift apart without this failing.
    const workflow = readFileSync(
      resolve(REPO, '.github', 'workflows', 'fault-extraction-accuracy.yml'),
      'utf8',
    );
    expect(workflow, 'the workflow must still append a truncation notice').toContain(
      'more row(s) omitted; all',
    );

    const rows = ['a.type:x>y', 'b.component:p>q'].join('\u001f');
    const truncated = `${rows}... [3 more row(s) omitted; all 5 are in the step summary]`;

    // `isTruncated` names the fact on its own, and it is not fooled by the suffix
    // being absent -- the false case is asserted too, because a predicate that
    // always returns true would pass a one-sided test.
    expect(isTruncated(truncated)).toBe(true);
    expect(isTruncated(rows)).toBe(false);

    const reading = readMissDetail(truncated);
    expect(reading.complete, 'a body carrying the suffix is not the whole list').toBe(false);
    expect(reading.rows).toEqual([
      { sampleId: 'a', field: 'type', expected: 'x', actual: 'y' },
      { sampleId: 'b', field: 'component', expected: 'p', actual: 'q' },
    ]);

    // And the untruncated case, so `complete` is not a constant.
    const whole = readMissDetail(rows);
    expect(whole.complete).toBe(true);
    expect(whole.rows).toHaveLength(2);
  });

  it('reads each recorded run as complete, because neither was capped', () => {
    // The cap is 60 rows and the current runs publish 38 and 39, so truncation is
    // not routine for this dataset. Asserted rather than assumed: if a future run
    // is capped, every reading taken from it is partial and the figures computed
    // from it are lower bounds. That is worth a failing test, not a footnote.
    for (const run of ['567118aea', '9932e766c'] as const) {
      const reading = readMissDetail(recorded(run));
      expect(reading.complete, `run ${run} must not be a capped reading`).toBe(true);
      expect(reading.rows.length, `run ${run}`).toBeGreaterThan(0);
    }
  });

  it('names the annotation title it reads, so the reader and the workflow cannot drift', () => {    expect(MISS_DETAIL_TITLE).toBe('M1 fault extraction miss detail');
    // The workflow emits this literal. Asserted against the workflow text rather
    // than trusted, because the reader's title and the workflow's title are the
    // two halves of the same contract and only one of them is compiled.
    const workflow = readFileSync(
      resolve(REPO, '.github', 'workflows', 'fault-extraction-accuracy.yml'),
      'utf8',
    );
    expect(workflow).toContain(`title=${MISS_DETAIL_TITLE}::`);
  });
});

describe('the reading is taken from the run, not from a transcription of it', () => {
  it('classifies the current run, whose answers differ from the earlier transcription', () => {
    // This is the defect stated as a test. `probe-type-misses.mjs` transcribed
    // run 9932e766c; a later reading quoted eight of its rows as the answers of
    // run 567118aea. The reader over the live bytes is the fix, and these four
    // rows are the ones that differed -- quoted from the annotation, not written
    // from memory.
    const rows = byField(parseMissDetail(recorded('567118aea')), 'type');
    const answers = new Map(rows.map((r) => [r.sampleId, r.actual]));
    expect(answers.get('network-loss-payment-gateway')).toBe('egress-interface-packet-loss');
    expect(answers.get('runtime-container-crash-loop-media')).toBe('ffmpeg-native-segmentation-fault');
    expect(answers.get('code-slow-regex-api-gateway')).toBe('catastrophic-regex-backtracking');
    expect(answers.get('dependency-upstream-5xx-pricing')).toBe('dependency-degradation');

    // And the two runs really do disagree, which is what made the transcription
    // stale rather than merely differently worded: the same four samples read
    // differently in 9932e766c. A reader that returned the same values for both
    // fixtures would pass the assertions above only by coincidence.
    //
    // Scoped to the four asserted samples, not to every `type` row. Of the 13
    // samples that miss `type` in both runs, 8 answers changed and 5 did not
    // (`cpu-throttling`, `disk-space-exhaustion`, `kubelet-eviction`,
    // `stale-config-key`, `connection-pool-deadlock` are stable); asserting over
    // the whole map would fail on the stable ones while claiming to test
    // discrimination.
    const earlier = new Map(
      byField(parseMissDetail(recorded('9932e766c')), 'type').map((r) => [r.sampleId, r.actual]),
    );
    const discriminating = [
      'network-loss-payment-gateway',
      'runtime-container-crash-loop-media',
      'code-slow-regex-api-gateway',
      'dependency-upstream-5xx-pricing',
    ];
    for (const id of discriminating) {
      expect(answers.get(id), `${id} must be present in the later run`).toBeDefined();
      expect(
        earlier.get(id),
        `${id} must read differently in the two runs, or the fixtures are not discriminating`,
      ).not.toBe(answers.get(id));
    }
  });

  it('reads a sample that missed one run but not the other, in both directions', () => {
    // The two runs do not merely word answers differently: the set of missing
    // fields moved. `resource-memory-leak-recommendation.type` missed in
    // 567118aea and not in 9932e766c; `code-null-dereference-reporting.type` is
    // the reverse. A reader that assumed a fixed row count per sample would fail
    // here, so the fixture pair has to carry both directions.
    const now = parseMissDetail(recorded('567118aea'));
    const before = parseMissDetail(recorded('9932e766c'));
    const key = (r: MissDetailRow): string => `${r.sampleId}.${r.field}`;

    expect(now.map(key)).toContain('resource-memory-leak-recommendation.type');
    expect(before.map(key)).not.toContain('resource-memory-leak-recommendation.type');

    expect(now.map(key)).not.toContain('code-unhandled-exception-export.type');
    expect(before.map(key)).toContain('code-unhandled-exception-export.type');
  });

  it('keeps every row attributable to exactly one sample and one field', () => {
    // A duplicate key would mean the reader produced a row twice, which is how a
    // naive whitespace split manifests: `order-service ConfigMap` becomes a row
    // `order-service -> order-service` that looks like a scorer defect. The
    // scorer was right both times; only the channel was ambiguous.
    for (const run of ['567118aea', '9932e766c']) {
      const rows = parseMissDetail(recorded(run));
      const keys = rows.map((r) => `${r.sampleId}.${r.field}`);
      expect(new Set(keys).size, `run ${run} must not repeat a sample.field key`).toBe(keys.length);
    }
  });
});
