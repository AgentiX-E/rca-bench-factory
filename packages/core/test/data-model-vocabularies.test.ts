import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The scripts this file executes.
 *
 * Rule 7 of `gate-sites-are-proven.test.ts` reconciles this declaration against
 * the scripts the spawn calls below actually reach, and reports a disagreement
 * in either direction.
 */
const DRIVES = ['scripts/check-data-model-vocabularies.mjs'];

/**
 * `docs/data-model.md` publishes vocabularies, and nothing reads them.
 *
 * The document makes a structural claim in as many words, twice:
 *
 * > Two payload fields are closed sets, and both are **declared once** -- as a
 * > tuple in `ir/types.ts`, with the type derived from it. Anything that admits
 * > a value (the `source` and `ingest` file readers) reads the same tuple, so the
 * > union and the admission list cannot disagree.
 *
 * and, for `EntityKind`:
 *
 * > `EntityKind` is declared once, as a tuple ... Formats that accept only some
 * > of them narrow that tuple by filtering it, so dropping a kind from the IR
 * > narrows the subset too rather than leaving a stale list behind.
 *
 * Measured, those sentences were **not true**. The tuples exist --
 * `LOG_SEVERITIES`, `SPAN_STATUSES`, `ENTITY_KINDS`, `FAULT_CATEGORIES` -- and
 * the derived types are derived. But `ir/schema.ts`, which is the thing that
 * actually *admits* a payload through `parseSignal`, re-spelled every vocabulary
 * as a list of string literals beside the tuple. There were **fifteen** such
 * copies and not one read its tuple.
 *
 * That is this campaign's recurring defect, in its purest form: a published
 * claim that nothing reads. The consequence is not cosmetic. Adding a member to
 * `LOG_SEVERITIES` would widen the TypeScript union and silently leave the
 * runtime schema rejecting the new value -- the union and the admission list
 * *would* disagree, which is the exact failure the document says cannot happen.
 *
 * ## What this file establishes
 *
 * Two independent things, because either alone is satisfiable by accident:
 *
 *   1. **The document and the code agree.** `check-data-model-vocabularies.mjs`
 *      parses the vocabulary tables out of `docs/data-model.md` and compares each
 *      against the code tuple it names. A vocabulary that drifts on either side
 *      fails.
 *   2. **The agreement is structural, not coincidental.** A test below re-spells
 *      a single member of `LOG_SEVERITIES` inside the schema text and asserts the
 *      gate reports it -- proving the gate reads the *binding* rather than
 *      comparing two hand-kept string lists that happen to match today.
 *
 * The distinction matters: (1) without (2) is the "enumeration gate whose list is
 * not independent of the thing it enumerates" trap, and (2) without (1) is a
 * structural check on a document nobody re-reads.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = 'check-data-model-vocabularies.mjs';
const DOC = resolve(ROOT, 'docs', 'data-model.md');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-datamodel-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A throwaway tree holding the gate, the document and the sources it reads.
 *
 * The gate compares a document against source text, so both sides must be
 * writable in the fixture -- unlike the user-guide gate, which needed the *real*
 * build because it executed the CLI. Here a symlink for `packages/` would defeat
 * the point: the corruption tests below rewrite the source, and a symlink would
 * rewrite the checkout instead of the fixture.
 */
function treeWith(doc: (markdown: string) => string, corrupt: (files: Map<string, string>) => void = () => {}): string {
  counter += 1;
  const tree = join(scratch, `tree-${counter}`);
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'docs'), { recursive: true });
  mkdirSync(join(tree, 'packages', 'core', 'src', 'ir'), { recursive: true });
  mkdirSync(join(tree, 'packages', 'core', 'src', 'score'), { recursive: true });
  mkdirSync(join(tree, 'packages', 'core', 'src', 'ingest'), { recursive: true });

  const files = new Map<string, string>();
  const copy = (relative: string): void => {
    files.set(relative, readFileSync(resolve(ROOT, relative), 'utf8'));
  };
  copy('packages/core/src/ir/types.ts');
  copy('packages/core/src/ir/schema.ts');
  copy('packages/core/src/score/score.ts');
  copy('scripts/check-data-model-vocabularies.mjs');

  corrupt(files);

  writeFileSync(join(tree, 'docs', 'data-model.md'), doc(readFileSync(DOC, 'utf8')));
  for (const [relative, content] of files) {
    const path = join(tree, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return tree;
}

function run(tree: string): Outcome {
  const result = spawnSync(process.execPath, [join(tree, 'scripts', SCRIPT)], {
    encoding: 'utf8',
    cwd: tree,
    timeout: 120_000,
  });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * `expectFailedForOwnReason`, as `check-no-absolute-paths.test.ts` defines it.
 *
 * Asserting the exit code alone is the false-green idiom this repository has
 * recorded more than once: a script that crashes on a missing import also exits
 * non-zero, and would be indistinguishable from the guard firing.
 */
function expectFailedForOwnReason(outcome: Outcome): void {
  expect(outcome.status).toBe(1);
  expect(outcome.stderr).toContain('check-data-model-vocabularies: FAILED');
  expect(outcome.stderr).not.toMatch(/Cannot find module/);
  expect(outcome.stderr).not.toMatch(/^\s+at .*node:internal/m);
}

describe('docs/data-model.md · the published vocabularies are read', () => {
  it('accepts the shipped document and the shipped source', () => {
    // The live assertion. The gate runs against the real tree first, so a failure
    // names this file rather than appearing only inside `docs:check`.
    const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts', SCRIPT)], {
      encoding: 'utf8',
      cwd: ROOT,
      timeout: 120_000,
    });
    const outcome: Outcome = {
      status: result.status ?? -1,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
    if (outcome.status !== 0) throw new Error(`gate failed:\n${outcome.stdout}\n${outcome.stderr}`);
    expect(outcome.stdout).toMatch(/check-data-model-vocabularies: OK \(\d+ vocabulary\(ies\)/);
  });

  it('examines every vocabulary the document publishes, not a convenient subset', () => {
    // The vacuity guard on the *reading* side. A gate that parsed one table and
    // stopped would pass; the document publishes more than one, and the count is
    // read from the document rather than pinned here.
    const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts', SCRIPT)], {
      encoding: 'utf8',
      cwd: ROOT,
      timeout: 120_000,
    });
    const stdout = result.stdout ?? '';
    const markdown = readFileSync(DOC, 'utf8');
    // Three-column table rows: `| `Field` | `TUPLE` | `A`, `B` |`.
    const rows = [...markdown.matchAll(/^\|\s*`[A-Za-z][\w.]*`\s*\|\s*`[A-Z][A-Z0-9_]*`\s*\|/gm)].length;
    // Prose sentences: "`Type` is declared once, as a tuple..."
    const prose = [...markdown.matchAll(/`[A-Za-z][\w]*`\s+is\s+declared\s+once,\s+as\s+a\s+tuple/g)].length;
    // The `source:` union in the FieldProvenance block.
    const unions = [...markdown.matchAll(/^\s*source:\s*(?:'[\w]+'\s*\|\s*)+'[\w]+'\s*;/gm)].length;
    const published = rows + prose + unions;
    expect(published).toBeGreaterThan(0);
    const claimed = Number(/OK \((\d+) vocabulary/.exec(stdout)?.[1] ?? '0');
    // The gate must examine at least as many as the document states. Equality is
    // not asserted: a reader may legitimately find the same vocabulary twice (the
    // `source` union appears in more than one code block) and de-duplication is
    // the gate's business, not this test's.
    expect(claimed).toBeGreaterThanOrEqual(rows + prose);
    expect(claimed).toBeGreaterThan(0);
  });

  it('reports a schema that re-spells a member instead of reading the tuple', () => {
    // The structural assertion, and the reason this file is not a string
    // comparison dressed up. `LOG_SEVERITIES` gains a member in the fixture's
    // types.ts; the schema keeps the old list. A gate comparing "the document to
    // the tuple" would still pass -- the document is untouched and the tuple is
    // intact. Only a gate that reads the *schema's* vocabulary notices.
    const tree = treeWith(
      (markdown) => markdown,
      (files) => {
        const types = files.get('packages/core/src/ir/types.ts') as string;
        files.set(
          'packages/core/src/ir/types.ts',
          types.replace(
            "export const LOG_SEVERITIES = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as const;",
            "export const LOG_SEVERITIES = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'NOTICE'] as const;",
          ),
        );
      },
    );
    const outcome = run(tree);
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toMatch(/NOTICE/);
  });

  it('reports a document row that lists values the code does not have', () => {
    // The other direction. The document is the specification for outsiders, so a
    // row naming a value the code rejects is a lie told to every consumer.
    const tree = treeWith((markdown) =>
      markdown.replace(
        '| `LogPayload.severityText` | `LOG_SEVERITIES` | `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL` |',
        '| `LogPayload.severityText` | `LOG_SEVERITIES` | `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`, `NOTICE` |',
      ),
    );
    const outcome = run(tree);
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toMatch(/NOTICE/);
  });

  it('reports a document row whose order has drifted from the tuple', () => {
    // `FAULT_CATEGORIES` is declared "in the order they are published in
    // `docs/data-model.md`", so order is part of the contract rather than
    // incidental formatting -- `unknown` sorts last because the tuple puts it
    // last. A set comparison would accept a reordered document; this does not.
    const tree = treeWith((markdown) =>
      markdown.replace(
        '`FaultCategory` is declared once, as a tuple in this order: `resource`, `network`,\n`runtime`, `middleware`, `code`, `config`, `dependency`, `unknown`.',
        '`FaultCategory` is declared once, as a tuple in this order: `unknown`, `resource`, `network`,\n`runtime`, `middleware`, `code`, `config`, `dependency`.',
      ),
    );
    const outcome = run(tree);
    // The order claim is prose, so this asserts the gate's verdict text names the
    // vocabulary rather than a bare non-zero exit.
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toMatch(/FaultCategory|order/);
  });

  it('refuses a document that publishes no vocabulary, rather than passing vacuously', () => {
    const tree = treeWith((markdown) =>
      markdown
        .replace(/^\|\s*`[A-Za-z][\w.]*`\s*\|\s*`[A-Z][A-Z0-9_]*`\s*\|.*$/gm, '')
        .replace(/`[A-Za-z][\w]*` is declared once, as a tuple[^:]*:[^.]*\./g, 'Not a vocabulary.')
        .replace(/^\s*source:\s*'[\w]+'.*$/gm, ''),
    );
    const outcome = run(tree);
    expectFailedForOwnReason(outcome);
    expect(outcome.stderr).toContain('no vocabulary');
  });

  it('refuses a document whose named source file is absent, rather than skipping it', () => {
    // A vocabulary row naming a tuple in a file that does not exist must not be
    // silently treated as "nothing to compare". That is how a renamed module
    // would quietly retire the check.
    const tree = treeWith((markdown) => markdown, (files) => {
      files.delete('packages/core/src/ir/schema.ts');
    });
    const outcome = run(tree);
    expectFailedForOwnReason(outcome);
  });
});
