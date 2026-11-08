import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { FORMAT_SPECS } from '../../../scripts/format-spec.mjs';
import { OPENRCA2_CONTRACT_VERSION } from '../src/export/openrca2.js';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement
 * in either direction: declaring one that is never spawned is as much a
 * violation as spawning one that is not declared. The declaration is needed
 * because several of these files drive a gate through a local `run(script)`
 * helper or a data table, so the script name never appears in a spawn's own
 * argument list and cannot be inferred from one.
 */
const DRIVES = [
  'scripts/gen-examples.mjs',
];


/**
 * `scripts/gen-examples.mjs` generates the site payload and the doc blocks.
 *
 * Three things it owns, and each fails differently:
 *
 *  - `site/assets/data.js`, compared byte-for-byte under `--check`;
 *  - the `<!-- example: … -->` **fenced content** in `docs/targets/*.md`,
 *    rewritten from the real export on every non-check run;
 *  - the `<!-- fields: … -->` **tables** in the same files, rendered from
 *    `format-spec.mjs`.
 *
 * The third is the one with no `--check` path at all, which the gate's own
 * comment does not say and this file asserts: a stale field table is only ever
 * corrected by a *writer* run, so a repository whose tables drifted fails
 * nothing. That is `audit.md`'s P2-4 and it is recorded here rather than
 * inferred.
 *
 * The gate is run as a subprocess against a copy in a throwaway tree. Its
 * `docs/targets/` directory is built by the fixture rather than copied from the
 * repository, because the tests below are about the **rewrite rules** -- which
 * marker matches which file, and what happens when one does not -- and a
 * fixture made of the real seven documents would make each assertion depend on
 * how those documents happen to be written today.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = 'gen-examples.mjs';
const REAL_EXAMPLES = resolve(ROOT, 'examples/order-prod');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-genex-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A throwaway tree holding the gate, the real example directory, the real
 * `format-spec.mjs`, and a `docs/targets/` the caller writes.
 *
 * `format-spec.mjs` is copied because the gate imports it *by relative path*
 * from its own directory; `packages/` and `node_modules/` are linked so the
 * gate loads the shipped build (`zod` included) rather than a stub.
 */
function treeWith(docs: Record<string, string> = {}, specEdits: Array<[string, string]> = []): string {
  counter += 1;
  const tree = join(scratch, `tree-${counter}`);
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'site', 'assets'), { recursive: true });
  mkdirSync(join(tree, 'docs', 'targets'), { recursive: true });
  writeFileSync(join(tree, 'scripts', SCRIPT), readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8'));
  // The specification is copied rather than linked so a fixture can *change* it: the two refusals
  // a specification can earn -- a modality code with no prose, a constant the package does not
  // export -- are about a specification that is wrong, and no shape of the shipped file reaches
  // them. Editing the copy is the only way to observe them; editing the real one would be editing
  // the thing under test.
  let spec = readFileSync(resolve(ROOT, 'scripts', 'format-spec.mjs'), 'utf8');
  for (const [from, to] of specEdits) {
    if (!spec.includes(from)) throw new Error(`fixture spec edit does not apply: ${from}`);
    spec = spec.replace(from, to);
  }
  writeFileSync(join(tree, 'scripts', 'format-spec.mjs'), spec);
  cpSync(REAL_EXAMPLES, join(tree, 'examples', 'order-prod'), { recursive: true });
  symlinkSync(resolve(ROOT, 'packages'), join(tree, 'packages'), 'dir');
  symlinkSync(resolve(ROOT, 'node_modules'), join(tree, 'node_modules'), 'dir');
  for (const [name, body] of Object.entries(docs)) writeFileSync(join(tree, 'docs', 'targets', name), body);
  return tree;
}

function run(tree: string, args: string[] = []): Outcome {
  const result = spawnSync(process.execPath, [join(tree, 'scripts', SCRIPT), ...args], {
    encoding: 'utf8',
    cwd: tree,
  });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** An example marker the gate will rewrite, for a file the exporters really emit. */
function exampleMarker(): string {
  return [
    '# openrca-1.0',
    '',
    '<!-- example: openrca-1.0/order-prod/query.csv -->',
    '```csv',
    'STALE,CONTENT,FROM,A,PREVIOUS,RUN',
    '```',
    '',
  ].join('\n');
}

describe('scripts/gen-examples.mjs · the payload it generates', () => {
  it('writes a data file that assigns the global the site reads', () => {
    // The precondition. The site is a dependency-free static app, so the
    // payload has to be a plain script assigning `window.RBF_DATA` -- not a
    // module, not JSON. A gate that produced ESM would pass every negative
    // below and leave the site blank.
    const tree = treeWith();
    const result = run(tree);

    expect(result.status).toBe(0);
    const data = readFileSync(join(tree, 'site', 'assets', 'data.js'), 'utf8');
    expect(data.startsWith('/* Generated by scripts/gen-examples.mjs - do not edit by hand. */')).toBe(true);
    expect(data).toContain('window.RBF_DATA = {');
    expect(data).toContain('"generatedBy": "scripts/gen-examples.mjs"');
  });

  it('covers every target the scorer declares, each with its own report', () => {
    // The payload is the site's data source. A target missing from it is a
    // format a visitor cannot inspect, and the loss would be invisible --
    // `data.js` is a valid file with one fewer key.
    const tree = treeWith();
    expect(run(tree).status).toBe(0);
    const data = readFileSync(join(tree, 'site', 'assets', 'data.js'), 'utf8');
    const payload = JSON.parse(
      data.slice(data.indexOf('window.RBF_DATA = ') + 'window.RBF_DATA = '.length).replace(/;\n$/, ''),
    ) as {
      targets: Record<string, { report: unknown; files: Record<string, string>; skipped?: unknown }>;
    };

    // Nine targets: OpenRCA 1.0/2.0, the three RCAEval suites as separate
    // targets, RCA100, AIOps2025, Cloud-OpsBench and ITBench.
    expect(Object.keys(payload.targets).sort()).toEqual([
      'aiops2025',
      'cloud-opsbench',
      'itbench',
      'openrca-1.0',
      'openrca-2.0',
      'rca100',
      'rcaeval-re1',
      'rcaeval-re2',
      'rcaeval-re3',
    ]);
    // `rcaeval-re3` is the one target that admits code-level faults only, and
    // the shipped example is a CPU-saturation case -- so its export is
    // **empty by contract**, which `check-official.mjs` also reports as its one
    // `SKIP`. The first version of this loop asserted a non-empty export for
    // all nine and failed here; the assertion below is the corrected one, and
    // the empty export is asserted as *expected* rather than tolerated.
    for (const [key, target] of Object.entries(payload.targets)) {
      expect(target.report, key).toBeTypeOf('object');
      if (key === 'rcaeval-re3') {
        expect(Object.keys(target.files).length, key).toBe(0);
        expect(target.skipped, `${key} must say why it is empty`).toBeTypeOf('object');
        continue;
      }
      // Every other target carries a real export: a target whose `files` were
      // empty would still serialise and would make the site show a format with
      // no fields.
      expect(Object.keys(target.files).length, key).toBeGreaterThan(0);
    }
  });

  it('passes --check against the file it has just written', () => {
    // The other half of the contrast for the staleness case below.
    const tree = treeWith();
    // The child's stderr is the assertion message, not a discarded field.
    //
    // This test has failed under a full suite with `expected 1 to be +0` and no
    // other information -- the run was fast (225 ms against a 387-399 ms normal)
    // so the generator exited early, and the assertion threw away the one thing
    // that would have said why. A red run that reports only an exit code sends
    // the next reader to re-derive the cause from scratch; the gate's own
    // standard elsewhere in this repository is that a diagnostic carries the
    // repair, and that applies to assertions as much as to scripts.
    const wrote = run(tree);
    expect(wrote.status, wrote.stderr).toBe(0);

    const result = run(tree, ['--check']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('examples data is up to date');
  });

  it('refuses a stale data file and names the command that fixes it', () => {
    // The guarantee that makes the committed payload meaningful. The diagnostic
    // has to carry the repair, because "is stale" alone does not say which
    // direction the drift went.
    const tree = treeWith();
    expect(run(tree).status).toBe(0);
    writeFileSync(join(tree, 'site', 'assets', 'data.js'), 'window.RBF_DATA = {"stale": true};\n');

    const result = run(tree, ['--check']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('data.js is stale');
    expect(result.stderr).toContain('pnpm examples:gen');
  });

  it('refuses --check when the data file does not exist at all', () => {
    // A separate exit with a separate sentence: a missing file is not a stale
    // one, and the operator's first action differs (`gen` versus `investigate`).
    const tree = treeWith();

    const result = run(tree, ['--check']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is missing');
    expect(result.stderr).toContain('pnpm examples:gen');
  });
});

describe('scripts/gen-examples.mjs · the doc blocks it rewrites', () => {
  it('replaces a stale example block with the real export', () => {
    // The doc-block half of the generator. The replacement is what makes a
    // documented sample unable to drift from the code that produces it, so an
    // unchanged file after a writer run is the defect.
    const tree = treeWith({ 'openrca-1.0.md': exampleMarker() });
    const result = run(tree);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('openrca-1.0.md');

    const after = readFileSync(join(tree, 'docs', 'targets', 'openrca-1.0.md'), 'utf8');
    expect(after).not.toContain('STALE,CONTENT,FROM,A,PREVIOUS,RUN');
    expect(after).toContain('instruction_id,query,occurrence_window');
    // The marker survives the rewrite, so a second run is idempotent rather
    // than consuming the block it just filled.
    expect(after).toContain('<!-- example: openrca-1.0/order-prod/query.csv -->');
  });

  it('is idempotent: a second run changes nothing', () => {
    // Not decoration. If the rewrite were not fixed-point, every run would
    // produce a diff and the committed file would be stale the moment anyone
    // ran the generator twice.
    const tree = treeWith({ 'openrca-1.0.md': exampleMarker() });
    expect(run(tree).status).toBe(0);
    const first = readFileSync(join(tree, 'docs', 'targets', 'openrca-1.0.md'), 'utf8');

    expect(run(tree).status).toBe(0);
    const second = readFileSync(join(tree, 'docs', 'targets', 'openrca-1.0.md'), 'utf8');

    expect(second).toBe(first);
  });

  it('honours the truncate modifier rather than writing the whole export', () => {
    // `truncate=N` keeps the first N lines and appends a count of the rest.
    // A gate that ignored the modifier would write a full metrics table into
    // the docs -- correct content, unusable page.
    //
    // Two earlier versions of this test failed, and both were measuring the
    // wrong thing rather than the modifier:
    //
    //  - `order-prod/metrics.csv` is **not a path this exporter emits**.
    //    OpenRCA writes metrics into `{date}/telemetry/metric/…`, so the run
    //    threw `example path '…' not exported` and the assertion on the
    //    truncation suffix could not be reached.
    //  - `order-prod/record.csv` *is* a real path but has three lines
    //    (header plus one row), so `truncate=2` had nothing to cut and no
    //    `… N more lines` marker was emitted. The test then asserted the full
    //    text was absent and found it present -- correctly, because with two
    //    lines kept out of three the kept portion still contains the row.
    //
    // The file used now has seventeen lines, which is what makes the modifier
    // observable at all. A truncation test needs a subject long enough to
    // truncate; that is the whole lesson of the two failures above.
    const marker = [
      '# openrca-1.0',
      '',
      '<!-- example: openrca-1.0/order-prod/2026_09_06/telemetry/metric/case-001.csv truncate=2 -->',
      '```csv',
      'stale',
      '```',
      '',
    ].join('\n');
    const tree = treeWith({ 'openrca-1.0.md': marker });
    expect(run(tree).status).toBe(0);

    const after = readFileSync(join(tree, 'docs', 'targets', 'openrca-1.0.md'), 'utf8');
    // The modifier is preserved so the next run truncates identically.
    expect(after).toContain('truncate=2');
    // The suffix names how much was dropped, so a reader can tell a short
    // table from a table that was cut.
    expect(after).toMatch(/… 1[0-9] more lines/);
    // The three columns of the full metrics file do not all appear: what is
    // written is a prefix, not the export.
    const block = after.slice(after.indexOf('```csv'), after.lastIndexOf('```'));
    expect(block.split('\n').filter((line) => line.includes('2026-09-06'))).toHaveLength(1);
  });

  it('refuses an example that names a target the exporters do not produce', () => {
    // The throw the gate has and no test ever entered. A marker referencing a
    // target that was renamed or removed is a documentation bug that must stop
    // the generator -- silently skipping it would leave a stale block that
    // looks generated.
    const tree = treeWith({
      'openrca-1.0.md': [
        '# openrca-1.0',
        '',
        '<!-- example: openrca-9.9/order-prod/query.csv -->',
        '```csv',
        'stale',
        '```',
        '',
      ].join('\n'),
    });

    const result = run(tree);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unknown example target 'openrca-9.9'");
  });

  it('refuses an example naming a path the target does not export', () => {
    // The second throw, and a different one: the target exists and the file
    // does not. This is the message that catches a renamed export.
    //
    // The assertion names the **path the gate reports**, which is the marker's
    // own reference minus the target key -- `order-prod/no-such-file.csv`, with
    // the `order-prod/` prefix kept. The first version asserted the bare
    // basename and failed, which is worth recording: the message a reader gets
    // carries the whole relative path, and a test asserting less than the
    // message says would pass a gate that reported only the file name.
    const tree = treeWith({
      'openrca-1.0.md': [
        '# openrca-1.0',
        '',
        '<!-- example: openrca-1.0/order-prod/no-such-file.csv -->',
        '```csv',
        'stale',
        '```',
        '',
      ].join('\n'),
    });

    const result = run(tree);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("example path 'order-prod/no-such-file.csv' not exported by openrca-1.0");
  });
});

describe('scripts/gen-examples.mjs · the field tables, and what is not checked', () => {
  it('regenerates a field table from the specification', () => {
    // The fields half. The table is rendered from `FORMAT_SPECS`, so the
    // generator is the only thing that can keep it in step with the code --
    // which is the argument P2-4 makes about every other measurable number in
    // these documents.
    const tree = treeWith({
      'openrca-1.0.md': [
        '# openrca-1.0',
        '',
        '<!-- fields: openrca-1.0/{system}/query.csv -->',
        '| Field | Type | Required | Source (IR) | Notes |',
        '| --- | --- | --- | --- | --- |',
        '| `stale` | string | yes | `x` | wrong on purpose |',
        '<!-- /fields -->',
        '',
      ].join('\n'),
    });
    expect(run(tree).status).toBe(0);

    const after = readFileSync(join(tree, 'docs', 'targets', 'openrca-1.0.md'), 'utf8');
    expect(after).not.toContain('wrong on purpose');
    // The three real fields of `{system}/query.csv`, rendered from the spec.
    expect(after).toContain('`instruction_id`');
    expect(after).toContain('`occurrence_window`');
    expect(after).toContain('<!-- /fields -->');
  });

  it('refuses a field marker that matches no documented file', () => {
    // The third throw. A marker is a claim that the specification documents
    // this path, so a marker whose path is absent is a spelling error that
    // would otherwise produce an empty or missing table.
    const tree = treeWith({
      'openrca-1.0.md': [
        '# openrca-1.0',
        '',
        '<!-- fields: openrca-1.0/{system}/no-such-file.csv -->',
        '<!-- /fields -->',
        '',
      ].join('\n'),
    });

    const result = run(tree);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not match any documented file');
  });

  it('refuses --check when a doc block disagrees with the export behind it', () => {
    // **The gap this test used to pin, now closed.**
    //
    // Until v3.67 `--check` compared `site/assets/data.js` and nothing else, so a tree whose
    // `docs/targets/*.md` had drifted from the specification passed the gate that exists to hold
    // the docs. The previous version of this test asserted exactly that -- green on a document it
    // had just made wrong on purpose -- and its comment called the gap `audit.md`'s P2-4. A test
    // that states a defect is worth more than a comment about one, and a test that stops stating
    // it is how the defect gets closed: the assertion inverts, and the day the check path is
    // removed again this test goes red instead of green.
    //
    // The fixture installs the stale marker *after* the writer run, so `data.js` is current and
    // the doc is the only disagreement. Otherwise the stale payload would be the first failure and
    // this would be measuring staleness in general rather than the doc path.
    const tree = treeWith();
    expect(run(tree).status).toBe(0);
    writeFileSync(join(tree, 'docs', 'targets', 'openrca-1.0.md'), exampleMarker());
    const stale = readFileSync(join(tree, 'docs', 'targets', 'openrca-1.0.md'), 'utf8');
    expect(stale).toContain('STALE,CONTENT,FROM,A,PREVIOUS,RUN');

    const result = run(tree, ['--check']);

    expect(result.status).toBe(1);
    // The diagnostic names the file, so the next reader does not have to bisect seven pages.
    expect(result.stderr).toContain('docs/targets/openrca-1.0.md');
    expect(result.stderr).toContain('pnpm examples:gen');
    // A check that repaired what it found would make `--check` and `gen` the same command, and the
    // committed file would no longer say whether anyone had run it.
    expect(readFileSync(join(tree, 'docs', 'targets', 'openrca-1.0.md'), 'utf8')).toBe(stale);
  });

  it('refuses --check when a field table disagrees with the specification', () => {
    // The same guarantee for the second marker kind. This one had no check path either, and it is
    // the table a reader trusts most: one row per field the exporter emits.
    const tree = treeWith();
    // A writer run first, so the failure under test is the table and not a missing payload -- the
    // same ordering mistake this file has already made once, recorded in the doc-block test above.
    expect(run(tree).status).toBe(0);
    writeFileSync(
      join(tree, 'docs', 'targets', 'openrca-1.0.md'),
      [
        '# openrca-1.0',
        '',
        '<!-- fields: openrca-1.0/{system}/query.csv -->',
        '| Field | Type | Required | Source (IR) | Notes |',
        '| --- | --- | --- | --- | --- |',
        '| `invented` | string | yes | `x` | a field this exporter does not emit |',
        '<!-- /fields -->',
        '',
      ].join('\n'),
    );

    const result = run(tree, ['--check']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/targets/openrca-1.0.md');
  });

  it('leaves a document with no markers untouched', () => {
    // The negative control for the rewriter. A `replace` that ran over every
    // line would reformat documents it has no business touching, and in a
    // repository of hand-written prose that is the expensive direction.
    const body = '# openrca-1.0\n\nProse with no markers at all.\n\n| a | b |\n| --- | --- |\n';
    const tree = treeWith({ 'openrca-1.0.md': body });
    expect(run(tree).status).toBe(0);

    expect(readFileSync(join(tree, 'docs', 'targets', 'openrca-1.0.md'), 'utf8')).toBe(body);
  });
});

/**
 * The metadata table at the top of each contract page.
 *
 * It used to be hand-written above all seven pages: a restatement of `format-spec.mjs` in slightly
 * different words (`metrics, logs, traces` on the page against `['M','L','T']` in the specification)
 * that nothing compared. Two things it cost are worth naming, because they are what the tests below
 * are about:
 *
 *  - `openrca-2.0`'s Vendor read `Microsoft` from the day the page was written. That is 1.0's
 *    vendor, the name in the line above it; the PAVE paper's author block says The Chinese
 *    University of Hong Kong, Shenzhen. Written 2026-09-10, corrected 2026-11-08, seven pages,
 *    no gate between them.
 *  - The two targets whose publisher this repository never established said `Reference` where the
 *    other five said `Vendor / venue` -- because the field held an arXiv id and no label fit it.
 *    Renaming the row is cheaper than answering it, and it left both pages with a row that means
 *    something different from the row of the same position on every other page.
 */
describe('scripts/gen-examples.mjs · the metadata table', () => {
  /** A page with a target block holding values no spec contains. */
  function tableWith(id: string, rows: string[]): string {
    return [
      `# ${id}`,
      '',
      `<!-- target: ${id} -->`,
      '| | |',
      '| --- | --- |',
      ...rows,
      '<!-- /target -->',
      '',
    ].join('\n');
  }

  function rendered(tree: string, id: string): string {
    const body = readFileSync(join(tree, 'docs', 'targets', `${id}.md`), 'utf8');
    return body.slice(body.indexOf(`<!-- target: ${id} -->`), body.indexOf('<!-- /target -->'));
  }

  it('replaces every row with a field of the specification', () => {
    // The whole table, not one cell. A generated row beside a hand-written one is the defect this
    // repair is about: the reader cannot tell which rows are checked.
    const tree = treeWith({
      'openrca-2.0.md': tableWith('openrca-2.0', [
        '| Vendor | Microsoft |',
        '| Venue | arXiv 2606.27154 |',
        '| Contract version | `pave-v0` (`OPENRCA2_CONTRACT_VERSION`) |',
        '| Emitter | `nowhere` |',
        '| CLI target id | `openrca-9` |',
        '| Modalities | everything |',
        '| Timezone | local time |',
      ]),
    });

    expect(run(tree).status).toBe(0);
    const table = rendered(tree, 'openrca-2.0');

    expect(table).toContain('| Vendor | The Chinese University of Hong Kong, Shenzhen |');
    expect(table).toContain('| Venue | arXiv preprint |');
    expect(table).toContain('| Reference | arXiv 2606.27154 |');
    expect(table).toContain('| CLI target id | `openrca-2.0` |');
    expect(table).toContain('| Modalities | metrics, logs, traces |');
    expect(table).toContain('| Timezone | inherits the UTC+8 telemetry layout of 1.0;');
    expect(table).toContain(
      '| Emitter | [`src/export/openrca2.ts`](../../packages/core/src/export/openrca2.ts) |',
    );
    expect(table).not.toContain('pave-v0');
    expect(table).not.toContain('openrca-9');
    // The markers survive, so a second run rewrites the same block instead of consuming it.
    expect(table).toContain('<!-- target: openrca-2.0 -->');
  });

  it('prints the version the exporter stamps, and names the constant it came from', () => {
    // The version used to exist three times: this table, `format-spec.mjs`, and the constant in
    // `packages/core/src/export/*.ts`. The constant is the only writer -- it is what the exporter
    // puts in the payload -- so the table is a rendering of it, and the cell names it so a reader
    // can check the claim without knowing this generator exists.
    const tree = treeWith({ 'openrca-2.0.md': tableWith('openrca-2.0', ['| Vendor | x |']) });
    expect(run(tree).status).toBe(0);

    const cell = rendered(tree, 'openrca-2.0')
      .split('\n')
      .find((line) => line.startsWith('| Contract version |'));

    expect(cell).toBe('| Contract version | `pave-v1` (`OPENRCA2_CONTRACT_VERSION`) |');
    // The value is what `packages/core` exports under the name the same cell prints.
    expect(OPENRCA2_CONTRACT_VERSION).toBe('pave-v1');
  });

  it('says a vendor is not established rather than naming something adjacent', () => {
    // Cloud-OpsBench's vendor has never been recorded in this repository. The field held
    // `arXiv 2603.00468` -- the paper's address, standing in for its author -- and the page renamed
    // the row to `Reference` so the value would fit its label. Both are ways of answering a
    // question nobody had answered, and the cell now says so in words.
    const tree = treeWith({ 'cloud-opsbench.md': tableWith('cloud-opsbench', ['| Vendor | arXiv 2603.00468 |']) });
    expect(run(tree).status).toBe(0);

    const table = rendered(tree, 'cloud-opsbench');
    expect(table).toContain('| Vendor | *not established* |');
    expect(table).toContain('| Venue | *not established* |');
    // The citation is kept -- as a citation, in the row that means citations.
    expect(table).toContain('| Reference | arXiv 2603.00468 |');
  });

  it('omits the reference row when the specification has no reference', () => {
    // A row of "not established" for every target without a paper id would be noise, and noise in
    // a table is what makes a reader stop reading the rows that matter. The reference is an
    // identifier, not a state: absent is the normal case for six of the seven.
    const tree = treeWith({ 'openrca-1.0.md': tableWith('openrca-1.0', ['| Reference | arXiv 0000.00000 |']) });
    expect(run(tree).status).toBe(0);

    expect(rendered(tree, 'openrca-1.0')).not.toContain('| Reference |');
  });

  it('renders the declared extra rows in the order the specification gives them', () => {
    // rcaeval and itbench carry a row no other target has. Declaring them in the specification is
    // what keeps them checkable: the alternative was free text on the page, and free text on the
    // page is what the whole repair is about.
    const tree = treeWith({ 'rcaeval.md': tableWith('rcaeval', ['| Persona | nobody |']) });
    expect(run(tree).status).toBe(0);

    const table = rendered(tree, 'rcaeval');
    expect(table).toContain('| Score target ids | `rcaeval-re1`, `rcaeval-re2`, `rcaeval-re3` |');
    expect(table).not.toContain('Persona');
    // The suite flag is part of the CLI row, and its pipes are escaped: an unescaped `|` inside a
    // table splits the row into cells, which is how this line read before it was generated.
    expect(table).toContain('| CLI target id | `rcaeval` with `--suite RE1\\|RE2\\|RE3` |');
  });

  it('refuses a specification naming a constant the package does not export', () => {
    // The generator reads the version out of the built package by name. A rename in the exporter
    // that nobody carried into the specification would otherwise render `undefined` into seven
    // cells -- a table that looks generated and says nothing.
    const tree = treeWith(
      { 'openrca-1.0.md': tableWith('openrca-1.0', ['| Vendor | x |']) },
      [["contractConstant: 'OPENRCA_CONTRACT_VERSION'", "contractConstant: 'OPENRCA_VERSION_TYPO'"]],
    );

    const result = run(tree);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('OPENRCA_VERSION_TYPO');
    expect(result.stderr).toContain('does not');
  });

  it('refuses a modality code the specification has no word for', () => {
    // The page prints the expansion and the site prints the code, from one array. A code with no
    // entry would print the code itself on the page -- `M` where every other page says `metrics` --
    // and a reader would have no way to tell a vocabulary from a typo.
    const tree = treeWith(
      { 'openrca-1.0.md': tableWith('openrca-1.0', ['| Vendor | x |']) },
      [['modalities: [\'M\', \'L\', \'T\'],\n  cliTarget: \'openrca-1.0\'', "modalities: ['M', 'L', 'Q'],\n  cliTarget: 'openrca-1.0'"]],
    );

    const result = run(tree);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("modality 'Q'");
    expect(result.stderr).toContain('MODALITY_LABELS');
  });
});

describe('the shipped contract pages', () => {
  it('carry one generated table and one field table per documented file', () => {
    // The half `--check` cannot see: it compares the blocks that are *there*, so deleting a marker
    // would take its block out of the check and leave every page green. This is the enumeration
    // that makes absence visible -- and it is why the generator's silence about a missing block is
    // a silence the suite covers.
    for (const spec of FORMAT_SPECS) {
      const page = readFileSync(resolve(ROOT, 'docs', 'targets', `${spec.id}.md`), 'utf8');
      const blocks = page.split(`<!-- target: ${spec.id} -->`).length - 1;
      expect(blocks, `${spec.id}.md must open exactly one target block`).toBe(1);
      expect(page.split('<!-- /target -->').length - 1, `${spec.id}.md must close it`).toBe(1);
      for (const file of spec.files) {
        const marker = `<!-- fields: ${spec.id}/${file.path} -->`;
        expect(page, `${spec.id}.md must document ${file.path}`).toContain(marker);
      }
    }
  });
});
