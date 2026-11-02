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
 * ## What this module does not decide
 *
 * Nothing. `claimedSites` reads the inventory, `parseTrace` and `parseSpawns` read a
 * run, `failureSummary` reads a failed run's own report, and `unprovenClaims`
 * compares those facts. The gate decides what to print and which code to exit with,
 * for the reason `gate-proofs.mjs` gives: a gate is proved by being emptied, so its
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
 */
export const HOOK_SOURCE = [
  "const fs = require('node:fs');",
  'const out = process.env.RCA_SITE_TRACE;',
  'const original = process.exit.bind(process);',
  'process.exit = function tracedExit(code) {',
  '  try {',
  '    if (out) {',
  '      const stack = String(new Error().stack);',
  '      for (const frame of stack.split("\\n").slice(1, 12)) {',
  '        const hit = /\\(?(\\/.*?\\/scripts\\/[A-Za-z0-9._-]+\\.mjs):(\\d+):\\d+\\)?/.exec(frame);',
  '        if (hit !== null) {',
  '          fs.appendFileSync(out, hit[1] + ":" + hit[2] + "\\n");',
  '          break;',
  '        }',
  '      }',
  '    }',
  '  } catch {',
  '    // A trace that cannot be written is a measurement that failed, not a gate',
  '    // that failed. Swallowing it here is what keeps the child`s verdict its own.',
  '  }',
  '  return original(code);',
  '};',
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
    if (line.startsWith('spawn ')) continue;
    const hit = /\/scripts\/([A-Za-z0-9._-]+\.mjs):(\d+)\s*$/.exec(line);
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
    });
  }
  return claims;
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
export function unprovenClaims(claimed, firedByFile, blindByFile = new Map()) {
  const violations = [];
  for (const claim of claimed) {
    const fired = firedByFile.get(claim.file);
    if (fired === undefined) {
      violations.push(
        `${claim.site} is claimed by ${claim.file}, which was not run, so the claim is unmeasured`,
      );
      continue;
    }
    if (fired.has(claim.site)) continue;
    if (blindByFile.get(claim.file)?.has(claim.script) === true) {
      violations.push(
        `${claim.site} is claimed by ${claim.file}, which started ${claim.script} in a child that ` +
          'did not carry the hook, so this run cannot say whether that exit was reached',
      );
      continue;
    }
    violations.push(
      `${claim.site} is claimed by ${claim.file}, which runs ${claim.script} and never reaches this exit`,
    );
  }
  return violations;
}
