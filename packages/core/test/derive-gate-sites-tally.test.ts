import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The tally beside the site list is a partition, not a remainder.
 *
 * ## The defect
 *
 * `golden-master/gate-sites.json` publishes `excluded` beside `sites`, so a reader
 * can subtract: "112 sites, and 18 other exits went elsewhere for these reasons".
 * The two halves were computed by two different readings, and they disagreed --
 * the committed file said `{15 zero, 3 indirect}` where the tree holds
 * `{16 zero, 2 indirect}`.
 *
 * **The totals matched anyway.** One count had been lost and one invented, and the
 * two errors cancelled to 130. A number that is right for two wrong reasons is
 * harder to notice than a number that is wrong, which is why this file asserts the
 * partition rather than the total.
 *
 * The lost one is `if (officialDirArg === undefined) process.exit(0);` in
 * `check-official.mjs`: a success exit written on a line that does not *begin*
 * with `process.exit`. The site rule grew a fallback for exactly that shape in an
 * earlier round, because it was costing the inventory a site; the tally never got
 * the same fallback, and the shape fell through every branch.
 *
 * The invented one is a docstring line in `derive-gate-sites.mjs` whose text
 * contains `.map((x) => process.exit(1))`, counted because the comment stripper
 * desyncs in that file -- a quote inside a regex literal, the same character that
 * defeated the two scanners before it.
 *
 * ## What this file asserts instead
 *
 * One pass over the syntax tree puts every `process.exit(...)` call in exactly one
 * basket. So `sites.length + zero` **is** the number of calls, by construction, and
 * the cases at the bottom hold that against the real tree with an independent
 * traversal.
 *
 * ## The third basket, and why there are now two
 *
 * `indirect` held calls that were not in statement position, and it was the last
 * remainder in this table: the rule it qualified -- "a call outside a statement may
 * not run" -- is equally true of the calls the rule *includes*, and `condition`
 * is the column that says so. Measured, the basket held exactly two calls, and both
 * were `main().then((code) => process.exit(code))`: the sentence that decides the
 * script's status. `code` is `main()`'s return value, so the inventory published
 * each of those scripts as having one failure exit -- the `.catch` arm -- while the
 * one carrying every refusal `main()` reports was filed as "not a site". v3.44
 * deletes the basket and counts them.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'derive-gate-sites.mjs');
const SCRIPTS = resolve(ROOT, 'scripts');

/**
 * The budget this file's tree walk is given, in milliseconds.
 *
 * ## The reading, taken before this constant existed
 *
 * `accounts for every call in every script` parses all 89 shipped scripts twice -- once
 * with `forEachChild`, once with `getChildren()` -- inside the test process. Measured
 * over ten full-suite runs on the tree before this constant existed, on a box whose
 * cgroup allows 4 CPUs:
 *
 *     2 workers   2 710 / 2 628 / 2 705 ms   green
 *     4 workers   2 837 / 3 528 / 3 364 ms   green
 *     6 workers   4 700 / 5 449 ms           green once, `Test timed out in 5000ms` once
 *     8 workers   7 597 / 9 876 ms           red twice of two
 *
 * So the file's verdict was a function of how many other files were running: green at
 * the two counts the suite normally uses, a coin flip at 6, and red at 8. The budget
 * below is the estate's tightest declaration (30 000 ms in nine other files), which
 * leaves 3x headroom over the worst reading here rather than the zero the inherited
 * 5 000 ms default left.
 *
 * ## Why the suite and not the test
 *
 * The sentence above is per *file*, but the number that ran out is per *process*: the
 * same walk is what the file is for, so a budget applied to that one test would leave
 * the next test added to this file on the default. `timeout-budget.test.ts` carries the
 * rule and the rows; this constant is the number those rows read.
 */
const SUITE_BUDGET_MS = 30_000;

interface Read {
  sites: Array<{ line: number; condition?: string; diagnostic?: string }>;
  excluded: Record<string, number>;
}

const { exitsIn } = (await import(pathToFileURL(SCRIPT).href)) as {
  exitsIn: (name: string, source: string) => Read;
};

/** One fixture, classified. */
function classify(source: string): Read {
  return exitsIn('fixture.mjs', source);
}

/** The two counts a partition can report, in a fixed order. */
function counts(source: string): { sites: number; zero: number } {
  const read = classify(source);
  return {
    sites: read.sites.length,
    zero: read.excluded.zero ?? 0,
  };
}

describe('an exit is a site unless its argument is a known zero', () => {
  it('counts `process.exit(1)`', () => {
    expect(counts('process.exit(1);')).toEqual({ sites: 1, zero: 0 });
  });

  it('counts any non-zero status, which is a spelling of the same property', () => {
    expect(counts('process.exit(2);').sites).toBe(1);
    expect(counts('process.exit(cond ? 0 : 1);').sites).toBe(1);
    expect(counts('process.exit(main());').sites).toBe(1);
  });

  it('counts an exit that carries no argument as zero, because that is what it exits with', () => {
    // Until v3.44 this was a site. The rule asked "is the argument the literal
    // zero?", and an absent argument is not the literal zero -- which is a reading
    // of the sentence rather than of the statement. `process.exit()` exits 0, so
    // by the property the rule exists to publish it is a success exit.
    expect(counts('process.exit();')).toEqual({ sites: 0, zero: 1 });
  });

  it('counts the inline `if (!ok) process.exit(1);`', () => {
    expect(counts('if (!ok) process.exit(1);')).toEqual({ sites: 1, zero: 0 });
  });
});

describe('a success exit is counted as zero rather than dropped', () => {
  it('counts `process.exit(0)`', () => {
    expect(counts('process.exit(0);')).toEqual({ sites: 0, zero: 1 });
  });

  it('reads the literal zero as a number, so `0x0` and `0.0` are the same claim', () => {
    expect(counts('process.exit(0x0);').zero).toBe(1);
    expect(counts('process.exit(0.0);').zero).toBe(1);
  });

  it('counts the inline `if (arg === undefined) process.exit(0);`', () => {
    // The shape that was counted nowhere: not a site, because the argument is zero;
    // and not a tally, because the line does not begin with `process.exit`.
    // `check-official.mjs` writes it, and its absence made the tally read one lower
    // than the tree.
    expect(counts('if (officialDirArg === undefined) process.exit(0);')).toEqual({
      sites: 0,
      zero: 1,
    });
  });

  it('does not read a string argument as zero', () => {
    expect(counts("process.exit('0');").sites).toBe(1);
  });
});

describe('an exit is a site wherever the call sits', () => {
  // `indirect` used to hold these, on the argument that a call outside statement
  // position may not run. That is true of `if (x) process.exit(1)` too, and the
  // published `condition` column is what says so -- position in an expression does
  // not weaken an exit, because a call that runs ends the process wherever it is.
  it('counts an exit inside another call', () => {
    expect(counts('assert(process.exit(1));')).toEqual({ sites: 1, zero: 0 });
  });

  it('counts an exit as an arrow body', () => {
    expect(counts('const codes = list.map((x) => process.exit(x));')).toEqual({ sites: 1, zero: 0 });
  });

  it('counts the continuation that carries a gate verdict', () => {
    // The shape the deleted basket was hiding: `code` is `main()`'s return value,
    // so this call is where the script's status is decided. Both instances in
    // `scripts/` are this line.
    const read = classify('main()\n  .then((code) => process.exit(code))\n  .catch(() => process.exit(1));');
    expect(read.sites.map((site) => site.line)).toEqual([2, 3]);
  });

  it('counts an exit inside a template substitution', () => {
    expect(counts('const text = `${process.exit(1)}`;')).toEqual({ sites: 1, zero: 0 });
  });
});

describe('prose about an exit is not an exit', () => {
  it('ignores a line comment quoting one', () => {
    expect(counts('// `assert(process.exit(1))`, `.map((x) => process.exit(1))`')).toEqual({
      sites: 0,
      zero: 0,
    });
  });

  it('ignores a block comment quoting one', () => {
    // The shape that used to be counted: a docstring in `derive-gate-sites.mjs`
    // spells `.map((x) => process.exit(1))` while documenting why that shape is
    // excluded, and it entered the `indirect` tally through a lexer desync.
    expect(
      counts(`/**
 * Not counted: \`assert(process.exit(1))\`, \`.map((x) => process.exit(1))\`.
 */
const x = 1;`),
    ).toEqual({ sites: 0, zero: 0 });
  });

  it('ignores the text inside a string and inside a template', () => {
    expect(counts("const pattern = 'process.exit(1)';").sites).toBe(0);
    expect(counts('const pattern = `process.exit(1)`;').sites).toBe(0);
  });
});

describe('the line a site publishes is the line its call starts on', () => {
  it('points at `process.exit`, not at the argument', () => {
    const read = classify(`const code = main();
process.exit(
  code,
);`);
    expect(read.sites).toHaveLength(1);
    expect(read.sites[0].line).toBe(2);
  });
});

describe('the two baskets are a partition of the calls, not a remainder', { timeout: SUITE_BUDGET_MS }, () => {
  it('adds up on a fixture that exercises both', () => {
    const source = [
      'process.exit(1);',
      'process.exit(0);',
      "assert(process.exit('both'));",
      'if (!ok) process.exit(0);',
      '// process.exit(1) in prose is not a call',
    ].join('\n');
    const read = counts(source);
    expect(read).toEqual({ sites: 2, zero: 2 });
  });

  it('publishes exactly one tally, so a second cannot describe a situation that cannot occur', () => {
    // `multiline` used to sit here, always 0, for "an exit whose argument spans
    // lines"; under a tree reading a spanning call is an ordinary site. `indirect`
    // followed it in v3.44 for the same reason: a basket whose members turn out to
    // be sites is a basket that describes the reading rather than the tree.
    expect(Object.keys(classify('process.exit(1);').excluded)).toEqual(['zero']);
  });

  it('accounts for every call in every script, and names the two continuations', () => {
    // The independent reading: `getChildren()` rather than `forEachChild`, walked
    // recursively. Same tree, different traversal -- so a visitor that skipped a
    // corner of the grammar (a class field, a decorator, a default parameter) would
    // show up as a shortfall rather than as a quietly smaller number.
    const files = readdirSync(SCRIPTS)
      .filter((f) => f.endsWith('.mjs') && !f.startsWith('.'))
      .sort();
    const shortfalls: string[] = [];
    let calls = 0;
    let sites = 0;
    const continuationSites: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(SCRIPTS, file), 'utf8');
      const read = exitsIn(file, source);
      sites += read.sites.length;
      const total = read.sites.length + (read.excluded.zero ?? 0);
      for (const line of read.sites.map((site) => site.line)) {
        const text = source.split('\n')[line - 1] ?? '';
        if (text.includes('.then((code) => process.exit(code))')) continuationSites.push(`${file}:${String(line)}`);
      }
      const counted = countExitsByChildren(source, file);
      calls += counted;
      if (total !== counted) shortfalls.push(`${file}: classified ${String(total)}, holds ${String(counted)}`);
    }
    expect(shortfalls).toEqual([]);
    // 140 = 123 failure sites + 17 zero exits. 121 -> 123 is v3.53's entry point: the
    // publish channel's two exits, which used to live outside the repository and therefore
    // outside every count in this file. The step from 130/114 is v3.51's gate:
    // six failure exits and one `--list` success exit, all in
    // `verify-claims-are-sensitive.mjs`; 137/120 -> 138/121 is v3.52's, which added one
    // refusal to `check-ci-budget.mjs` -- a declarations file that cannot be read. The two
    // numbers move together because the question is one -- does the classification account
    // for every call -- and a round that added calls without moving them would be the
    // drift this assertion is for. 141/124 is v3.55's: `check-ci-budget.mjs` now refuses a
    // tree with no history of readings, which is one more exit and one more site.
    // 144/126 is v3.56's reader: a `--file` with no value and a history that does not
    // describe a transport, both of which end the process and neither of which existed
    // before the channel kept a record of what it asked.
    // 145/127 is v3.66's: `check-fault-cases.mjs` refuses an index that does not declare what
    // the set is for, which is one more call and one more failure site -- and it is the same
    // pair moving together, which is what this assertion is about.
    // 146/128 is v3.67's: `gen-examples.mjs` refuses a `--check` whose generated document blocks
    // disagree with the specification. The three throws this round added do not appear here --
    // they are throws, counted in the partition below, and a round that added only throws would
    // leave both numbers still.
    // 150/132 is v3.69's: `check-rulegen-agreement.mjs` owns four exits -- an argument it cannot
    // read, a file it cannot read, a verdict that disagrees with the answer set, and a refusal that
    // names the wrong reason -- and the gate-sites row for the case-file derivation shifted. The two
    // numbers move together for the reason the paragraph above states: one question, counted two ways.
    // 151/133 is v3.80's, and it is the first pair in this file where only one number moved: the new
    // gate `check-repository-table.mjs` owns exactly one exit, the `if (check() !== 0)` at the bottom
    // of every gate in this directory, so the call count and the site count both rise by one. The
    // same round added four `throw new Error` statements, and those are counted in the partition
    // below rather than here -- which is what makes this pair the evidence that the two questions
    // are separate questions.
    //
    // 153/135 is v3.81's, and it is the same shape twice over: `probe-modality-memory.mjs` owns two
    // exits -- a build it cannot find and a row count it cannot use -- so both numbers rise by two.
    // The probe is the reason they are *both* two: a script with two guards, one of which only fires
    // on a bad argument, is where a call count and a site count could have parted.
    //
    // 154/136 is v3.90's, and it is the pair moving together again for the same reason: the
    // aggregate-table gate gained one exit -- a run in which no case at all could be reproduced,
    // which is not a pass -- because a *refusal* stopped being a failure in that round. A step whose
    // title is "either reproduced or refused" needs one sentence for each of the three states, and
    // the state with no case in it is the one that had nowhere to be said.
    //
    // 157/139 is v3.92's, and it is the pair moving together for the eighth round running: the reader
    // that compares a run's own per-test durations with the budget each file states has three exits --
    // an argument it cannot use, a set of problems, and a report that named no test at all -- so the
    // call count and the site count both rise by three. That last exit is the round's own subject one
    // level up: "nothing was over the line" and "nothing was read" print the same number of failures,
    // which is exactly why the aggregate gate's empty corpus needed a sentence and this needed one too.
    //
    // 158/140 is v3.93's, and it is the ninth round in which the two move together, for one exit: the
    // coverage table's reader refuses a stale figure, a missing dimension, a duplicate row, a report
    // without one of the four totals, and a required report that is not there -- all of them through
    // one `fail()`, because a guard whose refusals are one paragraph each is a guard whose exit code
    // says the same thing five ways. The pair moving together is not the interesting part; the
    // interesting part is that this is the first site in the tree whose *subject* is a figure the
    // documents publish about their own measurement.
    //
    // 159/141 is v3.96's, and the pair moves together for the tenth round, for the same reason one
    // degree further out: a document's language is a property nothing in this tree read, so the gate
    // that reads it is one more script with one more exit -- the verdict `check-docs-language.mjs`
    // hands to `process.exit`. What makes it worth a paragraph is that its *subject* is the documents
    // themselves rather than a number they publish: the nine rounds before it each added a reader for a
    // figure, and this one adds a reader for the sentence the figure is written in.
    //
    // 160/142 is v3.98's, and the pair moves together for the eleventh round. The subject is the same
    // one v3.96 took up -- a sentence nothing read -- from the other side: the document reader covers
    // markdown, and every comment in `src/`, `scripts/` and the tests was reviewed by reviewers. The
    // exit count rises by one because the verdict is one `process.exit`, and the *script* count rises
    // by two because the scanner behind it has no exit of its own: a reading module a verdict is built
    // on, which is the shape that lets `verify-gates-are-testable` empty the gate without killing the
    // worker.
    // 161/143 is v3.99's, and the pair moves together for the twelfth round. The subject is the one
    // v3.98 left on the Open list in its own header: a `#` in YAML is four grammars, so the workflow
    // files were the only prose surface in the tree with no reader at all -- 1,215 marks, almost all
    // of them sentences about why a step exists. The exit count rises by one for the verdict and the
    // script count by two for the scanner it is built on, which is the same shape as v3.98's pair.
    //
    // 162/144 is v3.107's, and the pair moves together for the thirteenth round -- but for a reason
    // none of the twelve had. Every round before this one added a *reader*: a gate that reads a
    // figure, a sentence, a comment, a workflow's prose. This one adds no reader at all. It adds a
    // way to **drive** a gate that already exists, so that what the gate does with a value it
    // computed stops being unobservable: `verify-local.mjs --rehearse <shape>` takes its inputs from
    // a table instead of from a fifteen-minute run, and the refusal for a name the table does not
    // have is the one new exit. The script count does not move, because the table lives in
    // `gate-receipt.mjs` -- a module with no exit, which is where it belongs: it is the enumeration
    // of that module's own branches. What makes the pair worth a paragraph is the direction: the
    // eleven rounds above each moved the inventory by reading something new, and this one moves it by
    // making an old reading falsifiable.
    // 164/145 is v3.124's, and the pair moves together for the fourteenth round. This one adds a
    // reader whose subject is not a figure but the **vocabulary the figures are written in**: nine
    // unit nouns are printed by more than one gate, and the count `8` is printed as `row(s)` by two
    // of them for two unrelated tables. The pair moves by two calls and one site because the exit is
    // a single `fail()` and the other call is the `--write` that regenerates the inventory -- the
    // shape v3.98 and v3.99 established, one call further out.
    // 165/146 is v3.134's, and the pair moves together for the fifteenth round. This one is a
    // gate whose subject is a **document's shape** rather than a number: every clause of
    // `docs/acceptance.md` owes an address a reader can open and a round in its heading, and the
    // index beneath the lead is compared line by line with the headings it projects. One exit,
    // one site: the clause rules and the index comparison return sentences, and `fail()` is the
    // only place the verdict is spent -- the shape v3.98 and v3.99 established.
    // 166/146 is v3.148's, and the pair moves apart for the first time in eleven rounds: the mode that
    // rewrites the history ends on `process.exit(0)`, which is a **call** and not a site -- the predicate
    // is "an argument that is not a known zero", so a success exit joins `excluded.zero` (19 -> 20) and
    // leaves the inventory at 146. A round that moved both would have had to add a refusal, and this one
    // did: the usage check that used to be one call is now one call with a second clause, which is why
    // the pair is not a line through the origin.
    // 169/149 is v3.155's, and it is the first round in which the two numbers move by the same
    // amount for **three separate reasons** rather than one gate's arrival. Two of the three are
    // the shard parser in `verify-gates-are-testable.mjs`: a `--shard` specification nobody can
    // number (`<i>/<n>`, 1 <= i <= n) and a slice that selects nothing, which would otherwise
    // print a tidy summary of zero gates and exit 0. The third is a refusal that had been a
    // *sentence without a verdict*: `verify-site-proofs.mjs` printed a usage line for an unknown
    // argument and then carried on measuring, so an argument it had just called unknown had no
    // effect on its status. That is the same defect as the empty shard one level down -- a gate
    // whose prose and whose exit disagree -- and it is why this round's pair is not a line
    // through the origin either: three calls, three sites, and one of the three was already
    // being printed before it was counted.
    // 169/149 -> 172/152 in v3.157, and this pair **is** a line through the origin: the two
    // refusals a cost table needs at the gate -- one for a table that cannot be read and one for
    // a table that no longer describes the inventory -- and the refusal of `--costs` on a run
    // that did not measure the whole inventory.
    expect(calls).toBe(172);
    expect(sites).toBe(152);
    // Both were filed as `indirect` before v3.44: a real exit whose statement it is
    // not, and the one that carries `main()`'s verdict.
    expect(continuationSites).toEqual([
      'derive-fault-golden.mjs:252',
      'score-fault-extraction.mjs:202',
    ]);
  });
});

/**
 * Count `process.exit` calls by walking `getChildren()`, which yields tokens as
 * well as nodes -- a different traversal from `forEachChild`, over the same tree.
 *
 * Deliberately written out rather than shared with the module under test: a
 * reading that imports the reading is not independent. It also keys on the call's
 * own text rather than on its callee's shape, so a classifier that got the
 * `process.exit` test itself wrong would disagree here.
 */
function countExitsByChildren(source: string, name: string): number {
  const ts = loadTypeScript();
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let found = 0;
  interface NodeLike {
    kind: number;
    getChildren?: () => NodeLike[];
    getText?: () => string;
  }
  const walk = (node: NodeLike): void => {
    if (node.kind === ts.SyntaxKind.CallExpression) {
      const text = node.getText?.() ?? '';
      if (/^process\.exit\s*\(/.test(text)) found += 1;
    }
    for (const child of node.getChildren?.() ?? []) walk(child);
  };
  walk(file as unknown as NodeLike);
  return found;
}

/** The compiler, resolved from the repository rather than from this test's path. */
function loadTypeScript(): typeof import('typescript') {
  return createRequire(import.meta.url)('typescript') as typeof import('typescript');
}
