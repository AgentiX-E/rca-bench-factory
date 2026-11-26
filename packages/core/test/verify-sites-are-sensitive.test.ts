import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The gate that asks whether a witness would notice the exit it claims.
 *
 * `verify-site-proofs.mjs` answers "did this file reach the exit". This one answers
 * the question that reaching cannot: a test that drives a gate, sees it fail, and
 * asserts nothing about the failure reaches every exit the gate has and would pass if
 * the gate stopped failing. The two answers are different, so the fixtures here hold
 * the shapes apart with one directive each -- `ASSERT` makes the claimant check the
 * exit code, its absence leaves the claimant green whatever happened.
 *
 * Every case runs the shipped script against a scratch tree. Nothing here reproduces
 * the gate's logic: the subject is the gate, and a test that reimplemented it would
 * agree with itself.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GATE = resolve(ROOT, 'scripts', 'verify-sites-are-sensitive.mjs');

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this against what the spawn
 * calls actually reach and reports a disagreement in either direction. The pointer
 * into the gate is a resolved constant rather than a literal argument, which is why
 * the declaration is required at all -- the scanner reads spawn arguments, and
 * `[GATE, ...args]` is not one it can resolve.
 */
const DRIVES = ['scripts/verify-sites-are-sensitive.mjs'];

/**
 * The clock every suite here runs under, stated rather than inherited.
 *
 * CI's `check-test-budgets` named this file on run `45841748590`: its slowest test took
 * **1 334 ms** and the file stated no budget, so vitest's 5 000 ms default was what
 * decided the verdict. The same bytes read **301 ms** here, alone -- the coverage run
 * shares the box with three other workers and every case here spawns the shipped script
 * against a scratch tree, so the multiplier is the scheduler's.
 *
 * Ten seconds is **3.3x** the reading and **7.5x** the local one. The gate holds a file
 * to *half* its declaration (**5 000 ms**), and the largest multiplier this tree has
 * measured for a process-spawning file is **27x** (`docs-guards-need-history.test.ts`,
 * 55 -> 1 487 ms) -- which on 301 ms is 8 127 ms, past the half. So the declaration is
 * stated on each spawning suite rather than once for the file: a suite that stops
 * spawning can lose its number, and the next reader can see which clock belongs to what.
 */
const SUITE_BUDGET_MS = 10_000;

/**
 * What a fixture's claimant does with the gate it starts.
 *
 * `assert` is the witness: it fails when the child's exit code is not the one the
 * fixture asked for. Without it the claimant reports the status and passes, which is
 * the shape the gate exists to find. `blind` drops the environment, which is how a
 * mutant fails to arrive without anybody lying about it. `red` makes the claimant
 * fail on its own, before any mutation.
 */
interface FixtureOptions {
  pick?: 'one' | 'two';
  assert?: boolean;
  blind?: boolean;
  red?: boolean;
  /** Fails with output that carries no report at all: every test passing, non-zero exit. */
  silent?: boolean;
  /** Fails the way vitest does when a test exceeds its own budget: one sentence, exit 1. */
  timedOut?: boolean;
  /**
   * Emits the budget sentence with no `FAIL` line beside it.
   *
   * The shape a reporter that prints totals and no test names produces. The refusal
   * still has to say something, and what it says must be that the run named nobody
   * rather than nothing.
   */
  namelessTimeout?: boolean;
  /** Writes the arguments it was given, so a case can read what the gate asked for. */
  argv?: boolean;
  /** A budget the claimant states for its own tests, written the way vitest accepts it. */
  budget?: string;
  /**
   * Crashes as soon as a mutant is armed, before the gate is ever started.
   *
   * The shape the old reader could not tell from a catch: the file goes red, the
   * mutation never arrived, and the exit code is the same one a witness produces.
   */
  crashOnMutant?: boolean;
  /** Starts the gate, then reports a vitest budget kill: the mutant arrived, the run was cut. */
  hangOnMutant?: boolean;
  /** The longest test, in ms, that this claimant's JSON report claims: the margin's subject. */
  report?: number;
  /**
   * The test that reports itself as failed, which is the name a witness is made of.
   *
   * A mutant run's verdict is "some test went red" and since v3.158 the report says
   * *which* one, so the next run of the same claim can be aimed at it. The stand-in has
   * to model that with the same fidelity it models the exit code: a report whose failed
   * list is filtered by `-t` is what makes an aim either hit or miss.
   */
  witness?: string;
  /** The witness the cost table already names, written before the gate runs. */
  recorded?: string;
  /**
   * Stops at an earlier red -- without reaching the gate -- whenever the run is bailing.
   *
   * The shape `--bail=1` produces in a file whose first failure is not the claim: vitest
   * ends the run at the first red, the armed exit is never reached, and the child exits
   * non-zero having recorded no mutant. `'always'` does the same when the run is not
   * bailing, which is the state that has to stay a refusal rather than become a credit.
   */
  bailDead?: boolean | 'always';
}

/** A repository the gate can be pointed at: an inventory, a gate, and a runner. */
function fixture(claims: { line: 1 | 2; file: string }[], options: FixtureOptions = {}): string {
  const tree = mkdtempSync(join(tmpdir(), 'sensitive-tree-'));
  mkdirSync(join(tree, 'golden-master'), { recursive: true });
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'packages', 'core', 'test'), { recursive: true });

  // Two exits and one of them fires. The line numbers are read back from the file
  // rather than written down twice: a fixture that copies them goes stale the first
  // time the gate is edited.
  const gate = [
    'if (process.env.FIXTURE_PICK === "one") {',
    '  console.error("one");',
    '  process.exit(1);',
    '}',
    'console.error("two");',
    'process.exit(2);',
    '',
  ].join('\n');
  writeFileSync(join(tree, 'scripts', 'fake-gate.mjs'), gate);
  const exits = gate
    .split('\n')
    .map((text, i) => (text.includes('process.exit') ? i + 1 : 0))
    .filter((n) => n > 0);

  writeFileSync(
    join(tree, 'golden-master', 'gate-sites.json'),
    JSON.stringify({
      rule: 'a fixture',
      scanned: 1,
      excluded: {},
      sites: claims.map((claim) => ({
        script: 'scripts/fake-gate.mjs',
        line: exits[claim.line - 1],
        status: 'proved',
        provedBy: claim.file,
      })),
    }),
  );

  if (options.recorded !== undefined) {
    // The table the gate reads before it runs: one claimant, one witness, and the site
    // the witness is supposed to notice. A witness it can no longer find is the shape
    // this fixture exists to model -- the aim misses, and the claim is measured against
    // the whole file exactly as it would have been before v3.158.
    writeFileSync(
      join(tree, 'golden-master', 'sensitivity-costs.json'),
      JSON.stringify({
        measured: '2026-11-26',
        machine: 'a fixture',
        source: 'node scripts/verify-sites-are-sensitive.mjs --costs golden-master/sensitivity-costs.json',
        files: Object.fromEntries(
          claims.map((claim) => [
            claim.file,
            {
              claims: 1,
              runs: 2,
              baselineMs: 1000,
              mutantMs: 1000,
              witnesses: { [`scripts/fake-gate.mjs:${String(exits[claim.line - 1])}`]: options.recorded ?? '' },
            },
          ]),
        ),
      }),
    );
  }

  const directive = [
    `PICK ${options.pick ?? 'one'}`,
    options.assert === true ? 'ASSERT' : '',
    options.blind === true ? 'BLIND' : '',
    options.red === true ? 'RED' : '',
    options.silent === true ? 'SILENT' : '',
    options.timedOut === true ? 'TIMEDOUT' : '',
    options.namelessTimeout === true ? 'NAMELESS' : '',
    options.crashOnMutant === true ? 'CRASH' : '',
    options.hangOnMutant === true ? 'HANG' : '',
    options.bailDead === true ? 'BAILDEAD' : '',
    options.bailDead === 'always' ? 'BAILDEAD BAILALWAYS' : '',
    options.report === undefined ? '' : 'REPORT',
    options.argv === true ? 'ARGV' : '',
  ]
    .filter((one) => one !== '')
    .join(' ');
  // The declaration a claimant states for itself, if the case is about one. It is
  // appended rather than modelled: the runner reads the file as text, and what the gate
  // reads is the same text.
  const declared =
    options.budget === undefined
      ? ''
      : `\ndescribe('a fixture', { timeout: ${options.budget} }, () => {});\n`;
  // The witness is on a line of its own, because it is a **name** and the flags above
  // are words: a name sharing a line with `ARGV` is read as part of the name, and a
  // witness one word too long is an aim that misses for a reason nobody would look for.
  const witnessLine =
    options.witness === undefined ? '' : `\n// WITNESS ${options.witness}\n`;
  const written = new Set<string>();
  for (const claim of claims) {
    if (written.has(claim.file)) continue;
    written.add(claim.file);
    writeFileSync(join(tree, claim.file), `${directive}\n${witnessLine}${declared}`);
  }

  // The stand-in for vitest. It reads the directive, starts the gate the way every
  // claimant in this tree does -- inherited environment, one exit expected -- and
  // either checks the status or does not.
  const runner = [
    "import { spawnSync } from 'node:child_process';",
    "import { readFileSync, writeFileSync } from 'node:fs';",
    "import { dirname, resolve } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    'const here = dirname(fileURLToPath(import.meta.url));',
    'const file = process.argv.find((one) => one.endsWith(".test.ts"));',
    'const text = readFileSync(file, "utf8");',
    'const pick = /PICK (\\w+)/.exec(text)[1];',
    'const want = pick === "one" ? 1 : 2;',
    'if (text.includes("ARGV")) {',
    // The path arrives as a parameter rather than being guessed from the runner's own
    // location: this template is source-as-a-string, so a `resolve(here, ...)` here
    // reads to `tests-do-not-write-inside-the-package.test.ts` as a write into the
    // package -- and the rule it enforces is the right one, so the fixture is what
    // should change.
    '  writeFileSync(process.env.FIXTURE_ARGV, process.argv.slice(2).join(" "));',
    '}',
    // The report vitest's json reporter would have written, at whichever path it was
    // given. Since v3.158 every run asks for one and the two are read for different
    // facts -- the baseline's for the longest duration, the mutant's for the test that
    // failed -- so the stand-in resolves the path the way vitest does: `--outputFile.json=`
    // when there is more than one reporter, `--outputFile=` when there is one.
    'const reportPath = (() => {',
    '  const args = process.argv.slice(2);',
    '  const named = args.find((one) => one.startsWith("--outputFile."));',
    '  const asked = named === undefined ? args.find((one) => one.startsWith("--outputFile=")) : named;',
    '  if (asked === undefined) return null;',
    '  return asked.slice(asked.indexOf("=") + 1);',
    '})();',
    // The aim, read the way vitest reads it: `-t` is a **regular expression**, and the
    // gate escapes the witness before passing it, so a name with brackets in it filters
    // to itself. This is the half of the fixture that decides whether an aim hits.
    'const aim = (() => {',
    '  const args = process.argv.slice(2);',
    '  const at = args.indexOf("-t");',
    '  return at === -1 ? null : new RegExp(args[at + 1]);',
    '})();',
    'if (text.includes("REPORT") && reportPath !== null) {',
    '  writeFileSync(reportPath, JSON.stringify({ testResults: [{ assertionResults: [',
    '    { fullName: "a short one", duration: 4.5 },',
    '    { fullName: "the long one", duration: ' + String(options.report ?? 0) + ' },',
    '  ] }] }));',
    '}',
    // A run that reports the test it failed, filtered by the aim: a stale witness
    // matches nothing, so the report names no test and the caller re-measures the file.
    'if (text.includes("WITNESS") && reportPath !== null) {',
    '  const noticed = /WITNESS (.+)/.exec(text)[1].trim();',
    '  const ran = aim === null || aim.test(noticed) ? [noticed] : [];',
    '  writeFileSync(reportPath, JSON.stringify({ testResults: [{ assertionResults:',
    '    ran.map((name) => ({ title: name, fullName: "a suite " + name, status: "failed" })) }] }));',
    '}',
    'if (text.includes("SILENT")) {',
    '  process.stdout.write("[vitest-worker]: Timeout calling " + String.fromCharCode(34) + "onTaskUpdate" + String.fromCharCode(34) + "\\n");',
    '  process.exit(1);',
    '}',
    'if (text.includes("TIMEDOUT")) {',
    '  if (!text.includes("NAMELESS")) process.stdout.write(" FAIL  " + file + " > drives the gate\\n");',
    '  process.stdout.write("Error: Test timed out in 30000ms.\\n");',
    '  process.stdout.write("\\n      Tests  1 failed (1)\\n");',
    '  process.exit(1);',
    '}',
    'if (text.includes("RED")) {',
    '  process.stdout.write(" FAIL  " + file + " > drives the gate\\n");',
    '  process.stdout.write("AssertionError: expected 1 to be 0 // Object.is equality\\n");',
    '  process.stdout.write("\\n      Tests  1 failed (1)\\n");',
    '  process.exit(1);',
    '}',
    // Armed-and-crashed: the gate is never reached, so nothing is recorded, and the
    // exit code is the one a witness would also produce.
    'if (text.includes("CRASH") && (process.env.RCA_HOLLOW_SITE || process.env.RCA_HOLLOW_THROW)) {',
    '  process.stdout.write(" FAIL  " + file + " > drives the gate\\n");',
    '  process.stdout.write("TypeError: Cannot read properties of undefined (reading " + String.fromCharCode(39) + "status" + String.fromCharCode(39) + ")\\n");',
    '  process.stdout.write("\\n      Tests  1 failed (1)\\n");',
    '  process.exit(1);',
    '}',
    // A red that is not the mutant's, arrived at by stopping early: the armed exit is
    // never reached, so nothing is recorded, and the exit code is the one a claimant
    // that cannot be proved also produces. `BAILALWAYS` does it even when the gate asks
    // for the whole file, which is the state the extra run must not launder.
    'const bailing = process.argv.slice(2).includes("--bail=1");',
    'if (text.includes("BAILDEAD") && (process.env.RCA_HOLLOW_SITE || process.env.RCA_HOLLOW_THROW)) {',
    '  if (bailing || text.includes("BAILALWAYS")) {',
    '    process.stdout.write(" FAIL  " + file + " > an earlier test that is not the claim\\n");',
    '    process.stdout.write("AssertionError: expected 0 to be 1 // Object.is equality\\n");',
    '    process.stdout.write("\\n      Tests  1 failed | 2 passed (3)\\n");',
    '    process.exit(1);',
    '  }',
    '}',
    "const gate = resolve(here, 'scripts', 'fake-gate.mjs');",
    'const env = text.includes("BLIND")',
    '  ? { PATH: process.env.PATH, FIXTURE_PICK: pick }',
    '  : { ...process.env, FIXTURE_PICK: pick };',
    'const child = spawnSync(process.execPath, [gate], { encoding: "utf8", env });',
    'if (text.includes("ASSERT") && child.status !== want) {',
    '  process.stdout.write(" FAIL  " + file + " > drives the gate\\n");',
    '  process.stdout.write("AssertionError: expected " + String(want) + " to be " + String(child.status) + "\\n");',
    '  process.stdout.write("\\n      Tests  1 failed (1)\\n");',
    '  process.exit(1);',
    '}',
    // The mutant arrived and the run was then cut by a budget: red, recorded, and
    // still not a failure -- nothing above this line asserted anything.
    'if (text.includes("HANG") && (process.env.RCA_HOLLOW_SITE || process.env.RCA_HOLLOW_THROW)) {',
    '  process.stdout.write(" FAIL  " + file + " > drives the gate\\n");',
    '  process.stdout.write("Error: Test timed out in 2500ms.\\n");',
    '  process.stdout.write("\\n      Tests  1 failed (1)\\n");',
    '  process.exit(1);',
    '}',
    'process.stdout.write("picked " + pick + " status " + String(child.status) + "\\n");',
    'process.exit(0);',
    '',
  ].join('\n');
  writeFileSync(join(tree, 'runner.mjs'), runner);
  return tree;
}

function runGate(
  tree: string,
  args: string[] = [],
  env: Record<string, string> = {},
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [GATE, ...args], {
    encoding: 'utf8',
    cwd: tree,
    env: {
      ...process.env,
      RCA_SENSITIVE_INVENTORY: join(tree, 'golden-master', 'gate-sites.json'),
      RCA_SENSITIVE_VITEST: join(tree, 'runner.mjs'),
      RCA_SENSITIVE_TESTS: join(tree, 'packages', 'core'),
      RCA_SENSITIVE_CONCURRENCY: '2',
      FIXTURE_ARGV: join(tree, 'argv.txt'),
      ...env,
    },
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * A plan long enough that the write has to be flushed rather than exited past.
 *
 * ## The measurement this case exists for
 *
 * CI's `sensitivity-shards.test.ts` failed once with `expected [ …(193) ] to deeply equal
 * [ …(183) ]`: the unsharded `--list` produced 183 lines and the two shards 193. Nothing
 * had changed the inventory -- the two calls that disagreed ran seconds apart against the
 * same file. What they differed in was **timing**: the gate prints one line per claim and
 * then calls `process.exit(0)`, and a pipe is asynchronous, so the lines still in the
 * stream's buffer are discarded. The ten missing rows were the last ten printed, which is
 * why the sorted diff showed them scattered rather than truncated off the end.
 *
 * 2 000 claims is about 160 KB, well past the pipe's own buffer, so the defect is not a
 * race that happens once in twenty runs: the old shape loses its tail every time.
 */
describe('verify-sites-are-sensitive.mjs · a plan that cannot fit in a pipe', { timeout: SUITE_BUDGET_MS }, () => {
  it('prints every claim, and exits only after the last one has been written', () => {
    const root = mkdtempSync(join(tmpdir(), 'rca-plan-'));
    const claims = 2000;
    try {
      mkdirSync(join(root, 'golden-master'), { recursive: true });
      const sites = Array.from({ length: claims }, (_, index) => ({
        script: `scripts/site-${String(index)}.mjs`,
        line: index + 1,
        condition: 'the exit',
        verdict: 'code',
        status: 'proved',
        provedBy: 'packages/core/test/a-claimant.test.ts',
      }));
      writeFileSync(
        join(root, 'golden-master', 'gate-sites.json'),
        JSON.stringify({ rule: 'a fixture rule', scanned: claims, excluded: { zero: 0 }, sites, throws: { rule: 'none', counts: {}, rows: [] } }),
        'utf8',
      );
      const run = spawnSync(process.execPath, [GATE, '--list'], {
        encoding: 'utf8',
        env: { ...process.env, RCA_SENSITIVE_ROOT: root },
        maxBuffer: 64 * 1024 * 1024,
      });
      expect(run.stderr).toBe('');
      expect(run.status).toBe(0);
      expect(run.stdout.trim().split('\n').filter(Boolean)).toHaveLength(claims);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('scripts/verify-sites-are-sensitive.mjs · the mutant, end to end', { timeout: SUITE_BUDGET_MS }, () => {
  it('passes when the claimant fails as soon as the exit stops failing', () => {
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], { assert: true });
    try {
      const result = runGate(tree);
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('1 claim(s)');
      // The summary counts the two mutants separately, because a run that emptied
      // every exit and removed no throw is a different reading from one that emptied
      // both -- and the fixture holds one exit claim, so both numbers are known here.
      expect(result.stdout).toContain('1 exit(s) hollowed, 0 throw(s) removed');
      expect(result.stdout).toContain('some test goes red');
      // And the census: the one run that is credited is counted in a basket, so the
      // summary's "caught" is a number a reader can check rather than a total that
      // could be made of crashes.
      expect(result.stdout).toContain('1 of 1 mutant run(s) are credited');
      expect(result.stdout).toContain('0 truncated by a budget, 0 exited without recording the mutant');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('fails when the claimant reaches the exit and passes whatever it does', () => {
    // The defect in miniature: the file runs the gate, the gate fails, and the file
    // asserts nothing about the failure. It would go on passing if the exit were
    // deleted, so it is not a proof of that exit.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], { assert: false });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('can stop failing and no test minds');
      expect(result.stderr).toContain('scripts/fake-gate.mjs:3');
      expect(result.stderr).toContain('packages/core/test/one.test.ts');
      expect(result.stderr).toContain('replaced by success');
      // And the repair is named: the sentence says what the witness does, not only
      // that something is wrong.
      expect(result.stderr).toContain('It does not depend on it');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('says a mutant never arrived when the child was started out of sight', () => {
    // A green run is not evidence about a mutant that did not reach the child. The
    // claim may be perfectly sound; reading this as SURVIVED would accuse the test of
    // the instrument's blindness -- finding 359's mistake, one question over.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], { blind: true });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('never');
      expect(result.stderr).toContain('recorded the mutant');
      expect(result.stderr).not.toContain('can stop failing and no test minds');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('credits nothing for a claimant that goes red as soon as a mutant is armed', () => {
    // The false half of this gate's sentence, and the shape it could not see until
    // v3.87: a file that crashes whenever `RCA_HOLLOW_SITE` is set exits non-zero for
    // every claim it makes and would be credited with every one of them. Nothing was
    // asserted about the mutation, and the mutation never even arrived.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      crashOnMutant: true,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('went red without the mutant');
      expect(result.stderr).toContain('scripts/fake-gate.mjs:3');
      expect(result.stderr).toContain('never recorded the mutant');
      expect(result.stderr).not.toContain('can stop failing and no test minds');
      expect(result.stdout).toContain('1 exited without recording the mutant');
      expect(result.stdout).not.toContain('1 of 1 mutant run(s) are credited');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('measures the claim again without --bail when the file stopped at a red that was not the mutant', () => {
    // The cost device that became a verdict. `--bail=1` ends a whole-file mutant run at
    // the first failing test, so a file whose first red is an unrelated test never
    // reaches the exit it was armed to hollow: red, no mutant recorded, and the reader --
    // correctly about that run -- refuses to credit it. The refusal is right and the
    // accusation is not: the claim was never measured. So the file is run again without
    // the flag, and what decides the claim is the run that got to the end.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      bailDead: true,
      witness: 'notices the exit',
    });
    try {
      const result = runGate(tree);
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      // Two mutant runs -- the one that bailed and the whole file -- plus the baseline,
      // which the pass line counts and the per-claimant row does not.
      expect(result.stdout).toContain('1 claim(s) in 2 run(s)');
      expect(result.stdout).toContain('PASSED (1 claim(s) across 1 file(s), 3 run(s)');
      expect(result.stdout).toContain('1 of 1 mutant run(s) are credited');
      expect(result.stdout).toContain('1 claim(s)');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('still refuses when the file records nothing even run to the end', () => {
    // The other side of the same repair: an extra run is not a second chance at a
    // verdict. A claimant that never reaches the mutant however it is run is the shape
    // the basket was built for, and it is refused in the same words.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      bailDead: 'always',
      witness: 'notices the exit',
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('went red without the mutant');
      expect(result.stderr).toContain('never recorded the mutant');
      expect(result.stdout).toContain('1 claim(s) in 2 run(s)');
      expect(result.stdout).not.toContain('1 of 1 mutant run(s) are credited');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('credits nothing for a claimant the budget stopped after the mutant arrived', () => {
    // Red, recorded, and still not a failure: the run was cut by a test budget, so
    // nothing asserted that the mutation made a difference. A claimant's own
    // declaration is the ordinary way this happens, which is why the sentence names
    // the number and whose it is.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      hangOnMutant: true,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('stopped by a test budget instead of failing');
      expect(result.stderr).toContain('did not finish inside the 2500 ms of test budget');
      // The mutant side asked the same question and had the same answer available: the
      // run it stopped had printed which test it was inside.
      expect(result.stderr).toContain('the test still running when the budget ended was `drives the gate`');
      expect(result.stderr).toContain('a run the harness ended is a claim nobody read');
      expect(result.stdout).toContain('1 truncated by a budget');
      expect(result.stdout).not.toContain('1 of 1 mutant run(s) are credited');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('reports a claimant that is already red, with its own failure quoted', () => {
    // A red file catches every mutant applied to it, so crediting it would make the
    // gate green on a broken tree. The summary is the run's own report rather than a
    // sentence about it, so the reader does not have to re-run a file the gate just
    // ran.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      red: true,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('does not pass on its own');
      expect(result.stderr).toContain('AssertionError: expected 1 to be 0');
      expect(result.stderr).toContain('Tests  1 failed (1)');
      expect(result.stderr).toContain('run it alone:');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('quotes the tail when the run failed with no report to summarise', () => {
    // The first real red of this battery on a runner was exactly this shape:
    // `[vitest-worker]: Timeout calling "onTaskUpdate"`, every test passing, exit 1.
    // `failureSummary` correctly yields nothing for output that names no failing test,
    // so the gate printed a file, an exit code and no evidence -- the same defect the
    // previous round fixed for a *survivor*, one arm over.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      silent: true,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('does not pass on its own (exit 1)');
      expect(result.stderr).toContain('its own output ends: [vitest-worker]: Timeout calling');
      expect(result.stderr).toContain('run it alone:');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('gives a claimant a test budget larger than the one vitest assumes', () => {
    // The gate asks whether a file passes on its own, and it asks it four files at a
    // time. Vitest's default ceiling answers a different question -- how long a test
    // takes on an idle box -- and this repository has already seen the two diverge: the
    // slowest claimant file runs in 4,900 ms alone and timed out at 30,000 ms inside a
    // shard, which the gate then reported as a claimant that "does not pass on its own".
    // A verdict about the machine, filed as a verdict about the claims. The flag is
    // asserted rather than the constant, so the number can be re-measured without
    // rewriting the fixture.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      argv: true,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(0);
      const argv = readFileSync(join(tree, 'argv.txt'), 'utf8');
      expect(argv).toContain('--testTimeout=120000');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('charges the mutant runs to the claimant that paid for them', () => {
    // The defect this exists for is a number that could not be divided. `v3.150` added
    // six claims to one file and charged them 282 s, which was the difference between
    // two afternoons: the battery printed one total and the recorder saw only the step.
    // A total cannot be divided after the fact, so the rows below are the division --
    // and the assertion is that a claimant's row exists, not that a duration is this
    // or that: seconds belong to the machine, and a fixture that wrote them down would
    // be the flaky row this campaign keeps removing.
    // Two claimants, both proving the exit that fires under `PICK one`: the fixture's
    // second exit is unreachable there, and a claim on it would be a survivor rather
    // than a row -- which is a different case, and one this file already has.
    const tree = fixture(
      [
        { line: 1, file: 'packages/core/test/one.test.ts' },
        { line: 1, file: 'packages/core/test/two.test.ts' },
      ],
      { assert: true },
    );
    try {
      const result = runGate(tree);
      expect(result.status).toBe(0);
      // One row per claimant, carrying its own claims and runs.
      expect(result.stdout).toContain('packages/core/test/one.test.ts -- 1 claim(s) in 1 run(s),');
      expect(result.stdout).toContain('packages/core/test/two.test.ts -- 1 claim(s) in 1 run(s),');
      // And a total that says how many runs it is made of, so the two halves can be
      // reconciled by a reader instead of taken on trust.
      expect(result.stdout).toContain('2 mutant run(s) cost');
      expect(result.stdout).toContain('the dearest claimant is');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('asks the run whose verdict is an exit code to stop at the first red', () => {
    // A mutant is proved by *a* test going red; what the rest of the file does after
    // that red adds nothing to the proof and is charged to the claim anyway. `--bail`
    // stops there. The baseline cannot take the same flag -- its verdict is a duration,
    // and a run that stopped early would report the longest test of a file it had not
    // finished -- which is why this flag is asserted on the mutant's argv and its
    // absence on the baseline's, in the case below.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      argv: true,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(0);
      const argv = readFileSync(join(tree, 'argv.txt'), 'utf8');
      expect(argv).toContain('--bail');
      // The report rides on both runs since v3.158, for two different readings: the
      // baseline's longest **test**, and the mutant's the one test that **failed**.
      expect(argv).toContain('--reporter=json');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('does not ask the baseline to stop, because its verdict is a duration', () => {
    // The other half of the boundary, taken from the run that survives the flag: a
    // baseline is red here, so no mutant runs and `argv.txt` holds the baseline's own
    // arguments. A `--bail` that reached this run would make the margin sentence report
    // the longest test of a file that stopped, which is a number about a subset.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      red: true,
      argv: true,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(1);
      const argv = readFileSync(join(tree, 'argv.txt'), 'utf8');
      expect(argv).not.toContain('--bail');
      expect(argv).toContain('--reporter=json');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('records the test that noticed, so the next run of that claim can be aimed at it', () => {
    // The claim's price was the whole file, once per claim, so a file's price was its own
    // runtime multiplied by its claim count: two claimants of sixty-eight were 45% of a
    // 2 632 s battery, and no static table could balance that pair for longer than one
    // run. The report a mutant run already writes names the test that failed, and the
    // table records it here -- which is the whole of what makes the next run cheaper.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      witness: 'the test that noticed',
    });
    try {
      const result = runGate(tree, ['--costs', 'written.json']);
      expect(result.status).toBe(0);
      const table = JSON.parse(readFileSync(join(tree, 'written.json'), 'utf8'));
      const row = table.files['packages/core/test/one.test.ts'];
      expect(Object.values(row.witnesses)).toEqual(['the test that noticed']);
      // Named by its site, because that is the key the claim is known by: a witness
      // filed under the file would be ambiguous the moment a file makes two claims.
      expect(Object.keys(row.witnesses)[0]).toContain('scripts/fake-gate.mjs:');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('aims the mutant at the recorded witness, with the name passed as a literal', () => {
    // `-t` is a **regular expression** to vitest. A name passed through unescaped is a
    // pattern that matches a family of tests, and a red from one of them would be
    // credited to this claim -- a filter that quietly widens is the one failure mode the
    // aim cannot have. The name here carries both a group and a dot, which is the shape
    // this tree's own test names have.
    const name = 'a bound (v3.158) is twice the day';
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      argv: true,
      recorded: name,
      witness: name,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(0);
      const argv = readFileSync(join(tree, 'argv.txt'), 'utf8');
      expect(argv).toContain('-t a bound \\(v3\\.158\\) is twice the day');
      // And the aim held: a missed aim is measured again against the whole file, which
      // is the next case, and a summary that called both of them aims would hide it.
      expect(result.stdout).toContain('1 of 1 claim(s) named a test that could see them, and 1 of those aims held');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('measures the whole file when the aim misses, and says how many aims missed', () => {
    // A witness that has stopped existing is what a renamed test looks like from here.
    // The aimed run goes red -- the gate still fails -- and its report names no test,
    // which is not evidence about the claim: the other tests in the file were never run.
    // So the claim is measured again against the whole file, the verdict is the one it
    // would have had before v3.158, and the count is printed because a battery that got
    // slower and a table that went stale look identical from a green run.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      recorded: 'a test this file no longer has',
      witness: 'the test that noticed',
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('1 aim(s) missed and were measured against the whole file instead');
      // Two children, not one: the aimed run and the whole run. A row that said one
      // would be a table that hides what a stale witness costs.
      expect(result.stdout).toContain('1 claim(s) in 2 run(s)');
      expect(result.stdout).toContain('1 of 1 mutant run(s) are credited');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('separates a claimant that did not finish from one that is red', () => {
    // Two sentences for two findings. "Does not pass on its own" sends a reader to the
    // test; a file that ran out of budget sends them to the number, and until this case
    // the gate said the first about the second.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      timedOut: true,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(1);
      // The number is the one the run printed, and the sentence now also says **whose**
      // number it is. This fixture's claimant declares no budget while the battery
      // furnishes 120 000, so a run that reports 30 000 was given its ceiling by
      // something neither of them states -- which is the third provenance, and the one
      // that used to be indistinguishable from the other two.
      expect(result.stderr).toContain('did not finish inside the 30000 ms of test budget');
      expect(result.stderr).toContain('neither the battery nor any declaration in this file furnishes');
      expect(result.stderr).toContain('unmeasured rather than unproven');
      // And **which test** was still running. A refusal that names the budget and not
      // the test sends its reader to a number that is almost never the thing to change:
      // the budget is a ceiling the whole file shares, the test is the one line of it
      // that hangs. The name is in the run's own `FAIL` line, which this gate already
      // captured and did not read.
      expect(result.stderr).toContain('the test still running when the budget ended was `drives the gate`');
      expect(result.stderr).not.toContain('does not pass on its own');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('says a stopped run named no test, when its output carries no name to read', () => {
    // The sentence above and this one are not the same number of failures apart. A run
    // whose reporter printed the budget and no names is the one case where the refusal
    // has nothing to point at, and silence there is indistinguishable from a reader that
    // did not look -- the defect class this repository keeps finding one level down.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      timedOut: true,
      namelessTimeout: true,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('did not finish inside the 30000 ms of test budget');
      expect(result.stderr).toContain('and its own output names no test, only the budget');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('says a run that wrote no per-test report did not measure a margin', () => {
    // The stand-in runner writes no vitest report, which is the shape of a vitest that
    // died before its reporter wrote. Reporting a share of a budget from a file's wall
    // clock is the arithmetic finding 528 removed: it divides a file's total by a
    // per-test ceiling and prints a percentage, and a reader then raises a number that
    // was never near it.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], { assert: true });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('slowest claimant packages/core/test/one.test.ts');
      expect(result.stdout).toContain('no run wrote a per-test report');
      expect(result.stdout).toContain('unmeasured');
      expect(result.stdout).not.toContain('the longest single test');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('prints the longest single test against the budget that test is given', () => {
    // The margin that has a ceiling: vitest's own per-test duration, not the file's
    // wall clock. Two tests in the report and the longer one is second, so a reader
    // that took the first would report 4 ms against 120 000.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      report: 2400,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        'the longest single test of any claimant is 2400 ms of the 120000 ms it is given (2%)',
      );
      expect(result.stdout).toContain('packages/core/test/one.test.ts: the long one');
      // The fallback sentence is the one that must not appear -- asserted by its own
      // words rather than by `wall clock`, which the per-claimant census prints for a
      // reason of its own (v3.153). A word was standing in for a sentence, and this
      // round's new line is what made the difference visible.
      expect(result.stdout).not.toContain('and no run wrote a per-test report');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('gives each claimant run one worker, because a one-file run has nothing to share', () => {
    // Four claimants at a time, each a vitest of its own: left to the default every
    // child sizes its pool from the machine, so four claimants on a four-vCPU runner
    // ask for sixteen workers. The signature of that is a red with every test passing,
    // and this repository has already paid for it once inside the suite (finding 297).
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      assert: true,
      argv: true,
    });
    try {
      const result = runGate(tree);
      expect(result.status).toBe(0);
      const argv = readFileSync(join(tree, 'argv.txt'), 'utf8');
      expect(argv).toContain('--maxWorkers=1');
      // And the file it was asked about, relative to the package the run happens in,
      // so the flag is not asserted on a run that measured something else.
      expect(argv).toContain('run test/one.test.ts');
      // The last run the fixture made is the mutant's, and it asks for a report too --
      // since v3.158 the mutant's report is read for the test that failed, which is the
      // witness the next run of the same claim is aimed at. The two flags are asserted
      // rather than the absence of one, because what changed is what the report is for.
      expect(argv).toContain('--reporter=json');
      expect(argv).toContain('--bail=1');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('names the file for a claim it could not run at all', () => {
    const tree = fixture([{ line: 1, file: 'packages/core/test/absent.test.ts' }], { assert: true });
    try {
      rmSync(join(tree, 'packages/core/test/absent.test.ts'));
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('absent.test.ts');
      expect(result.stderr).toMatch(/does not exist|cannot|missing/i);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('refuses an inventory with no proved site, which would pass while measuring nothing', () => {
    const tree = fixture([]);
    try {
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no proved site');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('refuses an inventory it cannot read instead of reporting no survivors', () => {
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], { assert: true });
    try {
      rmSync(join(tree, 'golden-master', 'gate-sites.json'));
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('gate-sites.json');
      expect(result.stderr).toContain('cannot');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('prints the plan without running it', () => {
    // The full pass is minutes long, so the plan has to be reviewable before it
    // starts -- and it is the only form the suite can afford to drive on the
    // shipped tree.
    const tree = fixture([
      { line: 1, file: 'packages/core/test/one.test.ts' },
      { line: 2, file: 'packages/core/test/two.test.ts' },
    ]);
    try {
      const result = runGate(tree, ['--list']);
      expect(result.status).toBe(0);
      expect(result.stdout.split('\n').filter((line) => line.includes('.mjs:'))).toHaveLength(2);
      expect(result.stdout).toContain('test/two.test.ts');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('refuses an argument it does not understand, rather than measuring anyway', () => {
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], { assert: true });
    try {
      const result = runGate(tree, ['--fast']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unknown argument '--fast'");
      expect(result.stderr).toContain('usage:');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('refuses a pool size that would measure nothing', () => {
    // A pool of zero resolves before running anything, and the summary would then
    // read like a clean bill of health over zero runs. The number is read from the
    // environment so this branch is reachable at all.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], { assert: true });
    try {
      const result = runGate(tree, [], { RCA_SENSITIVE_CONCURRENCY: '0' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('RCA_SENSITIVE_CONCURRENCY');
      expect(result.stderr).toContain('positive integer');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('writes the cost table it measured, one row per claimant', () => {
    // The shards are divided by this table and by nothing else, so the table has to
    // come out of a run rather than out of an author. The row is the division the
    // summary already prints -- a baseline and the mutant runs it paid for -- and the
    // assertion is on the shape, not on a duration: seconds belong to the machine.
    const tree = fixture(
      [
        { line: 1, file: 'packages/core/test/one.test.ts' },
        { line: 1, file: 'packages/core/test/two.test.ts' },
      ],
      { assert: true },
    );
    try {
      const where = join(tree, 'golden-master', 'sensitivity-costs.json');
      const result = runGate(tree, ['--costs', where]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('sensitivity-costs.json');
      const table = JSON.parse(readFileSync(where, 'utf8'));
      expect(table.measured).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(String(table.machine)).not.toBe('');
      expect(Object.keys(table.files).sort()).toEqual([
        'packages/core/test/one.test.ts',
        'packages/core/test/two.test.ts',
      ]);
      for (const row of Object.values(table.files) as { claims: number; runs: number; baselineMs: number; mutantMs: number }[]) {
        expect(row.claims).toBe(1);
        expect(row.runs).toBe(2);
        expect(Number.isInteger(row.baselineMs) && row.baselineMs >= 0).toBe(true);
        expect(Number.isInteger(row.mutantMs) && row.mutantMs > 0).toBe(true);
      }
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('refuses to write a cost table from a shard, which measured half an inventory', () => {
    // A table written by a shard would name the files that shard happened to own and
    // omit the rest, and the next run would divide the inventory by it. Refused at the
    // argument, so nothing is measured and nothing is written.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], { assert: true });
    try {
      const where = join(tree, 'half.json');
      // A table the shard *could* use, so that the only thing standing between this run
      // and a half-written table is the refusal itself. Without it the case would pass on
      // the gate's own "cannot read the table" -- a red for a different reason, which is
      // the shape a case like this is easiest to be wrong about.
      const table = join(tree, 'golden-master', 'sensitivity-costs.json');
      writeFileSync(
        table,
        JSON.stringify({
          measured: '2026-01-01',
          machine: 'the case',
          source: 'node scripts/verify-sites-are-sensitive.mjs --costs golden-master/sensitivity-costs.json',
          files: {
            'packages/core/test/one.test.ts': {
              claims: 1,
              runs: 2,
              baselineMs: 1000,
              mutantMs: 1000,
            },
          },
        }),
        'utf8',
      );
      const result = runGate(tree, ['--costs', where, '--shard', '1/2'], {
        RCA_SENSITIVE_COSTS: table,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--costs writes the table an unsharded run measured');
      expect(existsSync(where)).toBe(false);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });
});

/**
 * The suite the CI gate named, and the reason its budget is `SUITE_BUDGET_MS`.
 *
 * The `1 334 ms` reading that made this file declare a budget at all was a case *here*
 * -- one reading published from a tree the case had just built -- while the file's own
 * slowest case above is the heavier one on this box. Both spawn the shipped script, so
 * both state the same clock; the declaration is repeated rather than shared through a
 * file-wide default so that a reader can see which suite the number was measured for.
 */
describe('scripts/verify-sites-are-sensitive.mjs · the reading it publishes', { timeout: SUITE_BUDGET_MS }, () => {
  it('counts a site once per claim, not once per file', () => {
    // Two exits of one gate, both claimed by the same file, and the claimant checks
    // the one it fires. The other must be reported: a file sensitive to one exit says
    // nothing about the other.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], { assert: true });
    try {
      writeFileSync(
        join(tree, 'golden-master', 'gate-sites.json'),
        JSON.stringify({
          rule: 'a fixture',
          scanned: 1,
          excluded: {},
          sites: [
            { script: 'scripts/fake-gate.mjs', line: 3, status: 'proved', provedBy: 'packages/core/test/one.test.ts' },
            { script: 'scripts/fake-gate.mjs', line: 6, status: 'proved', provedBy: 'packages/core/test/one.test.ts' },
          ],
        }),
      );
      const result = runGate(tree);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('scripts/fake-gate.mjs:6');
      expect(result.stderr).not.toContain('scripts/fake-gate.mjs:3');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('runs the claimant once per claim plus once for the baseline', () => {
    // The cost model is part of the design: a pool that ran the baseline per claim
    // would double the pass, and one that skipped the baseline would credit a red
    // file as catching everything. Two claims on one file make the two orderings
    // different numbers -- three runs, not four -- so the count says which one this
    // is rather than describing it.
    const tree = fixture(
      [
        { line: 1, file: 'packages/core/test/one.test.ts' },
        { line: 2, file: 'packages/core/test/one.test.ts' },
      ],
      { assert: true },
    );
    try {
      const runner = readFileSync(join(tree, 'runner.mjs'), 'utf8');
      writeFileSync(
        join(tree, 'runner.mjs'),
        `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(join(tree, 'runs.log'))}, "run\\n");\n${runner}`,
      );
      const result = runGate(tree);
      // Red, because the second claim's exit never fires under this fixture: the
      // count is the subject here, not the verdict.
      expect(result.status).toBe(1);
      const runs = readFileSync(join(tree, 'runs.log'), 'utf8').trim().split('\n');
      expect(runs).toHaveLength(3);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });
});

/**
 * The budget the battery prints, and the budget the claimant actually gets.
 *
 * `--testTimeout=120000` is the flag the gate passes, and it sets the **inherited**
 * default: a file that declares `{ timeout: 30_000 }` keeps 30 000, because a default is
 * what a declaration replaces. Measured on the tree this case was written for, **9 of 61
 * claimants declare a budget below the battery's**, and the run's closing sentence named
 * the flag for all 61 -- so the one number a reader could see was not the one nine of
 * them were held to.
 *
 * The verdict is not to refuse them. A claimant's declaration is a statement about that
 * file's own work, and this gate has no measurement that says those numbers are wrong.
 * What it can do is say the two differ, and say whose number a timed-out claimant was
 * given -- which is what these three cases hold in place. The one state it refuses is a
 * budget it cannot price, because there the census itself would be a guess.
 */
describe('sensitivity battery · the two budgets', () => {
  it('names a claimant that furnishes less than the battery, and does not refuse it', () => {
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      pick: 'one',
      assert: true,
      budget: '30_000',
    });
    try {
      const result = runGate(tree, []);
      // The claim still holds: this case is about the sentence, not about the proof.
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('1 of 1 claimant(s) declare a test budget of their own');
      expect(result.stdout).toContain('packages/core/test/one.test.ts:3=30000');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('says every claimant got the battery number when none of them declares one', () => {
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], { pick: 'one', assert: true });
    try {
      const result = runGate(tree, []);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('none of the 1 claimant(s) declares a test budget of its own');
      expect(result.stdout).toContain('120000 ms is the one every one of them gets');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('refuses a budget it cannot price, because the census would be a guess', () => {
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      pick: 'one',
      assert: true,
      budget: 'FROM_THE_ENVIRONMENT',
    });
    try {
      const result = runGate(tree, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("states a test budget named 'FROM_THE_ENVIRONMENT'");
      expect(result.stderr).toContain('what the claimant furnishes is unknown');
      expect(result.stderr).toContain('FAILED');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });
});
