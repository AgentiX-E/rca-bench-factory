import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A battery must verify the files it wrote, not the files it remembers writing.
 *
 * ## The defect this asserts against
 *
 * `scripts/injection/m1-ceiling-probe.py` selects the file under mutation with:
 *
 * ```python
 * original = probe_text if target == PROBE else golden_text
 * ```
 *
 * Any target that is not `PROBE` therefore reads the **golden fixture's text**
 * as its source, while line 261 writes the result to `target`. Only `PROBE` and
 * `GOLDEN` are ever used today, so the substitution is invisible -- the two
 * cases happen to be exactly the two paths that are handled.
 *
 * It stops being invisible the moment a third target exists, and the failure is
 * silent in the worst direction. An eleventh injection targeting
 * `docs/audit.md` was added to measure this. The battery reported:
 *
 * ```
 * CAUGHT   Z. misroute probe: target a third file, whose text is not the fixture
 * battery: 11 caught, 0 survived, 0 inert
 * sources restored: identical to backup
 * ```
 *
 * Exit 0. Green. **And `docs/audit.md` -- 8098 lines of audit -- had been
 * replaced by the golden fixture JSON and truncated to 183 lines.**
 *
 * ## Why the battery still said "restored"
 *
 * Its check names its inputs rather than deriving them:
 *
 * ```python
 * restored = PROBE.read_text() == probe_text and GOLDEN.read_text() == golden_text
 * ```
 *
 * It verifies the two paths it knows about, not the paths it wrote. This is the
 * same defect finding 92 fixed in `type-miss-probe.py` by naming four inputs --
 * fixed locally, and never generalised. Every sibling battery has the shape:
 *
 * | battery | verifies |
 * |---|---|
 * | `m1-ceiling-probe.py` | `PROBE` and `GOLDEN` |
 * | `scorer-stability-probe.py` | `DIST` |
 * | `inject-stability.mjs` | `SRC` |
 * | `inject-m1-ceiling-tests.mjs` | `TEST`, `PROBE`, `GOLDEN` |
 * | `inject-component-rule.mjs` | the entry's own file |
 *
 * A list that must be updated when a file is added is a check that cannot see
 * the file it is missing. The rule asserted here is that the set is **derived
 * from what was written**, so a new target is covered by construction.
 *
 * ## What is asserted, and what is deliberately not
 *
 * Not "the batteries restore correctly" -- running six batteries and diffing the
 * tree is a slow test that still only samples the targets that happen to exist.
 * The assertions are on the *source*, in the style of
 * `injection-write-discipline.test.ts`: the selector must read the target, and
 * the restore must be derived.
 *
 * This is a weaker test than an integration run and it is the right one, because
 * the defect is that a *future* target is unprotected. No run of today's targets
 * can demonstrate that.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Python batteries, by path, with the name of the path constant they select on. */
const PY_BATTERIES = [
  { file: 'scripts/injection/m1-ceiling-probe.py', selectorConstant: 'PROBE' },
  { file: 'scripts/injection/scorer-stability-probe.py', selectorConstant: 'DIST' },
] as const;

/** Node batteries, by path. */
const JS_BATTERIES = [
  'scripts/inject-m1-ceiling-tests.mjs',
  'scripts/inject-component-rule.mjs',
  'scripts/inject-stability.mjs',
] as const;

function read(relative: string): string {
  return readFileSync(resolve(ROOT, relative), 'utf8');
}

describe('a battery reads the file it targets', () => {
  it('does not map an unrecognised target onto a different file', () => {
    // The exact defect, stated as the shape it takes. `X if target == A else Y`
    // routes every value of `target` that is not `A` onto `Y`, so the source
    // text and the write destination disagree for every other target.
    //
    // A battery that selects on `target` with an `else` fallback is the bug,
    // whatever the fallback is called. The comparison may legitimately appear in
    // an assertion -- `target == X` asserts a routing rather than performing
    // one -- so the match requires the conditional-expression form.
    const source = read(PY_BATTERIES[0].file);
    const fallbackSelection = /=\s*\w+\s+if\s+target\s*==\s*\w+\s+else\s+\w+/;
    expect(source).not.toMatch(fallbackSelection);
  });

  it('pairs each declared target with the text it reads from that path', () => {
    // The positive form of the same rule: whatever `target` is, the bytes read
    // and the bytes written come from the same path. Asserted as "the mutation
    // reads the target variable" rather than by naming the files, because
    // naming the files is what broke.
    //
    // The write side is deliberately not pinned to `target.write_text` any
    // more. The first version of this test asserted exactly that call, and the
    // fix routed the write through a recorder -- so the test went red against
    // correct code. Pinning a call site tests the implementation; the property
    // is that the read and the write name the same variable.
    const { file } = PY_BATTERIES[0];
    const source = read(file);

    // The mutation input comes off the target path itself.
    expect(source).toMatch(/original\s*=\s*target\.read_text\(\)/);
    // And the write goes to that same variable, whether directly or through the
    // recorder that also remembers its prior bytes.
    expect(source).toMatch(/(write_recorded\(target,|target\.write_text\()/);
    // The golden fixture may still be read -- the probe needs it as *data* --
    // but it must not stand in for the target's own text.
    expect(source).not.toMatch(/original\s*=\s*\w*golden\w*_text\s*$/m);
  });
});

describe('a battery verifies every file it wrote', () => {
  it('derives the restored set from the writes rather than from a fixed list', () => {
    // Every Python battery must route its writes through one recorder, so the
    // set of files needing a restore is a *consequence* of running rather than a
    // list an author maintains.
    //
    // Asserted by requiring a recorder to exist and by requiring the restore
    // check to consult it. A battery with no recorder either restores nothing
    // (and says so) or restores a hard-coded pair (and lies).
    //
    // The recorder may be module-level (`_WRITTEN`) or local to `main`
    // (`written`); both are the same property. What is rejected is a restore
    // whose truth is a conjunction over *constants*.
    const offenders: string[] = [];
    for (const { file } of PY_BATTERIES) {
      const source = read(file);
      const hasRecorder = /_WRITTEN|_BACKUPS|_ORIGINALS|written:\s*dict\[Path/.test(source);
      // The restore consults the recorded set -- `all(... for ... in <recorder>)`.
      const derivedRestore = /all\(\s*path\.read_text\([^)]*\)\s*==\s*\w+\s*for\s+path,\s*\w+\s+in\s+/.test(
        source,
      );
      if (!hasRecorder || !derivedRestore) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('derives the restored set from the applied writes in the Node batteries', () => {
    // The same rule in the JavaScript batteries. `inject-component-rule.mjs`
    // already does the right thing -- it iterates the entries it injected -- so
    // this asserts the property that file already exhibits in order to hold the
    // others to it.
    //
    // `restored` must be computed from a collection populated during the run,
    // not from a conjunction over constant names. The distinguishing feature is
    // that the left-hand side names a variable iterated at restore time.
    const offenders: string[] = [];
    for (const file of JS_BATTERIES) {
      const source = read(file);
      const derivedRestore =
        /(every|all)\(\s*\(|for\s*\(\s*const\s*\[/.test(source) ||
        /const restored\s*=\s*\w+\.(every|length)/.test(source);
      if (!derivedRestore) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('a restore over nothing is a failure, not a success', () => {
  it('refuses to report a clean restore when nothing was recorded', () => {
    // The defect introduced while fixing the previous one, and measured.
    //
    // The first recorder-based restore was `all(path.read_text() == text for
    // path, text in _WRITTEN.items())`. Over an empty mapping that is `True`,
    // so a battery whose recording had stopped printed, in one run:
    //
    //     files written and restored: 0
    //     sources restored: identical to backup
    //
    // A vacuous pass is worse than the hard-coded pair it replaced: the pair at
    // least verified two real files. This asserts the guard is present in both
    // Python batteries, because the shape is what recurs.
    const offenders: string[] = [];
    for (const { file } of PY_BATTERIES) {
      const source = read(file);
      // A depth guard on the recorded set, before the `all(...)`.
      const guard = /if\s+not\s+\w+:\s*\n\s*return\s+False/.test(source);
      if (!guard) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('is falsifiable: the guard is exercised by the battery, not merely present', () => {
    // A guard nobody can reach is finding 95's lesson N -- an unobservable
    // branch cannot be defended. The battery's own recording is the input, so
    // the guard fires exactly when the recorder stops working. This asserts the
    // wiring rather than re-running the battery: the entry that guards it is
    // injection K, whose requirement reads the recorded set.
    const source = read(PY_BATTERIES[0].file);
    expect(source).toMatch(/K\. battery: verify a fixed pair/);
    // K's requirement must read the recorded set rather than a computed figure,
    // so a recorder that stops recording is what trips it.
    expect(source).toMatch(/lambda r: len\(_WRITTEN\) < \d+/);
  });
});

describe('a caught-by-crash injection reports the failure, not the version banner', () => {
  it('extracts the thrown message instead of the last line of stderr', () => {
    // The defect: the crash path reported `crashed[-1]`, and for every node
    // failure the last line is `Node.js vX.Y.Z`. Measured on injection J, whose
    // entire purpose is for the recoverability-partition guard to throw:
    //
    //     CAUGHT   J. probe: let the two halves disagree...
    //              (the probe failed to run: Node.js v22.13.1)
    //
    // The message it was written to produce --
    // `Error: recoverability partition does not cover the dataset: 18 + 0 != 19`
    // -- was on stderr and was discarded. The comment above that call site says a
    // mutation which breaks the script for an unrelated reason must "stay
    // visible"; taking the last line made exactly that invisible, and a guard
    // firing became indistinguishable from a typo.
    const source = read(PY_BATTERIES[0].file);

    // The last line must no longer be what is printed.
    expect(source).not.toMatch(/crashed\[-1\]/);
    // The reporter is a named helper, so the extraction rule has one home.
    expect(source).toMatch(/def crash_reason\(/);
    // And it prefers the exception line over the first line, because a node
    // stack trace opens with the file path and the message is below it.
    expect(source).toMatch(/startswith\("Error:"\)/);
  });

  it('requires the guard message from the injection that exists to fire it', () => {
    // A crash on its own is not evidence that the guard fired -- `CAUGHT` here
    // means only "the probe died". J therefore declares the text its failure must
    // carry, and the runner fails the entry as SURVIVED when the text is absent.
    // Without this, J would pass on a probe that never reached the guard.
    const source = read(PY_BATTERIES[0].file);
    expect(source).toMatch(/crash_contains/);
    expect(source).toMatch(/crash_contains is not None and crash_contains not in/);
    // The declaration itself, on J.
    expect(source).toMatch(/"recoverability partition does not cover the dataset"/);
  });
});

describe('the batteries that exist are the batteries that are checked', () => {
  it('enumerates every injection battery in the repository', () => {
    // A test that checks a hand-written list of batteries goes stale the moment
    // a battery is added -- the exact failure mode this file exists to fix, one
    // level up. So the list is compared against the directory.
    const injectionDir = resolve(ROOT, 'scripts', 'injection');
    const jsDir = resolve(ROOT, 'scripts');

    const pythonBatteries = readdirSync(injectionDir)
      .filter((name) => name.endsWith('.py'))
      .filter((name) => /probe|battery/.test(name))
      .sort();
    const jsBatteries = readdirSync(jsDir)
      .filter((name) => name.startsWith('inject-') && name.endsWith('.mjs'))
      .sort();

    // Every battery on disk must be named here or in `JS_BATTERIES`. The
    // assertion is deliberately against the directory rather than against a
    // count, so adding a battery fails this test until it is brought under the
    // rule.
    const declaredPython = PY_BATTERIES.map((b) => b.file.split('/').pop()).sort();
    const declaredJs = [...JS_BATTERIES].map((f) => f.split('/').pop()).sort();

    // Batteries that are outside this rule's subject, each named with why.
    // `gate-tests-battery.py` verifies the *gate tests* rather than a file it
    // mutates in the tree; `type-miss-probe.py` was already fixed under finding
    // 92 and verifies four inputs. Listing them is the point: an omission has to
    // be a decision, not a default.
    const exempt = ['gate-tests-battery.py', 'type-miss-probe.py'];
    const undeclared = pythonBatteries.filter(
      (name) => !declaredPython.includes(name) && !exempt.includes(name),
    );
    expect(undeclared).toEqual([]);
    expect(declaredJs).toEqual(jsBatteries);
  });
});
