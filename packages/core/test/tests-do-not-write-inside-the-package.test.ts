import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * No test may write inside the package it is testing.
 *
 * ## What this guards against
 *
 * Finding 218: `export-surface-enumerated.test.ts` proved a property by appending a probe
 * line to `src/export/guard.ts` and restoring it in a `finally`. `writeFileSync` truncates
 * before it writes, so for microseconds the module on disk was partial — and the suite runs
 * thirty-two workers, two of which import that module through the exporters. CI run
 * `39954894209` reported **191 failures** with the single message
 * `(0 , assertExportableBundle) is not a function`, and nothing in it pointed at the write.
 *
 * That write is gone. **This file is what stops the next one**, because a finding that only
 * records "that was a race" leaves the class open: any test may write anywhere, and the
 * failure it causes will name a module that is in fact correct.
 *
 * ## What it can and cannot see
 *
 * The scan is *lexical*, and says so rather than pretending otherwise. It flags a write whose
 * target expression — or whose target's `const` binding, transitively — either **names** a root
 * (`SRC`, `PACKAGE_ROOT`, `ROOT`, `ROOT_DIR`) or **resolves from this file's own location**
 * (`import.meta.url`, `import.meta.dirname`, `process.cwd()`).
 *
 * The second clause is finding 220. The first version tested names only, and the class it had
 * just been written for survived one definition away: `type-miss-probe.test.ts` bound its repo
 * root as `const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')` and
 * wrote a harness into `scripts/` through it. Any name would do, because the binding's *value*
 * is what makes the path repository-relative — a location-derived path can only lead inside the
 * tree. Rooting the rule in the value rather than in the spelling is what makes it independent
 * of what the next author names things.
 *
 * It still does **not** see a path returned by a function — a helper that computes a repository
 * path and hands it back — nor one imported from another module. Those are the remaining false
 * negatives, listed because a guard described as complete when it is lexical is finding 196's
 * defect.
 *
 * The controls are the other half: a scan that reports nothing is indistinguishable from one
 * that cannot report anything, so the detector is also run against a source *string* written
 * to contain the defect, and against strings that must not be flagged.
 */

const REPO = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const TEST_ROOTS = ['packages/core/test', 'packages/cli/test'];

/**
 * Calls that change the filesystem, by the names node gives them, and **which argument is
 * the destination**.
 *
 * The index matters and cost a whole measurement to find: `copyFileSync(source, target)`
 * puts the repository path *first* when it copies a script out of the tree into a scratch
 * one, so a scan that always reads the first argument reports eight copies as writes. The
 * eight were the guard accusing the tests that isolate themselves correctly.
 */
const WRITES: Array<{ name: string; destination: number }> = [
  { name: 'writeFileSync', destination: 0 },
  { name: 'appendFileSync', destination: 0 },
  { name: 'rmSync', destination: 0 },
  { name: 'rmdirSync', destination: 0 },
  { name: 'unlinkSync', destination: 0 },
  { name: 'renameSync', destination: 1 },
  { name: 'mkdirSync', destination: 0 },
  { name: 'copyFileSync', destination: 1 },
  { name: 'cpSync', destination: 1 },
  { name: 'truncateSync', destination: 0 },
];

/** Names that make a path repository-relative rather than scratch. */
const ROOTS = new Set(['SRC', 'PACKAGE_ROOT', 'ROOT', 'ROOT_DIR']);

interface Flag {
  line: number;
  text: string;
}

/**
 * Every write in `source` whose target reaches a repository root.
 *
 * `bindings` is deliberately shallow: the first `const NAME = …` per name, one line each, so
 * a destructured or reassigned variable falls through to "not flagged". That is a false
 * negative rather than a false positive, which is the right direction for a guard whose
 * alternative is to send the next author looking for a differently named variable.
 */
function writesIntoThePackage(source: string): Flag[] {
  const bindings = new Map<string, string>();
  for (const match of source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*([^;\n]+);/g)) {
    if (!bindings.has(match[1] as string)) bindings.set(match[1] as string, match[2] as string);
  }

  /**
   * The expression with string literals blanked out.
   *
   * Without this the scan read `join(tree, 'README.md')` and found an identifier `README` --
   * a *string* that happens to be the name of a `const README = resolve(ROOT, ...)` two
   * hundred lines up. The first measurement reported 17 sites; four survived the argument
   * index, and one of those was this.
   */
  const withoutStrings = (expression: string): string =>
    expression.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');

  /**
   * Expressions that make a path repository-relative because of where they *start*.
   *
   * `import.meta.url` and `import.meta.dirname` are this file's own location, and every path
   * built from one is inside the tree; `process.cwd()` is the package root under vitest. The
   * rule is about the value, not the name, which is why it closes finding 220's case while the
   * name list could not.
   */
  const LOCATION = /import\.meta\.(url|dirname|filename)|process\.cwd\(\)/;

  const reachesRoot = (rawExpression: string, seen = new Set<string>(), depth = 0): boolean => {
    if (depth > 4) return false;
    const expression = withoutStrings(rawExpression);
    if (LOCATION.test(expression)) return true;
    for (const token of expression.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
      const name = token[1] as string;
      if (ROOTS.has(name)) return true;
      if (seen.has(name)) continue;
      const bound = bindings.get(name);
      if (bound !== undefined) {
        seen.add(name);
        if (reachesRoot(bound, seen, depth + 1)) return true;
      }
    }
    return false;
  };

  /**
   * The first argument only.
   *
   * The rest of the line was the first version, and it reported 31 sites of which most
   * named a root in a *later* argument -- `writeFileSync(join(tree, ...),
   * readFileSync(resolve(ROOT, ...)))` writes into a scratch tree and reads from the
   * repository. A guard that counts the read as a write is a guard that gets switched off.
   */
  const firstArgument = (afterCall) => {
    let depth = 0;
    let quote = '';
    for (let i = 0; i < afterCall.length; i += 1) {
      const char = afterCall[i];
      if (quote !== '') {
        if (char === quote && afterCall[i - 1] !== '\\') quote = '';
        continue;
      }
      if (char === "'" || char === '"' || char === '`') quote = char;
      else if (char === '(' || char === '[' || char === '{') depth += 1;
      else if (char === ')' || char === ']' || char === '}') {
        if (depth === 0) return afterCall.slice(0, i);
        depth -= 1;
      } else if (char === ',' && depth === 0) return afterCall.slice(0, i);
    }
    return afterCall;
  };

  const flags: Flag[] = [];
  source.split('\n').forEach((line, index) => {
    for (const call of WRITES) {
      const at = line.indexOf(`${call.name}(`);
      if (at === -1) continue;
      // `firstArgument` on the tail, then the destination's own index into the argument
      // text that remains after each preceding argument is consumed.
      let rest = line.slice(at + call.name.length + 1);
      let argument = '';
      for (let n = 0; n <= call.destination; n += 1) {
        argument = firstArgument(rest);
        rest = rest.slice(argument.length + 1);
      }
      if (reachesRoot(argument)) {
        flags.push({ line: index + 1, text: line.trim() });
        return;
      }
    }
  });
  return flags;
}

function testFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) testFiles(full, out);
    else if (entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

describe('no test writes inside the package it tests', () => {
  it('finds no such write in the tree', () => {
    // This file is skipped, and the reason is not convenience: its controls contain the
    // forbidden text *as string literals*, so a lexical scan cannot tell the specimen from
    // the disease. One exemption, stated here -- and the controls below are what make
    // skipping it safe, because they run the detector over those literals.
    const self = fileURLToPath(import.meta.url);
    const files = TEST_ROOTS.flatMap((root) => testFiles(join(REPO, root))).filter((file) => file !== self);
    // The count is compared to a published figure, not to a floor.
    //
    // It was `toBeGreaterThan(50)`, and that would have stayed green if the walker had stopped
    // descending into subdirectories: `packages/core/test` holds 163 files at the top level and
    // nine more under `fault/` and `llm/`, so a walker that missed the subdirectories would
    // have scanned 163 of 176 and reported zero offenders -- the same narrow-range-green-verdict
    // shape this file exists to refuse. `golden-master/doc-counts.json` is the count the README
    // publishes and CI verifies from its own run, so it is an oracle this test does not own.
    const published = JSON.parse(readFileSync(join(REPO, 'golden-master', 'doc-counts.json'), 'utf8')) as {
      repo: { files: number };
    };
    expect(files.length, 'the scan must read exactly the test files the published counts describe').toBe(
      // One less: this file is the exemption stated above.
      published.repo.files - 1,
    );

    const offenders = files.flatMap((file) =>
      writesIntoThePackage(readFileSync(file, 'utf8')).map(
        (flag) => `${relative(REPO, file)}:${String(flag.line)}  ${flag.text}`,
      ),
    );
    expect(
      offenders,
      'a test that writes into the package races every other worker that imports the file ' +
        'it writes; take the same input through a parameter, as exportPairs now does',
    ).toEqual([]);
  });

  it('flags the shape that caused finding 218', () => {
    // The code as it stood, reduced to the lines that matter: a target bound to
    // `join(SRC, …)` and two writes through that binding. Without this the scan above could
    // be a function that returns `[]` for every input.
    const source = [
      "import { writeFileSync, readFileSync } from 'node:fs';",
      "const SRC = join(HERE, '..', 'src');",
      "const target = join(SRC, 'export', 'guard.ts');",
      "const original = readFileSync(target, 'utf8');",
      'try {',
      '  writeFileSync(target, original + probe);',
      '} finally {',
      '  writeFileSync(target, original);',
      '}',
    ].join('\n');
    expect(writesIntoThePackage(source)).toHaveLength(2);
  });

  it('flags an inline join, which never had a binding to hide behind', () => {
    expect(writesIntoThePackage("rmSync(join(PACKAGE_ROOT, 'dist'), { recursive: true });")).toHaveLength(1);
  });

  it('does not flag a scratch directory, which is what the suite is supposed to use', () => {
    const source = [
      "const dir = mkdtempSync(join(tmpdir(), 'fixture-'));",
      "const target = join(dir, 'subject.yml');",
      "writeFileSync(target, 'original\\n');",
    ].join('\n');
    expect(writesIntoThePackage(source)).toEqual([]);
  });

  it('flags a write through a location-derived path, whatever the binding is called', () => {
    // The case this rule was widened for, in the shape it actually had: a root bound to a name
    // the name list did not carry, and a harness written into `scripts/` through it. The name
    // here is deliberately one nobody would put on a list -- `HERE` -- because the point is
    // that the identity of the binding must not be what decides.
    const source = [
      "const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');",
      "const harness = resolve(HERE, 'scripts', '.probe-harness.mjs');",
      "writeFileSync(harness, source);",
      "rmSync(harness, { force: true });",
    ].join('\n');
    expect(writesIntoThePackage(source)).toHaveLength(2);
  });

  it('flags a write through process.cwd(), which is the package root under the runner', () => {
    expect(writesIntoThePackage("writeFileSync(resolve(process.cwd(), 'scripts', 'x.mjs'), body);")).toHaveLength(1);
  });

  it('does not flag a write through a name nothing binds to a root', () => {
    expect(writesIntoThePackage("writeFileSync(join(examples, 'order-prod', 'run.sh'), body);")).toEqual([]);
  });
});
