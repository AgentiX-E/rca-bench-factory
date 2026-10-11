#!/usr/bin/env node
/**
 * Run the user guide's commands, in order, the way a reader would.
 *
 * ## Why this exists
 *
 * `docs/user-guide.md` opens by claiming something specific:
 *
 * > Every command and every output block below is real -- the inputs live in
 * > [`examples/order-prod/`](../examples/order-prod/) and can be run verbatim
 * > from the repository root.
 *
 * That claim is a promise about the guide's runnable blocks, and until this
 * guard existed nothing in the repository executed any of them. `docs:check`
 * ran four documentation guards and none read this file. So the sentence was
 * the same shape as the defect this campaign keeps finding: **a published claim
 * that nothing reads**. The README had the same shape once, and
 * `check-readme-sample.mjs` was written for it after the sample drifted -- that
 * gate's comment ends "eyeballing a code sample is not a check". The guide is
 * the sibling that was never covered.
 *
 * ## What counts as a runnable block, and why the fence tag is the contract
 *
 * The first draft of this guard extracted ```bash fences and ran them. It
 * passed on a clean checkout -- and that was an accident, for two reasons that
 * took a failure to expose:
 *
 *   1. A ```bash fence whose body is *prose about the CLI* (the round-trip
 *      section spells `rca-bench ingest ...` and a commented-out output line)
 *      is not runnable, but the tag says it is. The draft concatenated it into
 *      the walkthrough anyway.
 *   2. A ```bash fence that documents a flag shape rather than a step of this
 *      walkthrough (`official --target openrca-1.0 --dir ./out/openrca-1.0`)
 *      names a directory the walkthrough never created, so it can only pass if
 *      some *earlier unrelated run* left one behind.
 *
 * Both are the same defect: **the fence tag is a claim, and a claim the guard
 * does not read is exactly the class this campaign keeps finding.** So the tag
 * is now load-bearing in both directions. A ```bash fence must be executable
 * and is executed; an illustrative fence must not be tagged `bash`. The
 * round-trip and flag-shape snippets are tagged ```text, which is the honest
 * tag, and the census below makes the tag impossible to change quietly.
 *
 * ## The census, and why it is reported rather than assumed
 *
 * `bashBlocks` keys on the language tag, so re-tagging a fence from `bash` to
 * anything else silently removes it from both execution *and* the count -- the
 * gate would still print OK. That is the "enumeration gate whose list is not
 * independent of the thing it enumerates" trap. The census reports every fence
 * language found and how many blocks each contributed, so a change of tag shows
 * up as a changed line in the gate's output instead of as silence.
 *
 * ## Why the blocks run in one session rather than one each
 *
 * The guide is a walkthrough, not a reference: step 5 exports into `./out`, and
 * step 6 scores what step 5 wrote. Running each block from a clean state would
 * fail at step 6 for a reason that has nothing to do with the guide being
 * wrong. So the blocks are concatenated in document order and run as a single
 * script with `set -e`, which is also what makes the check meaningful -- it
 * establishes the sequence works end to end, which is the property the opening
 * sentence claims.
 *
 * ## Order sensitivity, stated rather than hidden
 *
 * Because it is one session, this guard is sensitive to what is already in
 * `./out`. It was first observed failing with `status 1` and an empty-looking
 * tail on a tree where a previous *partial* run had left artefacts behind, and
 * passing from a clean tree. That is not a flaky test and it is not tolerated
 * as one: the guard removes the directories the guide itself creates before
 * running, so its verdict depends on the document and the code rather than on
 * the machine's history. See `resetGuideOutputs` for exactly what is removed.
 *
 * ## What it deliberately does not check
 *
 * The `json` blocks that show command output. Re-running the tools and diffing
 * their stdout against the documented text would also pin formatting and
 * incidental field order, and a guard that fails on a reordered key is a guard
 * that gets disabled -- which is how a check stops being one. The commands are
 * the load-bearing claim; the samples illustrate them. What *is* checked is
 * that each command exits 0, because a guide whose commands fail is wrong in
 * the way that matters.
 *
 * ## Where it runs
 *
 * `./out` is a build artefact, not a source directory, so the script is written
 * into a temporary directory and run with the repository as the working
 * directory. The guide's own paths are relative to the repository root, so the
 * working directory is what makes them resolve; nothing is written into the
 * checkout beyond the `out/` directory the guide itself names.
 *
 *   node scripts/check-user-guide.mjs
 *   node scripts/check-user-guide.mjs --doc docs/user-guide.md
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const DOC = resolve(argValue('--doc') ?? resolve(ROOT, 'docs', 'user-guide.md'));

function fail(lines) {
  console.error('check-user-guide: FAILED');
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

/**
 * The fence language this guard executes.
 *
 * Named so the census and the extractor cannot disagree about it: a constant
 * that one of two spellings reads is a constant that drifts.
 */
const RUNNABLE_TAG = 'bash';

/**
 * Every fenced block in the document, as `{ tag, body }`, in document order.
 *
 * The tag is captured rather than filtered here so the caller can census every
 * language -- including the ones it does not run. An extractor that returns
 * only the matches cannot report what it skipped, which is how a renamed fence
 * becomes invisible.
 *
 * ## Indentation, and the fence that was invisible
 *
 * The first version anchored the fence on `^` with no allowance for leading
 * whitespace, so it matched only fences at column zero. A fence nested inside a
 * numbered list item is indented by the list marker's width, and there is one
 * in this document: the round-trip illustration in "Verification, not vibes".
 * It was therefore neither executed nor counted -- invisible to the gate *and*
 * invisible in the census that exists to make omissions visible.
 *
 * That is the same "off-by-one-shape" defect this campaign keeps recording: the
 * pattern encoded an assumption about where a fence starts rather than the
 * property it needed (`a fence starts wherever the line's first non-space
 * character is a fence`). Allowing leading whitespace is the fix; requiring the
 * body to end at a fence on its own line is unchanged, so the extractor is
 * still linear and still refuses to swallow the rest of the document if a
 * closing fence is missing.
 */
function fences(markdown) {
  const blocks = [];
  const fence = /^[ \t]*```(\S+)[ \t]*\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;
  for (const match of markdown.matchAll(fence)) blocks.push({ tag: match[1], body: match[2] });
  return blocks;
}

/**
 * The runnable blocks, in document order.
 *
 * Scoped to the language tag rather than to fence order, so adding an unrelated
 * snippet above a step cannot silently change what is executed -- the same
 * reasoning `check-readme-sample.mjs` uses when it keys on the import rather
 * than on an index.
 */
function bashBlocks(markdown) {
  return fences(markdown)
    .filter((block) => block.tag === RUNNABLE_TAG)
    .map((block) => block.body);
}

/**
 * A one-line census of every fence language and the block count it contributed.
 *
 * Printed on success so that re-tagging a runnable fence is a visible change to
 * this gate's output rather than a silent reduction in what it covers. The
 * order is the order the languages first appear, so the line is stable for a
 * stable document and diffable across revisions.
 */
function census(markdown) {
  const counts = new Map();
  for (const block of fences(markdown)) counts.set(block.tag, (counts.get(block.tag) ?? 0) + 1);
  return [...counts].map(([tag, n]) => `${tag}=${n}`).join(' ');
}

/**
 * Remove the outputs the guide itself creates, so the verdict is about the
 * document rather than about the machine's history.
 *
 * Everything named here is a path a block in `docs/user-guide.md` writes:
 * `./bundle.json`, `./report.html` and `./out`. They are build artefacts and
 * gitignored, so removing them is safe; a developer who wants the generated
 * files can re-run the walkthrough, which is exactly what this guard does.
 *
 * Only these paths, and only when they are exactly what the guide names. A
 * guard that wiped a broader set to make itself deterministic would be trading
 * a false failure for a destructive side effect.
 */
function resetGuideOutputs() {
  for (const relative of ['out', 'bundle.json', 'report.html']) {
    rmSync(resolve(ROOT, relative), { recursive: true, force: true });
  }
}

if (!existsSync(DOC)) {
  fail([`${DOC} does not exist.`, 'Pass --doc <path>, or delete this guard if the guide was removed.']);
}

const markdown = readFileSync(DOC, 'utf8');
const blocks = bashBlocks(markdown);

if (blocks.length === 0) {
  // A vacuity guard. If the extraction stops matching -- a fence renamed, the
  // language tag dropped -- this guard would otherwise report success while
  // checking nothing, which is the failure mode it exists to prevent.
  fail([
    `no \`\`\`${RUNNABLE_TAG} block found in ${DOC}.`,
    `Fences present: ${census(markdown) || '(none)'}`,
    'If the guide no longer carries runnable commands, delete this guard in the same change.',
    'Reporting success on zero blocks would be the defect this guard is for.',
  ]);
}

/**
 * Every runnable block is put through the shell guard before it is executed.
 *
 * ## Why a separate pass, when the block is about to be run anyway
 *
 * Because running it cannot detect the defect this pass is for. The rule is
 * about `$`-constructs a shell expands **before the program it names starts**,
 * and the failure mode is silent: `${count}` inside a double-quoted argument
 * expands to nothing, the step exits 0, and what ran is simply not what the guide
 * documented. A walkthrough that runs clean is exactly what a block with this
 * defect looks like from the outside, which is why the operator of this
 * repository lost three tool calls to `Bad substitution` while every gate here
 * was green.
 *
 * ## Why this gate and not the file scan
 *
 * `check-no-unsafe-shell.mjs` already scans the tree, and it does not scan this
 * document: its extensions are source files, and a guide's commands are not
 * source files. They are also not uniformly shell -- the same document holds
 * `json` samples of command output -- so a content-based scan of the markdown
 * would flag the samples. The tag is the contract this gate already relies on,
 * so the check is applied to the same set the gate is willing to execute, one
 * block at a time, and each carries a label so a failure names the fence rather
 * than a line of a generated script nobody can see.
 *
 * ## Why a missing sibling is a failure rather than a skip
 *
 * The guard is consulted on every run; if it cannot be found, this one no longer
 * knows that what it is about to execute is safe. Skipping in that case would
 * restore precisely the state this pass was added to end -- commands executed
 * with nothing having checked them -- while still reporting success.
 */
const SHELL_GUARD = resolve(HERE, 'check-no-unsafe-shell.mjs');

function assertBlocksAreSafeToRun(bodies) {
  if (!existsSync(SHELL_GUARD)) {
    fail([
      `${SHELL_GUARD} is missing, so the runnable blocks cannot be checked.`,
      'This guard consults it for every block it executes; a run that skips the check',
      'would execute commands nothing had looked at, while reporting success.',
    ]);
  }
  const refused = [];
  bodies.forEach((body, index) => {
    const result = spawnSync(
      process.execPath,
      [SHELL_GUARD, '--stdin', '--label', `user-guide block ${index + 1}`],
      { input: body, encoding: 'utf8', cwd: ROOT },
    );
    if (result.status !== 0) refused.push((result.stderr ?? '').trim());
  });
  if (refused.length > 0) {
    fail([
      'a runnable block contains a `$`-construct a shell expands before the program starts:',
      '',
      ...refused,
    ]);
  }
}

assertBlocksAreSafeToRun(blocks);

resetGuideOutputs();

// `set -e` so the first failing command is the one reported, and the block
// boundaries are echoed so a failure names the step rather than a line number
// in a generated file nobody can see.
const script = ['set -e', ...blocks.flatMap((body, i) => [`echo "--- step ${i + 1} of ${blocks.length} ---"`, body])].join('\n');

const dir = mkdtempSync(resolve(tmpdir(), 'rca-bench-guide-'));
const scriptPath = resolve(dir, 'steps.sh');
writeFileSync(scriptPath, script);

const result = spawnSync('bash', [scriptPath], {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  // The walkthrough runs nine CLI commands including a nine-target official
  // score, so the ceiling is generous; a timeout that fires on a slow machine
  // would be the flaky-test excuse this project does not accept.
  timeout: 600_000,
  // `pre`/`post` hooks are suppressed, and the reason is a defect this guard
  // caused rather than a preference about output.
  //
  // ## What the guide's own command did to the tree under test
  //
  // `docs/user-guide.md` documents `pnpm official:check`, and this guard runs
  // the document's commands verbatim with `cwd: ROOT`. The root manifest gives
  // that script a hook:
  //
  //     "preofficial:check": "pnpm build"
  //
  // so executing the guide ran `pnpm --filter core build && pnpm --filter cli
  // build` -- `tsc` over both packages -- **inside the repository, in the middle
  // of the test suite that was reading it**.
  //
  // Measured, not inferred. `packages/core/dist/index.js` and
  // `packages/cli/dist/main.js` were observed being rewritten exactly once per
  // full-suite run and never while the machine was idle. Polling the process
  // table during a run caught the writer and its ancestry:
  //
  //     pnpm official:check
  //      └ bash /tmp/rca-bench-guide-*/steps.sh
  //         └ node scripts/check-user-guide.mjs
  //            └ node (vitest 5)
  //
  // ## Why that was a test failure and not merely untidy
  //
  // Roughly a hundred test files read `packages/core/dist/index.js` or spawn
  // `packages/cli/dist/main.js`, and a `tsc` build is not atomic across the
  // files it emits. A concurrent importer could therefore read `dist/index.js`
  // after it was rewritten but before the module it re-exports from was, and the
  // observed failure was exactly that torn state:
  //
  //     SyntaxError: The requested module './fault/category-derivation.js' does
  //     not provide an export named 'ALT_READING_FLOOR'
  //
  // surfacing as `expected 1 to be +0` from whichever test happened to spawn a
  // reader at that instant -- a different file each run, which is why four
  // separate "flaky tests" turned out to be one condition.
  //
  // ## Why suppressing the hook is the right repair and not a weakening
  //
  // The hook is a *precondition* of the script, not the thing the script
  // asserts, and the guide's step is about what a reader types -- which is still
  // executed exactly as written. The precondition keeps its own proof in two
  // places that do not share this hazard: `cold-tree-preconditions.test.ts`
  // holds the declaration (`pre<script>` exists and names a build), and the
  // `cold-tree` CI job exercises the behaviour on a machine that has never been
  // built. What is dropped is only the *side effect* of re-running the build in
  // a tree that is already built and is being read by other tests.
  //
  // Verified by experiment: with the variable set, `pnpm official:check` exits 0,
  // emits no build, and leaves both build outputs' mtimes untouched; without it,
  // it rewrites them.
  env: { ...process.env, npm_config_enable_pre_post_scripts: 'false' },
});

rmSync(dir, { recursive: true, force: true });

if (result.error !== undefined) {
  fail([`could not run the guide's commands: ${result.error.message}`]);
}

if (result.status !== 0) {
  const tail = (result.stdout + '\n' + result.stderr).trim().split('\n').slice(-25);
  fail([
    `a command in ${DOC} failed (exit ${result.status}).`,
    'The guide says every command is real, so the document or the code is wrong -- fix one of them.',
    'Last output:',
    ...tail.map((l) => `  ${l}`),
  ]);
}

console.log(`check-user-guide: OK (${blocks.length} ${RUNNABLE_TAG} block(s) executed in order)`);
console.log(`check-user-guide: fences ${census(markdown)}`);
