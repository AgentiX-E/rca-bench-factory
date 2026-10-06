import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

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
  'scripts/check-cli-reference.mjs',
];


/**
 * `scripts/check-cli-reference.mjs` — the **drift report**, not the empty table.
 *
 * `gates-are-testable.test.ts` already covers this gate's first exit: a
 * reference whose command table has been deleted or renamed. What it does not
 * cover is the exit that fires when the reference and the binary *disagree* --
 * the one the gate exists for, and the one whose diagnostic an operator
 * actually reads.
 *
 * ## The half that is easy to get wrong
 *
 * Every flag the binary advertises is looked up in the reference with a
 * trailing word boundary:
 *
 *   `new RegExp(`${flag}(?![\\w-])`)`
 *
 * A plain `includes` would let `--lead-ms-X` satisfy `--lead-ms`, so a renamed
 * flag would still look documented. The gate's own comment says so. A test that
 * only asserted "an undocumented flag fails" would pass against the broken
 * `includes` version too, because a flag that appears nowhere fails either way.
 * The test that distinguishes them is the one where the reference contains the
 * flag as a **prefix of a longer flag**.
 *
 * ## Why the fixture drives the real CLI
 *
 * The gate executes `packages/cli/dist/main.js` as a subprocess and reads its
 * `--help`. Neither side is restated in the gate, so the fixture cannot stub
 * one of them without the test becoming a test of the stub. The tree below
 * links the real build and supplies only the *reference document*, which is the
 * one input the gate treats as data.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = 'check-cli-reference.mjs';
const REFERENCE = resolve(ROOT, 'docs/cli-reference.md');

interface Outcome {
  status: number;
  stdout: string;
  stderr: string;
}

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-cliref-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;

/**
 * A throwaway tree holding the gate and a `docs/cli-reference.md` the caller
 * writes, with the real CLI linked in.
 *
 * The link points at `packages/`, whose `cli/dist/main.js` is the shipped
 * binary. `node_modules/` comes along because the CLI resolves `core`, whose
 * own dependencies resolve from there.
 */
function treeWith(functionalReference: string): string {
  counter += 1;
  const tree = join(scratch, `tree-${counter}`);
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  mkdirSync(join(tree, 'docs'), { recursive: true });
  writeFileSync(join(tree, 'scripts', SCRIPT), readFileSync(resolve(ROOT, 'scripts', SCRIPT), 'utf8'));
  writeFileSync(join(tree, 'docs', 'cli-reference.md'), functionalReference);
  symlinkSync(resolve(ROOT, 'packages'), join(tree, 'packages'), 'dir');
  symlinkSync(resolve(ROOT, 'node_modules'), join(tree, 'node_modules'), 'dir');
  return tree;
}

function run(tree: string): Outcome {
  const result = spawnSync(process.execPath, [join(tree, 'scripts', SCRIPT)], {
    encoding: 'utf8',
    cwd: tree,
  });
  if (result.error !== undefined) {
    return { status: -1, stdout: result.stdout ?? '', stderr: result.error.message };
  }
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** The commands the real binary advertises, read from its own `--help`. */
function advertisedTopics(): string[] {
  const help = spawnSync(process.execPath, [resolve(ROOT, 'packages/cli/dist/main.js'), '--help'], {
    encoding: 'utf8',
  }).stdout;
  const section = help.split('Commands:')[1]?.split('\n\n')[0] ?? '';
  return [...section.matchAll(/^ {2}([a-z][\w-]*)\s{2,}\S/gm)]
    .map((m) => m[1]!)
    .filter((c) => c !== 'help' && c !== 'version');
}

describe('scripts/check-cli-reference.mjs · the drift report', () => {
  it('passes against the committed reference, so the negatives are not the only reachable state', { timeout: 30_000 }, () => {
    // The precondition, and the reason the fixture below can be trusted to be
    // measuring the drift rather than the fixture: the real document satisfies
    // this gate on the real binary.
    const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts', SCRIPT)], {
      encoding: 'utf8',
      cwd: ROOT,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/CLI reference check PASSED \(\d+ commands, \d+ documented\)/);
    // And it really is comparing non-empty sets on both sides. A green run over
    // zero commands would satisfy every assertion above and mean nothing.
    expect(advertisedTopics().length).toBeGreaterThan(1);
    expect(readFileSync(REFERENCE, 'utf8')).toContain('## Implemented commands');
  });

  it('refuses a command the binary implements but the reference omits', { timeout: 30_000 }, () => {
    // Build a reference that lists every topic except one. The omission is the
    // drift: a reader following the document cannot discover the command, and
    // nothing about the document says so.
    const topics = advertisedTopics();
    const omitted = topics[0]!;
    const document = referenceFor(topics.filter((t) => t !== omitted));

    const result = run(treeWith(document));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CLI reference check FAILED:');
    expect(result.stderr).toContain(`command '${omitted}' is implemented but not listed`);
  });

  it('refuses a section heading for a command the binary does not implement', { timeout: 30_000 }, () => {
    // A documentation bug of its own: readers follow the heading and hit
    // `unknown command`. The gate's comment says so, and this is the assertion
    // that makes the claim true.
    const topics = advertisedTopics();
    const document = `${referenceFor(topics)}\n### \`rca-bench not-a-command\`\n\nProse.\n`;

    const result = run(treeWith(document));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("documents 'not-a-command', which is not an implemented command");
  });

  it('refuses a reference that documents no flag at all', { timeout: 30_000 }, () => {
    // The `flags.length === 0` branch: a command advertising no flags "cannot
    // be right", in the gate's words. Without it, a reference stripped of every
    // flag table would pass -- there would be nothing to look up and no failure
    // to report. This is the branch that makes the flag comparison total.
    const topics = advertisedTopics();
    const document = referenceFor(topics, { flags: false });

    const result = run(treeWith(document));

    expect(result.status).toBe(1);
    // Several commands now advertise a flag the reference never mentions, so
    // the report names them rather than the empty-flag branch.
    expect(result.stderr).toContain("is accepted by '");
    expect(result.stderr).toContain('but absent from docs/cli-reference.md');
  });

  it('reports every disagreement rather than stopping at the first', { timeout: 30_000 }, () => {
    // The gate accumulates into `failures` and prints them all. One run should
    // be enough to fix a document, which is the same judgement the corpus
    // reader and `check-no-mock.mjs` both made.
    const topics = advertisedTopics();
    const document = referenceFor(topics).replace(/--[\w-]+/g, '--renamed');

    const result = run(treeWith(document));

    expect(result.status).toBe(1);
    const reported = result.stderr.split('\n').filter((line) => line.trim().startsWith('- '));
    expect(reported.length).toBeGreaterThan(1);
  });

  it('does not accept a longer flag as documentation of a shorter one', { timeout: 30_000 }, () => {
    // **The assertion that distinguishes the real gate from `includes`.**
    //
    // The test takes one flag the binary advertises, `f`, and writes the
    // reference so that `f` appears **only** as the prefix of `f-X`. A gate
    // using `includes` accepts this; a gate using the trailing word boundary
    // does not, because `-` follows the flag's name.
    //
    // Every other test in this file passes under both implementations, which is
    // why this one exists: it is the only one that can fail when the boundary
    // is dropped, so it is the only one that guards the boundary.
    const flags = advertisedFlags();
    expect(flags.length).toBeGreaterThan(0);
    const [topic, flag] = flags[0]!;

    const topics = advertisedTopics();
    let document = referenceFor(topics);
    // Remove the honest mention, then add the prefixed one back.
    document = document.split(flag).join(`${flag}-X`);
    expect(document).toContain(`${flag}-X`);
    expect(document).not.toMatch(new RegExp(`${escape(flag)}(?![\\w-])`));

    const result = run(treeWith(document));

    expect(result.status).toBe(1);
    // The failure names the topic that advertises it, and the flag itself.
    expect(result.stderr).toContain(`'${flag}' is accepted by '${topic}'`);
  });
});

/** Every flag the binary advertises, as `[topic, flag]`, read from its `--help`. */
function advertisedFlags(): [string, string][] {
  const found: [string, string][] = [];
  for (const topic of advertisedTopics()) {
    const help = spawnSync(process.execPath, [resolve(ROOT, 'packages/cli/dist/main.js'), topic, '--help'], {
      encoding: 'utf8',
    }).stdout;
    for (const match of help.matchAll(/^ {2}(--[\w-]+)/gm)) found.push([topic, match[1]!]);
  }
  return found;
}

function escape(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A reference document that the gate accepts, built around a given command list.
 *
 * The flag lists are read from each command's real `--help` rather than
 * invented, so the only thing the caller varies is the *structure* -- which
 * commands are listed, and whether the flags are written down at all.
 */
function referenceFor(topics: string[], options: { flags?: boolean } = {}): string {
  const lines = ['# CLI reference', '', '## Implemented commands', '', '| Command | What it does |', '| --- | --- |'];
  for (const topic of topics) lines.push(`| \`${topic}\` | a command |`);
  lines.push('');
  if (options.flags === false) return `${lines.join('\n')}\n`;
  for (const topic of topics) {
    const help = spawnSync(process.execPath, [resolve(ROOT, 'packages/cli/dist/main.js'), topic, '--help'], {
      encoding: 'utf8',
    }).stdout;
    const flags = [...help.matchAll(/^ {2}(--[\w-]+)/gm)].map((m) => m[1]!);
    lines.push(`### \`rca-bench ${topic}\``, '', `Flags: ${flags.map((f) => `\`${f}\``).join(', ')}`, '');
  }
  return `${lines.join('\n')}\n`;
}
