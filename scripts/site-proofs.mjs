#!/usr/bin/env node
/**
 * Reading an exit trace: which failure sites a test run reached, and whether the
 * inventory's claims about them held.
 *
 * ## Why this module exists
 *
 * `golden-master/gate-sites.json` carries a `provedBy` for every failure site, and
 * three rules in `gate-sites-are-proven.test.ts` read that claim. All three are
 * satisfied by less than the sentence says. Rule 3 asks whether the named file
 * *mentions* the script; rule 7 asks whether it *executes* it, at file level. A file
 * that runs a gate fifteen times for one exit satisfies both while never reaching
 * another, and the inventory would go on publishing the second as proved.
 *
 * Measured on the tree that prompted this, with the hook below and no other change:
 * of 96 claims, **two were false**. `scripts/check-cli-reference.mjs:51` was
 * published as proved by `check-cli-reference.test.ts`, which fires only line 301 --
 * the empty-table exit is reached in `gates-are-testable.test.ts`. And
 * `scripts/verify-scorer-stability.mjs:306` was published as proved by a file that
 * fires no site of that script at all: every case in it drives the gate through a
 * dataset the parser rejects, so the refusal is a crash and the gate's own
 * `FAILED: N propert(y/ies)` arm had never run.
 *
 * ## Why the question is an experiment
 *
 * "Did this file make this exit fire" cannot be answered from source. A regex over
 * the file finds the string; a spawn scan finds the script; only running it says
 * whether the branch was taken. The hook is the smallest way to observe that without
 * editing the gates: it replaces `process.exit` in every child, records the caller's
 * script and line, and then calls the original. It is installed through
 * `NODE_OPTIONS`, which descendants inherit, so nothing in the tree needs to know it
 * is being measured.
 *
 * ## The one thing inheritance does not cover, and what the trace does about it
 *
 * A child started with an `env:` that does not carry `NODE_OPTIONS` runs *without*
 * the hook, and its exits are invisible. Read naively, that is indistinguishable from
 * a gate that was never reached, so the gate would report a wrong pointer where the
 * truth is a measurement that could not see -- the same accusation this module was
 * written to stop making.
 *
 * It cannot be repaired from the child: anything the child could report through is
 * the environment that was dropped. It *can* be observed in the parent, which is
 * still instrumented when it calls `spawn`. So the hook also records, for every
 * child whose arguments name a script under `scripts/`, whether that child would
 * carry the hook. The trace then distinguishes three states, not two:
 *
 * | trace of a claimed script | what it means |
 * | --- | --- |
 * | an exit at the claimed line | the claim is honoured |
 * | a `spawn traced` and no such exit | the file started the script and it did not reach that line |
 * | a `spawn blind` and no such exit | the file started it out of sight; this run cannot say |
 *
 * The third state is a fact about the *measurement*, and the gate prints it as one.
 *
 * ## The second question, and why it is the same instrument
 *
 * "This file reached the exit" is one half of a proof. The other half is "and it
 * would notice if the exit stopped failing" -- a witness that reaches a site and
 * passes anyway is a witness that proves nothing about it, and no amount of
 * reaching distinguishes the two. The hook already computes the frame that decides
 * reachability, so the mutant is one line on top of it: `RCA_HOLLOW_SITE` names one
 * site, and the hook calls `process.exit(0)` from that frame instead of the code the
 * gate asked for. Nothing is written to the tree, which is the difference between
 * this and `verify-gates-are-testable.mjs` -- that one hollows a whole gate on disk
 * and needs a journal, a precondition and a restore path, none of which is necessary
 * when the edit is a value rather than a file.
 *
 * Verified per site, not per file: a file sensitive to one of its exits says nothing
 * about the other nine. Measured on this tree, per site: **100 claims, 44 files, 0
 * survivors** -- every claimed exit can disappear and some test goes red.
 *
 * ## What this module does not decide
 *
 * Nothing. `claimedSites` reads the inventory, `parseTrace`, `parseSpawns`,
 * `parseHollows` and `failureSummary` read a run, and `unprovenClaims` compares
 * those facts. The gates decide what to print and which code to exit with, for the
 * reason `gate-proofs.mjs` gives: a gate is proved by being emptied, so its
 * decision cannot live in a file a test imports.
 */

import { writeFileSync } from 'node:fs';

/**
 * The hook, as source.
 *
 * Kept as a string rather than a file beside this module because it is installed
 * into children started from *other* trees -- a test that copies a gate into a
 * scratch directory still spawns nodes, and they inherit `NODE_OPTIONS` pointing at
 * whatever path was written. Writing it into the scratch directory each run keeps
 * the two in step; a committed file would have to be resolved relative to something.
 *
 * Four properties it must hold, each asserted in `site-proofs.test.ts`:
 *
 *   - it records the *innermost* frame that is a script, since `process.exit` may be
 *     wrapped by the caller;
 *   - it never changes the verdict, so a child that exits 1 still exits 1 even if
 *     the trace cannot be written;
 *   - it is inert when no trace was asked for, because `NODE_OPTIONS` reaches the
 *     suite's own workers, which exit constantly -- including the spawn wrappers,
 *     which are only installed once a trace path exists;
 *   - it never breaks a spawn. The wrappers call the original and return its result;
 *     a spawn that cannot be noted is still a spawn, and a measurement may not
 *     become a failure of the thing it measures.
 *
 * And one property of the mutant arm: it records that it applied before it replaces
 * the code, so a run that stayed green because the mutant never arrived is a
 * different reading from a run that stayed green after it did.
 */
export const HOOK_SOURCE = [
  "const fs = require('node:fs');",
  'const out = process.env.RCA_SITE_TRACE;',
  'const hollow = process.env.RCA_HOLLOW_SITE || "";',
  'const original = process.exit.bind(process);',
  'process.exit = function tracedExit(code) {',
  '  let frame = null;',
  '  // Reading the stack costs something, so it is read only when a question was',
  '  // asked. Every other process in the tree -- the runner, its workers, the gates',
  '  // themselves -- is untouched.',
  '  if (out || hollow !== "") {',
  '    try {',
  '      const stack = String(new Error().stack);',
  '      for (const line of stack.split("\\n").slice(1, 12)) {',
  '        const hit = /\\(?(\\/.*?\\/scripts\\/[A-Za-z0-9._-]+\\.mjs):(\\d+):\\d+\\)?/.exec(line);',
  '        if (hit !== null) {',
  '          frame = hit[1] + ":" + hit[2];',
  '          break;',
  '        }',
  '      }',
  '    } catch {',
  '      // A frame that cannot be read is a measurement that failed, not a gate',
  '      // that failed. Swallowing it here is what keeps the verdict the child`s.',
  '    }',
  '  }',
  '  try {',
  '    if (out && frame !== null) fs.appendFileSync(out, frame + "\\n");',
  '    // The other half of the question: an exit that stops failing. The line is',
  '    // written before the code is replaced, because "this mutant was applied here"',
  '    // and "this exit was reached" are different facts and the reading below needs',
  '    // both -- a green run whose mutant never arrived is not a survivor.',
  '    if (hollow !== "" && frame !== null && frame.endsWith("/" + hollow)) {',
  '      if (out) fs.appendFileSync(out, "hollow " + hollow + "\\n");',
  '      return original(0);',
  '    }',
  '  } catch {',
  '    // Same rule: writing the trace may fail, and a measurement that failed is not',
  '    // a verdict about the gate.',
  '  }',
  '  return original(code);',
  '};',
  '',
  '// A gate can also refuse by throwing, and an uncaught throw ends the process with',
  '// status 1 -- to a shell the same refusal as `process.exit(1)`. The hook above',
  '// cannot see it: it replaces a function, and a `throw` is not a call. So the',
  '// process that is *the gate* also listens for the exception, records the line the',
  '// stack names, writes the stack the runtime would have written, and exits 1.',
  '//',
  '// The gate test is `process.argv[1]`, not a guess: it is the script this process',
  "// was started to run. The suite's own worker does not match -- its argv[1] is the",
  "// runner -- which is what keeps this from taking vitest's exception handling away",
  '// from vitest and turning a red test into a green process.',
  'if (out && /[\\/]scripts[\\/][A-Za-z0-9._-]+\\.mjs$/.test(String(process.argv[1] || ""))) {',
  '  process.on("uncaughtException", (error) => {',
  '    try {',
  '      const stack = String((error && error.stack) || error);',
  '      const hit = /\\(?([^()\\s]*[\\/]scripts[\\/][A-Za-z0-9._-]+\\.mjs):(\\d+):\\d+\\)?/.exec(stack);',
  '      if (hit !== null) fs.appendFileSync(out, "throw " + hit[1] + ":" + hit[2] + "\\n");',
  '      process.stderr.write("Uncaught " + stack + "\\n");',
  '    } catch {',
  '      // A trace that cannot be written is a measurement that failed, and a',
  '      // measurement may not become a verdict about the gate.',
  '    }',
  '    return original(1);',
  '  });',
  '}',
  '',
  '// The listener above sees a throw that *ended* a process. A throw a caller caught is',
  '// the same statement doing the same job one frame down, and no listener can see it:',
  '// the exception never reaches the runtime. So the module that holds the throw is',
  '// rewritten before it is evaluated -- `scripts/throw-witness.mjs` -- and this preload',
  '// is where that loader is registered and where the line it rewrites calls home.',
  '//',
  '// One environment name, not two: `RCA_THROW_WITNESS` carries the absolute path of the',
  '// loader, so "the witness is on" and "here is the witness" cannot disagree.',
  'const witness = process.env.RCA_THROW_WITNESS || "";',
  'if (out && witness !== "") {',
  '  try {',
  '    require("node:module").register(require("node:url").pathToFileURL(witness).href);',
  '  } catch {',
  '    // A witness that could not be registered is a measurement that did not happen.',
  '    // It is not a verdict about the gate, and the run that asked for it reports the',
  '    // absence of `reached` lines as its own problem rather than as the gate`s.',
  '  }',
  '  fs.appendFileSync(out, "witness on\\n");',
  '  globalThis.__rcaThrow = function witnessedThrow(line, file, hollowed) {',
  '    try {',
  '      if (typeof file !== "string" || !/^[A-Za-z0-9._-]+\\.mjs$/.test(file)) return;',
  '      const site = "scripts/" + file + ":" + String(line);',
  '      fs.appendFileSync(out, "reached " + site + "\\n");',
  '      // "the mutant arrived here" and "this statement was reached" are different',
  '      // facts, and a green run whose mutant never arrived is not a survivor.',
  '      if (hollowed === true) fs.appendFileSync(out, "hollowed " + site + "\\n");',
  '    } catch {',
  '      // Same rule as every other write in this file.',
  '    }',
  '  };',
  '}',
  '',
  '// A child started with an env that drops NODE_OPTIONS runs without this hook, and',
  '// its exits are invisible to the run that started it. The parent is still',
  '// instrumented at the moment it spawns, so that is where the difference between',
  '// "did not reach the exit" and "was never in sight" can be observed at all.',
  'if (out) {',
  '  try {',
  '    const cp = require("node:child_process");',
  '    const asked = /--require=(\\S+)/.exec(String(process.env.NODE_OPTIONS || ""));',
  '    const hookPath = asked === null ? "" : asked[1];',
  '    const note = (argv, options) => {',
  '      try {',
  '        const text = Array.isArray(argv) ? argv.join(" ") : String(argv);',
  '        const named = /(?:^|[\\/])scripts[\\/]([A-Za-z0-9._-]+\\.mjs)/.exec(text);',
  '        if (named === null) return;',
  '        const child = (options && options.env) || process.env;',
  '        const carried = String((child && child.NODE_OPTIONS) || "");',
  '        const traced = hookPath !== "" && carried.includes(hookPath);',
  '        fs.appendFileSync(out, "spawn " + (traced ? "traced" : "blind") + " scripts/" + named[1] + "\\n");',
  '      } catch {',
  '        // A spawn that cannot be noted is still a spawn: nothing here may throw',
  '        // into the caller, which is a gate under test.',
  '      }',
  '    };',
  '    for (const name of ["spawn", "spawnSync", "fork", "execFile", "execFileSync", "exec"]) {',
  '      const real = cp[name];',
  '      if (typeof real !== "function") continue;',
  '      cp[name] = function noted(...args) {',
  '        const first = typeof args[0] === "string" ? args[0] : "";',
  '        const second = args[1];',
  '        const rest = Array.isArray(second) ? second : [];',
  '        const options = Array.isArray(second) ? args[2] : second;',
  '        note([first, ...rest], typeof options === "object" && options !== null ? options : undefined);',
  '        return real.apply(this, args);',
  '      };',
  '    }',
  '  } catch {',
  '    // No spawn record costs the blind-spot reading, not the run.',
  '  }',
  '}',
  '',
].join('\n');

/** The hook written into `dir`, and its path. */
export function hookFile(dir) {
  const path = `${dir}/site-trace-hook.cjs`;
  writeFileSync(path, HOOK_SOURCE);
  return path;
}

/**
 * The exit sites named by a trace, sorted and deduplicated.
 *
 * Each line the hook writes for an exit is `<absolute path>:<line>`. The path is
 * absolute because that is what a stack frame holds, and it is deliberately *not*
 * compared: the same gate runs from this tree and from a scratch copy several tests
 * build, and both are the same site. What survives is `scripts/<name>.mjs:<line>`,
 * which is what the inventory records.
 *
 * Frames that are not scripts are dropped rather than reported. A test file exits
 * too -- vitest's worker does, and a fixture that gives up early does -- and counting
 * those would make every claim look honoured. Spawn records are dropped here for the
 * same reason: they are a statement about a child, not an exit, and `parseSpawns`
 * reads them.
 */
export function parseTrace(text) {
  const found = new Set();
  for (const line of String(text).split('\n')) {
    if (/^(spawn|hollow|throw|reached) /.test(line)) continue;
    const hit = /\/scripts\/([A-Za-z0-9._-]+\.mjs):(\d+)\s*$/.exec(line);
    if (hit !== null) found.add(`scripts/${hit[1]}:${hit[2]}`);
  }
  return [...found].sort();
}

/**
 * Whether the throw witness was installed in the run that produced this trace.
 *
 * The recorder is installed by `site-proofs.mjs`'s preload in a child and by
 * `test/setup/throw-witness.ts` in a worker, and both write `witness on` when they do.
 * Without this line a run whose recorder never arrived would report every throw as
 * unreached, which is an accusation about the tree made out of a broken measurement --
 * the mistake the blind-spot column exists to avoid, one instrument over.
 */
export function witnessArmed(text) {
  return /^witness on\s*$/m.test(String(text));
}

/**
 * The throw statements a run **reached**, whether or not anything caught them.
 *
 * A third fact from the same trace file, and it is not `parseThrows` with a wider
 * net: `parseThrows` reads what the runtime reported when a process died, this reads
 * what the rewritten statement announced before it threw. The two are nested --
 * `parseThrows ⊆ parseReached` -- and that containment is a property a test asserts,
 * because a throw that ended a process and was not announced is a rewrite that did
 * not arrive, which would silently widen the gap this instrument exists to close.
 */
export function parseReached(text) {
  const found = new Set();
  for (const line of String(text).split('\n')) {
    const hit = /^reached scripts\/([A-Za-z0-9._-]+\.mjs):(\d+)\s*$/.exec(line);
    if (hit !== null) found.add(`scripts/${hit[1]}:${hit[2]}`);
  }
  return [...found].sort();
}

/**
 * The sites one run was asked to hollow, and actually did.
 *
 * `RCA_HOLLOW_SITE` names one site; the hook records the moment it replaces that
 * site's exit code with zero. The record is what separates two answers that look
 * identical from outside: a witness that did not notice the exit stop failing, and
 * a mutant that never arrived in the child that reached the exit. The first is a
 * defect in the test; the second is a defect in the measurement, and crediting it as
 * the first would accuse the tree of the instrument's blindness -- finding 359's
 * mistake, one question over.
 */
export function parseHollows(text) {
  const found = [];
  for (const line of String(text).split('\n')) {
    // Two spellings because there are two mutants: the exit hook replaces a call's
    // argument (`hollow`), and the throw witness removes a statement (`hollowed`).
    // One reader, because the question is the same one -- did the mutant arrive.
    const hit = /^(?:hollow|hollowed) (scripts\/[A-Za-z0-9._-]+\.mjs:\d+)\s*$/.exec(line);
    if (hit !== null && !found.includes(hit[1])) found.push(hit[1]);
  }
  return found.sort();
}

/**
 * The lines a run threw from, and the process ended on.
 *
 * The hook records these from the gate's own `uncaughtException` listener, and they
 * are kept apart from the exit trace on purpose: an exit is a decision the gate
 * *made*, a throw is a decision that escaped it, and the two are proved by the same
 * question but not by the same fact. Merging them into one set would let a red run
 * count a throw as an exit if the same line ever held both.
 */
export function parseThrows(text) {
  const found = new Set();
  for (const line of String(text).split('\n')) {
    const hit = /^throw (?:.*?\/scripts\/([A-Za-z0-9._-]+\.mjs)):(\d+)\s*$/.exec(line);
    if (hit !== null) found.add(`scripts/${hit[1]}:${hit[2]}`);
  }
  return [...found].sort();
}

/**
 * The scripts a run started, and whether each child could carry the hook.
 *
 * The counts are kept rather than a boolean because a file may start the same gate
 * twice with different environments, and one traced child is enough to see it: the
 * third state in the table above is only honest when *no* child was traced.
 */
export function parseSpawns(text) {
  const counts = new Map();
  for (const line of String(text).split('\n')) {
    const hit = /^spawn (traced|blind) (scripts\/[A-Za-z0-9._-]+\.mjs)\s*$/.exec(line);
    if (hit === null) continue;
    const entry = counts.get(hit[2]) ?? { traced: 0, blind: 0 };
    entry[hit[1]] += 1;
    counts.set(hit[2], entry);
  }
  return counts;
}

/**
 * The scripts this run started *only* out of sight.
 *
 * A script started both ways is visible, so it is not blind. The distinction is what
 * keeps a claim from being reported as a wrong pointer when the truth is that the
 * child dropped `NODE_OPTIONS`.
 */
export function blindScripts(text) {
  const blind = new Set();
  for (const [script, count] of parseSpawns(text)) {
    if (count.traced === 0) blind.add(script);
  }
  return blind;
}

/**
 * What a failed run said about itself, in at most four lines.
 *
 * The gate used to report a claimant whose own tests were red as *unmeasured*, which
 * is true and useless: the reader has to re-run the file to learn anything. Vitest's
 * dot reporter already publishes the two facts that decide the repair -- which test
 * failed, and whether the failure is an assertion or a crash -- plus the totals. All
 * three are read from the run rather than guessed, and a run whose output carries
 * none of them yields no summary rather than an invented one.
 */
export function failureSummary(text) {
  const lines = String(text).split('\n');
  const picked = [];
  const failed = lines
    .filter((line) => /^\s*FAIL\s+\S/.test(line))
    .map((line) => line.trim().slice(0, 160));
  for (const line of failed.slice(0, 2)) picked.push(line);
  const error = lines.find((line) =>
    /^(AssertionError|Error|TypeError|RangeError|ReferenceError|SyntaxError|UnhandledPromiseRejection)\b/.test(line),
  );
  if (error !== undefined) picked.push(error.trim().slice(0, 160));
  const totals = lines.find((line) => /^\s*Tests\s+\d/.test(line));
  if (totals !== undefined) picked.push(totals.trim());
  return picked;
}

/**
 * Every site the inventory claims is proved, as `{ site, file }`.
 *
 * Exempt sites are not claims and are left out: their argument is that no input can
 * be aimed at them, which is a statement `gate-sites-are-proven.test.ts` already
 * judges. Reading them here would ask a run to confirm the absence of a test.
 */
export function claimedSites(inventory) {
  const sites = Array.isArray(inventory?.sites) ? inventory.sites : [];
  const claims = [];
  for (const site of sites) {
    if (site?.status !== 'proved') continue;
    if (typeof site.provedBy !== 'string' || site.provedBy === '') continue;
    claims.push({
      script: site.script,
      line: site.line,
      site: `${site.script}:${String(site.line)}`,
      file: site.provedBy,
      kind: 'exit',
    });
  }
  // A throw is the same claim with a different fact behind it: the gate refused by
  // throwing, Node printed the stack and exited 1. It is proved by the same two
  // questions -- does the named file reach the line, and would the suite notice if it
  // did not -- so it belongs in the same plan rather than in a second one nobody runs.
  //
  // v3.45 claimed only `fatal` throws here, and that was the same mistake the inventory
  // was making one level up: it treated the disposition as the claim. It is not. A row
  // with `status: proved` says a test reaches the line, and reaching is exactly what
  // this file measures -- the witness records the statement before it executes, so a
  // `throw` a caller catches is still recorded. Reading the fact as "the process ended
  // here" narrowed it to the one disposition that ends it, and left the other
  // thirty-one proved throws unmeasured while the inventory called them proved.
  const throws = Array.isArray(inventory?.throws?.rows) ? inventory.throws.rows : [];
  for (const row of throws) {
    if (row?.status !== 'proved') continue;
    if (typeof row.provedBy !== 'string' || row.provedBy === '') continue;
    claims.push({
      script: row.script,
      line: row.line,
      site: `${row.script}:${String(row.line)}`,
      file: row.provedBy,
      kind: 'throw',
    });
  }
  return claims;
}

/**
 * The claims grouped by the file that makes them, in a stable order.
 *
 * Both gates ask this question -- one runs the file once and reads its trace, the
 * other runs it once per claim -- and a grouping written twice is a grouping that
 * can sort one list and not the other. `--list` output and the run order come from
 * here, so a reader comparing the two plans is comparing the same sequence.
 */
export function claimsByFile(claimed) {
  const groups = new Map();
  for (const claim of claimed) {
    const list = groups.get(claim.file) ?? [];
    list.push(claim);
    groups.set(claim.file, list);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * `--shard <i>/<n>`: which part of the sorted claimants one run is responsible for.
 *
 * The index is one-based because a shard is named by a person in `ci.yml`, and `1/2`
 * reads as "the first of two" rather than "the second of two". A count of zero, an
 * index past the count and a fraction that is not two integers are refused here rather
 * than by the caller noticing an empty run -- a battery that measured nothing would
 * otherwise print a clean bill of health.
 *
 * Returns a value rather than throwing, because the gate and the workflow both ask this
 * question and both need the sentence that says why the argument is wrong.
 */
export function parseShard(text) {
  const match = /^(\d+)\/(\d+)$/.exec(String(text ?? '').trim());
  if (match === null) {
    return {
      ok: false,
      error: `expected --shard <i>/<n> with one-based i and a positive n, not '${String(text)}'`,
    };
  }
  const index = Number(match[1]);
  const count = Number(match[2]);
  if (count < 1) {
    return { ok: false, error: `the shard count has to be at least 1, not ${String(count)}` };
  }
  if (index < 1 || index > count) {
    return {
      ok: false,
      error: `shard ${String(index)}/${String(count)} is out of range: i runs from 1 to n`,
    };
  }
  return { ok: true, index, count };
}

/**
 * The claimants of one shard, from the sorted list `claimsByFile` returns.
 *
 * Position rather than file size, deliberately. A split by measured seconds would have
 * to be re-derived after every run and would put the same file in different shards on
 * different machines; a split by sorted position is a pure function of the inventory,
 * so a plan written in `ci.yml` and a plan checked by a test are the same plan.
 */
export function shardClaims(byFile, index, count) {
  return byFile.filter((_, position) => position % count === index - 1);
}

/**
 * Whether the shard calls in a workflow measure every proved claim exactly once.
 *
 * A split is only an improvement if its union is the whole inventory. Each refusal
 * names a different repair: a missing shard, a duplicated one, two shards in one job
 * (which would run serially and save no wall clock), disagreeing counts, a shard with no
 * file, and a claim measured twice or by nobody. It is a function of the inventory and
 * the plan, so a test can reach every verdict without a runner -- which is the only
 * place those verdicts can be reached at all.
 */
export function checkShardPlan(byFile, specs) {
  const errors = [];
  if (specs.length === 0) {
    return [
      'no call to verify-sites-are-sensitive.mjs carries --shard, so the battery is not ' +
        'split at all and no partition can be checked',
    ];
  }
  const counts = new Set(specs.map((one) => one.count));
  if (counts.size !== 1) {
    errors.push(
      `the shard calls disagree on the count (${[...counts].join(', ')}): every shard of ` +
        'one battery has to name the same n, or the modulo assigns the same file twice',
    );
    return errors;
  }
  const count = specs[0].count;
  if (count < 2) {
    errors.push(
      `one shard is not a split: n is ${String(count)}, and a battery with one shard ` +
        'still measures every claimant in one job',
    );
  }
  for (let index = 1; index <= count; index += 1) {
    const seen = specs.filter((one) => one.index === index).length;
    if (seen === 0) {
      errors.push(
        `shard ${String(index)}/${String(count)} is not called by any step of ci.yml, so its ` +
          'claimants are measured by nobody and the battery would pass on a subset of itself',
      );
    } else if (seen > 1) {
      errors.push(
        `shard ${String(index)}/${String(count)} is called ${String(seen)} times, so its ` +
          'claimants are measured twice and the second run is charged to another job',
      );
    }
  }
  for (const one of specs) {
    if (one.index < 1 || one.index > count) {
      errors.push(
        `shard ${String(one.index)}/${String(count)} is out of range, so its plan cannot ` +
          'be argued about',
      );
    }
  }
  const seenJobs = new Set();
  for (const one of specs) {
    if (seenJobs.has(one.job)) {
      errors.push(
        `\`${one.job}\` calls two shards: they would run one after the other in the same ` +
          'job, which is the same measurement with two names',
      );
    }
    seenJobs.add(one.job);
  }

  const allSites = byFile.flatMap(([, claims]) => claims.map((claim) => claim.site));
  const measured = [];
  for (const one of specs) {
    const files = shardClaims(byFile, one.index, one.count);
    if (files.length === 0) {
      errors.push(
        `shard ${String(one.index)}/${String(one.count)} holds no claimant, so that run ` +
          'would pass while measuring nothing',
      );
    }
    // A loop rather than a spread: the number of claims is a function of the inventory,
    // and a `push(...sites)` over it would overflow the argument limit on a tree with
    // enough proved exits. The guard in `spread-append-guard.test.ts` exists for exactly
    // this shape.
    for (const [, claims] of files) {
      for (const claim of claims) measured.push(claim.site);
    }
  }
  for (const site of new Set(allSites)) {
    const times = measured.filter((one) => one === site).length;
    if (times === 0) {
      errors.push(
        `\`${site}\` is measured by no shard, so a claim that a test proves this exit ` +
          'would go unchecked on this tree',
      );
    } else if (times > 1) {
      errors.push(
        `\`${site}\` is measured by ${String(times)} shards, so the partition is not a ` +
          'partition at all',
      );
    }
  }
  return errors;
}

/**
 * The claims a run did not honour, as sentences.
 *
 * The comparison is **per file**, and that is the whole point. Pooling every file
 * into one set of fired sites would call `check-cli-reference.mjs:51` proved because
 * `gates-are-testable.test.ts` fires it, which is true and is not what the inventory
 * says. A claim names a file; the question is whether *that* file reached the exit.
 *
 * Three sentences, because there are three states and they have three repairs:
 *
 *   - the file was not run -> nothing was measured, and the gate says so instead of
 *     counting it as honoured;
 *   - the file started the script out of sight -> the measurement could not see, and
 *     no re-pointing is called for;
 *   - the file started the script in sight and the exit did not come -> the claim is
 *     false, and either the pointer or the test has to change.
 */
export function unprovenClaims(
  claimed,
  firedByFile,
  blindByFile = new Map(),
  thrownByFile = new Map(),
  reachedByFile = new Map(),
  armedByFile = new Set(),
) {
  const violations = [];
  for (const claim of claimed) {
    const fired = firedByFile.get(claim.file);
    if (fired === undefined) {
      violations.push(
        `${claim.site} is claimed by ${claim.file}, which was not run, so the claim is unmeasured`,
      );
      continue;
    }
    // A throw claim needs the witness, and a run whose witness did not arm cannot
    // answer it in either direction. Saying "never reaches this throw" here would be
    // the instrument's failure reported as the gate's.
    if (claim.kind === 'throw' && !armedByFile.has(claim.file)) {
      violations.push(
        `${claim.site} is claimed by ${claim.file}, whose run armed no throw witness, so this claim is unmeasured`,
      );
      continue;
    }
    // Three facts, three sets. A throw is not an exit that happened a different way:
    // the hook writes them from different places, and reading one as the other would
    // let a run that crashed satisfy a claim about a refusal the gate chose.
    //
    // A throw claim is honoured by *reaching* the statement, not by ending a process
    // on it: a caller that catches it is a reader, and a row proved by a test that
    // expects the throw is proved. When the witness did not run, the ended set is the
    // only evidence there is, so it is used -- and the narrower fact is named in the
    // sentence rather than silently standing in for the wider one.
    const seen = claim.kind === 'throw'
      ? (reachedByFile.get(claim.file) ?? thrownByFile.get(claim.file) ?? new Set())
      : fired;
    if (seen.has(claim.site)) continue;
    const what = claim.kind === 'throw' ? 'never reaches this throw' : 'never reaches this exit';
    if (blindByFile.get(claim.file)?.has(claim.script) === true) {
      violations.push(
        `${claim.site} is claimed by ${claim.file}, which started ${claim.script} in a child that ` +
          `did not carry the hook, so this run cannot say whether that line was reached`,
      );
      continue;
    }
    violations.push(`${claim.site} is claimed by ${claim.file}, which runs ${claim.script} and ${what}`);
  }
  return violations;
}
