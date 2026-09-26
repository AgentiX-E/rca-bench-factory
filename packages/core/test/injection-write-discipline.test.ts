import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A battery that mutates a checked-in file must never expose a partial one.
 *
 * An injection battery works by writing a fault into a file that is *in the
 * repository*, running the gate against it, and restoring it. That makes the
 * file shared state between the battery and every other process that reads the
 * tree -- and a test run reads every test file at collect time, so "every other
 * process" includes the suite that is testing the battery's own subject.
 *
 * This was found the expensive way. Running this battery concurrently with
 * `pnpm test:coverage` produced one red test in `workflow-provider.test.ts`
 * asserting that `RCA_BENCH_LLM_BASE_URL` came from `vars.` -- which it does, in
 * every revision of the file that was ever committed. The battery wrote the
 * workflow with `Path.write_text` at three sites, so a concurrent reader could
 * observe the injected revision. Reproduced with a polling reader: **11 distinct
 * file states were observed in a single battery run, four of them zero bytes**,
 * because `write_text` truncates before it writes.
 *
 * That last detail is what makes this a defect rather than untidiness. Reading a
 * wrong revision yields a *misleading failure*, which costs an investigation.
 * Reading an empty file yields a `SyntaxError` or a schema failure that points
 * nowhere at all, and the file is not empty on disk, so re-reading it "proves"
 * the failure was spurious. A reader would have to suspect a race it has no
 * evidence for.
 *
 * ## What is asserted, and why these assertions can fail
 *
 * Not "the battery restores the file" -- it always did, and that is not the
 * property. The property is **every write replaces the destination atomically**,
 * so a concurrent reader sees one revision or the other and never a mixture.
 *
 * The test is written against the *source* of the battery rather than by racing
 * it, for two reasons. A race-based test is probabilistic: it would pass on the
 * broken version whenever the reader happened not to land inside the window, and
 * a test that fails one run in ten is worse than no test. And a source assertion
 * states the rule the next author has to follow, which is the thing being fixed.
 *
 * The check is mechanical: every `write_text` call on the workflow path is
 * located, and each must be routed through the helper. A new direct call is a
 * new hole, so the test counts them rather than looking for one.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BATTERY = resolve(ROOT, 'scripts', 'injection', 'fault-extraction-workflow.py');
const SOURCE = readFileSync(BATTERY, 'utf8');
function stripCommentsAndStrings(source: string): string {
  /**
   * Remove Python comments and string literals, leaving executable code.
   *
   * A gate that scans the whole file cannot tell "this call is made" from "this
   * call is explained". Both matter, and only the first is the defect: this file
   * documents *why* `write_text` and `copyfile` are not used, so a whole-file
   * scan forbids the explanation. That is backwards -- it would push an author to
   * delete the reason the rule exists in order to satisfy the rule.
   *
   * Not a Python parser. It handles the three cases this file contains: `#`
   * comments to end of line, triple-quoted docstrings, and single-quoted strings.
   * Docstring and string delimiters are consumed before comment handling, because
   * a `#` inside either is not a comment.
   */
  const out: string[] = [];
  let i = 0;
  while (i < source.length) {
    const three = source.slice(i, i + 3);
    if (three === '"""' || three === "'''") {
      const end = source.indexOf(three, i + 3);
      i = end === -1 ? source.length : end + 3;
      continue;
    }
    const ch = source[i]!;
    if (ch === '#') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      while (j < source.length && source[j] !== quote) {
        if (source[j] === '\\') {
          j += 1;
        }
        j += 1;
      }
      i = j + 1;
      continue;
    }
    out.push(ch);
    i += 1;
  }
  return out.join('');
}

const WORKFLOW = resolve(ROOT, '.github', 'workflows', 'fault-extraction-accuracy.yml');
const CODE = stripCommentsAndStrings(SOURCE);

describe('the injection battery writes atomically', () => {
  it('routes every workflow write through the atomic helper', () => {
    // Every mutation of the file under test must go through one function, so
    // there is exactly one place that can be wrong.
    //
    // Scanned against `CODE`, not `SOURCE`: this file's own comments explain the
    // defect by naming it, and a whole-file scan matched that explanation. The
    // gate went red on prose, which would have taught an author to delete the
    // reason the rule exists.
    const directWrites = [...CODE.matchAll(/\.write_text\(/g)].length;
    expect(directWrites).toBe(0);

    // And the helper must actually be used -- zero direct writes would also be
    // satisfied by a battery that forgot to inject anything at all.
    //
    // Counted per *site* rather than as a total, because a total cannot say
    // which one went missing. Each write in the loop is required for a different
    // reason, and dropping any one of them leaves the tree dirty: the injected
    // revision, the restore between injections, and the restore that precedes
    // the negative control.
    const injections = [...CODE.matchAll(/write_atomically\(WORKFLOW, pristine\.replace\(/g)].length;
    expect(injections).toBe(1);
    // Two bare restores: one at the end of each loop iteration and one before
    // the negative control. Matched without pinning the indent, because the two
    // legal indents differ and an indent-sensitive regex would be asserting
    // formatting rather than the property.
    const bareRestores = [...CODE.matchAll(/^[ \t]*write_atomically\(WORKFLOW, pristine\)$/gm)].length;
    expect(bareRestores).toBe(2);
    // The pristine snapshot the battery writes for crash recovery.
    expect(CODE).toMatch(/write_atomically\(PRISTINE, pristine\)/);
  });

  it('replaces the destination by rename rather than truncating in place', () => {
    // The mechanism, not the name. `os.replace` on a path in the same directory
    // is what makes the swap atomic; an equivalent implementation with a
    // different name would be fine, but it must be a rename.
    expect(CODE).toMatch(/os\.replace\(/);
    // A temporary file created beside the destination -- renaming across
    // filesystems is a copy, which is not atomic and would reintroduce the hole.
    expect(CODE).toMatch(/mkstemp\(dir=str\(path\.parent\)/);
    // Durability before the rename: without the flush the rename can land while
    // the bytes are still buffered, and the reader sees an empty file again.
    expect(CODE).toMatch(/os\.fsync\(stream\.fileno\(\)\)/);
  });

  it('has no non-atomic writer left anywhere in the file', () => {
    // The first fix routed `write_text` through the helper and left
    // `shutil.copyfile(PRISTINE, WORKFLOW)` in place. Measured in isolation,
    // copyfile opens the destination with `O_TRUNC` and streams into it: two
    // zero-byte observations in 18 reads, against zero in 13 for `os.replace`.
    // So one empty-file window survived the fix, and it was found only by
    // re-running the reader probe rather than by reading the diff.
    //
    // Enumerated by name rather than by pattern, because the defect is "a
    // function that writes non-atomically is still imported or called", and
    // there is a finite list of those. Scanned against `CODE` so the two
    // functions this file documents as rejected are not read as used.
    const nonAtomic = ['copyfile', 'copyfileobj', 'copytree', 'write_text', 'write_bytes'];
    const offenders = nonAtomic.filter((name) => new RegExp(`\\b${name}\\(`).test(CODE));
    expect(offenders).toEqual([]);
    // And the import that would let `copyfile` back in. Checked on `CODE`
    // because a commented-out import is not an import.
    expect(CODE).not.toMatch(/^import shutil$/m);
  });

  it('leaves no temporary file behind in the workflows directory', () => {
    // A stray `.injection-*.tmp` in `.github/workflows/` would be picked up by
    // the workflow schema check and, worse, could be committed.
    const entries = readdirSync(resolve(ROOT, '.github', 'workflows'));
    expect(entries.filter((name) => name.startsWith('.injection-'))).toEqual([]);
  });

  it('leaves the workflow in a reviewable state when no battery is running', () => {
    // The battery's own end state, checked independently of its own report. A
    // battery that reports success while leaving a fault in the tree is the
    // worst outcome available, because the injected revision would then be
    // committed.
    //
    // ## Why this asserts against the committed revision rather than against a
    // ## digest taken a moment earlier
    //
    // The first version of this test hashed the file, slept, re-read it and
    // required the two digests to match. That test cannot hold while the battery
    // is running, and it failed for exactly that reason: it was asserting that
    // the file does not change *during this test*, which is a claim about
    // scheduling rather than about the repository.
    //
    // What matters is narrower and checkable at any time: no *injected* revision
    // has been left behind. Uncommitted work is expected -- the tree is where
    // work happens -- so the check is not "matches HEAD". It is that the file
    // still has the shape the gate test asserts, which is the strongest
    // statement available without racing the battery.
    const onDisk = readFileSync(WORKFLOW, 'utf8');
    expect(onDisk).toMatch(/^name: Fault extraction accuracy$/m);
    // The provider is forwarded from the resolution step, not hard-coded. An
    // injected tree would have the literal here.
    expect(onDisk).toMatch(/RCA_BENCH_LLM_PROVIDER:\s*\$\{\{\s*steps\.provider\.outputs\.provider\s*\}\}/);
    // The invented secret name never appears as a secret *reference*. The
    // header comment may name it -- and does, to explain the history -- so the
    // assertion is scoped to the `${{ secrets.NAME }}` form rather than to the
    // bare string. Asserting the bare string would forbid documenting the
    // defect, which is the opposite of what the repository wants.
    expect(onDisk).not.toMatch(/\$\{\{\s*secrets\.RCA_BENCH_LLM_API_KEY\s*\}\}/);
    // The endpoint is an operator variable, not a vendor URL.
    expect(onDisk).toMatch(/RCA_BENCH_LLM_BASE_URL:\s*\$\{\{\s*vars\./);
    expect(onDisk).not.toMatch(/https:\/\/api\.deepseek\.com/);
    // And the masking line survives, because its removal is one of the nine
    // injections.
    expect(onDisk).toMatch(/::add-mask::\$\{selected\}/);
  });
});

describe('the atomic helper is correct on its own', () => {
  /**
   * The helper is exercised directly, because "the battery passes" does not
   * prove "the swap is atomic" -- it proves the battery is self-consistent.
   */
  const helper = (): string => {
    // Extract the helper body so it can be run against a scratch directory.
    // A regex over Python is not a parser, so the extraction is asserted to have
    // found something rather than silently yielding an empty program.
    const start = SOURCE.indexOf('def write_atomically(');
    expect(start).toBeGreaterThan(-1);
    const end = SOURCE.indexOf('\ndef ', start + 1);
    const body = SOURCE.slice(start, end === -1 ? undefined : end);
    expect(body).toMatch(/def write_atomically\(/);
    return body;
  };

  it('replaces content and removes its temporary file', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'injection-atomic-'));
    try {
      const target = resolve(dir, 'subject.yml');
      writeFileSync(target, 'original\n');
      const program = [
        'import os, tempfile',
        'from pathlib import Path',
        helper(),
        `path = Path(${JSON.stringify(target)})`,
        "write_atomically(path, 'replaced\\n')",
        "assert path.read_text() == 'replaced\\n', path.read_text()",
        // No leftovers: a temporary file per write would accumulate one per
        // injection across every run.
        "leftovers = [n for n in os.listdir(path.parent) if n.startswith('.injection-')]",
        "assert leftovers == [], leftovers",
        "print('OK')",
      ].join('\n');
      const result = spawnSync('python3', ['-c', program], { encoding: 'utf8' });
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toBe('OK');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not leave a temporary file behind when the rename fails', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'injection-atomic-fail-'));
    try {
      const target = resolve(dir, 'subject.yml');
      writeFileSync(target, 'original\n');
      // A failing rename must leave the destination untouched and clean up the
      // temporary file; otherwise a crash mid-battery leaves debris in the tree.
      //
      // The failure is injected by making `os.replace` raise, because an earlier
      // version of this test wrote `os.replace = os.replace` -- a no-op. The
      // write then succeeded, the destination was overwritten, and the test
      // failed on its own assertion rather than on the property. Patching the
      // call to raise is what actually exercises the cleanup path.
      const program = [
        'import os, tempfile',
        'from pathlib import Path',
        helper(),
        `path = Path(${JSON.stringify(target)})`,
        'real_replace = os.replace',
        'def boom(src, dst):',
        "    raise OSError('simulated rename failure')",
        'os.replace = boom',
        'try:',
        "    write_atomically(path, 'replacement\\n')",
        'except OSError:',
        '    pass',
        'finally:',
        '    os.replace = real_replace',
        // The destination is whatever it was: the rename never happened.
        "assert path.read_text() == 'original\\n', path.read_text()",
        // And the temporary file was removed rather than left in the directory.
        "leftovers = [n for n in os.listdir(path.parent) if n.startswith('.injection-')]",
        "assert leftovers == [], leftovers",
        "print('OK')",
      ].join('\n');
      const result = spawnSync('python3', ['-c', program], { encoding: 'utf8' });
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toBe('OK');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('strips prose without stripping code', () => {
    // The stripper is new logic and a gate built on it is only as good as it is.
    // Over-stripping is the dangerous direction: it would remove a real call and
    // the gate would then pass on a file that has the defect. Under-stripping
    // gives a false red, which is merely annoying. Both are asserted.
    //
    // Exercised through the real source rather than through a fixture, because
    // the fixture would be written by the same author as the stripper and would
    // encode the same misunderstanding.
    expect(CODE).toMatch(/def write_atomically/);
    expect(CODE).toMatch(/os\.replace\(temp_name, path\)/);
    expect(CODE).toMatch(/WORKFLOW = REPO/);
    // The docstring that names the rejected writers is gone from the code view,
    // which is the whole point: presence in prose is not usage.
    expect(SOURCE).toMatch(/copyfile/);
    expect(CODE).not.toMatch(/copyfile/);
    // Comments are gone too, including the ones that explain the fix.
    expect(CODE).not.toMatch(/O_TRUNC/);
    // A `#` inside a string is not a comment -- a naive line-based stripper
    // would cut the rest of this line and hide a real call on it.
    const sample = 'x = os.replace("# not a comment")\ny = 1\n';
    const stripped = stripCommentsAndStrings(sample);
    expect(stripped).toMatch(/os\.replace/);
    expect(stripped).toMatch(/y = 1/);
    // And a string containing a quote does not terminate the string early.
    expect(stripCommentsAndStrings('a = "it\'s fine"\nb = 2\n')).toMatch(/b = 2/);
  });

  it('is present and syntactically valid as a script', () => {
    // The battery is a deliverable that is run by hand; a syntax error would be
    // discovered at the worst moment. `py_compile` checks it without running it.
    const result = spawnSync('python3', ['-m', 'py_compile', BATTERY], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    // Compiling writes a __pycache__ directory for a script outside a package.
    const cache = resolve(ROOT, 'scripts', 'injection', '__pycache__');
    if (existsSync(cache)) {
      rmSync(cache, { recursive: true, force: true });
    }
  });
});
