import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The coverage step's own name is a published claim, and nothing read it.
 *
 * ## The defect
 *
 * `.github/workflows/ci.yml` runs the coverage chain under the step name
 *
 *     Test with coverage (core + cli, >=95% per dimension, 100% functions)
 *
 * and that sentence is repeated in `CONTRIBUTING.md`, in `docs/acceptance.md`
 * as an acceptance criterion, and in the CI output recorded in
 * `docs/progress.md` and `docs/audit.md`. Both `vitest.config.ts` files set
 *
 *     thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 }
 *
 * Measured at the commit this file was added, core reported 100% functions and
 * cli reported 100% functions, so the sentence happened to be true. It was not
 * *enforced* true. A change that took either package to 96% functions -- one
 * uncovered function appearing somewhere -- would pass CI while the step name
 * still advertised 100%, and the number a reader would take from a green run
 * would be wrong.
 *
 * That is the same shape this repository has now named four times: **a claim
 * that is published and that nothing reads.** Finding 123 was a pair of test
 * counts; this is a threshold. The repair is the same in both cases -- either
 * make the claim true by construction, or stop publishing it. Here the claim is
 * made true: `functions` is raised to 100, so the step name describes what the
 * configuration actually refuses.
 *
 * ## What this file asserts
 *
 * Not that coverage is high -- only `test:coverage` can say that, and it does so
 * by running. What is asserted is the cheaper and prior fact that **the
 * published claim and the enforced threshold are the same number**, which is
 * decidable from the two files without executing anything.
 *
 * It reads both sides as *text* rather than importing them. `vitest.config.ts`
 * calls `defineConfig` at module scope and the workflow is YAML; reading text is
 * the mechanism that keeps this file from depending on either one's runtime, and
 * it is the same choice `export-surface-enumerated.test.ts` records for its own
 * module scan.
 *
 * ## What this does not establish
 *
 * It does not establish that the thresholds are *satisfied*. A configuration
 * demanding 100% that the suite fails to reach is a red build, which is a
 * different problem with a different channel.
 *
 * It does not establish that the other four words in the step name are true --
 * `core + cli` names the two packages the `test:coverage` script filters to, and
 * that routing belongs to `ci-reaches-doc-guards.test.ts`, not here.
 *
 * It does not check the three documents that restate the number. A test that
 * scanned prose for "100% functions" would fail on the historical CI output
 * recorded in `docs/progress.md`, which is a *record* of a past run and must not
 * be edited; the two live files are the ones that can drift against each other,
 * and they are the ones asserted.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const WORKFLOW = join('.github', 'workflows', 'ci.yml');

function join(...parts: string[]): string {
  return resolve(ROOT, ...parts);
}

function read(relative: string): string {
  return readFileSync(join(relative), 'utf8');
}

/** The four dimensions vitest can threshold, in one fixed order. */
const DIMENSIONS = ['statements', 'branches', 'functions', 'lines'] as const;

type Dimension = (typeof DIMENSIONS)[number];

/**
 * The `thresholds` block of a `vitest.config.ts`, as numbers.
 *
 * Anchored on `thresholds` so a stray `statements: 95` elsewhere in the file --
 * in a comment explaining the choice, which is where this repository puts its
 * reasons -- is not mistaken for the configuration. The block is then delimited
 * by braces rather than by a line count, so reformatting does not change the
 * answer.
 *
 * A dimension that is absent is a *failure*, not a zero: `vitest` treats an
 * omitted key as no threshold at all, and reading that as 0 would make this
 * check pass while the guarantee was gone. `parseThresholds` therefore throws,
 * and the callers assert on the dimensions they need by name.
 */
function parseThresholds(source: string, label: string): Record<Dimension, number> {
  const start = source.indexOf('thresholds:');
  if (start < 0) throw new Error(`${label} declares no thresholds block`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  if (open < 0 || close < 0) throw new Error(`${label} has an unterminated thresholds block`);
  const block = source.slice(open, close);

  const out = {} as Record<Dimension, number>;
  for (const dimension of DIMENSIONS) {
    const match = new RegExp(`\\b${dimension}\\s*:\\s*(\\d+(?:\\.\\d+)?)`).exec(block);
    if (!match) throw new Error(`${label} sets no threshold for '${dimension}'`);
    out[dimension] = Number(match[1]);
  }
  return out;
}

/** One `- name:` line of the workflow carrying a percentage claim. */
interface Claim {
  step: string;
  perDimension: number;
  functions: number;
}

/**
 * The numeric claims in a coverage step name, read the way a reader would.
 *
 * The step name is prose, and the two numbers in it are spelled differently:
 * `>=95% per dimension` sets a floor for the dimensions named around it, while
 * `100% functions` names its dimension explicitly. Both shapes are matched
 * rather than one, because a step name that dropped either half would otherwise
 * make this parser return nothing and the file pass on an empty scan -- the
 * false-green this repository has paid for before.
 */
function parseClaims(workflow: string): Claim[] {
  const claims: Claim[] = [];
  for (const raw of workflow.split('\n')) {
    const name = /^\s*-\s*name:\s*(.+?)\s*$/.exec(raw);
    if (!name) continue;
    const step = name[1]!;
    const perDimension = /(\d+)%\s*per dimension/.exec(step);
    const functions = /(\d+)%\s*functions/.exec(step);
    if (!perDimension && !functions) continue;
    claims.push({
      step,
      perDimension: perDimension ? Number(perDimension[1]) : Number.NaN,
      functions: functions ? Number(functions[1]) : Number.NaN,
    });
  }
  return claims;
}

const CORE_CONFIG = 'packages/core/vitest.config.ts';
const CLI_CONFIG = 'packages/cli/vitest.config.ts';

describe('coverage · the published claim is the enforced threshold', () => {
  const workflow = read(WORKFLOW);
  const claims = parseClaims(workflow);
  const core = parseThresholds(read(CORE_CONFIG), CORE_CONFIG);
  const cli = parseThresholds(read(CLI_CONFIG), CLI_CONFIG);

  it('finds a coverage step that makes a numeric claim, so the rest is not vacuous', () => {
    // A scan that finds no claim passes every assertion below without reading
    // anything. This is the non-vacuity control for the whole file.
    expect(claims.length).toBeGreaterThan(0);
    const coverage = claims.filter((c) => c.step.includes('coverage'));
    expect(coverage.length, 'no step name mentions coverage').toBeGreaterThan(0);
  });

  it('names the function dimension at 100, which is the claim that was unenforced', () => {
    const named = claims.filter((c) => !Number.isNaN(c.functions));
    expect(named.length, 'no step names a function threshold').toBeGreaterThan(0);
    for (const claim of named) {
      expect(
        claim.functions,
        `the step "${claim.step}" advertises ${claim.functions}% functions; this test exists ` +
          'because that number was once 100 in the name and 95 in the configuration',
      ).toBe(100);
    }
  });

  it.each([
    [CORE_CONFIG, core],
    [CLI_CONFIG, cli],
  ])('%s enforces every dimension the step name claims', (label, thresholds) => {
    for (const claim of claims) {
      if (!Number.isNaN(claim.perDimension)) {
        for (const dimension of DIMENSIONS) {
          expect(
            thresholds[dimension],
            `${label} sets ${dimension}: ${thresholds[dimension]}, below the ${claim.perDimension}% ` +
              `the step name "${claim.step}" promises`,
          ).toBeGreaterThanOrEqual(claim.perDimension);
        }
      }
      if (!Number.isNaN(claim.functions)) {
        // Equality, not a floor. A configuration stricter than its own step name
        // is a red build on ordinary work, and a configuration looser than it is
        // the defect -- so the two numbers have exactly one acceptable relation.
        expect(
          thresholds.functions,
          `${label} sets functions: ${thresholds.functions}, but the step name says ` +
            `${claim.functions}% functions. Raise the threshold or correct the name; a claim ` +
            'looser than the check is what this file was written for',
        ).toBe(claim.functions);
      }
    }
  });

  it('would catch the drift it was written for, so a green run is not a parser that agrees with itself', () => {
    // The exact defect, driven through the real parsers. Reading the live files
    // can only ever show agreement, and "they agree" and "the parser returns the
    // same constant for both sides" look identical from a green test.
    const drifted = [
      '- name: Test with coverage (core + cli, ≥95% per dimension, 100% functions)',
    ].join('\n');
    const claimed = parseClaims(drifted);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.functions).toBe(100);

    // The configuration as it stood before the fix.
    const before = ['thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 }'].join(
      '\n',
    );
    const parsed = parseThresholds(before, 'pre-fix fixture');
    expect(parsed.functions).toBe(95);
    expect(parsed.functions).not.toBe(claimed[0]!.functions);
  });

  it('refuses a configuration that omits a dimension rather than reading it as zero', () => {
    // A dimension left out of `thresholds` is not a threshold of zero -- it is no
    // threshold, which is weaker than zero and would slip through a `>= 0` test.
    const missing = 'thresholds: { statements: 95, branches: 95, lines: 95 }';
    expect(() => parseThresholds(missing, 'fixture with no functions key')).toThrow(/functions/);

    const noBlock = 'export default defineConfig({ test: { coverage: { provider: "v8" } } });';
    expect(() => parseThresholds(noBlock, 'fixture with no thresholds')).toThrow(/thresholds/);
  });
});
