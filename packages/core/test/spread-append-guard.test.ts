import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A size-independent append must not go through the spread operator.
 *
 * ## The defect this guards
 *
 * `signals.push(...ingested.signals)` passes every element as a function
 * argument, and V8 caps argument count far below `signals.length` for a real
 * telemetry file. One RE1 `data.csv` holds a whole run, so the first time the
 * round trip was pointed at the real corpus -- 375 cases -- every case died with
 * `RangeError: Maximum call stack size exceeded` before producing a single
 * signal.
 *
 * The reason it existed undetected is the reason a source-level guard is the
 * right fix rather than another behavioural test: **every fixture in this
 * repository is synthetic and small**, so the ceiling was never approached.
 * A behavioural test only covers the calls it makes. This covers the calls
 * nobody has made yet.
 *
 * ## What is allowed and what is not
 *
 * A spread whose array has a *bounded* size is fine and is left alone --
 * `markers.push(...found)` where `found` is filtered from a fixed marker list,
 * `paths.push(...walk(...))` bounded by directory count. The distinction that
 * matters is not the syntax but whether the array's length is a function of the
 * input's row count.
 *
 * That is not decidable by reading one line, so this guard takes the honest
 * route: it names the sites that are known-bounded, each with the reason, and
 * fails on any new one. A new spread therefore has to be argued for rather than
 * waved through, and the argument lives next to the exemption.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..');

/**
 * Spread-appends whose array length is bounded independently of input size.
 *
 * Each entry is `relative path` + `source line`, which is what makes the
 * exemption precise: moving the code invalidates it, and that is intentional.
 */
const BOUNDED_SPREAD_APPENDS: ReadonlyArray<{ file: string; line: string; why: string }> = [
  {
    file: 'packages/core/src/fault/denial-inventory.ts',
    line: 'markers.push(...found);',
    why: '`found` is `DENIAL_MARKERS.filter(...)`, a fixed literal list, so its length has a compile-time ceiling.',
  },
  {
    file: 'packages/core/src/score/official.ts',
    line: 'failures.push(...officialCaseFailures(entry));',
    why: '`officialCaseFailures` returns at most one entry per mutation, and `OFFICIAL_FACETS` is a fixed list.',
  },
  {
    file: 'scripts/verify-example-pack.mjs',
    line: 'if (statSync(join(dir, relative)).isDirectory()) paths.push(...walk(dir, relative));',
    why: '`walk` returns directory entries, bounded by the pack manifest rather than by any row count.',
  },
  {
    file: 'scripts/gen-rcaeval-cases.mjs',
    line: 'unparsed.push(...collected.unparsed);',
    why: '`unparsed` holds one entry per skipped case directory, not one per telemetry row.',
  },
];

/** Every spread-append in the tree, as `file` + trimmed source line. */
function spreadAppends(): Array<{ file: string; line: string }> {
  const dirs = ['packages/core/src', 'packages/cli/src', 'scripts'];
  const found: Array<{ file: string; line: string }> = [];
  for (const dir of dirs) {
    for (const file of walk(join(ROOT, dir))) {
      if (!/\.(?:ts|mjs|js)$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        // Comments are stripped so the explanatory note left in `prime.ts` does
        // not itself register as a violation.
        if (line.startsWith('//') || line.startsWith('*')) continue;
        if (/\.push\(\.\.\./.test(line)) {
          found.push({ file: file.slice(ROOT.length + 1), line });
        }
      }
    }
  }
  return found;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSyncWithTypes(current)) {
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        stack.push(join(current, entry.name));
      } else {
        out.push(join(current, entry.name));
      }
    }
  }
  return out;
}

function readdirSyncWithTypes(dir: string): Array<{ name: string; isDirectory: () => boolean }> {
  // Imported lazily so this file has no top-level dependency on `node:fs` beyond
  // the read used above; `withFileTypes` is what keeps the walk off `statSync`.
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  return readdirSync(dir, { withFileTypes: true });
}

describe('no size-dependent array is spread into a call', () => {
  it('finds the four known-bounded spread appends and nothing else', () => {
    const found = spreadAppends();
    const known = BOUNDED_SPREAD_APPENDS.map((e) => ({ file: e.file, line: e.line }));

    const unexpected = found.filter(
      (f) => !known.some((k) => k.file === f.file && k.line === f.line),
    );
    expect(
      unexpected,
      'A new `push(...x)` appeared. If `x.length` is a function of the input row count it will ' +
        'overflow the argument limit on real data; use a `for` loop. If it is genuinely bounded, ' +
        'add it to BOUNDED_SPREAD_APPENDS with the reason.',
    ).toEqual([]);

    const missing = known.filter((k) => !found.some((f) => f.file === k.file && f.line === k.line));
    expect(
      missing,
      'An exemption no longer matches any line. Either the call was removed -- drop the ' +
        'exemption -- or it moved, in which case the exemption must move with it so the ' +
        'reason stays attached to the code.',
    ).toEqual([]);
  });

  it('names a distinct reason for every exemption, so none is a placeholder', () => {
    const reasons = BOUNDED_SPREAD_APPENDS.map((e) => e.why);
    expect(new Set(reasons).size).toBe(reasons.length);
    for (const reason of reasons) {
      expect(reason.length).toBeGreaterThan(40);
    }
  });

  it('does not exempt the ingest accumulator, which is the site the defect was at', () => {
    // The guard has to be able to fail. This is the negative control: the line
    // that caused finding 117 is not in the exemption list, so a reintroduction
    // is a violation rather than a pre-approved shape.
    const found = spreadAppends();
    expect(found.some((f) => f.file === 'packages/core/src/ingest/prime.ts')).toBe(false);
  });
});
