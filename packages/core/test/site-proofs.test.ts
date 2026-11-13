import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  HOOK_SOURCE,
  blindScripts,
  claimedSites,
  claimsByFile,
  exhaustedTestBudget,
  failureSummary,
  longestTest,
  outputTail,
  hookFile,
  parseHollows,
  parseSpawns,
  parseThrows,
  parseTrace,
  governingTestBudget,
  testBudgetDeclarations,
  unprovenClaims,
} from '../../../scripts/site-proofs.mjs';

/**
 * A proof claim is a statement that a test makes an exit *fire*, and until this
 * round nothing asked whether it did.
 *
 * `gate-sites-are-proven.test.ts` has three rules that read a `provedBy` claim, and
 * each of them is satisfied by less than the claim says: rule 3 asks whether the
 * named file *mentions* the script, rule 7 whether it *executes* it at file level.
 * Neither is site level, and both are silent about the difference -- which is how
 * `scripts/check-cli-reference.mjs:51` was published as proved by a file that fires
 * only line 301, and `scripts/verify-scorer-stability.mjs:306` as proved by a file
 * that fires no site of that script at all.
 *
 * The question "did this file make this exit fire" is an experiment and not a
 * reading, and it is cheap: install a hook that records `process.exit`'s caller,
 * run the file once, read the trace. These fixtures hold the two shapes apart --
 * a claim that fired, and a claim that did not -- because a parser that reported
 * "no claims violated" for both would look exactly like a finding.
 *
 * There is a third shape, and it is the one this round was about: a file that starts
 * the gate in a child that drops `NODE_OPTIONS` runs it *out of sight*, and the exit
 * is absent for a reason that is not "the branch was not taken". The hook records
 * each child's environment so the trace can tell the two apart, and the fixtures here
 * reach that state deliberately -- a nested helper, once inheriting and once
 * scrubbing -- because an assumption about inheritance that is never exercised is a
 * sentence with a test's name on it.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GATE = resolve(ROOT, 'scripts', 'verify-site-proofs.mjs');

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this against what the spawn
 * calls actually reach and reports a disagreement in either direction. The pointer
 * into the gate is a resolved constant here rather than a literal argument, which is
 * why the declaration is needed at all -- the scanner reads spawn arguments, and
 * `[GATE, ...args]` is not one it can resolve.
 */
const DRIVES = [
  'scripts/verify-site-proofs.mjs',
];

/** A trace as the hook writes it: one `<absolute path>:<line>` per exit taken. */
const TRACE = [
  '/repo/scripts/check-cli-reference.mjs:301',
  '/repo/scripts/check-cli-reference.mjs:301',
  '/tmp/rca-bench-cliref-Ab12/tree-1/scripts/check-cli-reference.mjs:51',
  '/repo/packages/core/test/check-cli-reference.test.ts:88',
].join('\n');

describe('site-proofs · reading an exit trace', () => {
  it('keeps the site of every frame and drops the test frames', () => {
    // A test file calls `process.exit` too -- vitest's worker does, and so does a
    // fixture that gives up early. Those frames are not failure sites of a gate,
    // and counting them would make every claim look honoured.
    expect(parseTrace(TRACE)).toEqual([
      'scripts/check-cli-reference.mjs:301',
      'scripts/check-cli-reference.mjs:51',
    ]);
  });

  it('collapses repeated exits, because a file may drive one site many times', () => {
    // Eight test cases spawn the same gate and all reach its drift report. A count
    // would be a number about the fixture; the claim is about reachability.
    const once = parseTrace('/repo/scripts/a.mjs:7');
    const thrice = parseTrace(['/repo/scripts/a.mjs:7', '/repo/scripts/a.mjs:7', '/repo/scripts/a.mjs:7'].join('\n'));
    expect(once).toEqual(['scripts/a.mjs:7']);
    expect(thrice).toEqual(once);
  });

  it('ignores a trace that holds nothing it can read', () => {
    expect(parseTrace('')).toEqual([]);
    expect(parseTrace('not a path\n/somewhere/else.txt:1')).toEqual([]);
  });

  it('reads a frame whose path holds the separator the caller used', () => {
    // The hook is installed into children spawned from a scratch tree as well as
    // from this one, so the same site appears under more than one absolute prefix.
    // Both spellings are the site; the claim names the script, not the directory.
    const trace = parseTrace(
      ['/a/b/scripts/x.mjs:12', '/tmp/z/tree-3/scripts/x.mjs:12'].join('\n'),
    );
    expect(trace).toEqual(['scripts/x.mjs:12']);
  });
});

describe('site-proofs · what the inventory claims', () => {
  const inventory = {
    sites: [
      { script: 'scripts/a.mjs', line: 4, status: 'proved', provedBy: 'packages/core/test/a.test.ts' },
      { script: 'scripts/a.mjs', line: 9, status: 'proved', provedBy: 'packages/core/test/b.test.ts' },
      { script: 'scripts/b.mjs', line: 2, status: 'exempt', reason: 'a sentence long enough to pass rule 4' },
    ],
  };

  it('claims only the sites that name a proof', () => {
    expect(claimedSites(inventory)).toEqual([
      { script: 'scripts/a.mjs', line: 4, site: 'scripts/a.mjs:4', file: 'packages/core/test/a.test.ts', kind: 'exit' },
      { script: 'scripts/a.mjs', line: 9, site: 'scripts/a.mjs:9', file: 'packages/core/test/b.test.ts', kind: 'exit' },
    ]);
  });

  it('claims a proved throw of any disposition, because the fact is that the line was reached', () => {
    // The first version of this test asserted the opposite: only `fatal` was a claim,
    // on the argument that `guarded` and `rethrow` do not end a process. That argument
    // is true and it answers a question nobody asked. A row with `status: proved` says
    // a test reaches the line; the witness records the statement as it executes, so a
    // throw a caller catches is recorded too. Narrowing the claim to `fatal` left the
    // thirty-one non-fatal proved throws in the shipped inventory unmeasured while the
    // inventory called them proved -- the defect this file exists to find, one level up.
    //
    // What stays out is the row with no status: it says nothing, so there is nothing to
    // measure, and excusing it here would turn silence back into a pass.
    const withThrows = {
      ...inventory,
      throws: {
        rows: [
          { script: 'scripts/c.mjs', line: 7, disposition: 'fatal', status: 'proved', provedBy: 'packages/core/test/c.test.ts' },
          { script: 'scripts/c.mjs', line: 9, disposition: 'unguarded', status: 'proved', provedBy: 'packages/core/test/c.test.ts' },
          { script: 'scripts/c.mjs', line: 11, disposition: 'guarded', status: 'proved', provedBy: 'packages/core/test/d.test.ts' },
          { script: 'scripts/c.mjs', line: 13, disposition: 'rethrow', status: 'proved', provedBy: 'packages/core/test/d.test.ts' },
          { script: 'scripts/c.mjs', line: 15, disposition: 'fatal', status: 'exempt', reason: 'a sentence long enough to pass rule 4' },
          { script: 'scripts/c.mjs', line: 17, disposition: 'fatal' },
        ],
      },
    };
    expect(claimedSites(withThrows).filter((claim) => claim.kind === 'throw')).toEqual([
      { script: 'scripts/c.mjs', line: 7, site: 'scripts/c.mjs:7', file: 'packages/core/test/c.test.ts', kind: 'throw' },
      { script: 'scripts/c.mjs', line: 9, site: 'scripts/c.mjs:9', file: 'packages/core/test/c.test.ts', kind: 'throw' },
      { script: 'scripts/c.mjs', line: 11, site: 'scripts/c.mjs:11', file: 'packages/core/test/d.test.ts', kind: 'throw' },
      { script: 'scripts/c.mjs', line: 13, site: 'scripts/c.mjs:13', file: 'packages/core/test/d.test.ts', kind: 'throw' },
    ]);
  });

  it('accepts a throw claim honoured by reaching the line, which is narrower than ending on it', () => {
    // Three states, and this is the one the witness added: a test that imports the
    // module, calls it inside `expect(...).toThrow()`, and catches what it threw. The
    // throw never ends a process and the claim is still true, so a rule that demanded
    // the ended set would accuse every import-based proof in the tree.
    const withThrows = {
      sites: [],
      throws: {
        rows: [
          { script: 'scripts/c.mjs', line: 21, disposition: 'rethrow', status: 'proved', provedBy: 'packages/core/test/c.test.ts' },
        ],
      },
    };
    const claim = claimedSites(withThrows);
    const fired = new Map([['packages/core/test/c.test.ts', new Set<string>()]]);
    const reached = new Map([['packages/core/test/c.test.ts', new Set(['scripts/c.mjs:21'])]]);
    const armed = new Set(['packages/core/test/c.test.ts']);
    expect(unprovenClaims(claim, fired, new Map(), new Map(), reached, armed)).toEqual([]);
    // Without the reached set the same claim is a violation, which is what makes the
    // previous line a measurement rather than a message that always passes.
    expect(unprovenClaims(claim, fired, new Map(), new Map(), new Map(), armed)).toEqual([
      expect.stringContaining('never reaches this throw'),
    ]);
  });

  it('says a throw claim is unmeasured when no witness armed, rather than accusing the pointer', () => {
    // The instrument's own failure, reported as the instrument's. A run that never
    // installed the recorder has no reached set, and reading that as "the line is not
    // reached" would accuse every pointer in a tree whose loader broke.
    const withThrows = {
      sites: [],
      throws: {
        rows: [
          { script: 'scripts/c.mjs', line: 21, disposition: 'unguarded', status: 'proved', provedBy: 'packages/core/test/c.test.ts' },
        ],
      },
    };
    const fired = new Map([['packages/core/test/c.test.ts', new Set<string>()]]);
    expect(unprovenClaims(claimedSites(withThrows), fired, new Map(), new Map(), new Map(), new Set())).toEqual([
      expect.stringContaining('armed no throw witness'),
    ]);
  });

  it('does not let an exit satisfy a claim about a throw, or the reverse', () => {
    // Two facts, two sets. The hook writes them from different places, and reading one
    // as the other would let a run that merely crashed satisfy a claim about a refusal
    // the gate chose.
    //
    // The throw side now has two sets of its own rather than one: the witness records
    // every statement it reaches, and the hook records the throws that ended a process.
    // Both are needed -- the first is the wider fact and the second is the only evidence
    // there is when the witness did not arm -- so this fixture passes an armed witness
    // and puts the site only in the exit set, which must not be read across.
    const withThrows = {
      sites: [],
      throws: {
        rows: [
          { script: 'scripts/c.mjs', line: 7, disposition: 'fatal', status: 'proved', provedBy: 'packages/core/test/c.test.ts' },
        ],
      },
    };
    const claim = claimedSites(withThrows);
    const armed = new Set(['packages/core/test/c.test.ts']);
    const exited = new Map([['packages/core/test/c.test.ts', new Set(['scripts/c.mjs:7'])]]);
    expect(unprovenClaims(claim, exited, new Map(), new Map(), new Map(), armed)).toEqual([
      expect.stringContaining('never reaches this throw'),
    ]);
    const thrown = new Map([['packages/core/test/c.test.ts', new Set(['scripts/c.mjs:7'])]]);
    expect(unprovenClaims(claim, exited, new Map(), thrown, new Map(), armed)).toEqual([]);
  });

  it('reports a claim the run did not honour, and names both halves', () => {
    const fired = new Map([['packages/core/test/a.test.ts', new Set(['scripts/a.mjs:4'])]]);
    const violations = unprovenClaims(claimedSites(inventory), fired);
    expect(violations).toHaveLength(1);
    // The message has to name the site *and* the file: the repair is either "the
    // pointer is wrong" or "the test does not reach it", and a reader cannot tell
    // which without both.
    expect(violations[0]).toContain('scripts/a.mjs:9');
    expect(violations[0]).toContain('packages/core/test/b.test.ts');
  });

  it('prefers the claim over a site another file happens to fire', () => {
    // The defect this whole module exists for: `check-cli-reference.mjs:51` fires
    // in `gates-are-testable.test.ts` and the inventory names
    // `check-cli-reference.test.ts`. A run that pooled both files would call the
    // claim honoured and hide the wrong pointer, so the comparison is per file.
    const fired = new Map([
      ['packages/core/test/a.test.ts', new Set(['scripts/a.mjs:4', 'scripts/a.mjs:9'])],
      ['packages/core/test/b.test.ts', new Set(['scripts/a.mjs:4'])],
    ]);
    const violations = unprovenClaims(claimedSites(inventory), fired);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('packages/core/test/b.test.ts');
  });

  it('says a claim could not be seen rather than that it was not reached', () => {
    // The distinction the third state exists for. A child that dropped `NODE_OPTIONS`
    // ran the gate; the run simply could not observe it. Printing "never reaches this
    // exit" there would accuse a pointer that may be perfectly correct, which is the
    // same class of error as the two false claims this gate was built to find.
    const blind = new Map([['packages/core/test/b.test.ts', new Set(['scripts/a.mjs'])]]);
    const fired = new Map([
      ['packages/core/test/a.test.ts', new Set(['scripts/a.mjs:4'])],
      ['packages/core/test/b.test.ts', new Set<string>()],
    ]);
    const violations = unprovenClaims(claimedSites(inventory), fired, blind);
    const sightless = violations.filter((one) => one.includes('scripts/a.mjs:9'));
    expect(sightless).toHaveLength(1);
    expect(sightless[0]).toContain('did not carry the hook');
    expect(sightless[0]).not.toContain('never reaches');
  });

  it('keeps accusing a claim whose child was in sight and whose exit never came', () => {
    // The other half: with no blind record the sentence is unchanged, because the
    // new state must not become a blanket excuse. A run that saw the child and saw no
    // exit is evidence that the pointer or the test is wrong.
    const blind = new Map([['packages/core/test/b.test.ts', new Set(['scripts/other.mjs'])]]);
    const fired = new Map([
      ['packages/core/test/a.test.ts', new Set(['scripts/a.mjs:4'])],
      ['packages/core/test/b.test.ts', new Set(['scripts/a.mjs:4'])],
    ]);
    const violations = unprovenClaims(claimedSites(inventory), fired, blind);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('never reaches this exit');
  });
});

describe('site-proofs · what a run started, and whether it could be seen', () => {
  const MIXED = [
    'spawn traced scripts/a.mjs',
    'spawn blind scripts/b.mjs',
    'spawn blind scripts/b.mjs',
    'spawn traced scripts/c.mjs',
    'spawn blind scripts/c.mjs',
    '/repo/scripts/a.mjs:4',
  ].join('\n');

  it('counts a script started both ways as visible, because one sighted child suffices', () => {
    const spawns = parseSpawns(MIXED);
    expect(spawns.get('scripts/b.mjs')).toEqual({ traced: 0, blind: 2 });
    expect(spawns.get('scripts/c.mjs')).toEqual({ traced: 1, blind: 1 });
    expect([...blindScripts(MIXED)]).toEqual(['scripts/b.mjs']);
  });

  it('reads a spawn line and an exit line as different facts', () => {
    // A spawn record ends with a script name and an exit record with `:<line>`. A
    // parser that read `spawn blind scripts/b.mjs` as an exit would call every blind
    // child a reached site -- the original defect, inverted and harder to notice.
    expect(parseTrace(MIXED)).toEqual(['scripts/a.mjs:4']);
    expect(parseSpawns(MIXED).size).toBe(3);
  });

  it('reads a trace with no spawn record as no information, not as blind', () => {
    // Every trace written before this round looks like this, and so does one written
    // by a process that could not install the wrappers. Neither says a child was
    // invisible, so neither may be read as saying it.
    expect(parseSpawns('').size).toBe(0);
    expect(blindScripts('/repo/scripts/a.mjs:1').size).toBe(0);
    expect(blindScripts('spawn sideways scripts/a.mjs').size).toBe(0);
  });
});

describe('site-proofs · what a red run says about itself', () => {
  const REPORT = [
    '',
    ' RUN  v3.2.4 /repo/packages/core',
    '',
    'x\u00b7',
    '',
    '\u2500\u2500 Failed Tests 1 \u2500\u2500',
    '',
    ' FAIL  packages/core/test/x.test.ts > adds up',
    'AssertionError: expected 2 to be 3 // Object.is equality',
    '',
    ' \u276f x.test.ts:2:37',
    '',
    ' Test Files  1 failed (1)',
    '      Tests  1 failed | 1 passed (2)',
  ].join('\n');

  it('quotes the failing test, the error line and the totals', () => {
    // The gate used to say only "did not pass", which leaves the reader to re-run the
    // file to learn what it refused to tell them. These three lines are the ones that
    // decide the repair: which test, assertion or crash, and how much else broke.
    expect(failureSummary(REPORT)).toEqual([
      'FAIL  packages/core/test/x.test.ts > adds up',
      'AssertionError: expected 2 to be 3 // Object.is equality',
      'Tests  1 failed | 1 passed (2)',
    ]);
  });

  it('caps the report at two failing tests, because the first two locate the repair', () => {
    const many = [
      ' FAIL  a.test.ts > one',
      ' FAIL  b.test.ts > two',
      ' FAIL  c.test.ts > three',
      'Error: boom',
      '      Tests  3 failed (3)',
    ].join('\n');
    expect(failureSummary(many)).toHaveLength(4);
    expect(failureSummary(many)).not.toContain('FAIL  c.test.ts > three');
  });

  it('quotes the tail of a run whose output carries no report at all', () => {
    // The other half of the same question. A run that dies before printing a report --
    // vitest exiting non-zero with every test passing is the measured case -- has no
    // `FAIL`, no error line and no totals, and a gate that printed nothing left the
    // reader with a filename. The tail is quoted as evidence, not summarised as a
    // diagnosis, which is the distinction between this function and `failureSummary`.
    // Five lines, because three would not tell "the tail" from "the head": the first
    // mutation of this function kept the wrong end and the case stayed green.
    const died = [
      '',
      ' RUN  v3.2.4 /repo',
      'x\u00b7',
      'stdout | x.test.ts',
      'it did nothing',
      '[vitest-worker]: Timeout calling "onTaskUpdate"',
      '',
    ].join('\n');
    expect(outputTail(died)).toEqual([
      'stdout | x.test.ts',
      'it did nothing',
      '[vitest-worker]: Timeout calling "onTaskUpdate"',
    ]);
    // Three lines by default, and never a fabricated fourth: a run that printed one
    // line is quoted as one line.
    expect(outputTail('only this')).toEqual(['only this']);
    expect(outputTail('')).toEqual([]);
  });

  it('reads an exhausted test budget, and only when a test is what ran out of time', () => {
    // vitest's own sentence. It is the only line in a run that separates "this file's
    // test is wrong" from "this file did not finish", and the sites battery filed the
    // second as the first when a claimant timed out inside a shard.
    expect(exhaustedTestBudget('Test timed out in 30000ms.')).toBe(30000);
    expect(exhaustedTestBudget('  ❯ adds up\n  Test timed out in 120000ms.')).toBe(120000);
    // The other `Timeout` in this repository's output is not this one: a worker whose
    // RPC deadline expires reports every test passing and dies, and that run says
    // nothing about any test's budget. Reading it as 30,000 ms would send the reader
    // to a number the run never mentioned.
    expect(exhaustedTestBudget('[vitest-worker]: Timeout calling "onTaskUpdate"')).toBeNull();
    expect(exhaustedTestBudget(REPORT)).toBeNull();
    expect(exhaustedTestBudget('boom')).toBeNull();
    expect(exhaustedTestBudget('')).toBeNull();
  });

  it('invents nothing when the report carries none of those lines', () => {
    // A runner that dies before printing a report produces output with no `FAIL`, no
    // error line and no totals. Summarising it must yield nothing rather than a
    // sentence about a failure nobody described.
    expect(failureSummary('boom')).toEqual([]);
    expect(failureSummary('')).toEqual([]);
  });
});

describe('site-proofs · the hook records what the parser reads', () => {
  it('writes the line of the exit that was taken, and nothing else', () => {
    // The hook and the parser are one contract written in two languages, so it is
    // exercised rather than described: a child is started with the hook installed,
    // it exits at a known line, and the trace is parsed back.
    const dir = mkdtempSync(join(tmpdir(), 'site-proofs-hook-'));
    try {
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      const gate = join(dir, 'scripts', 'gate.mjs');
      writeFileSync(
        gate,
        ['console.error("unhappy");', 'process.exit(1);', ''].join('\n'),
      );
      const trace = join(dir, 'trace.log');
      const result = spawnSync(process.execPath, [gate], {
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: `--require=${hookFile(dir)}`, RCA_SITE_TRACE: trace },
      });
      expect(result.status).toBe(1);
      // The hook must not change the verdict: the child still exits with its code.
      expect(parseTrace(readFileSync(trace, 'utf8'))).toEqual(['scripts/gate.mjs:2']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is inert when no trace is asked for', () => {
    // The hook is installed through `NODE_OPTIONS`, which every descendant process
    // inherits, including the suite's own workers. A hook that wrote regardless
    // would add a file write to every `process.exit` in the run.
    const dir = mkdtempSync(join(tmpdir(), 'site-proofs-inert-'));
    try {
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      const gate = join(dir, 'scripts', 'gate.mjs');
      writeFileSync(gate, 'process.exit(3);\n');
      const result = spawnSync(process.execPath, [gate], {
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: `--require=${hookFile(dir)}` },
      });
      expect(result.status).toBe(3);
      expect(result.stderr).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('survives an exit whose stack names no script, rather than refusing to exit', () => {
    // `process.exit` is called by more than the gates: a rejection handler, a
    // library's bail-out. A hook that threw on a frame it could not place would
    // convert a normal exit into a crash, and the run it was measuring would be a
    // measurement of the hook.
    const dir = mkdtempSync(join(tmpdir(), 'site-proofs-other-'));
    try {
      const trace = join(dir, 'trace.log');
      const result = spawnSync(process.execPath, ['-e', 'process.exit(4)'], {
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: `--require=${hookFile(dir)}`, RCA_SITE_TRACE: trace },
      });
      expect(result.status).toBe(4);
      // Nothing was recorded, and "nothing" may be an absent file: the hook only
      // opens the trace once it has a site to write, so a run that reaches no gate
      // leaves no file behind. Reading absence as an empty trace is the honest
      // reading -- inventing the file would be the hook writing about itself.
      expect(existsSync(trace) ? parseTrace(readFileSync(trace, 'utf8')) : []).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records a throw that ended the process, which the exit hook cannot see', () => {
    // A gate refuses two ways, and only one of them is a call. `throw` ends the process
    // with status 1 and Node prints the stack -- to a shell, the same refusal. The hook
    // above replaces `process.exit`, so it is blind to this by construction, and the
    // inventory's second half needs a different observation.
    const dir = mkdtempSync(join(tmpdir(), 'site-proofs-throw-'));
    try {
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      const gate = join(dir, 'scripts', 'gate.mjs');
      writeFileSync(gate, ['const answer = 1;', "throw new Error('the run holds no job');", ''].join('\n'));
      const trace = join(dir, 'trace.log');
      const result = spawnSync(process.execPath, [gate], {
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: `--require=${hookFile(dir)}`, RCA_SITE_TRACE: trace },
      });
      // The verdict is the gate's: still 1, and the message still reaches stderr in the
      // form the runtime would have printed it.
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('the run holds no job');
      const text = readFileSync(trace, 'utf8');
      expect(parseThrows(text)).toEqual(['scripts/gate.mjs:2']);
      // An exit trace and a throw trace are different facts, and a parser that read one
      // as the other would let a crash satisfy a claim about a refusal.
      expect(parseTrace(text)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records nothing for a throw the gate caught itself', () => {
    // A caught throw is not a refusal; it is control flow. Recording it would publish
    // every `try { ... } catch { }` in the tree as a failure site.
    const dir = mkdtempSync(join(tmpdir(), 'site-proofs-caught-'));
    try {
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      const gate = join(dir, 'scripts', 'gate.mjs');
      writeFileSync(
        gate,
        ["try { throw new Error('caught'); } catch { /* handled */ }", 'process.exit(0);', ''].join('\n'),
      );
      const trace = join(dir, 'trace.log');
      const result = spawnSync(process.execPath, [gate], {
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: `--require=${hookFile(dir)}`, RCA_SITE_TRACE: trace },
      });
      expect(result.status).toBe(0);
      const text = existsSync(trace) ? readFileSync(trace, 'utf8') : '';
      expect(parseThrows(text)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves a process that is not a gate on the runtime\'s own handling', () => {
    // The listener is installed only in the process that *is* the gate, because the
    // suite's own worker has exception handling of its own: taking it away would turn a
    // red test into a green process, which is the worst trade in this file.
    const dir = mkdtempSync(join(tmpdir(), 'site-proofs-notgate-'));
    try {
      const trace = join(dir, 'trace.log');
      const result = spawnSync(process.execPath, ['-e', "throw new Error('inner')"], {
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: `--require=${hookFile(dir)}`, RCA_SITE_TRACE: trace },
      });
      expect(result.status).toBe(1);
      // The hook's report *starts* with `Uncaught `; the runtime's own starts with the
      // line that threw (`[eval]:1` here, a path for a file). Testing for the prefix
      // rather than for the words after it is what makes this a discriminator: a first
      // version asserted `not.toContain('Uncaught Error')` and passed under the very
      // mutant it was written for, because the hook writes `Uncaught [eval]:1`.
      expect(result.stderr.startsWith('Uncaught ')).toBe(false);
      const text = existsSync(trace) ? readFileSync(trace, 'utf8') : '';
      expect(parseThrows(text)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is a program the interpreter accepts', () => {
    // The hook is a string in a module, so a typo in it is invisible until a child
    // is spawned under it -- and the failure would read as "the gate exited, so the
    // site fired". Compiling it here is the cheapest place to say it is well formed.
    const dir = mkdtempSync(join(tmpdir(), 'site-proofs-parse-'));
    try {
      const parsed = spawnSync(process.execPath, ['--check', hookFile(dir)], { encoding: 'utf8' });
      expect(parsed.stderr).toBe('');
      expect(parsed.status).toBe(0);
      expect(HOOK_SOURCE).toContain('RCA_SITE_TRACE');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * A gate one level deeper: `helper.mjs` starts `gate.mjs`, and the helper is what the
 * test starts.
 *
 * The helper decides whether to pass its environment on. That single line is the
 * whole question -- every claimant in the tree spreads `process.env` when it sets one,
 * and until this fixture the reason that mattered was a sentence in a header.
 */
function nested(dir: string): string {
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'gate.mjs'), 'process.exit(7);\n');
  writeFileSync(
    join(dir, 'scripts', 'helper.mjs'),
    [
      "import { spawnSync } from 'node:child_process';",
      "import { dirname, resolve } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      'const here = dirname(fileURLToPath(import.meta.url));',
      "const env = process.env.FIXTURE_SIGHT === 'blind' ? { PATH: process.env.PATH } : { ...process.env };",
      "const child = spawnSync(process.execPath, [resolve(here, 'gate.mjs')], { encoding: 'utf8', env });",
      'process.stdout.write(String(child.status));',
      '',
    ].join('\n'),
  );
  return join(dir, 'scripts', 'helper.mjs');
}

/** Start the helper with the hook installed, and read back what the run could see. */
function throughHelper(sight: 'traced' | 'blind'): { status: number; text: string } {
  const dir = mkdtempSync(join(tmpdir(), `site-proofs-nested-${sight}-`));
  try {
    const helper = nested(dir);
    const trace = join(dir, 'trace.log');
    const result = spawnSync(process.execPath, [helper], {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_OPTIONS: `--require=${hookFile(dir)}`,
        RCA_SITE_TRACE: trace,
        FIXTURE_SIGHT: sight,
      },
    });
    return { status: result.status ?? -1, text: existsSync(trace) ? readFileSync(trace, 'utf8') : '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('site-proofs · the mutant, which is a value and not an edit', () => {
  /** A gate with two exits, run once with one of them hollowed. */
  function withHollow(hollow: string | null, pick: 'one' | 'two'): { status: number; text: string } {
    const dir = mkdtempSync(join(tmpdir(), 'site-proofs-hollow-'));
    try {
      mkdirSync(join(dir, 'scripts'), { recursive: true });
      const gate = join(dir, 'scripts', 'gate.mjs');
      writeFileSync(
        gate,
        [
          'if (process.env.PICK === "one") {',
          '  console.error("one");',
          '  process.exit(1);',
          '}',
          'console.error("two");',
          'process.exit(2);',
          '',
        ].join('\n'),
      );
      const trace = join(dir, 'trace.log');
      const env: Record<string, string> = {
        ...process.env,
        NODE_OPTIONS: `--require=${hookFile(dir)}`,
        RCA_SITE_TRACE: trace,
        PICK: pick,
      } as Record<string, string>;
      if (hollow === null) delete env.RCA_HOLLOW_SITE;
      else env.RCA_HOLLOW_SITE = hollow;
      const result = spawnSync(process.execPath, [gate], { encoding: 'utf8', env });
      return { status: result.status ?? -1, text: existsSync(trace) ? readFileSync(trace, 'utf8') : '' };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('replaces the named exit with success, and records that it did', () => {
    // The mutant is what turns "the file reached this exit" into "the file noticed
    // this exit". The line is written before the code is replaced because a green
    // run whose mutant never arrived is not a survivor, and the reading needs both
    // facts to tell them apart.
    const seen = withHollow('scripts/gate.mjs:3', 'one');
    expect(seen.status).toBe(0);
    expect(parseTrace(seen.text)).toEqual(['scripts/gate.mjs:3']);
    expect(parseHollows(seen.text)).toEqual(['scripts/gate.mjs:3']);
  });

  it('leaves a different exit alone, so the mutant is aimed rather than global', () => {
    // The control in the other direction. A hook that hollowed whatever it was told
    // without comparing the frame would turn every failure in the child into success,
    // and every claimant would look sensitive to everything.
    const seen = withHollow('scripts/gate.mjs:6', 'one');
    expect(seen.status).toBe(1);
    expect(parseTrace(seen.text)).toEqual(['scripts/gate.mjs:3']);
    expect(parseHollows(seen.text)).toEqual([]);
  });

  it('records nothing when the site it was aimed at never fires', () => {
    // The third state, and the reason a green run is not enough: hollowing an exit
    // that this run does not reach changes nothing, and the absence of the marker is
    // what says so. Reading that as SURVIVED would accuse the witness of a defect
    // that belongs to the measurement.
    const seen = withHollow('scripts/gate.mjs:3', 'two');
    expect(seen.status).toBe(2);
    expect(parseTrace(seen.text)).toEqual(['scripts/gate.mjs:6']);
    expect(parseHollows(seen.text)).toEqual([]);
  });

  it('reads its own marker as a marker, not as an exit', () => {
    // The two lines live in one file, so the parser that reads exits has to be able
    // to ignore the other one -- the same separation `parseSpawns` already needed.
    const text = [
      '/repo/scripts/gate.mjs:3',
      'hollow scripts/gate.mjs:3',
      'spawn traced scripts/gate.mjs',
    ].join('\n');
    expect(parseTrace(text)).toEqual(['scripts/gate.mjs:3']);
    expect(parseHollows(text)).toEqual(['scripts/gate.mjs:3']);
    expect(parseHollows('/repo/scripts/gate.mjs:3\nspawn blind scripts/gate.mjs')).toEqual([]);
  });
});

describe('site-proofs · the claims grouped by the file that makes them', () => {
  it('groups, sorts by file, and keeps every claim', () => {
    // Both gates ask this question, and `--list` prints the answer: a grouping that
    // sorted one list and not the other would make two plans that cannot be compared.
    const grouped = claimsByFile([
      { site: 'scripts/b.mjs:2', script: 'scripts/b.mjs', line: 2, file: 't/z.test.ts' },
      { site: 'scripts/a.mjs:1', script: 'scripts/a.mjs', line: 1, file: 't/z.test.ts' },
      { site: 'scripts/c.mjs:3', script: 'scripts/c.mjs', line: 3, file: 't/a.test.ts' },
    ]);
    expect(grouped.map(([file]) => file)).toEqual(['t/a.test.ts', 't/z.test.ts']);
    expect(grouped[1]?.[1].map((claim) => claim.site)).toEqual(['scripts/b.mjs:2', 'scripts/a.mjs:1']);
    expect(grouped.flatMap(([, claims]) => claims)).toHaveLength(3);
  });
});

describe('site-proofs · the hook through a spawn, which was an assumption until now', () => {
  it('records an exit taken by a gate that a helper script started', () => {
    // Two levels, because one level is what every other fixture already does and the
    // claim under test is about inheritance. If this failed, every claim proved
    // through a helper would read as a wrong pointer, and the gate would be accusing
    // the tree of a defect in its own instrument.
    const seen = throughHelper('traced');
    expect(seen.status).toBe(0);
    expect(parseTrace(seen.text)).toEqual(['scripts/gate.mjs:1']);
    expect(parseSpawns(seen.text).get('scripts/gate.mjs')).toEqual({ traced: 1, blind: 0 });
  });

  it('records a child that drops the environment as blind, and records no exit for it', () => {
    // The measurement's one blind spot, which cannot be repaired from inside the
    // child -- everything the child could report through is the environment that was
    // dropped. It can be observed from the parent, and this is what that observation
    // looks like: the child ran (the helper printed its status, 7), and nothing about
    // its exit is in the trace.
    const seen = throughHelper('blind');
    expect(seen.status).toBe(0);
    expect(parseTrace(seen.text)).toEqual([]);
    expect([...blindScripts(seen.text)]).toEqual(['scripts/gate.mjs']);
  });
});

/**
 * How a fixture's claimant behaves.
 *
 * `pick` is the exit it reaches. `sight` is whether the child it starts inherits the
 * environment -- `blind` is the state the trace can only describe, not judge. `red`
 * makes the claimant's own run fail, which is a third thing again: no trace, because
 * the file never got far enough to produce one.
 */
interface FixtureOptions {
  pick: 1 | 2;
  sight?: 'traced' | 'blind';
  red?: boolean;
}

/** A repository the gate can be pointed at: an inventory, a gate, and a runner. */
function fixture(claims: { line: number; file: string }[], options: FixtureOptions = { pick: 1 }): string {
  const tree = mkdtempSync(join(tmpdir(), 'site-proofs-tree-'));
  mkdirSync(join(tree, 'golden-master'), { recursive: true });
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'packages', 'core', 'test'), { recursive: true });

  // Two exits, and the runner fires exactly one of them. The lines are read back
  // from the file rather than written down twice, because a fixture whose line
  // numbers are copied is a fixture that goes stale the first time it is edited.
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
        line: exits[claim.line === 1 ? 0 : 1],
        status: 'proved',
        provedBy: claim.file,
      })),
    }),
  );

  // One "test file" per claimant, whose whole content is the exit it *reaches* and,
  // when the fixture is about the other two states, the directive that produces them.
  // Where two claims name the same file the first one decides, because a file that
  // exits twice is a file that exits once -- the second claim is then the claim the
  // fixture is built to leave unhonoured.
  const directive = [
    `FIXTURE_PICK ${options.pick === 1 ? 'one' : 'two'}`,
    options.sight === 'blind' ? 'FIXTURE_BLIND' : '',
    options.red === true ? 'FIXTURE_RED' : '',
  ]
    .filter((one) => one !== '')
    .join(' ');
  const reached = new Map<string, number>();
  for (const claim of claims) {
    if (!reached.has(claim.file)) reached.set(claim.file, claim.line);
  }
  for (const [file] of reached) {
    writeFileSync(join(tree, file), `${directive}\n`);
  }

  // The runner is the stand-in for vitest: it reads the directive out of the "test
  // file", then either reports a failure (red), starts the gate with an environment
  // that drops the hook (blind), or starts it the way every claimant in this tree
  // does (traced).
  const runner = [
    "import { spawnSync } from 'node:child_process';",
    "import { readFileSync } from 'node:fs';",
    "import { dirname, resolve } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    'const here = dirname(fileURLToPath(import.meta.url));',
    'const file = process.argv.find((one) => one.endsWith(".test.ts"));',
    'const text = readFileSync(file, "utf8");',
    'const pick = /FIXTURE_PICK (\\w+)/.exec(text)[1];',
    'if (text.includes("FIXTURE_RED")) {',
    '  process.stdout.write(" FAIL  " + file + " > does the thing\\n");',
    '  process.stdout.write("AssertionError: expected 1 to be 2 // Object.is equality\\n");',
    '  process.stdout.write("\\n      Tests  1 failed (1)\\n");',
    '  process.exit(1);',
    '}',
    "const gate = resolve(here, 'scripts', 'fake-gate.mjs');",
    'const env = text.includes("FIXTURE_BLIND")',
    '  ? { PATH: process.env.PATH, FIXTURE_PICK: pick }',
    '  : { ...process.env, FIXTURE_PICK: pick };',
    'const child = spawnSync(process.execPath, [gate], { encoding: "utf8", env });',
    'process.stdout.write(`picked ${pick} status ${String(child.status)}\\n`);',
    'process.exit(0);',
    '',
  ].join('\n');
  writeFileSync(join(tree, 'runner.mjs'), runner);
  return tree;
}

function runGate(tree: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [GATE, ...args], {
    encoding: 'utf8',
    cwd: tree,
    env: {
      ...process.env,
      RCA_SITE_PROOFS_INVENTORY: join(tree, 'golden-master', 'gate-sites.json'),
      RCA_SITE_PROOFS_VITEST: join(tree, 'runner.mjs'),
      RCA_SITE_PROOFS_TESTS: join(tree, 'packages', 'core'),
    },
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('scripts/verify-site-proofs.mjs · the experiment, end to end', () => {
  it('passes when each claimed exit fired in the file that claimed it', () => {
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }]);
    try {
      const result = runGate(tree, []);
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('1 claim(s)');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('fails when a claim names a file that reaches the script but not the exit', () => {
    // The shipped defect in miniature: the file runs the gate, the gate exits
    // somewhere else, and the claim reads as proved.
    const tree = fixture(
      [
        { line: 1, file: 'packages/core/test/one.test.ts' },
        { line: 2, file: 'packages/core/test/one.test.ts' },
      ],
      { pick: 1 },
    );
    try {
      const result = runGate(tree, []);
      expect(result.status).toBe(1);
      const exits = readFileSync(join(tree, 'scripts', 'fake-gate.mjs'), 'utf8')
        .split('\n')
        .map((text, i) => (text.includes('process.exit') ? i + 1 : 0))
        .filter((n) => n > 0);
      // Names the site that did not fire -- the second exit -- and the file whose
      // claim it was. A message that named only the file would leave a reader
      // re-reading every exit of it.
      expect(result.stderr).toContain(`scripts/fake-gate.mjs:${String(exits[1])}`);
      expect(result.stderr).toContain('packages/core/test/one.test.ts');
      expect(result.stderr).not.toContain(`scripts/fake-gate.mjs:${String(exits[0])}`);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('says which files it will run, without running them', () => {
    // `--list` is what makes the plan reviewable before a two-minute run, and it is
    // the only form the suite can afford to drive.
    const tree = fixture(
      [
        { line: 1, file: 'packages/core/test/one.test.ts' },
        { line: 2, file: 'packages/core/test/two.test.ts' },
      ],
      { pick: 1 },
    );
    try {
      const result = runGate(tree, ['--list']);
      expect(result.status).toBe(0);
      expect(result.stdout.split('\n').filter((l) => l.includes('.mjs:'))).toHaveLength(2);
      expect(result.stdout).toContain('test/two.test.ts');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('refuses an argument it does not understand, rather than measuring anyway', () => {
    // The gate has one flag, and a typo in a CI step would otherwise be read as
    // "run everything" -- a green run that answers a question nobody asked. The
    // usage line is printed with the refusal because the reader is a person editing
    // a workflow file.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }]);
    try {
      const result = runGate(tree, ['--fast']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unknown argument '--fast'");
      expect(result.stderr).toContain('usage:');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('refuses an inventory it cannot read instead of reporting no violations', () => {
    // The failure that would make the gate green forever: no claims, so nothing to
    // violate. It is the shape `check-cli-reference.mjs` refuses for an empty table.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }]);
    try {
      rmSync(join(tree, 'golden-master', 'gate-sites.json'));
      const result = runGate(tree, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('gate-sites.json');
      expect(result.stderr).toContain('cannot');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('refuses an inventory with no proved site, which would pass while measuring nothing', () => {
    const tree = fixture([]);
    try {
      const result = runGate(tree, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('no proved site');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('reports a file that could not be run rather than counting it as honoured', () => {
    // A runner that fails to start produces no trace, and "no trace" is exactly
    // what a claim that did not fire looks like. The two are separated so that a
    // broken runner is not read as two wrong claims.
    const tree = fixture([{ line: 1, file: 'packages/core/test/absent.test.ts' }]);
    try {
      rmSync(join(tree, 'packages/core/test/absent.test.ts'));
      const result = runGate(tree, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('absent.test.ts');
      expect(result.stderr).toMatch(/missing|no such file|does not exist/i);
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('says a claim could not be seen when the claimant starts the gate out of sight', () => {
    // The third state, end to end. The child ran; the run could not observe it. The
    // gate must not print the accusation it prints for a wrong pointer, because the
    // repair is different -- and re-pointing the claim would not make the exit appear.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      pick: 1,
      sight: 'blind',
    });
    try {
      const result = runGate(tree, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('did not carry the hook');
      expect(result.stderr).not.toContain('never reaches this exit');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });

  it('quotes a red claimant instead of only saying its claims are unmeasured', () => {
    // A file whose own tests fail cannot be evidence about anybody's proof, and
    // "unmeasured" was all this gate said about it. What it can also say -- because
    // the run already printed it -- is which test failed and whether it was an
    // assertion or a crash, plus the command that reproduces it.
    const tree = fixture([{ line: 1, file: 'packages/core/test/one.test.ts' }], {
      pick: 1,
      red: true,
    });
    try {
      const result = runGate(tree, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('did not pass');
      expect(result.stderr).toContain('does the thing');
      expect(result.stderr).toContain('AssertionError: expected 1 to be 2');
      expect(result.stderr).toContain('Tests  1 failed (1)');
      expect(result.stderr).toContain('run it alone:');
    } finally {
      rmSync(tree, { recursive: true, force: true });
    }
  });
});

/**
 * A budget stated by the file that is run, and a budget stated by the run that runs it.
 *
 * The battery furnishes `--testTimeout=120000`, and a file that writes
 * `describe('…', { timeout: 30_000 }, …)` keeps its own number: the flag sets the
 * *inherited* default, and an inherited default loses to a declaration. So the sentence
 * the battery published -- "budget 120000 ms per test" -- was true of the files that
 * declare nothing and false of every file that declares less, and nothing read the
 * declarations to say which was which.
 *
 * These fixtures hold the two halves apart. A `timeout:` inside a test declaration is
 * that test's budget; a `timeout:` inside `spawnSync` is the child's, and reading the
 * second as the first would report a file as giving its tests 30 s when it gives the
 * process it starts 30 s. Both appear in this tree, often in one file.
 */
describe('site-proofs · the longest test a report names', () => {
  /** The shape vitest's json reporter writes, cut to the three fields this reader uses. */
  const report = (tests: { name: string; duration: unknown }[]): string =>
    JSON.stringify({
      numTotalTests: tests.length,
      testResults: [{ assertionResults: tests.map((one) => ({ fullName: one.name, duration: one.duration })) }],
    });

  it('picks the longest test across every suite in the report', () => {
    const text = JSON.stringify({
      testResults: [
        { assertionResults: [{ fullName: 'first suite > slow', duration: 981.4 }] },
        { assertionResults: [{ fullName: 'second suite > slower', duration: 2400.6 }] },
      ],
    });
    expect(longestTest(text)).toEqual({ ms: 2401, name: 'second suite > slower' });
  });

  it('keeps the test name, because the margin a reader acts on is one test', () => {
    // A duration without a name is a number a reader cannot go and look at, and the
    // repair for a margin that is too thin is almost always inside one test.
    const text = report([{ name: 'drives the gate through a pipe', duration: 12.5 }]);
    expect(longestTest(text)).toEqual({ ms: 13, name: 'drives the gate through a pipe' });
  });

  it('skips an assertion whose duration is not a number rather than reporting it', () => {
    const text = report([
      { name: 'pending, so undated', duration: undefined },
      { name: 'dated', duration: 100 },
      { name: 'a string, which is not a measurement', duration: '4000' },
    ]);
    expect(longestTest(text)).toEqual({ ms: 100, name: 'dated' });
  });

  it('returns null for a report it cannot parse, and for one with no test in it', () => {
    // The caller's sentence has a branch for this state -- "no run wrote a per-test
    // report" -- and reporting a margin of zero instead would be a measurement that
    // failed dressed as a margin that is comfortable.
    expect(longestTest('not json')).toBeNull();
    expect(longestTest('')).toBeNull();
    expect(longestTest('{}')).toBeNull();
    expect(longestTest(JSON.stringify({ testResults: [] }))).toBeNull();
    expect(longestTest(JSON.stringify({ testResults: [{ assertionResults: [] }] }))).toBeNull();
    expect(longestTest(JSON.stringify({ testResults: [{}, null] }))).toBeNull();
  });
});

describe('site-proofs · the budget a claimant declares', () => {
  it('reads a literal budget and a named one, and reports the tighter', () => {
    const source = [
      "import { describe, it } from 'vitest';",
      'const FILE_TIMEOUT_MS = 30_000;',
      "describe('a file', { timeout: FILE_TIMEOUT_MS }, () => {",
      "  it('a test', { timeout: 60_000 }, () => {});",
      '});',
    ].join('\n');
    const declared = testBudgetDeclarations(source);
    expect(declared.constants).toEqual({ FILE_TIMEOUT_MS: 30_000 });
    expect(declared.declarations).toEqual([
      { ms: 30_000, line: 3, callee: 'describe' },
      { ms: 60_000, line: 4, callee: 'it' },
    ]);
    expect(declared.tightest).toEqual({ ms: 30_000, line: 3 });
  });

  it('does not read the budget of a process the test starts', () => {
    // The shape that would make a reader wrong in the safe direction -- it would raise
    // a number that was never a test budget -- and it is in the same file as the real
    // one often enough that a filter by value would not separate them.
    const source = [
      "import { it } from 'vitest';",
      'const CHILD_MS = 30_000;',
      "it('starts a gate', { timeout: 90_000 }, () => {",
      "  spawnSync('node', ['gate.mjs'], { encoding: 'utf8', timeout: CHILD_MS });",
      '});',
    ].join('\n');
    const declared = testBudgetDeclarations(source);
    expect(declared.declarations).toEqual([{ ms: 90_000, line: 3, callee: 'it' }]);
    expect(declared.otherTimeouts).toBe(1);
    expect(declared.tightest).toEqual({ ms: 90_000, line: 3 });
  });

  it('names a budget it cannot resolve instead of reading it as absent', () => {
    // An unresolved name is the one state where the reader knows a budget exists and
    // cannot say what it is. Skipping it would publish the battery's number as the
    // file's, which is the defect this reader was written for.
    const source = ["describe('a file', { timeout: FROM_THE_ENVIRONMENT }, () => {});"].join('\n');
    const declared = testBudgetDeclarations(source);
    expect(declared.declarations).toEqual([]);
    expect(declared.unresolved).toEqual([{ name: 'FROM_THE_ENVIRONMENT', line: 1 }]);
    expect(declared.tightest).toBeNull();
  });

  it('reads a per-test budget written as the third argument', () => {
    // The older spelling, and the one vitest still accepts. A reader that only knew the
    // options object would report this file as declaring nothing.
    const source = ["it('a slow test', async () => {}, 45_000);"].join('\n');
    expect(testBudgetDeclarations(source).tightest).toEqual({ ms: 45_000, line: 1 });
  });

  it('reads a suite-wide default set through the vi API', () => {
    const source = ["vi.setConfig({ testTimeout: 15_000 });"].join('\n');
    expect(testBudgetDeclarations(source).declarations).toEqual([
      { ms: 15_000, line: 1, callee: 'vi.setConfig' },
    ]);
  });

  it('says which half of the pair governs, and when the file is the tighter one', () => {
    const declared = testBudgetDeclarations("describe('a file', { timeout: 30_000 }, () => {});");
    expect(governingTestBudget(120_000, declared)).toEqual({
      ms: 30_000,
      from: 'file',
      line: 1,
      below: true,
    });
    expect(governingTestBudget(120_000, testBudgetDeclarations('const x = 1;'))).toEqual({
      ms: 120_000,
      from: 'battery',
      line: null,
      below: false,
    });
    // A file that asks for more than the battery furnishes does not get it: the flag is
    // the default, and a default is what the declaration replaces. `below` is false and
    // the governing number is the file's, because that is what will be enforced.
    expect(governingTestBudget(120_000, testBudgetDeclarations("it('t', { timeout: 600_000 }, () => {});"))).toEqual({
      ms: 600_000,
      from: 'file',
      line: 1,
      below: false,
    });
  });
});
