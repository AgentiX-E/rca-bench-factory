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
 * ## What this module does not decide
 *
 * Nothing. `claimedSites` reads the inventory, `parseTrace` reads a run, and
 * `unprovenClaims` compares the two facts. The gate decides what to print and which
 * code to exit with, for the reason `gate-proofs.mjs` gives: a gate is proved by
 * being emptied, so its decision cannot live in a file a test imports.
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
 * Three properties it must hold, each asserted in `site-proofs.test.ts`:
 *
 *   - it records the *innermost* frame that is a script, since `process.exit` may be
 *     wrapped by the caller;
 *   - it never changes the verdict, so a child that exits 1 still exits 1 even if
 *     the trace cannot be written;
 *   - it is inert when no trace was asked for, because `NODE_OPTIONS` reaches the
 *     suite's own workers, which exit constantly.
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
].join('\n');

/** The hook written into `dir`, and its path. */
export function hookFile(dir) {
  const path = `${dir}/site-trace-hook.cjs`;
  writeFileSync(path, HOOK_SOURCE);
  return path;
}

/**
 * The sites named by a trace, sorted and deduplicated.
 *
 * Each line the hook writes is `<absolute path>:<line>`. The path is absolute
 * because that is what a stack frame holds, and it is deliberately *not* compared:
 * the same gate runs from this tree and from a scratch copy several tests build, and
 * both are the same site. What survives is `scripts/<name>.mjs:<line>`, which is what
 * the inventory records.
 *
 * Frames that are not scripts are dropped rather than reported. A test file exits
 * too -- vitest's worker does, and a fixture that gives up early does -- and counting
 * those would make every claim look honoured.
 */
export function parseTrace(text) {
  const found = new Set();
  for (const line of String(text).split('\n')) {
    const hit = /\/scripts\/([A-Za-z0-9._-]+\.mjs):(\d+)\s*$/.exec(line);
    if (hit !== null) found.add(`scripts/${hit[1]}:${hit[2]}`);
  }
  return [...found].sort();
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
 * A file with no entry in `firedByFile` is reported the same way, with a different
 * sentence: no run happened, or the run could not be started, and neither is
 * evidence about the claim.
 */
export function unprovenClaims(claimed, firedByFile) {
  const violations = [];
  for (const claim of claimed) {
    const fired = firedByFile.get(claim.file);
    if (fired === undefined) {
      violations.push(
        `${claim.site} is claimed by ${claim.file}, which was not run, so the claim is unmeasured`,
      );
      continue;
    }
    if (!fired.has(claim.site)) {
      violations.push(
        `${claim.site} is claimed by ${claim.file}, which runs ${claim.script} and never reaches this exit`,
      );
    }
  }
  return violations;
}
