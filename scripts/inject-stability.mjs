#!/usr/bin/env node
/**
 * Injection battery for the four stability properties.
 *
 * Each injection mutates the SHIPPED scorer in a way that a reader could plausibly
 * write, then runs the new suite. A property that survives its own injection is
 * not a test -- it is a comment.
 */
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Paths are resolved from this script's own location, never hard-coded.
 *
 * The first version of this file used the absolute path of the machine it was
 * written on. That passed locally on every run and failed the first time it ran
 * in CI -- `copyFileSync` on a path that does not exist there -- which is the
 * exact local-green/CI-red drift the repository's gates exist to prevent, and it
 * was introduced by a script whose whole purpose is catching that class of
 * problem. Resolving from `import.meta.url` is the only form that cannot drift:
 * a battery that only works on the author's checkout cannot gate anything.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const SRC = resolve(REPO, 'packages/core/src/fault/extraction-scoring.ts');
const BAK = resolve(REPO, 'node_modules/.cache/extraction-scoring.bak.ts');

// The backup has to live somewhere writable that is not inside the tree being
// graded. `node_modules/.cache` exists after any install and is never committed,
// so a crashed run cannot leave a stray file that a later `git status` would
// report as a source change.
mkdirSync(dirname(BAK), { recursive: true });
copyFileSync(SRC, BAK);
const original = readFileSync(SRC, 'utf8');

function runSuite() {
  try {
    const out = execSync(
      'pnpm exec vitest run --root packages/core extraction-miss-diagnosis.test.ts 2>&1',
      { cwd: REPO, encoding: 'utf8' },
    );
    const m = /Tests\s+(?:(\d+) failed \| )?(\d+) passed/.exec(out);
    return { failed: m && m[1] ? Number(m[1]) : 0, passed: m ? Number(m[2]) : 0 };
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '');
    const m = /Tests\s+(?:(\d+) failed \| )?(\d+) passed/.exec(out);
    return { failed: m && m[1] ? Number(m[1]) : 1, passed: m ? Number(m[2]) : 0 };
  }
}

const injections = [
  {
    name: 'A. non-deterministic: embed a per-call counter in the report',
    apply(t) {
      // Plausible-looking: "tag each report with a run id". Breaks byte-identical
      // repeat calls, which is exactly what the determinism property asserts.
      //
      // Anchored on the real `return {` shape (verified against the source; the
      // first attempt at this injection silently did not apply, which the battery
      // reported as SURVIVED -- an inert injection is a false survivor, so the
      // script now prints SKIP when an anchor fails rather than reading as a pass).
      const patched = t
        .replace(
          'export function buildExtractionReport(',
          'let __reportSerial = 0;\nexport function buildExtractionReport(',
        )
        .replace(
          '\n  return {\n    total,\n    counts,',
          '\n  __reportSerial += 1;\n  return {\n    serial: __reportSerial,\n    total,\n    counts,',
        );
      return patched;
    },
  },
  {
    name: 'B. mutates its input: sorts the samples in place',
    apply(t) {
      return t.replace(
        /(\n\s*)(const paired = samples\.map)/,
        '$1samples.sort((a, b) => (a.id < b.id ? -1 : 1));$1$2',
      );
    },
  },
  {
    name: 'C. pairs by position instead of by id',
    apply(t) {
      // The classic bug this contract exists to prevent.
      return t.replace(
        /const p = byId\.get\(s\.id\);/,
        'const p = samples.indexOf(s) < predictions.length ? predictions[samples.indexOf(s)] : undefined;',
      );
    },
  },
  {
    name: 'D. drops the denominator: omits a sample that missed',
    apply(t) {
      return t.replace(
        /samplesWithMisses: /,
        'samplesWithMisses: 0 + ',
      );
    },
  },
];

let survivors = 0;
let inert = 0;

for (const inj of injections) {
  const mutated = inj.apply(original);
  if (mutated === original) {
    // An injection whose anchor no longer matches is NOT a survivor. Reporting it
    // as one would read as "the test has no teeth" when the truth is "the
    // mutation never happened" -- the same class of false reading as a test that
    // passes for the wrong reason. Counted separately and failed at the end.
    console.log(`INERT ${inj.name}  -- anchor did not match; the injection never applied`);
    inert += 1;
    continue;
  }
  writeFileSync(SRC, mutated);
  const r = runSuite();
  writeFileSync(SRC, original);
  if (r.failed > 0) {
    console.log(`CAUGHT  ${inj.name}  (failed ${r.failed}, passed ${r.passed})`);
  } else {
    console.log(`SURVIVED ${inj.name}  -- no test detected this mutation`);
    survivors += 1;
  }
}

writeFileSync(SRC, original);
copyFileSync(BAK, SRC);
console.log('');
const restored = execSync(`diff -q ${BAK} ${SRC} || true`, { shell: '/bin/bash' }).toString();
console.log(restored.trim() === '' ? 'source restored: identical to backup' : 'source restore FAILED');
console.log(`battery: ${injections.length - survivors - inert} caught, ${survivors} survived, ${inert} inert`);
process.exit(survivors === 0 && inert === 0 ? 0 : 1);
