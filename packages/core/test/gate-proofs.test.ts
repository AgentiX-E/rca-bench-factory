import { describe, expect, it } from 'vitest';
import {
  claimedProofs,
  classify,
  namesInCode,
  redFiles,
  stripAnsi,
  stripComments,
} from '../../../scripts/gate-proofs.mjs';

/**
 * Reading a hollowed run: the facts, not the verdict.
 *
 * ## Why these are canned transcripts
 *
 * The first version of this parse looked for a test path **in the `×` line**, found
 * none in any of the 42 gates, and reported `0 of 4 naming file(s)` for every one of
 * them. It was wrong in the safe direction -- nothing failed -- so it read exactly
 * like a finding: "no gate's claimed proofs go red". A run of the real thing cannot
 * tell those two apart, and that is what these fixtures are for.
 *
 * The two shapes below are the two reporters this repository meets: `default` (a
 * `❯ <file> (N tests | M failed)` header followed by `× <test>` lines) and the one
 * CI uses (`FAIL <file> > <describe> > <test>`). A parser that knew one of them
 * would be right on this machine and wrong on the runner.
 */

/** The default reporter's shape, as the nested run prints it. */
const DEFAULT_REPORTER = [
  ' RUN  v3.2.4 /repo/packages/core',
  '',
  ' ❯ test/check-no-mock.test.ts (5 tests | 2 failed) 12ms',
  '   × scans the tree 5ms',
  '   × names the file it refused 3ms',
  ' ❯ test/gate-steps.test.ts (151 tests | 1 failed) 240ms',
  '   × error: the step exited 1 8ms',
  '',
  ' Test Files  2 failed (2)',
  '      Tests  3 failed | 153 passed (156)',
].join('\n');

/** The shape `FAIL <file> > <suite> > <test>` arrives in on the runner. */
const CI_REPORTER = [
  'FAIL  packages/core/test/audit-volumes.test.ts > volumes > refuses a gap',
  'AssertionError: expected 2 to be 1',
  'FAIL  packages/core/test/tree-repair.test.ts > repair > refuses a live battery',
  'AssertionError: expected 0 to be 1',
].join('\n');

describe('which files the hollowed run actually put in the red', () => {
  it('attributes each failure to the file header above it', () => {
    // The `×` line carries the test's name and nothing else. A parser that looked
    // for a path there found nothing, which is the defect this test exists for.
    const outcome = classify(['test/a.test.ts'], { status: 1, stdout: DEFAULT_REPORTER, stderr: '' });
    expect(outcome.verdict).toBe('CAUGHT');
    expect(outcome.failures).toHaveLength(3);
    expect(outcome.red).toEqual(['test/check-no-mock.test.ts', 'test/gate-steps.test.ts']);
  });

  it('reads the runner\'s reporter too, and strips the path the inventory does not use', () => {
    const outcome = classify(['test/a.test.ts'], { status: 1, stdout: CI_REPORTER, stderr: '' });
    expect(outcome.red).toEqual(['test/audit-volumes.test.ts', 'test/tree-repair.test.ts']);
    // The nested run is given `--root packages/core`, so its paths may arrive with
    // the prefix; the inventory writes them from the repository root.
    expect(redFiles({ red: ['packages/core/test/x.test.ts'] })).toEqual(['test/x.test.ts']);
  });

  it('does not attribute a failure that no header precedes', () => {
    // The honest answer for a reporter this parser does not know: no file, rather
    // than a file guessed from the line above. A wrong attribution would make the
    // claimed-proof comparison pass or fail for the wrong reason.
    const outcome = classify(['test/a.test.ts'], { status: 1, stdout: '   × a test 5ms\n', stderr: '' });
    expect(outcome.verdict).toBe('CAUGHT');
    expect(outcome.red).toEqual([]);
  });

  it('separates the three endings, because two of them are not proofs', () => {
    expect(classify([], { status: 0, stdout: ' Tests  156 passed (156)', stderr: '' }).verdict).toBe('SURVIVED');
    const crash = classify(['test/a.test.ts'], { status: 1, stdout: 'Error: cannot find module', stderr: '' });
    expect(crash.verdict).toBe('UNATTRIBUTED');
    expect(crash.status).toBe(1);
    expect(crash.files).toEqual(['test/a.test.ts']);
  });

  it('reads through the colour a terminal would have added', () => {
    // The nested run inherits a TTY when a person starts it, so the same transcript
    // arrives with escapes. A `startsWith('×')` on the raw line would miss all of it.
    expect(stripAnsi('\u001b[31m× failed\u001b[0m')).toBe('× failed');
    const coloured = DEFAULT_REPORTER.replace(' ❯ ', ' \u001b[36m❯\u001b[0m ');
    expect(classify([], { status: 1, stdout: coloured, stderr: '' }).red).toHaveLength(2);
  });
});

describe('what the inventory claims about those files', () => {
  const inventory = {
    sites: [
      { script: 'scripts/verify-local.mjs', provedBy: 'packages/core/test/gate-steps.test.ts' },
      { script: 'scripts/verify-local.mjs', provedBy: 'packages/core/test/tree-repair.test.ts' },
      { script: 'scripts/verify-local.mjs', provedBy: 'packages/core/test/gate-steps.test.ts' },
      { script: 'scripts/verify-local.mjs', status: 'exempt', reason: 'not a failure' },
      { script: 'scripts/other.mjs', provedBy: 'packages/core/test/other.test.ts' },
    ],
  };

  it('collects the distinct files named for one gate, and only that gate', () => {
    expect(claimedProofs(inventory, 'verify-local.mjs')).toEqual([
      'packages/core/test/gate-steps.test.ts',
      'packages/core/test/tree-repair.test.ts',
    ]);
  });

  it('ignores a site with no claim, because an exemption is not a proof', () => {
    expect(claimedProofs(inventory, 'verify-local.mjs')).not.toContain(undefined);
    expect(claimedProofs(inventory, 'nothing.mjs')).toEqual([]);
  });

  it('normalises the prefix, so a claim and a reading can be compared at all', () => {
    // The two sides are written by different things -- the deriver from the
    // repository root, the reporter from `--root packages/core` -- and this is the
    // one place that has both, which is where the normalisation belongs.
    const claimed = claimedProofs(inventory, 'verify-local.mjs').map((one) => one.replace(/^packages\/core\//, ''));
    const red = redFiles({ red: ['packages/core/test/gate-steps.test.ts'] });
    expect(claimed.filter((one) => !red.includes(one))).toEqual(['test/tree-repair.test.ts']);
  });
});

/**
 * Naming a gate in code is a narrower claim than containing its name.
 *
 * The meta-gate's first denominator was `source.includes(gate)`, and it inflated every
 * ratio: `check-official.mjs` reads as `4 of 10 naming file(s)` while **nine** of the
 * ten only mention it -- a register key, a command list, and seven sentences,
 * including one in `gate-sites-are-proven.test.ts` that says "a file that mentions
 * `check-official.mjs` in a [comment]". The repository knew the distinction; the
 * number did not.
 */
describe('a comment is prose about the gate, a string is the gate being used', () => {
  const gate = 'check-no-mock.mjs';

  it('does not count a line comment', () => {
    expect(namesInCode(`// \`${gate}\` made about reporting every line.\n`, gate)).toBe(false);
  });

  it('does not count a block comment, on one line or across many', () => {
    expect(namesInCode(`/* ${gate} is not imported here */\n`, gate)).toBe(false);
    const block = ['/**', ` * ${gate} also lacks a fixture.`, ' */', 'const x = 1;'].join('\n');
    expect(namesInCode(block, gate)).toBe(false);
  });

  it('counts a string, because that is what a spawn path is', () => {
    expect(namesInCode(`spawnSync(node, [resolve(ROOT, 'scripts', '${gate}')]);\n`, gate)).toBe(true);
    expect(namesInCode(`const DRIVES = ['scripts/${gate}'];\n`, gate)).toBe(true);
  });

  it('does not truncate a line at a `//` inside a string', () => {
    // The naive stripper (`replace(/\/\/.*$/gm, '')`) deletes half of this line and,
    // with it, the only mention -- a false negative in a check whose job is to find
    // mentions. `https://` is everywhere in this tree.
    const line = `const url = 'https://example.test/${gate}';\n`;
    expect(stripComments(line)).toContain(gate);
    expect(namesInCode(line, gate)).toBe(true);
  });

  it('honours an escaped quote, so a string does not end early', () => {
    const line = `const note = 'it\\'s ${gate}'; // trailing comment\n`;
    expect(stripComments(line)).toContain(gate);
    expect(stripComments(line)).not.toContain('trailing comment');
  });

  it('keeps code that follows a comment on another line', () => {
    const source = `// a comment about ${gate}\nconst x = 'kept';\n`;
    expect(stripComments(source)).toContain("const x = 'kept';");
    expect(namesInCode(source, gate)).toBe(false);
  });
});
