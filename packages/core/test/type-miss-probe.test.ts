import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The `type` miss classifier.
 *
 * Finding 69 called `type` a "model-accuracy figure" and finding 78 repeated
 * that `type` has no structural ceiling behind it. Both are arguments; neither
 * read the answers. Finding 69 classified `category`'s eight misses one by one
 * (`resource -> code`, `runtime -> resource`, ...) and concluded that a legal
 * vocabulary member was chosen, so the failure was choosing rather than
 * formatting. No equivalent reading was taken for `type`, and that asymmetry is
 * the gap this file closes.
 *
 * The question the classifier answers is narrow and decidable:
 *
 *   when the model's `type` differs from the expected slug, is it a *form
 *   variant* of that slug -- which `normalizeFaultType` should already have
 *   folded -- or a *different mechanism* named at the same level?
 *
 * The distinction matters because the two have different fixes. A form variant
 * is a normalizer defect: the scorer is rejecting an answer it should accept, and
 * that is a BUG in this repository. A different mechanism is a capability limit:
 * the model read the incident and named something else, which no normalizer and
 * no synonym table reaches.
 *
 * The recorded misses live in the CI annotation rather than in the repository, so
 * they are transcribed into `RECORDED_TYPE_MISSES` with their run named. That is
 * a deliberate trade: the alternative is a test that cannot run without a live
 * LLM key, and a figure that cannot be re-derived is worth less than a figure
 * whose provenance is stated. The transcription is checked against the annotation
 * format by its own tests, and one test asserts the shape of the transcription
 * itself so a careless edit fails rather than silently reclassifying the finding.
 *
 * The classifier is duplicated here rather than imported, because the script
 * that ships it (`scripts/probe-type-misses.mjs`) is the thing under test and a
 * test that imports its subject's helper agrees with it by construction. The
 * duplication is checked: a test runs the script as a subprocess and requires its
 * output to match this file's classification.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROBE = resolve(REPO_ROOT, 'scripts/probe-type-misses.mjs');

/**
 * The fifteen `type` misses from run `9932e766c` (annotation captured in
 * `ann.json`), transcribed verbatim in `expected -> actual` order.
 *
 * The same run's `component` misses are recorded in `fault-prompt-grammar.test.ts`
 * as `WRONG_ANSWERS`; this is the `type` half that was missing.
 */
export const RECORDED_TYPE_MISSES: ReadonlyArray<readonly [string, string, string]> = [
  ['resource-cpu-saturation-checkout', 'cpu-saturation', 'cpu-throttling'],
  ['resource-disk-full-log-collector', 'disk-full', 'disk-space-exhaustion'],
  ['network-loss-payment-gateway', 'network-loss', 'egress-packet-drop'],
  ['runtime-pod-kill-user-profile', 'pod-kill', 'kubelet-eviction'],
  ['runtime-container-crash-loop-media', 'container-crash', 'native-ffmpeg-segfault'],
  ['middleware-redis-latency-cache', 'redis-latency', 'redis-command-thread-saturation'],
  ['middleware-kafka-consumer-lag', 'kafka-consumer-lag', 'synchronous-outbound-call-per-record'],
  [
    'middleware-database-connection-pool',
    'database-connection-pool-exhaustion',
    'connection-pool-deadlock',
  ],
  ['code-null-dereference-reporting', 'null-dereference', 'null-pointer-dereference'],
  ['code-unhandled-exception-export', 'unhandled-exception', 'csv-writer-typeerror'],
  ['code-slow-regex-api-gateway', 'regex-catastrophic-backtracking', 'regex-backtracking'],
  ['config-datasource-url-orders', 'config-mismatch', 'stale-config-key'],
  ['dependency-upstream-5xx-pricing', 'upstream-5xx', 'upstream-dependency-outage'],
  [
    'dependency-version-incompatibility-shipping',
    'library-version-incompatibility',
    'breaking-dependency-api-change',
  ],
  ['middleware-mysql-replica-lag-analytics', 'replica-lag', 'replica-apply-thread-saturation'],
];

/** The normalizer the scorer applies, reproduced so the classifier can use it. */
function normalizeFaultType(type: string): string {
  return type
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

type MissClass = 'formVariant' | 'sharesToken' | 'differentMechanism';

interface Classified {
  sampleId: string;
  expected: string;
  actual: string;
  kind: MissClass;
}

/**
 * Classify one miss.
 *
 * The partition is ordered and total by construction: every miss lands in exactly
 * one class, and `formVariant` is tested by normalized equality -- the same
 * function `sameValue` uses -- so an answer the scorer *should* have accepted can
 * never be reported as a different mechanism.
 */
function classify(expected: string, actual: string): MissClass {
  if (normalizeFaultType(expected) === normalizeFaultType(actual)) {
    return 'formVariant';
  }
  const expectedTokens = normalizeFaultType(expected).split('-').filter((t) => t.length > 0);
  const actualTokens = new Set(normalizeFaultType(actual).split('-').filter((t) => t.length > 0));
  if (expectedTokens.some((t) => actualTokens.has(t))) {
    return 'sharesToken';
  }
  return 'differentMechanism';
}

function classifyAll(
  misses: ReadonlyArray<readonly [string, string, string]>,
): Classified[] {
  return misses.map(([sampleId, expected, actual]) => ({
    sampleId,
    expected,
    actual,
    kind: classify(expected, actual),
  }));
}

describe('the type misses are classified by a stated rule, not by taste', () => {
  it('every recorded miss falls into exactly one class', () => {
    // The partition must be total and disjoint. A class that can be empty is
    // fine; a miss that lands in none, or an implementation that double-counts,
    // is not -- finding 78's probe held two contradictory figures because it
    // computed its halves with two independent filters.
    const kinds: MissClass[] = ['formVariant', 'sharesToken', 'differentMechanism'];
    const classified = classifyAll(RECORDED_TYPE_MISSES);
    expect(classified).toHaveLength(RECORDED_TYPE_MISSES.length);
    for (const c of classified) {
      expect(kinds, `${c.sampleId}: '${c.kind}' is not a class`).toContain(c.kind);
    }
    const counted = kinds.map((k) => classified.filter((c) => c.kind === k).length);
    expect(counted.reduce((a, b) => a + b, 0), 'the classes must cover every miss').toBe(
      RECORDED_TYPE_MISSES.length,
    );
  });

  it('no recorded miss is a form variant, so the normalizer is not the defect', () => {
    // The load-bearing result. `normalizeFaultType` folds case, whitespace and
    // separators and strips non-alphanumerics; it performs no synonym resolution.
    // If any recorded answer were normalized-equal to its expected slug, the
    // scorer would be wrong rather than the model -- a BUG to fix this round. The
    // reading says none is, so the gap is not a formatting failure.
    const formVariants = classifyAll(RECORDED_TYPE_MISSES).filter((c) => c.kind === 'formVariant');
    expect(
      formVariants.map((c) => `${c.expected} -> ${c.actual}`),
      'a form variant here would be a scoring defect, not a model failure',
    ).toEqual([]);
  });

  it('the classifier recognises a form variant when one is constructed', () => {
    // The discriminating half. Without this, the assertion above passes for the
    // wrong reason: a classifier that returned `differentMechanism` for
    // everything would satisfy "no form variants" and would be useless. This is
    // the same trap finding 76 records -- an assertion the data satisfies
    // incidentally is corroborated, not tested.
    expect(classify('cpu-saturation', 'CPU_Saturation')).toBe('formVariant');
    expect(classify('cpu-saturation', '  cpu saturation ')).toBe('formVariant');
    expect(classify('cpu-saturation', 'cpu  saturation')).toBe('formVariant');
    // The normalizer's exact behaviour on punctuation, which is *strip* and not
    // *replace*: `null.dereference` becomes `nulldereference`, which does not
    // equal `null-dereference`. An earlier draft of this test asserted the
    // opposite and was wrong about the implementation. Stated as a contrast so
    // the distinction is pinned rather than paraphrased, because it is the reason
    // the recorded misses are not form variants.
    //
    // A trailing hyphen is likewise *kept* (`[^a-z0-9-]` retains `-`), so
    // `cpu-saturation-` is not equal either. Both were asserted wrongly once and
    // both are now stated as the negative half of a contrast.
    expect(classify('null-dereference', 'null dereference')).toBe('formVariant');
    expect(classify('null-dereference', 'null.dereference')).not.toBe('formVariant');
    expect(classify('cpu-saturation', 'cpu-saturation-')).not.toBe('formVariant');
    // And the negative case, so the rule is not merely "contains the same words".
    expect(classify('cpu-saturation', 'cpu-throttling')).toBe('sharesToken');
    expect(classify('network-loss', 'egress-packet-drop')).toBe('differentMechanism');
  });

  it('most misses share at least one token with the expected slug', () => {
    // The measured distribution, pinned as a contrast rather than as a bare
    // count: the model is not answering a different field or inventing unrelated
    // vocabulary, it is naming the same subject with more words. `cpu-saturation`
    // -> `cpu-throttling` shares `cpu`; `redis-latency` ->
    // `redis-command-thread-saturation` shares `redis`. The classifier earns its
    // third class because some misses share nothing at all.
    const classified = classifyAll(RECORDED_TYPE_MISSES);
    const sharing = classified.filter((c) => c.kind === 'sharesToken').length;
    const different = classified.filter((c) => c.kind === 'differentMechanism').length;
    expect(sharing, 'most misses share a token, which is why they are near misses').toBeGreaterThan(0);
    expect(different, 'and some share none, which is why the third class is needed').toBeGreaterThan(0);
    expect(sharing + different).toBe(classified.length);
  });

  it('the answers are over-specified far more often than under-specified', () => {
    // The direction of the drift, measured. The model's answers are longer than
    // the expected slug in the large majority of misses: it drifts from the
    // canonical mechanism name toward a *description* of the incident
    // (`replica-lag` -> `replica-apply-thread-saturation`). That is a specific,
    // testable claim about the failure mode and it is what makes the finding
    // actionable -- the prompt asks for a name and the model supplies a summary.
    const classified = classifyAll(RECORDED_TYPE_MISSES);
    const longer = classified.filter(
      (c) => c.actual.split('-').length > c.expected.split('-').length,
    ).length;
    const shorter = classified.filter(
      (c) => c.actual.split('-').length < c.expected.split('-').length,
    ).length;
    expect(longer, 'the model over-specifies, it does not under-specify').toBeGreaterThan(
      shorter * 2,
    );
    expect(longer).toBeGreaterThan(classified.length / 2);
  });

  it('the recorded misses are well formed, so a careless transcription fails here', () => {
    // The transcription is the one thing in this file that is not computed. A row
    // with a typo in the expectation would classify as a different mechanism and
    // silently join the capability argument, so the shape is asserted: every id
    // is a slug, every expected value is a slug, and the ids are distinct.
    const ids = RECORDED_TYPE_MISSES.map((r) => r[0]);
    expect(new Set(ids).size, 'ids must be distinct').toBe(ids.length);
    for (const [id, expected, actual] of RECORDED_TYPE_MISSES) {
      expect(id, `'${id}' is not a slug`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
      expect(expected, `'${expected}' is not a slug`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
      expect(actual.length, `'${actual}' is empty`).toBeGreaterThan(0);
      expect(
        normalizeFaultType(expected),
        `${id}: expected and actual must differ, or the row records no miss`,
      ).not.toBe(normalizeFaultType(actual));
    }
  });

  it('the shipped probe reproduces this classification, run as a subprocess', () => {
    // The classifier is written twice on purpose -- once here as the thing under
    // test, once in `scripts/probe-type-misses.mjs` as the thing that ships -- and
    // duplication that is not checked is just two opinions. Running the script as
    // a *subprocess* rather than importing it is what makes this a check: an
    // import would let the two share a module instance and agree by construction,
    // and the figure that matters is the figure the command prints.
    //
    // This is also the pattern finding 80's probe tests established, for the same
    // reason: a test that imports its subject's helper proves only that the file
    // agrees with itself.
    const raw = execFileSync(process.execPath, [PROBE, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const report = JSON.parse(raw);

    expect(report.source, 'the probe must state where its rows came from').toContain('9932e766c');
    expect(report.total).toBe(RECORDED_TYPE_MISSES.length);

    // The counts, cross-checked against the local classification rather than
    // against literals -- a literal pair of numbers would pass if both copies were
    // wrong in the same direction, while this fails if either drifts.
    const local = classifyAll(RECORDED_TYPE_MISSES);
    const localCounts = {
      'form-variant': local.filter((c) => c.kind === 'formVariant').length,
      'shares-token': local.filter((c) => c.kind === 'sharesToken').length,
      'different-mechanism': local.filter((c) => c.kind === 'differentMechanism').length,
    };
    expect(report.counts['form-variant']).toBe(localCounts['form-variant']);
    expect(report.counts['shares-token']).toBe(localCounts['shares-token']);
    expect(report.counts['different-mechanism']).toBe(localCounts['different-mechanism']);

    // And the over-specification figure, which is the finding's actionable half.
    const localLonger = local.filter(
      (c) => c.actual.split('-').length > c.expected.split('-').length,
    ).length;
    expect(report.overSpecified).toBe(localLonger);
    expect(report.overSpecified, 'the majority of answers are longer than the slug').toBeGreaterThan(
      RECORDED_TYPE_MISSES.length / 2,
    );
  });

  it('the probe exits non-zero when a form variant exists, because that is a bug', () => {
    // The exit code is part of the contract: a form variant means the *scorer*
    // rejected an answer it should have accepted, so the probe must be usable as
    // a gate rather than only as a report. Driven through the documented input
    // path -- a scored report on stdin is not supported, so a temporary file is
    // written and removed -- rather than by mutating the transcription.
    const report = {
      misses: [
        { sampleId: 'a-form-variant', detail: [{ field: 'type', expected: 'cpu-saturation', actual: 'CPU_Saturation' }] },
        { sampleId: 'a-clean-miss', detail: [{ field: 'type', expected: 'network-loss', actual: 'egress-packet-drop' }] },
      ],
    };
    const tmp = resolve(REPO_ROOT, 'node_modules/.cache/type-miss-probe-input.json');
    mkdirSync(dirname(tmp), { recursive: true });
    writeFileSync(tmp, JSON.stringify(report));
    try {
      expect(() =>
        execFileSync(process.execPath, [PROBE, '--predictions', tmp], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      ).toThrowError();
      // And the clean report exits zero, so the non-zero above is about the form
      // variant rather than about the input path.
      const clean = { misses: [report.misses[1]] };
      writeFileSync(tmp, JSON.stringify(clean));
      expect(() =>
        execFileSync(process.execPath, [PROBE, '--predictions', tmp], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      ).not.toThrow();
    } finally {
      rmSync(tmp, { force: true });
    }
  });
});
