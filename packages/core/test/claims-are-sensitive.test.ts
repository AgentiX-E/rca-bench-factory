import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The gate that asks whether an exemption's claim can be made false.
 *
 * Rule 9 of `gate-sites-are-proven.test.ts` requires an exempt `throw` to name the test
 * that holds its claim. That answers "is there a test"; it cannot answer "does that test
 * measure this claim", because nothing reads an assertion and decides whether it is a
 * sentence. `verify-claims-are-sensitive.mjs` answers it the only way it can be answered:
 * a mutation of the tree makes the claim false, and the named test has to go red.
 *
 * Every case here runs the shipped gate against a scratch tree. Nothing reimplements it
 * -- a fixture that agreed with a copy of the logic would prove the copy.
 *
 * ## What each fixture holds apart
 *
 * The stand-in runner reads the subject file and reports whether it still carries the
 * string the claim is about. That one decision is enough for three of the verdicts:
 * green before and red after (held), green both times (a survivor), red before (nothing
 * measured). The fourth -- a mutation that broke the subject rather than the claim -- is
 * carried by the output instead of the exit code, so a mode that prints a transform
 * failure and exits non-zero covers it.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GATE = resolve(ROOT, 'scripts', 'verify-claims-are-sensitive.mjs');

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this against the spawn calls and
 * reports a disagreement in either direction. `[GATE, ...args]` is not an argument the
 * scanner can resolve, which is why the declaration is required at all.
 */
const DRIVES = ['scripts/verify-claims-are-sensitive.mjs'];

/** How the stand-in runner answers, per fixture. */
type Mode = 'honest' | 'green' | 'red' | 'broken' | 'hang';

interface Row {
  find?: string;
  replace?: string;
  mutant?: boolean;
}

interface Fixture {
  tree: string;
  run: (args?: string[]) => ReturnType<typeof spawnSync>;
  spawn: (args?: string[]) => ReturnType<typeof spawn>;
  subject: string;
}

/**
 * A tree the gate can be pointed at: one inventory row, one subject, one runner.
 *
 * The subject is a module rather than a script so that a mutation is a string swap with
 * no syntax to get wrong -- the gate under test is the verdict, not the mutation.
 */
function fixture(rows: Row[], mode: Mode = 'honest'): Fixture {
  const tree = mkdtempSync(join(tmpdir(), 'claims-tree-'));
  mkdirSync(join(tree, 'golden-master'), { recursive: true });
  mkdirSync(join(tree, 'packages', 'core', 'test'), { recursive: true });

  writeFileSync(join(tree, 'subject.mjs'), "export const answer = 'stable';\n");
  writeFileSync(join(tree, 'packages', 'core', 'test', 'fake.test.ts'), '// a stand-in\n');
  writeFileSync(
    join(tree, 'runner.mjs'),
    [
      "import { readFileSync, writeFileSync } from 'node:fs';",
      "import { dirname, resolve } from 'node:path';",
      // The tree is found from this file's own path rather than from `import.meta`:
      // the guard in `tests-do-not-write-inside-the-package.test.ts` reads a path built
      // from `import.meta` as inside the package, and this string is a stand-in runner
      // that writes into a scratch tree. Naming it `here` and deriving it from argv keeps
      // the guard reading the truth rather than an exemption.
      'const here = dirname(process.argv[1]);',
      'const mode = process.argv[2];',
      `const subject = resolve(here, 'subject.mjs');`,
      'if (mode === "hang") {',
      // Hangs only once the mutation has landed, so the signal arrives mid-mutant
      // rather than during the baseline run.
      `  if (readFileSync(subject, 'utf8').includes("'stable'")) process.exit(0);`,
      `  writeFileSync(resolve(here, 'ready'), String(process.pid));`,
      '  setInterval(() => {}, 1000);',
      '  setTimeout(() => process.exit(3), 20000);',
      '} else if (mode === "broken") {',
      // Broken only once the mutation has landed: a runner that failed the baseline
      // too would be reported as unmeasured before the mutant was ever applied.
      `  if (readFileSync(subject, "utf8").includes("'stable'")) process.exit(0);`,
      '  console.error("SyntaxError: the subject does not parse");',
      '  process.exit(1);',
      '} else if (mode === "red") {',
      '  process.exit(1);',
      '} else if (mode === "green") {',
      '  process.exit(0);',
      '} else {',
      `  process.exit(readFileSync(subject, 'utf8').includes("'stable'") ? 0 : 1);`,
      '}',
      '',
    ].join('\n'),
  );

  const written = rows.map((row, index) => ({
    script: `scripts/fake-${String(index)}.mjs`,
    line: 1,
    disposition: 'fatal',
    status: 'exempt',
    statement: `The subject still carries the value claim ${String(index)} is about.`,
    heldBy: { file: 'packages/core/test/fake.test.ts', test: `a title ${String(index)}` },
    ...(row.mutant === false
      ? {}
      : {
          mutant: {
            file: 'subject.mjs',
            find: row.find ?? "'stable'",
            replace: row.replace ?? "'broken'",
            defect: `the subject stops carrying the value claim ${String(index)} asserts`,
          },
        }),
    reason: `No test can reach this line because the fixture never runs ${String(index)}.`,
  }));
  writeFileSync(
    join(tree, 'golden-master', 'gate-sites.json'),
    `${JSON.stringify({ rule: 'a fixture', scanned: 1, excluded: {}, throws: { counts: {}, rows: written } }, null, 2)}\n`,
  );

  const env = {
    ...process.env,
    RCA_CLAIMS_ROOT: tree,
    RCA_CLAIMS_RUNNER: `${process.execPath} ${join(tree, 'runner.mjs')} ${mode}`,
  };
  return {
    tree,
    subject: join(tree, 'subject.mjs'),
    run: (args = []) => spawnSync(process.execPath, [GATE, ...args], { encoding: 'utf8', env }),
    spawn: (args = []) => spawn(process.execPath, [GATE, ...args], { env, stdio: 'ignore' }),
  };
}

const trees: string[] = [];
function make(rows: Row[], mode: Mode = 'honest'): Fixture {
  const built = fixture(rows, mode);
  trees.push(built.tree);
  return built;
}

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

describe('verify-claims-are-sensitive · the plan', () => {
  it('names every exemption with the test that holds it and the edit that falsifies it', () => {
    // Against the shipped tree, because the claim being made is about it: six rows are
    // exempt, and the plan has to name all six rather than the ones the script happened
    // to understand. A plan that dropped a row would leave that claim unmeasured while
    // the run reported itself complete.
    const result = spawnSync(process.execPath, [GATE, '--list'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    const inventory = JSON.parse(readFileSync(resolve(ROOT, 'golden-master', 'gate-sites.json'), 'utf8'));
    const exempt = (inventory.throws.rows as { status?: string; heldBy?: { test: string } }[]).filter(
      (row) => row.status === 'exempt',
    );
    expect(exempt.length).toBeGreaterThan(0);
    for (const row of exempt) {
      expect(result.stdout, `${row.heldBy?.test ?? '?'} is exempt and missing from the plan`).toContain(
        row.heldBy?.test ?? '?',
      );
    }
    expect(result.stdout.trim().split('\n')).toHaveLength(exempt.length);
  });
});

describe('verify-claims-are-sensitive · the verdicts', () => {
  it('passes when the test goes red on the mutation the inventory names', () => {
    // The negative control, and the reason the rest of this block can be read: the
    // fixture's runner answers honestly, so the baseline is green, the mutated subject
    // is red, and the claim is held.
    const built = make([{}]);
    const result = built.run();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('1 claim(s), 2 run(s)');
    expect(result.stdout).toContain('1 on an assertion'.replace('an assertion', "the code's own guard"));
    // The tree is what it was: the mutation was written back, and the gate says so by
    // leaving nothing behind. Measured, because a battery that leaves a file mutated
    // corrupts every later step rather than failing.
    expect(readFileSync(built.subject, 'utf8')).toBe("export const answer = 'stable';\n");
  });

  it('fails when the test passes with the claim made false', () => {
    // The defect the gate exists to find: a title the inventory names, a test that does
    // not measure the sentence beside it. Its summary quotes the edit, because "survived"
    // without the mutation is an accusation a reader cannot check.
    const built = make([{}], 'green');
    const result = built.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('these claims nothing in the code can falsify');
    expect(result.stderr).toContain('in subject.mjs');
  });

  it('fails when the claimant is red before any mutation', () => {
    // A test that is already failing would be credited with catching every mutant. The
    // verdict is "unmeasured", not "held", which is the distinction finding 359 is about.
    const built = make([{}], 'red');
    const result = built.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not pass on its own');
  });

  it('reports a mutation that broke the subject as unmeasured rather than as caught', () => {
    // The oldest defect shape in this repository: a mutation that does not parse fails
    // every suite for a reason about the mutation, and crediting that red as proof would
    // make the gate unable to fail. The failure text decides, not the exit code.
    const built = make([{}], 'broken');
    const result = built.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('does not load');
    expect(result.stderr).toContain('SyntaxError');
  });

  it('fails when the mutant text has drifted out of the tree', () => {
    // A `find` that no longer occurs is a stale index, and a run that skipped the row
    // would report the claim as measured on the strength of an edit it never made.
    const built = make([{ find: 'this text is not in the subject' }]);
    const result = built.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('occurs 0 time(s)');
  });

  it('fails when the inventory carries an exemption with no mutant', () => {
    // The state every exemption shipped in through v3.50: a claim, a test, and nothing
    // that could make the claim false.
    const built = make([{ mutant: false }]);
    const result = built.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is exempt without a mutation');
  });
});

describe('verify-claims-are-sensitive · the refusals', () => {
  it('refuses an argument it does not know', () => {
    const result = spawnSync(process.execPath, [GATE, '--everything'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown argument '--everything'");
  });

  it('refuses an inventory it cannot read', () => {
    const built = make([{}]);
    const result = spawnSync(process.execPath, [GATE, '--list'], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CLAIMS_ROOT: built.tree, RCA_CLAIMS_INVENTORY: 'golden-master/absent.json' },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot read');
  });

  it('refuses an inventory whose exemptions are empty, rather than passing while measuring nothing', () => {
    // The shape that would pass forever: no exemptions, so nothing to falsify, and a
    // summary line that reads like a clean bill of health.
    const built = make([]);
    const result = built.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('holds no exempt throw');
  });
});

describe('verify-claims-are-sensitive · the tree', () => {
  it('restores the file when it is signalled in the middle of a mutant', async () => {
    // Finding 173's shape: a killed run that leaves a tracked file mutated. The handler
    // restores what is pending, and this is the case that proves it rather than the case
    // that reads the handler and believes it.
    const built = make([{}], 'hang');
    const child = built.spawn();
    const ready = join(built.tree, 'ready');
    const deadline = Date.now() + 20_000;
    while (!existsSync(ready) && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 50));
    }
    expect(existsSync(ready), 'the runner never started, so the signal reached nothing').toBe(true);
    // The mutant is in the tree at this moment -- that is what "mid-mutant" means, and
    // it is asserted rather than assumed, or the restore below would prove nothing.
    expect(readFileSync(built.subject, 'utf8')).toBe("export const answer = 'broken';\n");

    child.kill('SIGTERM');
    const code = await new Promise((done) => child.on('close', (signal) => done(signal)));
    expect(code).toBe(143);
    expect(readFileSync(built.subject, 'utf8')).toBe("export const answer = 'stable';\n");
    // The stand-in runner is not the gate's child to kill, and it outlives its parent by
    // design; the pid it wrote is the handle, so the fixture does not leak a process.
    const pid = Number(readFileSync(ready, 'utf8'));
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone, which is the other acceptable outcome.
    }
  });

  it('refuses to measure a file the repository says has uncommitted changes', () => {
    // The precondition that makes the restore provable: a run cannot start on a file
    // somebody else has edited, or "the bytes before the mutation" would themselves be
    // an edit, and a restore would put back work nobody asked it to keep.
    const tree = mkdtempSync(join(tmpdir(), 'claims-git-'));
    trees.push(tree);
    mkdirSync(join(tree, 'golden-master'), { recursive: true });
    writeFileSync(join(tree, 'subject.mjs'), "export const answer = 'stable';\n");
    writeFileSync(
      join(tree, 'golden-master', 'gate-sites.json'),
      `${JSON.stringify({
        throws: {
          counts: {},
          rows: [
            {
              script: 'scripts/fake-0.mjs',
              line: 1,
              disposition: 'fatal',
              status: 'exempt',
              statement: 'The subject still carries the value this claim is about.',
              heldBy: { file: 'packages/core/test/fake.test.ts', test: 'a title' },
              mutant: {
                file: 'subject.mjs',
                find: "'stable'",
                replace: "'broken'",
                defect: 'the subject stops carrying the value the claim asserts',
              },
              reason: 'No test can reach this line because the fixture never runs it.',
            },
          ],
        },
      })}\n`,
    );
    const git = (...args: string[]): void => {
      spawnSync('git', ['-C', tree, ...args], { encoding: 'utf8' });
    };
    git('init', '--quiet');
    git('add', '--all');
    git('-c', 'user.email=a@b', '-c', 'user.name=fixture', 'commit', '--quiet', '-m', 'fixture');
    writeFileSync(join(tree, 'subject.mjs'), "export const answer = 'edited';\n");

    const result = spawnSync(process.execPath, [GATE], {
      encoding: 'utf8',
      env: { ...process.env, RCA_CLAIMS_ROOT: tree, RCA_CLAIMS_RUNNER: `${process.execPath} /dev/null` },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('uncommitted changes');
    // And the edit is still there: the run refused before writing, which is the whole
    // point of refusing.
    expect(readFileSync(join(tree, 'subject.mjs'), 'utf8')).toBe("export const answer = 'edited';\n");
  });
});
