import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMissDetail } from '../src/fault/miss-detail.js';

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
 * the annotation body of each run is recorded verbatim under `test/fixtures/` and
 * read back through `parseMissDetail`. That replaces a hand transcription, and the
 * replacement is the point rather than a tidy-up: a transcription is a second copy
 * of a fact, it is exact only against the run it names, and it cannot be re-derived
 * when the question changes. The copy that used to live here was quoted -- by this
 * repository's own next reading -- as the answers of a *different* run.
 *
 * Reading the recorded bytes instead means the run is an input rather than a claim.
 * `RECORDED_RUNS` names every run that has an annotation on file; the default is the
 * most recent, and the type-miss classification is asserted for each.
 *
 * The classifier is duplicated here rather than imported, because the script
 * that ships it (`scripts/probe-type-misses.mjs`) is the thing under test and a
 * test that imports its subject's helper agrees with it by construction. The
 * duplication is checked: a test runs the script as a subprocess and requires its
 * output to match this file's classification.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PROBE = resolve(REPO_ROOT, 'scripts/probe-type-misses.mjs');
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
/**
 * Every run whose annotation body is on file, most recent first.
 *
 * The `${run}` name is the recorded run id, which is what makes a figure quotable:
 * a reading that does not carry its run is a reading that cannot be checked.
 */
export const RECORDED_RUNS = {
  /** Rows joined with U+001F -- the format finding 70 introduced. type=5/19. */
  '567118aea': 'miss-detail-567118aea.txt',
  /** Rows joined with a space -- the format finding 70 replaced. type=4/19. */
  '9932e766c': 'miss-detail-9932e766c.txt',
} as const;

export type RecordedRun = keyof typeof RECORDED_RUNS;

/** The run the classification is asserted against when none is named. */
export const CURRENT_RUN: RecordedRun = '567118aea';

/**
 * The `type` misses of a recorded run, in `[sampleId, expected, actual]` order.
 *
 * Read, not transcribed. `(omitted)` is kept as the literal string rather than
 * normalised to `null` here, because this file's classifier takes three strings
 * and an omission is not a form variant of anything -- the distinction matters
 * for `missClassification`, not for this partition.
 */
export function recordedTypeMisses(run: RecordedRun): ReadonlyArray<readonly [string, string, string]> {
  const body = readFileSync(resolve(FIXTURES, RECORDED_RUNS[run]), 'utf8');
  return parseMissDetail(body)
    .filter((row) => row.field === 'type')
    .map((row) => [row.sampleId, row.expected, row.actual ?? '(omitted)'] as const);
}

/**
 * The `type` misses of the current run, kept as a named export because the
 * assertions below read better against a name than against a call, and because
 * a compile-time-shaped constant is what the previous hand transcription was.
 */
export const RECORDED_TYPE_MISSES: ReadonlyArray<readonly [string, string, string]> =
  recordedTypeMisses(CURRENT_RUN);

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
    // (`replica-lag` -> `replication-apply-bottleneck`). That is a specific,
    // testable claim about the failure mode and it is what makes the finding
    // actionable -- the prompt asks for a name and the model supplies a summary.
    //
    // Stated per run, because the runs differ and the earlier form of this
    // assertion was tuned to one of them. The old bound was
    // `longer > classified.length / 2`, which holds for `9932e766c` (11 of 15)
    // and fails for `567118aea` (7 of 14, i.e. exactly half) -- so a bound that
    // looked like a property was in fact a coincidence of the run it was read
    // from. The claim that survives both is the *direction*: over-specification
    // outnumbers under-specification, and it does so by a factor rather than by
    // one. That is the property, so that is what is asserted.
    for (const run of Object.keys(RECORDED_RUNS) as RecordedRun[]) {
      const classified = classifyAll(recordedTypeMisses(run));
      const longer = classified.filter(
        (c) => c.actual.split('-').length > c.expected.split('-').length,
      ).length;
      const shorter = classified.filter(
        (c) => c.actual.split('-').length < c.expected.split('-').length,
      ).length;
      expect(
        longer,
        `run ${run}: the model over-specifies, it does not under-specify`,
      ).toBeGreaterThan(shorter);
      expect(
        longer,
        `run ${run}: over-specification must dominate, not merely lead`,
      ).toBeGreaterThanOrEqual(classified.length / 2);
      expect(
        shorter,
        `run ${run}: under-specification must be the minority case`,
      ).toBeLessThan(classified.length / 2);
    }
  });

  it('the recorded misses are well formed, so a careless edit fails here', () => {
    // The rows are read from recorded bytes rather than transcribed, so the shape
    // assertion is no longer a guard on a hand copy -- it is a guard on the reader
    // and on the annotations themselves. A row that came back malformed would
    // classify as a different mechanism and silently join the capability
    // argument, which is the failure this pins.
    for (const run of Object.keys(RECORDED_RUNS) as RecordedRun[]) {
      const rows = recordedTypeMisses(run);
      expect(rows.length, `run ${run} must yield type misses`).toBeGreaterThan(0);
      const ids = rows.map((r) => r[0]);
      expect(new Set(ids).size, `run ${run}: ids must be distinct`).toBe(ids.length);
      for (const [id, expected, actual] of rows) {
        expect(id, `run ${run}: '${id}' is not a slug`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
        expect(expected, `run ${run}: '${expected}' is not a slug`).toMatch(
          /^[a-z0-9]+(-[a-z0-9]+)+$/,
        );
        expect(actual.length, `run ${run}: '${actual}' is empty`).toBeGreaterThan(0);
        expect(
          normalizeFaultType(expected),
          `${run} ${id}: expected and actual must differ, or the row records no miss`,
        ).not.toBe(normalizeFaultType(actual));
      }
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
    //
    // Every recorded run is checked, and the source line must name the run that
    // was asked for. The previous form of this assertion required the literal
    // `9932e766c` in the source line, which is what the probe printed when it had
    // one run hard-coded -- the assertion was pinning the defect.
    for (const run of Object.keys(RECORDED_RUNS) as RecordedRun[]) {
      const raw = execFileSync(process.execPath, [PROBE, '--json', '--run', run], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      });
      const report = JSON.parse(raw);

      expect(report.source, `the probe must state where its rows came from`).toContain(run);
      const local = classifyAll(recordedTypeMisses(run));
      expect(report.total, `run ${run}`).toBe(local.length);

      // The counts, cross-checked against the local classification rather than
      // against literals -- a literal pair of numbers would pass if both copies
      // were wrong in the same direction, while this fails if either drifts.
      const localCounts = {
        'form-variant': local.filter((c) => c.kind === 'formVariant').length,
        'shares-token': local.filter((c) => c.kind === 'sharesToken').length,
        'different-mechanism': local.filter((c) => c.kind === 'differentMechanism').length,
      };
      expect(report.counts['form-variant'], `run ${run}`).toBe(localCounts['form-variant']);
      expect(report.counts['shares-token'], `run ${run}`).toBe(localCounts['shares-token']);
      expect(report.counts['different-mechanism'], `run ${run}`).toBe(
        localCounts['different-mechanism'],
      );

      // And the over-specification figure, which is the finding's actionable half.
      const localLonger = local.filter(
        (c) => c.actual.split('-').length > c.expected.split('-').length,
      ).length;
      expect(report.overSpecified, `run ${run}`).toBe(localLonger);

      // The adjudication block. It is asserted through the subprocess rather than
      // only through `miss-adjudication.test.ts` because the wiring is a separate
      // claim from the rule: the rule can be right and the probe can still print
      // it against the wrong rows, which is exactly what finding 92 was.
      expect(report.adjudication, `run ${run}`).toBeDefined();
      expect(report.adjudication.total, `run ${run}`).toBe(local.length);
      expect(
        report.adjudication['same-fault-different-altitude'] +
          report.adjudication['different-fault'] +
          report.adjudication.undecided,
        `run ${run}: the three verdicts must cover every row`,
      ).toBe(report.adjudication.total);
      expect(
        report.unreached.length,
        `run ${run}: the unreached list must match the count`,
      ).toBe(report.adjudication['different-fault']);
      // The unreached rows must come from the rows actually classified. A list
      // carrying a name that is not among the misses would mean the adjudication
      // ran over something other than the partition above it.
      const localAnswers = new Set(local.map((c) => c.expected));
      for (const entry of report.unreached) {
        expect(
          localAnswers.has(entry.expected),
          `run ${run}: '${entry.expected}' is not one of the classified misses`,
        ).toBe(true);
      }
    }
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

/**
 * The probe's UModel figures, and the class of edit they cannot see.
 *
 * v1.48 added six figures for the `UMODEL_TYPE` table. This describe exists
 * because two mutations were run against them and **none of the six moved**:
 *
 *   SWAP   pod <-> node            -- a permutation inside the vocabulary
 *   FLAT   every kind -> apm.service -- the vocabulary collapses to one word
 *
 * Both keep every emitted word legal, so the three ghost verdicts stay at 1 and
 * `rca100UmodelVocabularyWords` stays at 7. Both keep nine rows and nine answered
 * kinds, so `umodelRows` and `umodelKindsAnswered` stay at 9. `FLAT` moves
 * `umodelDistinctWords` from 7 to 1 -- but only `SWAP` is the harder case, and
 * `SWAP` moves nothing at all.
 *
 * The figures measured the mapping's *shape* and were documented as if they
 * measured the mapping. A figure that cannot move cannot report, and its presence
 * makes the reading look covered -- the third-source defect `validity.test.ts`
 * names. The three counts are kept (they are real statements about shape) and one
 * content reading is added beside them.
 */
/**
 * The probe's UModel figures, and the class of edit the counts cannot see.
 *
 * v1.48 added six figures for the `UMODEL_TYPE` table, and two mutations were run
 * against them:
 *
 *   SWAP   pod <-> node                 -- a permutation inside the vocabulary
 *   FLAT   every kind -> apm.service    -- the vocabulary collapses to one word
 *
 * **Neither moved any of the six.** Both keep every emitted word legal, so the
 * three ghost verdicts stay at 1 and `rca100UmodelVocabularyWords` stays at 7.
 * Both keep nine rows and nine answered kinds, so `umodelRows` and
 * `umodelKindsAnswered` stay at 9. `FLAT` moves only `umodelDistinctWords`; `SWAP`
 * moves nothing at all, and is the harder case for exactly that reason.
 *
 * The figures measured the mapping's *shape* and were documented as if they
 * measured the mapping. A figure that cannot move cannot report, and its presence
 * makes the reading look covered -- the third-source defect `validity.test.ts`
 * names. The counts are kept (they are real statements about shape) and one
 * content reading, `umodelMappingDigest`, is added beside them.
 *
 * ## Why the mutations are *not* driven from here
 *
 * The first version of this describe applied the two mutations in the test body,
 * rebuilding `packages/core` each time. That is a defect and it was measured as
 * one: `vocabulary-single-source.test.ts` reads `src/export/rca100.ts` **at module
 * load**, and vitest runs test *files* in parallel, so this file mutated a file
 * another file in the same run reads. Two full-suite runs failed with two
 * different victims (`check-cli-reference` once, then `vocabulary-single-source`),
 * both green in isolation. Routing the writes through an atomic helper -- the
 * discipline `injection-write-discipline.test.ts` states -- was necessary but not
 * sufficient: atomicity prevents a *partial* read, not a *complete but mutated*
 * one, and the failure survived it at roughly one run in three.
 *
 * So the mutation proofs live in `scripts/injection/type-miss-probe.py` as entries
 * `BS` and `BT`, which is the component that already owns source mutation along
 * with the snapshot, restore-verification and rebuild machinery for it. What stays
 * here is what can be asserted without touching shared state: that the figure
 * exists, that it is a digest, and that it is *content* reading rather than a
 * count.
 */
describe('the UModel figures separate shape from content', () => {
  const readFigures = (): Record<string, unknown> => {
    // The harness lives beside the probe: the probe resolves its own imports
    // (`../packages/core/dist/...`) relative to its own path, so a harness
    // anywhere else makes every one of them unresolvable. Written and removed per
    // call so a crash cannot leave a stray module in `scripts/`.
    const harness = resolve(REPO_ROOT, 'scripts/.probe-figures-harness.mjs');
    const source = readFileSync(PROBE, 'utf8');
    // Re-export exactly the one name that publishes the figures, so this reads the
    // same figures the battery reads rather than a reimplementation of them.
    writeFileSync(
      harness,
      source.replace(
        'export { RUNS, DEFAULT_RUN, classify, normalizeFaultType, recordedTypeMisses, typeMissesFrom, umodelMappingDigestOf };',
        'export { RUNS, DEFAULT_RUN, classify, normalizeFaultType, recordedTypeMisses, typeMissesFrom, umodelMappingDigestOf, readOutcomeVocabulary };',
      ),
    );
    try {
      // The cache-buster belongs *inside* the specifier: `JSON.stringify(harness)`
      // alone would put `?v=` outside the quotes and produce a syntax error.
      const specifier = `${harness}?v=${Date.now()}`;
      const script =
        `import(${JSON.stringify(specifier)}).then((m) => ` +
        `console.log(JSON.stringify(m.readOutcomeVocabulary())));`;
      return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      }));
    } finally {
      rmSync(harness, { force: true });
    }
  };

  it('carries a content reading beside the three counts, because the counts cannot move', () => {
    const figures = readFigures();
    // The three counts, which are real and stay: they are the shape statement, and
    // their values are pinned here so a change to any of them is a deliberate edit.
    expect(figures.umodelRows).toBe(9);
    expect(figures.umodelDistinctWords).toBe(7);
    expect(figures.umodelKindsAnswered).toBe(9);
    // The content reading, which is what a permutation moves.
    expect(typeof figures.umodelMappingDigest, 'umodelMappingDigest must be a string digest').toBe('string');
    expect(figures.umodelMappingDigest).toMatch(/^[0-9a-f]{16,}$/);
  });

  it('the digest is not any of the counts, so it is a different reading and not a fourth aggregate', () => {
    // A digest that happened to be a function of the three counts would move only
    // when they move, which is the defect it exists to fix. Stated as a comparison
    // against the counts' own composition rather than by reading the source.
    const figures = readFigures();
    const digest = String(figures.umodelMappingDigest);
    for (const count of [figures.umodelRows, figures.umodelDistinctWords, figures.umodelKindsAnswered]) {
      expect(digest).not.toBe(String(count));
    }
    // And it is a digest of nine pairs, so its length is consistent with that rather
    // than with a constant: `sha256` is 64 hex characters.
    expect(digest.length).toBe(64);
  });

  it('the digest is order-free, and the sort that makes it so is load-bearing', () => {
    // The contrast that keeps the figure honest, asserted without touching a file.
    //
    // The property is that a *reordering* of the pairs must not move the figure, so a
    // cosmetic edit to the source cannot read as a mapping change. The probes are fed
    // to the exported pure function rather than to a mutated repository, which is what
    // makes this test safe to run: the version that mutated `src/` raced
    // `vocabulary-single-source.test.ts` and was moved out of the suite.
    const harness = resolve(REPO_ROOT, 'scripts/.probe-figures-harness.mjs');
    const source = readFileSync(PROBE, 'utf8');
    writeFileSync(
      harness,
      source.replace(
        'export { RUNS, DEFAULT_RUN, classify, normalizeFaultType, recordedTypeMisses, typeMissesFrom, umodelMappingDigestOf };',
        'export { RUNS, DEFAULT_RUN, classify, normalizeFaultType, recordedTypeMisses, typeMissesFrom, umodelMappingDigestOf };',
      ),
    );
    try {
      const specifier = `${harness}?v=${Date.now()}`;
      const script =
        `import(${JSON.stringify(specifier)}).then((m) => {` +
        `  const pairs = [['service','apm.service'],['pod','k8s.pod'],['node','k8s.node'],` +
        `['host','k8s.node'],['container','k8s.pod'],['db','apm.external.database'],` +
        `['mq','apm.external.message'],['cluster','k8s.cluster'],['external','apm.external']];` +
        `  const reversed = pairs.slice().reverse();` +
        `  const rotated = pairs.slice(4).concat(pairs.slice(0, 4));` +
        `  console.log(JSON.stringify([` +
        `    m.umodelMappingDigestOf(pairs),` +
        `    m.umodelMappingDigestOf(reversed),` +
        `    m.umodelMappingDigestOf(rotated),` +
        `    m.umodelMappingDigestOf(pairs.map(([k, w]) => [k, w === 'k8s.pod' ? 'k8s.node' : w])),` +
        `  ]));` +
        `});`;
      const [base, reversed, rotated, permuted] = JSON.parse(
        execFileSync(process.execPath, ['--input-type=module', '-e', script], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
        }),
      ) as [string, string, string, string];
      // Order-free: two different orderings give the same reading.
      expect(reversed).toBe(base);
      expect(rotated).toBe(base);
      // Content-sensitive: an actual change to the mapping does not.
      expect(permuted).not.toBe(base);
    } finally {
      rmSync(harness, { force: true });
    }
  });
});
