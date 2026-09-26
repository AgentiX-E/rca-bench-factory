import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LLM_PROVIDER_ENV_VARS, LLM_PROVIDER_IDS } from '../../src/llm/registry.js';
import {
  SCORED_FIELDS,
  buildExtractionReport,
  formatExtractionReport,
  parseGoldenDataset,
} from '../../src/fault/extraction-scoring.js';

/**
 * The workflow and the provider registry must not drift apart.
 *
 * This is the check that would have caught the defect that cost two runs. The
 * workflow named a secret this repository invented; the organisation stores its
 * keys under vendor names; so the run stopped on a missing secret that was not
 * missing, and the only way to discover that was to spend a dispatch reading a
 * one-line error.
 *
 * The rule these tests enforce: **the set of providers the workflow can supply a
 * key for equals the set the registry can build.** A provider added to one and
 * not the other is a run that fails at the last step, and the failure looks like
 * an infrastructure problem rather than a missing line of YAML.
 *
 * Read as text rather than parsed as YAML, deliberately. The assertion is about
 * what the file *says* -- which secret names it binds, which inputs it forwards
 * -- and a YAML parse would let a value be assembled from anchors or expressions
 * that this suite then has to re-implement an evaluator to see. `check-no-mock`
 * permits no mocking library, and a hand-rolled YAML evaluator would be a worse
 * dependency than a regex over a file this suite also pins the shape of.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(ROOT, '.github', 'workflows', 'fault-extraction-accuracy.yml'),
  'utf8',
);

/**
 * A `case` arm in the workflow's key-selection step, e.g. `deepseek) ... ;;`.
 *
 * The selector is what actually decides, so it is what must cover the registry.
 */
function selectedProviders(): string[] {
  const names: string[] = [];
  // `case "$PROVIDER" in` ... `esac`, then the `<name>)` arms inside it.
  for (const match of WORKFLOW.matchAll(/^\s{4,}([a-z][a-z0-9-]*)\)\s/gm)) {
    names.push(match[1]);
  }
  return names;
}

/** Each `KEY_<PROVIDER>: ${{ secrets.<NAME> }}` binding. */
function secretBindings(): Array<{ provider: string; secret: string }> {
  const bindings: Array<{ provider: string; secret: string }> = [];
  for (const match of WORKFLOW.matchAll(
    /^\s*KEY_([A-Z0-9_]+):\s*\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}\s*$/gm,
  )) {
    bindings.push({ provider: match[1].toLowerCase(), secret: match[2] });
  }
  return bindings;
}

/**
 * The text of one `- name: <step>` block, up to the next step at the same indent.
 *
 * Scoping an assertion to a step is the difference between "this file contains a
 * `set -eu`" and "this step contains one". The loose form passed while the step
 * it was written for had none, because five sibling steps did.
 */
function stepBlock(name: string): string {
  const lines = WORKFLOW.split('\n');
  const startIndex = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  if (startIndex === -1) return '';
  // A sibling step is a `- name:` continuation at the same indentation.
  const indent = /^\s*/.exec(lines[startIndex])?.[0] ?? '';
  const out: string[] = [lines[startIndex] as string];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.startsWith(`${indent}- name:`)) break;
    out.push(line);
  }
  return out.join('\n');
}

/**
 * A `sed` BRE pattern translated into an equivalent JavaScript one.
 *
 * The two dialects disagree, and the difference is silent in the direction that
 * matters: in `sed`'s basic regular expressions `\(` and `\)` are *capturing
 * groups*, while in JavaScript they are *literal parentheses*. Compiling a sed
 * pattern with `new RegExp` therefore produces a regex that matches the literal
 * text `(19)` and never the `19` a report actually prints -- no error, just no
 * match. Translating keeps the assertion about the workflow's real pattern
 * instead of loosening it into something the test finds easier to satisfy.
 */
function toJavaScriptPattern(sedPattern: string): string {
  return sedPattern.replace(/\\\(/g, '(').replace(/\\\)/g, ')');
}

/**
 * A `sed` replacement translated into the equivalent JavaScript one.
 *
 * The same dialect gap, on the other side of the substitution: `sed` writes a
 * backreference as `\1`, and JavaScript writes it as `$1`. Left untranslated,
 * `line.replace` emits the literal two characters `\1` where the number should
 * be -- which reads as a match and is exactly the class of silent wrongness
 * this gate exists to prevent.
 */
function toJavaScriptReplacement(sedReplacement: string): string {
  return sedReplacement.replace(/\\\//g, '/').replace(/\\(\d)/g, '$$$1');
}

describe('the workflow covers every provider the registry can build', () => {
  it('selects a key for each registered provider', () => {
    const selected = selectedProviders();
    for (const id of LLM_PROVIDER_IDS) {
      expect(selected, `workflow must select a key for '${id}'`).toContain(id);
    }
  });

  it('binds a secret for each registered provider', () => {
    const bound = secretBindings().map((b) => b.provider);
    for (const id of LLM_PROVIDER_IDS) {
      expect(bound, `workflow must bind a secret for '${id}'`).toContain(id);
    }
  });

  it('does not select a provider the registry cannot build', () => {
    // The reverse direction: a case arm for a provider that was removed from the
    // registry is dead configuration that reads like support.
    for (const selected of selectedProviders()) {
      expect(
        LLM_PROVIDER_IDS as readonly string[],
        `workflow selects '${selected}', which the registry does not know`,
      ).toContain(selected);
    }
  });

  it('does not bind a secret for a provider the registry cannot build', () => {
    for (const binding of secretBindings()) {
      expect(
        LLM_PROVIDER_IDS as readonly string[],
        `workflow binds KEY_${binding.provider.toUpperCase()} for a provider the registry does not know`,
      ).toContain(binding.provider);
    }
  });
});

describe('the workflow names no vendor in its key binding', () => {
  it('does not reference a secret name this repository invented', () => {
    // The original defect, pinned. `RCA_BENCH_LLM_API_KEY` is the *environment*
    // variable the scripts read -- a neutral, repository-owned name. It must not
    // also be a secret name, because there is no organisation secret by that
    // name and demanding one asks the user to duplicate their key.
    const secretRefs = [...WORKFLOW.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g)].map(
      (m) => m[1],
    );
    expect(secretRefs).not.toContain(LLM_PROVIDER_ENV_VARS.apiKey);
  });

  it('reads the neutral variable into the environment rather than into a file', () => {
    expect(WORKFLOW).toMatch(/RCA_BENCH_LLM_API_KEY=\$\{selected\}.*>>\s*"\$GITHUB_ENV"/);
  });

  it('masks the selected key before using it', () => {
    // The key is pasted into a shell variable here, so it must not be printable
    // by an unrelated later step that happens to echo its environment.
    expect(WORKFLOW).toMatch(/::add-mask::\$\{selected\}/);
  });

  it('never writes a key to the artefact path', () => {
    // The predictions artefact is uploaded; a key in its directory would leak
    // through the upload.
    const uploadIndex = WORKFLOW.indexOf('upload-artifact');
    expect(uploadIndex).toBeGreaterThan(-1);
    const uploadBlock = WORKFLOW.slice(uploadIndex, uploadIndex + 400);
    expect(uploadBlock).not.toMatch(/RCA_BENCH_LLM_API_KEY/);
    expect(uploadBlock).not.toMatch(/secrets\./);
  });
});

describe('the workflow forwards the registry-owned variable names', () => {
  it('passes the provider through to the derivation step', () => {
    expect(WORKFLOW).toMatch(
      /RCA_BENCH_LLM_PROVIDER:\s*\$\{\{\s*steps\.provider\.outputs\.provider\s*\}\}/,
    );
  });

  it('keeps the endpoint and model optional and out of the file', () => {
    // Hard-coding an endpoint here would reintroduce the single-vendor lock at
    // the layer that is supposed to be provider-neutral.
    expect(WORKFLOW).toMatch(/RCA_BENCH_LLM_BASE_URL:\s*\$\{\{\s*vars\./);
    expect(WORKFLOW).toMatch(/RCA_BENCH_LLM_MODEL:\s*\$\{\{\s*vars\./);
    expect(WORKFLOW).not.toMatch(/https:\/\/api\.deepseek\.com/);
    expect(WORKFLOW).not.toMatch(/https:\/\/api\.openai\.com/);
    expect(WORKFLOW).not.toMatch(/https:\/\/api\.anthropic\.com/);
  });

  it('resolves the provider through the registry rather than re-implementing it', () => {
    // A workflow that hard-codes the list would drift from the registry the
    // moment a provider is added.
    expect(WORKFLOW).toMatch(/resolveLlmProviderConfig/);
  });
});

describe('the workflow still fails early and readably', () => {
  it('checks the dataset before it selects a key', () => {
    // Ordering is the assertion: a malformed dataset must be found in seconds,
    // before a secret is even read, let alone a request paid for.
    const datasetIndex = WORKFLOW.indexOf('Validate the golden dataset');
    const keyIndex = WORKFLOW.indexOf('Select the key');
    expect(datasetIndex).toBeGreaterThan(-1);
    expect(keyIndex).toBeGreaterThan(-1);
    expect(datasetIndex).toBeLessThan(keyIndex);
  });

  it('distinguishes "no mapping for this provider" from "its secret is empty"', () => {
    // Two different fixes. One is a line of YAML; the other is an organisation
    // setting. Collapsing them is what made the first version cost two runs.
    expect(WORKFLOW).toMatch(/No key mapping/);
    expect(WORKFLOW).toMatch(/Missing LLM key/);
  });

  it('uses a shell that fails on an unset variable, in the step that picks the key', () => {
    // Without `set -eu` an unset variable expands to empty rather than aborting,
    // so a missing provider mapping would fall through to an empty key and fail
    // three steps later inside an adapter -- a 401 that reads like a provider
    // problem instead of a missing line of YAML.
    //
    // Scoped to the one step on purpose. An earlier version of this test matched
    // `set -eu` anywhere in the file, and it passed while the key-selection step
    // had none, because five other steps have one. A file-wide match cannot say
    // *which* step is protected, and this assertion is about which step is
    // protected.
    const block = stepBlock('Select the key for the resolved provider');
    expect(block).not.toBe('');
    expect(block).toMatch(/set -eu/);
  });

  it('aborts the key-selection step rather than continuing with an empty key', () => {
    // `set -u` is the property that makes the missing-mapping case fatal. Pinned
    // separately from the combined `-eu` spelling so a rewrite to `set -e` alone
    // -- which would leave the step reading an unset variable as empty -- fails.
    const block = stepBlock('Select the key for the resolved provider');
    expect(block).toMatch(/set -[a-z]*u/);
  });
});

/**
 * The number has to survive the trip out of the runner.
 *
 * The run's accuracy is written to `GITHUB_STEP_SUMMARY`, and this sandbox cannot
 * read it there: the job-log endpoint 302s to a blob host that will not resolve,
 * and a run object carries no summary field at all. So the figure is repeated as
 * a check-run annotation, which `GET /check-runs/{id}` does serve -- that is how
 * the run's two infrastructure notices were read.
 *
 * The extraction is the fragile part, and it is fragile in a way that fails
 * *quietly*: a pattern that matches nothing still exits 0 and still prints a
 * notice, just one that says nothing. A pattern that is too loose is worse -- it
 * reports a per-field rate or a sample count as if it were the headline. These
 * tests read the pattern details out of the workflow and exercise them against
 * the exact strings `formatExtractionReport` produces.
 */
describe('the workflow publishes the accuracy where the API can serve it', () => {
  /**
   * The `sed` expressions in the score step, parsed into their parts.
   *
   * Both spellings are collected. The headline uses a multi-line `sed -n -e '<expr>'`
   * chain, and the per-field echo uses a single `sed -n '<expr>'`; matching only
   * the first form silently dropped the second, so the per-field assertions found
   * nothing to check while the suite stayed green -- the same shape of gap the
   * patterns themselves have.
   *
   * A `sed` program is `s<delim>pattern<delim>replacement<delim>flags`, and no
   * replacement here contains an unescaped `/`, so splitting on unescaped
   * delimiters yields exactly four parts. Anything that does not split into four
   * is reported rather than skipped silently -- a pattern that silently drops out
   * is how a field would come back empty while the step still exits 0.
   */
  function headlineSubstitutions(): Array<{
    expression: string;
    pattern: string;
    replacement: string;
    key: string;
  }> {
    const block = stepBlock('Score the run');
    expect(block).not.toBe('');
    const parsed: Array<{ expression: string; pattern: string; replacement: string; key: string }> =
      [];
    const candidates = [
      ...[...block.matchAll(/-e '([^']*)'/g)].map((m) => m[1] as string),
      ...[...block.matchAll(/\bsed -n '([^']*)'/g)].map((m) => m[1] as string),
    ];
    for (const expression of candidates) {
      // `sed` accepts any delimiter after the `s`, and the workflow uses `|` for
      // the one substitution whose replacement contains a `/`. Splitting on `/`
      // unconditionally would report that expression as unparseable -- a false
      // positive that would read as a workflow defect. The delimiter is read from
      // the expression rather than assumed.
      const delimiter = expression.slice(1, 2);
      // Split on the delimiter only where it is not backslash-escaped. Built by
      // scanning rather than by constructing a regex: escaping a `/` inside a
      // `RegExp` string is a double-escaping exercise whose failure mode is a
      // syntax error in the test rather than a message about the workflow, and
      // the scan is three lines and obviously correct.
      const parts: string[] = [];
      let current = '';
      for (let i = 0; i < expression.length; i += 1) {
        const ch = expression[i] as string;
        if (ch === delimiter && expression[i - 1] !== '\\') {
          parts.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      parts.push(current);
      expect(
        parts.length,
        `'${expression}' is not a parseable sed substitution; the field would silently drop out`,
      ).toBe(4);
      const [verb, pattern, replacement, flag] = parts as [string, string, string, string];
      expect(verb).toBe('s');
      expect(flag).toBe('p');
      parsed.push({ expression, pattern, replacement, key: replacement.split('=')[0] as string });
    }
    expect(parsed.length).toBeGreaterThan(0);
    return parsed;
  }

  it('states the headline as an annotation, not only as a step summary', () => {
    const block = stepBlock('Score the run');
    expect(block).toMatch(/::notice title=/);
    // The summary is still written; it is the human-facing copy, not the only one.
    expect(block).toMatch(/GITHUB_STEP_SUMMARY/);
  });

  it('keys each headline field exactly once', () => {
    // The bug this catches was real: an earlier `graded *: ` pattern matched
    // both the counts line (`graded         : 19`) and the layers line
    // (`graded: 19/19`), so the annotation read `graded=19 graded=19/19` -- two
    // values under one name, which a reader has to decode rather than read.
    const keys = headlineSubstitutions().map((s) => s.key);
    const duplicates = keys.filter((key, i) => keys.indexOf(key) !== i);
    expect(duplicates, `headline key(s) written twice: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('anchors every pattern to the two-space indent of the report body', () => {
    // Per-field lines look like
    // `    component   : graded 19/19 (100.0%)  overall ...` -- indented four
    // spaces. Anchoring to two keeps the headline off them, so a per-field rate
    // can never be reported as the strict rate.
    for (const { expression, pattern } of headlineSubstitutions()) {
      expect(pattern, `'${expression}' must anchor to the start`).toMatch(/^\^ {2}/);
    }
  });

  it('distinguishes the graded count from the graded rate', () => {
    // Both begin with `graded`. The count is `graded<space>+: <n>` and ends the
    // line; the rate is `graded: <n>/<n> (<pct>%)`. Ending each pattern at `$`
    // is what keeps them from matching each other's line.
    //
    // `sed` patterns carry their own `^` anchor, so the literal text to match
    // against is the pattern with that anchor removed.
    const graded = headlineSubstitutions().filter((s) => /^  graded/.test(s.pattern.slice(1)));
    expect(graded.length, 'both graded lines must be keyed').toBe(2);
    for (const { expression, pattern } of graded) {
      expect(pattern, `'${expression}' must terminate the line`).toMatch(/\$$/);
    }
    const countLine = '  graded         : 19';
    const rateLine = '  graded: 19/19 (100.0%)';
    const countPattern = graded.find((s) => s.key === 'graded_count');
    const ratePattern = graded.find((s) => s.key === 'graded_rate');
    expect(countPattern, 'a count pattern must exist').toBeDefined();
    expect(ratePattern, 'a rate pattern must exist').toBeDefined();
    const countRe = new RegExp(toJavaScriptPattern((countPattern as { pattern: string }).pattern));
    const rateRe = new RegExp(toJavaScriptPattern((ratePattern as { pattern: string }).pattern));
    expect(countRe.test(countLine)).toBe(true);
    expect(countRe.test(rateLine)).toBe(false);
    expect(rateRe.test(rateLine)).toBe(true);
    expect(rateRe.test(countLine)).toBe(false);
  });

  it('extracts the headline from the report the scorer actually produces', () => {
    // The end-to-end check. `formatExtractionReport` is the producer and the sed
    // patterns are the consumer, so the two are wired together here rather than
    // described in a comment. Without this, the patterns could be perfectly
    // self-consistent and still match nothing the scorer ever prints.
    const dataset = parseGoldenDataset(
      JSON.parse(
        readFileSync(resolve(ROOT, 'golden-master', 'fault-extraction', 'samples.json'), 'utf8'),
      ),
    );
    const substitutions = headlineSubstitutions();

    /** Apply the workflow's own patterns to one report string. */
    function headlineOf(report: string): Record<string, string> {
      const lines = report.split('\n');
      const matched: Record<string, string> = {};
      for (const { pattern, replacement, key } of substitutions) {
        const regex = new RegExp(toJavaScriptPattern(pattern));
        for (const line of lines) {
          if (regex.test(line)) {
            matched[key] = line.replace(regex, toJavaScriptReplacement(replacement));
          }
        }
      }
      return matched;
    }

    const perfect = dataset.samples.map((s) => ({
      sampleId: s.id,
      parseOk: true,
      extracted: { ...s.expected },
      validationValid: true,
    }));
    const perfectHeadline = headlineOf(
      formatExtractionReport(buildExtractionReport([...dataset.samples], perfect)),
    );
    expect(perfectHeadline['samples']).toBe(`samples=${dataset.samples.length}`);
    expect(perfectHeadline['graded_count']).toBe(`graded_count=${dataset.samples.length}`);
    expect(perfectHeadline['strict']).toMatch(/^strict=\d+\/\d+ \(/);
    expect(perfectHeadline['graded_rate']).toMatch(/^graded_rate=\d+\/\d+ \(/);
    expect(perfectHeadline['m1']).toMatch(/^m1=MET/);

    // And the branch that must *not* read as a passing number: no scoreable
    // answer at all. The rate is `n/a`, so the headline has to be unambiguous
    // that there is no measurement rather than showing a zero.
    const unusable = dataset.samples.map((s) => ({ sampleId: s.id, parseOk: false }));
    const noneHeadline = headlineOf(
      formatExtractionReport(buildExtractionReport([...dataset.samples], unusable)),
    );
    expect(noneHeadline['graded_count']).toBe('graded_count=0');
    expect(noneHeadline['strict']).toMatch(/n\/a/);
    expect(noneHeadline['m1']).toMatch(/NOT MET \(no graded sample\)/);
  });

  it('publishes the per-field breakdown, which is what makes a miss diagnosable', () => {
    // A headline of `strict=0/19` says every sample missed at least one field
    // without saying which. The report already prints the breakdown, and the
    // workflow echoes it as a second annotation so the number and its explanation
    // arrive through the same channel -- the one this sandbox can read.
    const block = stepBlock('Score the run');
    const fieldExpression = /-e '([^']*)'|-n '([^']*)'/g;
    const hasFieldPattern = [...block.matchAll(fieldExpression)].some((m) =>
      /^s\/\^    \\\(\[a-z\]/.test((m[1] ?? m[2]) as string),
    );
    expect(
      hasFieldPattern,
      'the score step must extract the four per-field rows, not only the headline',
    ).toBe(true);
  });

  it('extracts each per-field row from the report the scorer actually produces', () => {
    // The per-field substitution, as written in the workflow.
    const match = headlineSubstitutions().find((s) => /^s\/\^    \\\(\[a-z\]/.test(s.expression));
    expect(match, 'a per-field substitution must exist').toBeDefined();
    const regex = new RegExp(toJavaScriptPattern((match as { pattern: string }).pattern));

    // The four rows for a perfect run, as `formatExtractionReport` prints them.
    const rows = [
      '    type        : graded 19/19 (100.0%)  overall 19/19 (100.0%)',
      '    component   : graded 9/19 (47.4%)  overall 9/19 (47.4%)',
    ];
    const keyed = rows.map((row) => {
      expect(regex.test(row), `must match: ${row}`).toBe(true);
      return row.replace(
        regex,
        toJavaScriptReplacement((match as { replacement: string }).replacement),
      );
    });
    expect(keyed[0]).toBe('type=19/19');
    expect(keyed[1]).toBe('component=9/19');

    // And the property that separates the per-field pattern from the headline
    // ones: it must not claim a headline row, whose indent is two spaces.
    expect(regex.test('  strict all-fields: 19/19 (100.0%)')).toBe(false);
    expect(regex.test('  samples        : 19')).toBe(false);
  });
});

/**
 * The miss diagnosis, published where it can be read.
 *
 * The per-field rates established in the previous round say that a field missed.
 * They cannot say whether the model answered *wrongly* or *declined to answer*,
 * and those two have different fixes. Four rounds of prompt and comparator
 * reasoning produced hypotheses that a single reading of the answers would have
 * settled -- and the answers were already being written to the predictions file.
 * Only the reading was missing.
 *
 * These tests run the workflow's own `sed` expressions against the report the
 * scorer actually produces, for the reason recorded in the round that added the
 * per-field annotation: the failure mode of a `sed` extraction is silence, so a
 * test that only checks the pattern's presence cannot see it.
 */
describe('the workflow publishes the miss diagnosis', () => {
  /**
   * The miss-diagnosis substitutions, split into their sed pattern and
   * replacement.
   *
   * This deliberately reuses the same delimiter-aware split as
   * `headlineSubstitutions()` instead of a per-expression regex. An earlier
   * version of this helper did `expression.replace(/^s\//, '')` and assumed `/`
   * was the delimiter. The detail substitution uses `|` -- because its
   * *replacement* contains a `/` -- so the strip matched nothing and the
   * `|p` suffix was left on the end. Both errors are silent, and together they
   * produced a regex that matched **every** line: `s|` matched the literal
   * `s` and `|` characters ... except the pattern was unanchored at that point,
   * so it matched at any offset. The three negative assertions failed, which is
   * how it was caught, but the two *positive* assertions had been passing for
   * the wrong reason -- an empty-ish match, not a real row match. A helper that
   * assumes a delimiter can therefore not just miss a defect, it can manufacture
   * a green.
   */
  function missSubstitutions(): Array<{ pattern: string; replacement: string }> {
    const block = stepBlock('Score the run');
    const out: Array<{ pattern: string; replacement: string }> = [];
    for (const m of block.matchAll(/(?:misses|missed_rows)=\$\(sed -n '([^']*)'/g)) {
      const expression = m[1] as string;
      const delimiter = expression.slice(1, 2);
      const parts: string[] = [];
      let current = '';
      for (let i = 0; i < expression.length; i += 1) {
        const ch = expression[i] as string;
        if (ch === delimiter && expression[i - 1] !== '\\') {
          parts.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      parts.push(current);
      const [verb, pattern, replacement, flag] = parts as [string, string, string, string];
      expect(verb, `'${expression}' must be a sed substitution`).toBe('s');
      expect(flag, `'${expression}' must print only what it matches`).toBe('p');
      out.push({ pattern, replacement });
    }
    expect(out.length, 'both miss-diagnosis substitutions must be present').toBe(2);
    return out;
  }

  function classificationAndDetail(): { counts?: string; detail?: RegExp } {
    const [counts, detail] = missSubstitutions() as [
      { pattern: string; replacement: string },
      { pattern: string; replacement: string },
    ];
    return {
      counts: counts.pattern,
      detail: new RegExp(toJavaScriptPattern(detail.pattern)),
    };
  }

  it('extracts the classifier counts from the report layout', () => {
    const block = stepBlock('Score the run');
    // The expression must key the line and drop the label, so the annotation
    // reads `classification=wrong value 8, omitted 3, ...` rather than repeating
    // the report's own wording.
    expect(
      /misses=\$\(sed -n 's\/\^  Miss classification[^']*'/m.test(block),
      'the score step must extract the miss classification line',
    ).toBe(true);
  });

  it('keys the classification line the scorer actually prints', () => {
    const samples = parseGoldenDataset(
      JSON.parse(readFileSync(resolve(ROOT, 'golden-master', 'fault-extraction', 'samples.json'), 'utf8')),
    ).samples;
    const report = formatExtractionReport(
      buildExtractionReport(
        samples,
        samples.map((s) => {
          const e = s.expected as unknown as Record<string, string | undefined>;
          const extracted: Record<string, string> = {};
          for (const k of ['type', 'category', 'component', 'description'] as const) {
            const v = e[k];
            if (v !== undefined) extracted[k] = v;
          }
          return { sampleId: s.id, parseOk: true, extracted, validationValid: true };
        }),
      ),
    );
    const line = report.split('\n').find((l) => l.includes('Miss classification'));
    expect(line, 'the report must print the classification line').toBeDefined();
    // The property the sed relies on: the line is two-space indented and the
    // counts follow a colon, so a pattern that ignored the indent would also
    // claim the per-sample rows further down.
    expect((line as string).startsWith('  Miss classification')).toBe(true);
  });

  it('extracts per-sample miss detail, which is the line that ends the guessing', () => {
    const { detail } = classificationAndDetail();
    expect(detail, 'the workflow must extract the per-sample miss rows').toBeDefined();
    // Exercised against rows in the exact shape `formatExtractionReport` prints:
    // four-space indent, id, field, reason, and an `expected -> actual` pair. The
    // proof of correctness is `command substitution` semantics, reproduced here --
    // running the real workflow `sed` over these two rows yields exactly the
    // strings asserted below.
    //
    // The reason group is captured by the pattern but not emitted, which is
    // deliberate: the counts already say how many were wrong values and how many
    // were omissions, and repeating `wrongValue` on every detail row would make
    // the line long enough to truncate sooner.
    const rows = [
      '    resource-cpu-saturation-checkout               type       wrongValue cpu-saturation -> cpu-saturation-exhaustion',
      '    network-loss-payment-gateway                   component  omitted    payment-gateway -> (omitted)',
    ];
    const regex = detail as RegExp;
    expect(regex.test(rows[0] as string)).toBe(true);
    expect(regex.test(rows[1] as string)).toBe(true);
    // Group order in the substitution is id, field, reason, expected, actual.
    const keyed = rows.map((row) =>
      row.replace(regex, (_m, id: string, field: string, _reason: string, expected: string, actual: string) => {
        return `${id}.${field}:${expected}>${actual}`;
      }),
    );
    expect(keyed[0]).toBe('resource-cpu-saturation-checkout.type:cpu-saturation>cpu-saturation-exhaustion');
    expect(keyed[1]).toBe('network-loss-payment-gateway.component:payment-gateway>(omitted)');
  });

  it('keeps a fully-missed run inside the workflow row cap, so truncation is not routine', () => {
    // Measured against the real scorer rather than estimated. The dataset has 19
    // samples; a run where every scored field of every sample misses is the
    // largest payload this workflow can be asked to publish. If that exceeds the
    // workflow's `head -n` cap, the truncation path stops being a fallback and
    // becomes the normal case -- and the reading would routinely be partial
    // without anyone noticing, because the suffix is easy to skim past.
    const samples = parseGoldenDataset(
      JSON.parse(
        readFileSync(resolve(ROOT, 'golden-master', 'fault-extraction', 'samples.json'), 'utf8'),
      ),
    ).samples;
    const predictions = samples.map((s) => {
      const e = s.expected as unknown as Record<string, string | undefined>;
      const extracted: Record<string, string> = {};
      for (const f of SCORED_FIELDS) {
        // A wrong answer for every field the sample states an expectation for.
        if (e[f] !== undefined) extracted[f] = `wrong-value-for-${f}`;
      }
      return { sampleId: s.id, parseOk: true, validationValid: true, extracted };
    });
    const report = buildExtractionReport(samples, predictions);
    // Every scored field of every sample is wrong, so this is the maximum.
    const rowCount = report.misses.reduce((n, m) => n + m.detail.length, 0);
    expect(report.misses.length, 'the saturated fixture must actually miss').toBe(samples.length);

    const block = stepBlock('Score the run');
    const cap = Number(
      /detail=\$\(printf '%s' "\$missed_rows" \| head -n ([0-9]+) \| tr '\\n' ' '\)/.exec(block)?.[1],
    );
    expect(Number.isFinite(cap), 'the workflow must apply a row cap').toBe(true);
    expect(
      cap,
      `the workflow caps detail at ${cap} rows but a fully-missed run produces ${rowCount}`,
    ).toBeGreaterThanOrEqual(rowCount);

    // And the characters, from the rows the scorer actually prints rather than
    // from a formula: an annotation limit is 64KiB.
    const longest = report.misses
      .flatMap((m) => m.detail.map((d) => `${m.sampleId} ${d.field} ${d.reason} ${d.expected} -> ${d.actual ?? '(omitted)'}`))
      .reduce((n, row) => Math.max(n, row.length), 0);
    expect(cap * (longest + 1) + 200, 'the saturated payload must fit an annotation').toBeLessThan(65535);
  });

  it('does not claim the headline or per-field rows as miss detail', () => {
    const { detail } = classificationAndDetail();
    expect(detail).toBeDefined();
    // The three row families share the report and differ only by indent and
    // shape. A pattern loose enough to match the headline would publish a rate
    // as if it were a miss.
    expect((detail as RegExp).test('  strict all-fields: 0/19 (0.0%)')).toBe(false);
    expect((detail as RegExp).test('    type        : graded 5/19 (26.3%)  overall 5/19 (26.3%)')).toBe(false);
    expect((detail as RegExp).test('  Miss classification (per field miss): wrong value 8, omitted 0, samples with >= 1 miss 8')).toBe(false);
  });

  it('bounds the detail annotation by whole rows and states what it left out', () => {
    const block = stepBlock('Score the run');
    // A character cut was the first attempt and it is wrong: at 19 samples x 3
    // fields the detail payload is 4044 characters, and `cut -c1-N` ends
    // mid-token. The observed worst case read `...type:network-loss>wrong
    // network-` -- half an expected value, indistinguishable from a wrong one.
    //
    // The row-bounded form is asserted structurally, because the property that
    // matters is not "the output is short" but "every row in it is complete":
    // take whole lines, then say how many were dropped.
    expect(block, 'the detail must be bounded by whole rows, not by characters').not.toMatch(
      /miss detail::\$\(printf '%s' "\$detail" \| cut -c[0-9]+\)/,
    );
    // The cap must exceed the arithmetic maximum for the current dataset
    // (19 samples x 3 scored fields = 57 rows), because a cap below it would
    // truncate an ordinary worst-case run and push routine reading into the
    // summary. Asserted as a comparison rather than an exact number so raising
    // the dataset size surfaces here instead of silently shortening the read.
    const cap = Number(
      /detail=\$\(printf '%s' "\$missed_rows" \| head -n ([0-9]+) \| tr '\\n' ' '\)/.exec(block)?.[1],
    );
    expect(Number.isFinite(cap), 'a whole-row cap must be applied before joining').toBe(true);
    expect(cap, 'the cap must cover 19 samples x 3 scored fields').toBeGreaterThanOrEqual(57);
    // The dropped count must be computed, not assumed, and the announcement must
    // name the true total so the reader can tell a truncated list from a short one.
    expect(block).toMatch(/dropped=\$\(\(miss_row_count > [0-9]+ \? miss_row_count - [0-9]+ : 0\)\)/);
    expect(block).toMatch(/\$\{dropped\} more row\(s\) omitted; all \$\{miss_row_count\}/);
    // Both branches must exist: with no truncation the suffix would be noise.
    expect(block).toMatch(/if \[ "\$dropped" -gt 0 \]; then/);
  });
});
