import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  const directive = [
    `PICK ${options.pick ?? 'one'}`,
    options.assert === true ? 'ASSERT' : '',
    options.blind === true ? 'BLIND' : '',
    options.red === true ? 'RED' : '',
  ]
    .filter((one) => one !== '')
    .join(' ');
  const written = new Set<string>();
  for (const claim of claims) {
    if (written.has(claim.file)) continue;
    written.add(claim.file);
    writeFileSync(join(tree, claim.file), `${directive}\n`);
  }

  // The stand-in for vitest. It reads the directive, starts the gate the way every
  // claimant in this tree does -- inherited environment, one exit expected -- and
  // either checks the status or does not.
  const runner = [
    "import { spawnSync } from 'node:child_process';",
    "import { readFileSync } from 'node:fs';",
    "import { dirname, resolve } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    'const here = dirname(fileURLToPath(import.meta.url));',
    'const file = process.argv.find((one) => one.endsWith(".test.ts"));',
    'const text = readFileSync(file, "utf8");',
    'const pick = /PICK (\\w+)/.exec(text)[1];',
    'const want = pick === "one" ? 1 : 2;',
    'if (text.includes("RED")) {',
    '  process.stdout.write(" FAIL  " + file + " > drives the gate\\n");',
    '  process.stdout.write("AssertionError: expected 1 to be 0 // Object.is equality\\n");',
    '  process.stdout.write("\\n      Tests  1 failed (1)\\n");',
    '  process.exit(1);',
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
      ...env,
    },
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('scripts/verify-sites-are-sensitive.mjs · the mutant, end to end', () => {
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
});

describe('scripts/verify-sites-are-sensitive.mjs · the reading it publishes', () => {
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
