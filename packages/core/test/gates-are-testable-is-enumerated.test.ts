import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The audit that empties every gate has to be auditable too.
 *
 * ## What it is, and what the tracking row said about it
 *
 * `scripts/verify-gates-are-testable.mjs` inserts `process.exit(0)` into each
 * `scripts/check-*.mjs`, runs the test files that name it, and fails if any gate
 * survives or is named by nothing. It exists because the tracking row for P1-6
 * read "partially complete (3 of 8 gates)" for several rounds while the criterion
 * -- *a gate with no test is neither a threshold nor an enumeration* -- was
 * measured and already held for all thirteen. That count was of a **mechanism**
 * (gates carrying a dedicated block in `gates-are-testable.test.ts`), not of the
 * property, which is the shape this audit has now recorded at least five times.
 *
 * ## Why it is not run here
 *
 * The audit mutates tracked files and runs other test files. Running it inside
 * this suite would put a hollowed gate under concurrent readers -- the hazard
 * finding 145 was about, where a gate rebuilt the tree beneath its own tests --
 * and it would nest vitest inside vitest. So the behaviour is asserted against a
 * **sandbox** instead: a throwaway tree with one gate, one test that names it, and
 * a stub `npx` whose exit status and output decide the audit's verdict. The real
 * tree is never touched, and the two controls below are the audit's own verdict
 * logic running for real.
 *
 * CI runs the audit against the shipped tree, which is where the tree-wide claim
 * is established; this file establishes that the verdict discriminates.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const AUDIT = 'verify-gates-are-testable.mjs';
const AUDIT_SOURCE = readFileSync(resolve(ROOT, 'scripts', AUDIT), 'utf8');

/**
 * The script this file drives.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * what the spawn calls actually reach, and reports a disagreement in either
 * direction. The declaration is needed because the spawn below is handed a path
 * built at runtime -- a copy inside a sandbox -- so the script's name cannot be
 * inferred from the call's own argument list. The rule caught its absence here on
 * the first run, which is what the rule is for.
 */
const DRIVES = ['scripts/verify-gates-are-testable.mjs'];

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-gate-audit-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * A throwaway tree holding the audit, one gate, and a test that names it.
 *
 * `stub` is what the audit's `npx` resolves to: a shell script that decides
 * whether the audit observes a failure. That is the whole experiment -- the audit
 * shells out for its evidence, so controlling the shell is controlling the
 * evidence.
 */
function sandbox(stub: { body: string; status: number }, withGate = true): string {
  counter += 1;
  const tree = join(scratch, `tree-${counter}`);
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'packages', 'core', 'test'), { recursive: true });
  mkdirSync(join(tree, 'bin'), { recursive: true });
  copyFileSync(resolve(ROOT, 'scripts', AUDIT), join(tree, 'scripts', AUDIT));
  // A gate whose filename this test controls, so the audit's directory scan has
  // exactly one subject and the count in its report is a fact about the sandbox.
  // `withGate: false` is the vacuity case: a tree with no gate at all.
  if (withGate) {
    writeFileSync(join(tree, 'scripts', 'check-throwaway.mjs'), 'process.exit(1);\n');
    writeFileSync(
      join(tree, 'packages', 'core', 'test', 'probe.test.ts'),
      "// names scripts/check-throwaway.mjs so the audit has a subject to run\n",
    );
  }
  const npx = join(tree, 'bin', 'npx');
  writeFileSync(npx, `#!/bin/sh\n${stub.body}\nexit ${stub.status}\n`);
  chmodSync(npx, 0o755);
  return tree;
}

function audit(tree: string): Outcome {
  const result = spawnSync(process.execPath, [join(tree, 'scripts', AUDIT)], {
    encoding: 'utf8',
    cwd: tree,
    env: { ...process.env, PATH: `${join(tree, 'bin')}:${process.env.PATH ?? ''}` },
    timeout: 120_000,
  });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('scripts/verify-gates-are-testable.mjs · the audit of the audits', () => {
  it('takes its subjects from the directory rather than from a list', () => {
    // The rule the register in `scripts-are-classified.test.ts` states for itself:
    // a list that must be updated when a file is added is a check that cannot see
    // the file it is missing. So the subject list is derived, and the assertion is
    // about the derivation rather than about the absence of names.
    //
    // The first version of this test asserted that no gate filename appeared in
    // the audit at all, and it failed on `check-official.mjs` -- which the audit
    // *mentions in prose*, in the paragraph explaining what finding 46 found. A
    // name-absence check cannot tell a mention from a use, which is the same
    // mistake this repository has now recorded three times in its own scanners
    // (findings 127, 133, and the `cwd: sandbox` substring in 140). The property
    // is that the subjects come from `gates()`, so that is what is asserted.
    expect(AUDIT_SOURCE).toMatch(/function gates\(\)[\s\S]*?readdirSync/);
    expect(AUDIT_SOURCE).toContain("startsWith('check-')");
    expect(AUDIT_SOURCE).toContain("endsWith('.mjs')");
    // And the derived list is what the loop is handed, so the scan and the loop
    // cannot disagree about their subject.
    expect(AUDIT_SOURCE).toContain('const subjects = gates();');
    expect(AUDIT_SOURCE).toContain('for (const gate of subjects)');
  });

  it('refuses a run whose subject list came back empty', () => {
    // A vacuity guard, proved rather than read. An audit that found no gates would
    // print a tidy summary and exit 0 while measuring nothing, which is the defect
    // this script exists to find; the sandbox below holds no gate at all.
    const outcome = audit(sandbox({ body: 'true', status: 0 }, false));
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('no `check-*.mjs` gate was found');
    expect(outcome.stdout.trim()).toBe('');
  });

  it('reads a failure the runner coloured, which is the only shape CI produces', () => {
    // **The defect this file was written after.** The audit looked for a line whose
    // first non-space character is `×`; it passed here and on CI reported
    // `caught: 0, survived: 13`, because a runner colourises and the line is
    // `\x1b[31m×\x1b[39m …`. That is the same defect class the audit exists to
    // find, in the audit, and the fourth time this campaign has recorded it.
    //
    // The escapes below are written as printf octal rather than as literal bytes so
    // the stub is readable; what matters is that an escape precedes the marker.
    const outcome = audit(sandbox({ body: "printf '\\033[31m\\303\\227\\033[39m void\\n'", status: 1 }));
    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('CAUGHT');
    expect(outcome.stdout).toContain('gates: 1  caught: 1  survived: 0  no-test: 0  unattributed: 0');
  });

  it('refuses to credit a failure that names no failing test', () => {
    // The other half of reading the verdict honestly. `npx vitest run <files>`
    // exits non-zero when a test fails **and** when there was nothing to run -- a
    // suite that never collected, a path that does not exist, a syntax error
    // introduced by the hollowing itself. Crediting those as CAUGHT would be
    // reading a crash as a proof, so the state is named rather than assumed and
    // the run fails: an unattributable failure cannot be credited to the gate.
    const outcome = audit(sandbox({ body: "printf 'No test files found\\n'", status: 1 }));
    expect(outcome.status).toBe(1);
    expect(outcome.stdout).toContain('UNATTRIBUTED');
    expect(outcome.stderr).toContain('without naming a failing test');
  });

  it('refuses to credit a mutation it could not make parse', () => {
    // The defect the first version actually had, and it was not theoretical.
    //
    // The hollowing inserted its line after the last line beginning with `import`,
    // which for `check-official.mjs` is the opening brace of a multi-line import.
    // The mutated gate was a **syntax error**, its tests failed for that reason,
    // and the row read CAUGHT with 51 failing tests -- a crash credited as proof
    // that the gate's tests notice its removal.
    //
    // So a mutation is parsed before it is trusted, and one that does not parse is
    // reported, not credited. The sandbox gate below is invalid on its own, which
    // is the simplest way to be sure the branch is reachable; the bytes must also
    // be left exactly as they were, because there is no reason to write a mutation
    // that will not be run.
    const tree = sandbox({ body: 'true', status: 0 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const invalid = 'process.exit(0\n';
    writeFileSync(gate, invalid);

    const outcome = audit(tree);
    expect(outcome.status).toBe(1);
    expect(outcome.stdout).toContain('UNPARSABLE');
    expect(outcome.stderr).toContain('could not be hollowed into valid JavaScript');
    expect(readFileSync(gate, 'utf8')).toBe(invalid);
  });

  it('repairs a gate an earlier run was killed while holding', () => {
    // **Measured, not imagined.** A run was killed while it held
    // `scripts/check-official.mjs` hollowed, and the next `git status` showed that
    // gate modified in the working tree. Every step after that would have read a
    // gate with its verdict removed as the shipped gate -- the failure finding 142
    // repaired in three batteries and 148 in the ones nothing invoked.
    //
    // The first repair was a signal handler and it does not cover the case: during
    // `spawnSync` the event loop is blocked, so a handler cannot run until the
    // child exits, and that is exactly where the kill arrived. SIGKILL cannot be
    // handled at all. So the repair is a journal written before the mutation and
    // consumed by the next run, which covers every way a run can end.
    //
    // The journal is laid down here by hand and the gate is left hollowed, so the
    // test asserts the repair itself rather than a signal's timing.
    const tree = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const original = readFileSync(gate, 'utf8');
    const journal = join(tree, 'node_modules', '.cache', 'verify-gates-are-testable.json');
    mkdirSync(dirname(journal), { recursive: true });
    writeFileSync(journal, JSON.stringify({ path: gate, original, gate: 'check-throwaway.mjs' }));
    writeFileSync(gate, 'process.exit(0);\n');

    const outcome = audit(tree);
    expect(readFileSync(gate, 'utf8'), 'the hollowed gate was measured instead of repaired').toBe(original);
    expect(existsSync(journal), 'the journal was left behind').toBe(false);
    expect(outcome.stderr).toContain('repaired check-throwaway.mjs');
    // And the run then proceeded normally, so the repair is a sweep rather than a
    // reason to stop.
    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('CAUGHT');
  });

  it('fails rather than continuing when the journal cannot put the gate back', () => {
    // The repair is a sweep, and a sweep that cannot restore has to stop. Continuing
    // would measure a gate it knows is not the shipped one, which is the reading
    // the journal exists to prevent -- so the failure is loud and the run ends.
    //
    // Proved by making the restore a no-op: the gate is a symlink to `/dev/null`, so
    // the repair's write is discarded and the read-back cannot match. The same
    // filesystem property the in-run restore test uses, applied one step earlier.
    const tree = sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 });
    const gate = join(tree, 'scripts', 'check-throwaway.mjs');
    const original = readFileSync(gate, 'utf8');
    rmSync(gate);
    symlinkSync('/dev/null', gate);
    const journal = join(tree, 'node_modules', '.cache', 'verify-gates-are-testable.json');
    mkdirSync(dirname(journal), { recursive: true });
    writeFileSync(journal, JSON.stringify({ path: gate, original, gate: 'check-throwaway.mjs' }));

    const outcome = audit(tree);
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('could not repair check-throwaway.mjs from the journal');
    // And it did not go on to measure anything.
    expect(outcome.stdout).not.toContain('CAUGHT');
  });

  it('fails when it cannot put a gate back, rather than reporting success', () => {
    // The restore is verified by reading the file back and comparing, because a
    // battery that leaves a tracked file mutated corrupts every later step. The
    // branch is proved by making the restore a no-op: the stub replaces the gate
    // with a symlink to `/dev/null` while the audit is between its write and its
    // read-back, so the write is discarded and the comparison must fail.
    //
    // A deterministic filesystem property rather than a mock, and confined to the
    // sandbox: the audit's own message is what is asserted, so a crash for any
    // other reason cannot satisfy this test.
    const tree = sandbox({
      body: `rm -f scripts/check-throwaway.mjs && ln -s /dev/null scripts/check-throwaway.mjs`,
      status: 1,
    });
    const outcome = audit(tree);
    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain('FAILED -- could not restore check-throwaway.mjs');
  });

  it('fails when a gate survives being emptied', () => {
    // The stub exits 0 and prints no failure line, so the audit sees no test
    // going red: every gate must be reported SURVIVED and the run must fail.
    const outcome = audit(sandbox({ body: 'true', status: 0 }));
    expect(outcome.status).toBe(1);
    expect(outcome.stdout).toContain('SURVIVED');
    expect(outcome.stdout).toContain('check-throwaway.mjs');
    expect(outcome.stderr).toContain('can be emptied with no test noticing');
    expect(outcome.stdout).toContain('restored byte-for-byte: 1 of 1');
  });

  it('passes when a gate is caught, and says so (control)', () => {
    // The other direction, so the failure above cannot be satisfied by an audit
    // that fails on everything. The stub prints a vitest failure line and exits
    // non-zero, which is the observation the audit calls CAUGHT.
    const outcome = audit(sandbox({ body: "printf '\\303\\227 void\\n'", status: 1 }));
    expect(outcome.status).toBe(0);
    expect(outcome.stdout).toContain('CAUGHT');
    expect(outcome.stdout).toContain('gates: 1  caught: 1  survived: 0  no-test: 0  unattributed: 0');
    expect(outcome.stdout).toContain('OK (1 gate(s)');
  });

  it('is invoked by a package script and by a workflow, not only by hand', () => {
    // The defect finding 148 recorded at a scale of three: a battery that is
    // green when run by hand and that no job and no script names. Both halves are
    // asserted, because a package script nobody calls reproduces the same gap.
    const manifest = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const commands = Object.values(manifest.scripts ?? {});
    expect(commands.some((command) => command.includes(AUDIT))).toBe(true);

    const workflows = readdirSync(resolve(ROOT, '.github', 'workflows'));
    const runLines = workflows.flatMap((name) =>
      readFileSync(resolve(ROOT, '.github', 'workflows', name), 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('run:') || line.startsWith('- run:')),
    );
    expect(
      runLines.some((line) => line.includes(AUDIT)),
      'the audit is not reached by any workflow, so a merge is not decided by it',
    ).toBe(true);
  });
});
