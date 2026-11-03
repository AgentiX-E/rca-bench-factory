import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The refusals the inventory publishes, driven until they happen.
 *
 * ## What made this file necessary
 *
 * `golden-master/gate-sites.json` publishes 41 `throw` statements. Until v3.46 one of
 * them -- the top-level `throw` in `measure-ci-baseline.mjs` -- carried a proof, and
 * the other forty carried **nothing**: not a proof, not an exemption, not a sentence
 * saying whether any test had ever executed the line. The count is what made that
 * invisible. Forty-one reads as a measurement of the tree, and an absence of evidence
 * reads as an absence of news.
 *
 * A census over the whole suite, with a loader that records every `throw` a process
 * reaches, found **21 of the 41 reached and 20 not**. This file drives the ones that
 * can be aimed at. The ones that cannot are exempted in the inventory, each with the
 * sentence that says why -- and the sentence has to be about the line, not about this
 * file's mood.
 *
 * ## Why a subprocess rather than an import
 *
 * Because the refusal is what happens to a *process*. `probe-m1-ceiling.mjs --bogus`
 * does not throw at a caller: it prints a stack and exits 1, and that is the event a
 * shell sees. An `expect(() => parseArgs(...)).toThrow()` would be a test of the same
 * function with the verdict removed -- and `parseArgs` is not exported, which is the
 * script saying so.
 *
 * Two of the blocks below are the exception, and they are the ones whose refusal is a
 * library contract rather than a process verdict: `specById` is called by other
 * modules, so its throw is aimed at in-process.
 *
 * ## The fixtures are real files
 *
 * Every input here is a file on disk handed to the shipped command. Nothing stubs a
 * reader, a parser or a filesystem: the point of these rows is that a refusal happens
 * when a file is wrong, and a stub would only prove that the stub was wrong.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const SCRATCH = mkdtempSync(join(tmpdir(), 'rca-published-refusals-'));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));

let citationsCounter = 0;

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * One script, run to completion, with its three answers kept apart.
 *
 * `target` is either a name under `scripts/` or a path to a copy of one, which is how
 * the fixtures below hand the gate a tree whose documents are wrong. Both spellings
 * reach the same spawn, so `inferredDrives` reads them from the call sites -- that is
 * what `DRIVES` below is reconciled against by `gate-sites-are-proven.test.ts`.
 */
function run(target: string, args: string[], cwd = ROOT): Outcome {
  const path = target.includes('/') ? target : resolve(ROOT, 'scripts', target);
  const result = spawnSync(process.execPath, [path, ...args], { cwd, encoding: 'utf8' });
  if (result.error !== undefined) return { status: -1, stdout: '', stderr: result.error.message };
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** A file under the scratch directory, written and named. */
function fixture(name: string, contents: string): string {
  const path = join(SCRATCH, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  return path;
}

export const DRIVES = [
  'scripts/score-fault-extraction.mjs',
  'scripts/check-citations.mjs',
  'scripts/probe-m1-ceiling.mjs',
  'scripts/probe-type-misses.mjs',
  'scripts/measure-doc-counts.mjs',
  'scripts/serve-site.mjs',
];

describe('scripts/score-fault-extraction.mjs · the prediction envelope is checked, not skipped', () => {
  /**
   * `:92` -- `!Array.isArray(raw.predictions)`.
   *
   * The envelope check exists because the alternative is worse than a refusal: an
   * artefact that is actually a dataset reaches the scorer as zero predictions and
   * fails with a count mismatch, which is a sentence about the wrong problem. The two
   * checks above it (`:84` not an object, `:87` wrong schema) are driven by
   * `extraction-miss-diagnosis.test.ts` and by the derivation path; this is the third,
   * and it had never run.
   */
  it('refuses an artefact that has the schema and no predictions array', () => {
    const artefact = fixture(
      'predictions/no-array.json',
      `${JSON.stringify({ schema: 'rca-bench-fault-extraction-predictions/1' })}\n`,
    );
    const result = run('score-fault-extraction.mjs', ['--predictions', artefact]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("has no 'predictions' array");
  });
});

describe('scripts/check-citations.mjs · a read that fails for a reason is not a corpus that is absent', () => {
  /**
   * `:50` and `:60` -- the two `catch` blocks that rethrow anything whose `code` is not
   * `ENOENT`.
   *
   * The gate is deliberately tolerant of a missing document: the corpus is "whatever is
   * under the two doc roots", so a tree without `docs/audit.md` is a smaller corpus
   * rather than a broken one. The tolerance is exactly what makes the rethrow worth
   * having -- and worth testing, because a catch that swallows everything turns a
   * permissions error, a directory where a file should be, or a bad mount into "no
   * citations", which passes.
   *
   * The fixture is a tree whose `docs/` is wrong in the two ways the two catches
   * distinguish. `EISDIR` from reading a file that is a directory reaches `:50`;
   * `ENOTDIR` from listing a directory that is a file reaches `:60`.
   */
  function tree(mutate: (docs: string) => void): string {
    const treeDir = join(SCRATCH, `citations-${String(Math.abs(citationsCounter += 1))}`);
    mkdirSync(join(treeDir, 'scripts'), { recursive: true });
    for (const name of ['check-citations.mjs', 'audit-citations.mjs']) {
      writeFileSync(join(treeDir, 'scripts', name), readFileSync(resolve(ROOT, 'scripts', name), 'utf8'));
    }
    mkdirSync(join(treeDir, 'docs'), { recursive: true });
    writeFileSync(join(treeDir, 'docs', 'audit.md'), '# findings\n');
    writeFileSync(join(treeDir, 'docs', 'progress.md'), '# rounds\n');
    mkdirSync(join(treeDir, 'docs', 'audit'), { recursive: true });
    mkdirSync(join(treeDir, 'docs', 'progress'), { recursive: true });
    mutate(join(treeDir, 'docs'));
    return treeDir;
  }

  it('rethrows when a document is a directory rather than absent', () => {
    const treeDir = tree((docs) => {
      rmSync(join(docs, 'audit.md'));
      mkdirSync(join(docs, 'audit.md'));
    });
    const result = run(join(treeDir, 'scripts', 'check-citations.mjs'), [], treeDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EISDIR');
  });

  it('rethrows when a volume directory is a file rather than absent', () => {
    const treeDir = tree((docs) => {
      rmSync(join(docs, 'progress'), { recursive: true });
      writeFileSync(join(docs, 'progress'), 'not a directory\n');
    });
    const result = run(join(treeDir, 'scripts', 'check-citations.mjs'), [], treeDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ENOTDIR');
  });
});
describe('scripts/probe-m1-ceiling.mjs · an argument it does not know is a refusal, not a default', () => {
  /**
   * `:72` -- `throw new Error('unknown argument')`.
   *
   * The probe is run by `m1-ceiling-probe.test.ts` with `--json` and with no argument
   * at all, so the arm that refuses a *third* argument had never executed. It matters
   * for the reason every usage arm does: a probe that silently ignored `--jsno` would
   * print a human report where its caller asked for machine-readable output, and the
   * caller would read the first line of a table as JSON.
   */
  it('refuses an argument it does not know, and names it', () => {
    const result = run('probe-m1-ceiling.mjs', ['--jsno']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown argument '--jsno'");
  });
});

describe('scripts/probe-type-misses.mjs · three refusals at its edges', () => {
  /**
   * `:1228` -- an unknown argument. Same shape as the ceiling probe's, and the same
   * reason: the probe is driven by a test that passes `--json`, so nothing had ever
   * passed it something wrong.
   */
  it('refuses an argument it does not know', () => {
    const result = run('probe-type-misses.mjs', ['--bogus']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown argument '--bogus'");
  });

  /**
   * `:526` -- an unknown recorded run.
   *
   * `--run` exists because the defect it replaced was a run being *implied*: the probe
   * read one recorded run's rows while a reader assumed another's. So a run that is
   * not in the table has to stop the reading rather than fall back to the default,
   * which is what a `?? DEFAULT_RUN` would have done.
   */
  it('refuses a run name that is not recorded, and lists the ones that are', () => {
    const result = run('probe-type-misses.mjs', ['--run', 'not-a-run']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown run 'not-a-run'");
    expect(result.stderr).toContain('recorded runs are');
  });

  /**
   * `:1247` -- an input with no `misses` array.
   *
   * The message draws the distinction the whole block exists for: a raw predictions
   * file is not a scored report, and reading it here would mean reimplementing the
   * scorer. An empty classification and an unreadable input are different findings,
   * so the input is refused rather than classified as "no misses".
   */
  it('refuses a report with no misses array rather than classifying nothing', () => {
    const input = fixture('probe/no-misses.json', `${JSON.stringify({ schema: 'rca-bench-fault-extraction-predictions/1' })}\n`);
    const result = run('probe-type-misses.mjs', ['--predictions', input]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no `misses` array');
  });

  /**
   * `:570` -- the goldens carry no `samples` array.
   *
   * The guard is on a **committed** file, so the only way to reach it is a tree whose
   * copy of that file is wrong -- which is what this fixture is. It is worth reaching
   * because the alternative reading of an empty dataset is not a refusal: a corpus with
   * no samples produces a table of zeros, and a table of zeros is a figure a document
   * can quote.
   *
   * The three blocks that read this file run in sequence, and this is the first of
   * them, so `:665` and `:931` -- the same check in the two later blocks -- cannot be
   * reached while this one is in front of them. Both are exempt in the inventory, with
   * that sentence as the reason.
   */
  it('refuses a golden file that carries no samples, rather than reporting zeros', () => {
    const treeDir = join(SCRATCH, 'probe-unreadable-golden');
    mkdirSync(join(treeDir, 'scripts'), { recursive: true });
    writeFileSync(
      join(treeDir, 'scripts', 'probe-type-misses.mjs'),
      readFileSync(resolve(ROOT, 'scripts', 'probe-type-misses.mjs'), 'utf8'),
    );
    // The probe imports the built graph and reads the recorded misses out of the test
    // fixtures, so both are links to the real tree rather than copies: a copy of
    // `packages/` would need a build, and a copy of the fixtures would be a second
    // transcription of the numbers under test.
    symlinkSync(resolve(ROOT, 'packages'), join(treeDir, 'packages'), 'dir');
    symlinkSync(resolve(ROOT, 'node_modules'), join(treeDir, 'node_modules'), 'dir');
    mkdirSync(join(treeDir, 'golden-master', 'fault-extraction'), { recursive: true });
    writeFileSync(join(treeDir, 'golden-master', 'fault-extraction', 'samples.json'), '{}\n');

    const result = run(join(treeDir, 'scripts', 'probe-type-misses.mjs'), [], treeDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('carries no samples array');
  });
});

describe('scripts/format-spec.mjs · an id that names no spec', () => {
  /**
   * `:669` -- `specById` refuses an id it does not know.
   *
   * This one is aimed at in-process because the throw is a library contract: the
   * converter asks for a spec by the id a dataset names, so a dataset naming a format
   * this tree does not model has to fail at the lookup rather than produce an empty
   * field table. Nothing had ever asked for a wrong id -- the table is read from the
   * same list that names it.
   */
  it('throws for an id no spec declares, and names the id', async () => {
    const { FORMAT_SPECS, specById } = (await import('../../scripts/format-spec.mjs')) as {
      FORMAT_SPECS: { id: string }[];
      specById: (id: string) => unknown;
    };
    expect(() => specById('not-a-format')).toThrow(/unknown format id 'not-a-format'/);
    // The positive half, so that a table emptied to nothing cannot satisfy the refusal
    // above: every declared id resolves to the spec that declares it.
    for (const spec of FORMAT_SPECS) expect(specById(spec.id)).toBe(spec);
  });
});

describe('scripts/measure-doc-counts.mjs · a tree with no workspace list', () => {
  /**
   * The refusal that this round *created*, and the reason it had to exist.
   *
   * `measure-doc-counts.mjs:267` is a bare `throw error`: everything the two reading
   * paths refuse is a `MeasurementUnavailable`, printed as a diagnosis, and this line
   * re-throws whatever is left. The census that asked which published refusals any
   * test had executed reported it as never reached -- correctly, and for the wrong
   * reason: it *was* reachable, through `workspacePackages`'s `readFileSync` of
   * `pnpm-workspace.yaml`, which threw `ENOENT` into it. A tree missing that file got a
   * stack trace where every other state of the tree gets a sentence.
   *
   * So the line is now unreachable by construction: the read refuses with a diagnosis.
   * That is what this test holds -- a tree without the workspace list is answered, not
   * crashed on -- and it is why the row is exempt in the inventory rather than proved.
   */
  it('diagnoses a missing pnpm-workspace.yaml instead of printing a stack', () => {
    const treeDir = join(SCRATCH, 'counts-no-workspace');
    mkdirSync(join(treeDir, 'scripts'), { recursive: true });
    for (const name of [
      'measure-doc-counts.mjs',
      'doc-counts-rows.mjs',
      'doc-counts-vocabulary.mjs',
      'docs-corpus.mjs',
    ]) {
      writeFileSync(join(treeDir, 'scripts', name), readFileSync(resolve(ROOT, 'scripts', name), 'utf8'));
    }
    writeFileSync(join(treeDir, 'report.json'), `${JSON.stringify({ testResults: [] })}\n`);

    const result = run(join(treeDir, 'scripts', 'measure-doc-counts.mjs'), ['--from', 'report.json'], treeDir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('measure-doc-counts: FAILED');
    expect(result.stderr).toContain('pnpm-workspace.yaml');
    expect(result.stderr).not.toContain('    at ');
  });
});

describe('scripts/serve-site.mjs · a request for something that is not a file', () => {
  /**
   * `:38` -- `throw new Error('not a file')` inside the `try` whose `catch` answers 404.
   *
   * This is the row that made the four-basket partition worth having. Read as a
   * refusal it is nothing of the kind: the throw is a **goto** into the 404 arm, caught
   * by the frame that contains it, and the process keeps serving. The inventory
   * publishes it as `guarded` for exactly that reason, and a reader who mistook the
   * word "throw" for "refuses" would be reading the wrong row.
   *
   * It had never run because no test starts the server at all: `scripts-are-classified`
   * lists `serve-site.mjs` among the scripts no test names. Starting it is the only way
   * to reach the line, and the assertion is the response the browser would get.
   */
  it('answers 404 for a path that is not a file, and 200 for the page', async () => {
    const port = await freePort();
    const child = spawn(process.execPath, [resolve(ROOT, 'scripts', 'serve-site.mjs'), String(port)], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      await listening(child);
      const notAFile = await fetch(`http://127.0.0.1:${String(port)}/assets`);
      expect(notAFile.status).toBe(404);
      const page = await fetch(`http://127.0.0.1:${String(port)}/index.html`);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-type')).toContain('text/html');
      expect((await page.text()).length).toBeGreaterThan(0);
    } finally {
      child.kill('SIGTERM');
    }
  });
});

/** A port the kernel says is free, closed before the server is started on it. */
function freePort(): Promise<number> {
  return new Promise((accept, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => accept(port));
    });
  });
}

/** Resolves when the server says it is serving, or rejects with what it printed. */
function listening(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((accept, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`serve-site did not start: ${output}`)), 10_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('serving ')) {
        clearTimeout(timer);
        accept();
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`serve-site exited ${String(code)} before listening: ${output}`));
    });
  });
}
