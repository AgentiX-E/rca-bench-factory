import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  RULEGEN_LAYOUT_SCHEMA,
  describeRulegenAgreement,
  parseRulegenLayoutGolden,
  readRulegenAgreement,
  type RulegenLayoutCase,
} from '../src/llm/rulegen-agreement.js';

/**
 * The layout answer set, and the two verdicts read over it.
 *
 * `rulegen` prompts a model for a column mapping, parses the answer and validates it. Nothing calls
 * it -- the path every file takes is `prime.ts`'s alias table -- so a rate over model output would
 * be a rate over a channel that does not run. What this suite measures is what can be measured
 * without a model: the alias table against specified layouts, and the validator against answers
 * written the way a model gets them wrong.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GOLDEN = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'rulegen-layouts.json'), 'utf8'),
) as Record<string, unknown>;

const shipped = () => parseRulegenLayoutGolden(JSON.parse(JSON.stringify(GOLDEN)) as unknown);

/**
 * The scripts this file spawns, declared rather than inferred.
 *
 * `gate-sites-are-proven` compares two accounts of the same fact -- the `provedBy` a site names and
 * the tests that actually spawn it -- and a test that spawns a script without saying so makes the
 * two disagree. The declaration is the claim; the spawn is the proof.
 */
const DRIVES = ['scripts/check-rulegen-agreement.mjs'];

/** A one-case golden, for the shapes the shipped file deliberately does not contain. */
function goldenOf(cases: Array<Partial<RulegenLayoutCase>>): Record<string, unknown> {
  return {
    schema: RULEGEN_LAYOUT_SCHEMA,
    provenance: {
      note: 'n',
      reviewGate: 'H3',
      authoringRule: 'a',
      candidateRule: 'c',
      annotationRule: 'r',
      measuredAt: '2026-11-08',
    },
    cases: cases.map((one) => ({
      id: 'case',
      signalKind: 'metric',
      headers: ['timestamp', 'service', 'metric', 'value'],
      samples: [{ timestamp: '2026-09-14T02:03:00Z', service: 'a', metric: 'm', value: 1 }],
      expectedLayout: { timestamp: 'timestamp', service: 'service', metricName: 'metric', metricValue: 'value' },
      candidate: JSON.stringify({
        layout: { timestamp: 'timestamp', service: 'service', metricName: 'metric', metricValue: 'value' },
        confidence: 0.9,
        rationale: 'r',
      }),
      expectedVerdict: 'accepted',
      why: 'w',
      ...one,
    })),
  };
}

describe('the shipped layout answer set', () => {
  it('reads both channels, and states which one has a caller', () => {
    const reading = readRulegenAgreement(shipped());
    // Sixteen authored cases. The alias table reproduces fourteen of the sixteen specified layouts
    // and differs on the two whose value column is outside its vocabulary -- `reading` in the
    // prefixed-file case and `usage` in the two-column case. The other two refusals
    // (`metric-column-absent-from-header`, `metric-value-empty-in-one-sample`) are about the model
    // side: their header rows are plain, so the alias table reads them correctly and the answer set
    // is refused by the *validator* for a candidate that names a column the file cannot carry.
    expect(reading.total).toBe(16);
    expect(reading.deterministic).toEqual({
      agreements: 14,
      disagreements: ['metric-prefixed-columns', 'metric-wrong-column-both-present'],
    });
    // The validator agrees with the answer set on every verdict, and refuses seven times.
    expect(reading.verdicts).toEqual({ agreements: 16, disagreements: [] });
    expect(reading.accepted).toBe(9);
    expect(reading.refused).toBe(7);
    // Every refusal names the reason the answer set expected, which is the half a verdict alone
    // cannot check: refusing for the wrong reason is still a wrong answer.
    expect(reading.reasons).toEqual({ checked: 7, agreements: 7 });
    // The class the replay cannot see: one accepted answer points `metricValue` at `limit` where the
    // specified column is `usage`. Both exist and both are populated.
    expect(reading.misreads).toEqual([
      { id: 'metric-wrong-column-both-present', fields: ['metricValue'] },
    ]);
  });

  it('does not count a field mapped beyond the specification as a contradiction', () => {
    // `metric-semantic-type` maps `semanticType` as well, which is a legal extra: the field set is a
    // minimum, not an equality. If this were counted, the reading would report a misread for the one
    // case whose answer is the most complete in the set.
    const reading = readRulegenAgreement(shipped());
    const row = reading.cases.find((c) => c.id === 'metric-semantic-type');
    expect(row?.misread).toEqual([]);
    expect(row?.verdict).toBe('accepted');
  });

  it('refuses the four shapes a model gets wrong, each for its own stated reason', () => {
    // Named rather than counted, because the interesting claim is not "six refusals" but that the
    // misspelling, the absent column, the empty cell, the wrong-kind field and the invented enum all
    // land in the refusal path rather than travelling into the layout.
    const reading = readRulegenAgreement(shipped());
    const reasons = new Map(reading.cases.map((c) => [c.id, c.reason]));
    expect(reasons.get('metric-misspelled-field')).toContain("'timstamp' is not an IR field");
    expect(reasons.get('metric-column-absent-from-header')).toContain('latency_ms');
    expect(reasons.get('metric-value-empty-in-one-sample')).toContain("maps to column 'note'");
    expect(reasons.get('trace-missing-duration')).toContain("missing required field 'durationMs'");
    expect(reasons.get('log-trace-field')).toContain("not an IR field for signal kind 'log'");
    expect(reasons.get('metric-semantic-type-outside-vocabulary')).toContain('must be one of');
  });

  it('prints the two channels, the refusal reasons and the absence of kappa', () => {
    expect(describeRulegenAgreement(readRulegenAgreement(shipped()))).toBe(
      'rulegen layouts: 16 case(s); the alias table reproduces 14 of 16 specified layout(s) '
        + '(it differs on metric-prefixed-columns, metric-wrong-column-both-present); '
        + 'the model-side validator agrees on 16 of 16 verdict(s), accepting 9 and refusing 7, '
        + '7 of 7 for the reason the answer set names; '
        + '1 accepted answer(s) map a field to another column that exists '
        + '(metric-wrong-column-both-present: metricValue), which the replay cannot refuse; '
        + 'one author wrote the cases and the answers, so there is no kappa here: '
        + 'this is agreement with a specified answer, which is a weaker claim',
    );
  });
});

describe('the reading over one case', () => {
  it('says nothing was misread when the only accepted answer is the specified one', () => {
    const reading = readRulegenAgreement(parseRulegenLayoutGolden(goldenOf([{}])));
    expect(reading.misreads).toEqual([]);
    expect(reading.reasons).toEqual({ checked: 0, agreements: 0 });
    expect(describeRulegenAgreement(reading)).toContain('no accepted answer maps a field to another real column');
    expect(describeRulegenAgreement(reading)).toContain('accepting 1 and refusing 0;');
  });

  it('reports a refusal the answer set did not expect', () => {
    // The verdict comparison is the gate this reading exists for: an answer set that says accepted
    // and a validator that refuses is a disagreement, and the reading has to name the case.
    const reading = readRulegenAgreement(
      parseRulegenLayoutGolden(
        goldenOf([{ expectedVerdict: 'accepted', candidate: '{"layout":{"timstamp":"timestamp"},"confidence":0.5}' }]),
      ),
    );
    expect(reading.verdicts.agreements).toBe(0);
    expect(reading.verdicts.disagreements).toEqual(['case']);
    expect(reading.refused).toBe(1);
  });

  it('reports a refusal for a reason other than the one the answer set names', () => {
    // Refusing the right answer for the wrong reason is not agreement. The verdict matches and the
    // reason does not, which is why the two are counted apart.
    const reading = readRulegenAgreement(
      parseRulegenLayoutGolden(
        goldenOf([
          {
            expectedVerdict: 'refused',
            expectedReason: "missing required field 'durationMs'",
            candidate: '{"layout":{"timestmp":"timestamp"},"confidence":0.5}',
          },
        ]),
      ),
    );
    expect(reading.verdicts.agreements).toBe(1);
    expect(reading.reasons).toEqual({ checked: 1, agreements: 0 });
    expect(reading.cases[0]?.reasonAgrees).toBe(false);
  });

  it('counts a field the alias table cannot see as a disagreement, not as a refusal', () => {
    // The deterministic channel does not refuse: it returns a layout whatever the header row is. So
    // the only way for it to be wrong is a missing or different field, and the reading says which.
    const headers = ['event_ts', 'container', 'kpi', 'reading'];
    const reading = readRulegenAgreement(
      parseRulegenLayoutGolden(
        goldenOf([
          {
            headers,
            samples: [{ event_ts: '2026-09-14T02:03:00Z', container: 'a', kpi: 'm', reading: 1 }],
            expectedLayout: {
              timestamp: 'event_ts',
              service: 'container',
              metricName: 'kpi',
              metricValue: 'reading',
            },
            candidate: JSON.stringify({
              layout: {
                timestamp: 'event_ts',
                service: 'container',
                metricName: 'kpi',
                metricValue: 'reading',
              },
              confidence: 0.6,
              rationale: 'r',
            }),
          },
        ]),
      ),
    );
    expect(reading.deterministic.agreements).toBe(0);
    expect(reading.deterministic.disagreements).toEqual(['case']);
    // The candidate still answers with the specified layout, because the candidate is text and does
    // not go through the alias table -- which is the whole point of the second channel.
    expect(reading.verdicts.agreements).toBe(1);
  });

  it('compares no reason when the answer it expected to be refused was accepted', () => {
    // The answer set can name a reason for a refusal that the validator does not make. There is
    // then no reason to compare -- not an empty one -- so the count of checked reasons includes the
    // case while the count of agreements does not, and a reading that folded "no reason" into
    // "a different reason" would report two disagreements where there is one.
    const reading = readRulegenAgreement(
      parseRulegenLayoutGolden(
        goldenOf([
          {
            expectedVerdict: 'refused',
            expectedReason: "missing required field 'durationMs'",
          },
        ]),
      ),
    );
    expect(reading.cases[0]?.reasonAgrees).toBe(false);
    expect(reading.verdicts.disagreements).toEqual(['case']);
    expect(reading.reasons).toEqual({ checked: 1, agreements: 0 });
  });

  it('counts an answer that points a field at a real but different column as a contradiction', () => {
    // The replay cannot refuse this one: both columns exist and both are populated, so
    // `validateGeneratedLayout` accepts the layout. Only a field-by-field comparison against the
    // specified answer can see that `metricValue` was read from `limit` rather than from `usage`,
    // which is why the comparison tests the mapping and not the presence of a mapped field.
    const reading = readRulegenAgreement(
      parseRulegenLayoutGolden(
        goldenOf([
          {
            headers: ['event_ts', 'container', 'kpi', 'usage', 'limit'],
            samples: [{ event_ts: '2026-09-14T02:03:00Z', container: 'a', kpi: 'm', usage: 91, limit: 4 }],
            expectedLayout: {
              timestamp: 'event_ts',
              service: 'container',
              metricName: 'kpi',
              metricValue: 'usage',
            },
            candidate: JSON.stringify({
              layout: {
                timestamp: 'event_ts',
                service: 'container',
                metricName: 'kpi',
                metricValue: 'limit',
              },
              confidence: 0.7,
              rationale: 'r',
            }),
          },
        ]),
      ),
    );
    expect(reading.deterministic.disagreements).toEqual(['case']);
    // The validator agrees with the answer set, because a legal layout is legal whatever it means.
    expect(reading.verdicts.agreements).toBe(1);
    expect(reading.misreads).toEqual([{ id: 'case', fields: ['metricValue'] }]);
  });
});

describe('the answer set cannot be read as a rate over something else', () => {
  const rejects = (mutate: (file: Record<string, unknown>) => void, expected: string) => {
    const file = goldenOf([{}]);
    mutate(file);
    expect(() => parseRulegenLayoutGolden(file)).toThrow(expected);
  };

  it('refuses a schema it does not recognise', () => {
    rejects((f) => { f.schema = 'rca-bench-rulegen-layouts/0'; }, "schema is 'rca-bench-rulegen-layouts/0'");
  });

  it('refuses a file with no cases', () => {
    rejects((f) => { f.cases = []; }, 'the cases array is missing or empty');
  });

  it('refuses two cases with one id', () => {
    rejects(
      (f) => {
        const cases = f.cases as unknown[];
        (cases[0] as Record<string, unknown>).id = 'twin';
        f.cases = [...cases, { ...(cases[0] as Record<string, unknown>) }];
      },
      "'twin' appears twice, so a rate over these cases would drop one",
    );
  });

  it('refuses a signal kind the contract does not know', () => {
    rejects((f) => {
      ((f.cases as unknown[])[0] as Record<string, unknown>).signalKind = 'event';
    }, "names signal kind 'event'");
  });

  it('refuses an expected column the header row does not carry', () => {
    // An answer set that maps a field to a column the file does not have is not hard, it is wrong --
    // and it would make the alias table look better than it is, because it could never match.
    rejects((f) => {
      ((f.cases as unknown[])[0] as Record<string, unknown>).expectedLayout = { metricValue: 'absent' };
    }, "expects a field mapped to 'absent'");
  });

  it('refuses a case expected to be accepted that also names a refusal reason', () => {
    rejects((f) => {
      ((f.cases as unknown[])[0] as Record<string, unknown>).expectedReason = 'missing required field';
    }, 'is expected to be accepted and names a refusal reason as well');
  });

  it('refuses a case with no expected layout, no candidate, or an unreadable verdict', () => {
    // Three separate sentences, because a reader repairing the file needs to know which one is
    // missing: a case with no answer, a case with no answer *text* and a case whose answer names
    // neither verdict are three different repairs.
    rejects((f) => {
      delete ((f.cases as unknown[])[0] as Record<string, unknown>).expectedLayout;
    }, 'has no expected layout');
    rejects((f) => {
      ((f.cases as unknown[])[0] as Record<string, unknown>).candidate = '';
    }, 'carries no candidate answer');
    rejects((f) => {
      ((f.cases as unknown[])[0] as Record<string, unknown>).expectedVerdict = 'maybe';
    }, "expects verdict 'maybe', which is neither accepted nor refused");
  });

  it('refuses a case with no header row, and a case that is not an object', () => {
    rejects((f) => {
      ((f.cases as unknown[])[0] as Record<string, unknown>).headers = [];
    }, 'has no header row');
    rejects((f) => {
      ((f.cases as unknown[])[0] as Record<string, unknown>).id = '';
    }, 'has no id');
    rejects((f) => {
      f.cases = ['case'];
    }, 'case 0 is not an object');
  });

  it('refuses a case with no sample to replay against', () => {
    rejects((f) => {
      ((f.cases as unknown[])[0] as Record<string, unknown>).samples = [];
    }, 'carries no sample');
  });

  it('refuses a case that does not say why it is a case', () => {
    rejects((f) => {
      ((f.cases as unknown[])[0] as Record<string, unknown>).why = '';
    }, 'does not say why it is a case');
  });

  it('refuses a bare object where the file should be', () => {
    expect(() => parseRulegenLayoutGolden(null)).toThrow('the file is not an object');
    expect(() => parseRulegenLayoutGolden({ schema: RULEGEN_LAYOUT_SCHEMA, cases: [] })).toThrow(
      'the provenance block is missing',
    );
  });
});

describe('scripts/check-rulegen-agreement.mjs · the command a reader can run', () => {
  const SCRIPT = resolve(ROOT, 'scripts', 'check-rulegen-agreement.mjs');
  const dirs: string[] = [];

  function copyOf(mutate: (file: Record<string, unknown>) => void): string {
    const dir = mkdtempSync(join(tmpdir(), 'rulegen-agreement-'));
    dirs.push(dir);
    const file = JSON.parse(JSON.stringify(GOLDEN)) as Record<string, unknown>;
    mutate(file);
    const path = join(dir, 'golden.json');
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
    return path;
  }

  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  async function run(args: string[]): Promise<{ status: number | null; out: string }> {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { out += chunk; });
    child.stderr.on('data', (chunk: string) => { out += chunk; });
    const status = await new Promise<number | null>((done, fail) => {
      child.on('error', fail);
      child.on('close', (code) => done(code));
    });
    return { status, out };
  }

  it('accepts the shipped answer set and prints the reading once', async () => {
    const result = await run([]);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toContain('the alias table reproduces 14 of 16 specified layout(s)');
    expect(result.out).toContain('there is no kappa here');
    expect(result.out).toContain('check-rulegen-agreement: OK');
  });

  it('refuses an answer set whose verdict it contradicts', async () => {
    // The gate this script is: one word in the file, and a green run becomes a red one. The
    // disagreement is named with the reason the validator gave, because "it disagrees" without the
    // reason is a report a reader cannot act on.
    const path = copyOf((file) => {
      const cases = file.cases as Array<Record<string, unknown>>;
      const target = cases.find((c) => c.id === 'metric-misspelled-field');
      target!.expectedVerdict = 'accepted';
      delete target!.expectedReason;
    });
    const result = await run(['--golden', path]);
    expect(result.status, result.out).toBe(1);
    expect(result.out).toContain("'metric-misspelled-field' is refused and the answer set says otherwise");
    expect(result.out).toContain("'timstamp' is not an IR field");
    expect(result.out).toContain('1 of 16 verdict(s) disagree with the answer set');
  });

  it('refuses a refusal that names a different reason than the answer set', async () => {
    // Exit zero is not the whole claim: a validator that refused everything for one reason would
    // pass a verdict-only check. The reason is compared, and a mismatch is a failure.
    const path = copyOf((file) => {
      const cases = file.cases as Array<Record<string, unknown>>;
      const target = cases.find((c) => c.id === 'trace-missing-duration');
      target!.expectedReason = 'column is empty in a sample';
    });
    const result = await run(['--golden', path]);
    expect(result.status, result.out).toBe(1);
    expect(result.out).toContain('was refused for a reason the answer set does not name');
  });

  it('refuses a file it cannot read, and names the check that failed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rulegen-agreement-'));
    dirs.push(dir);
    const path = join(dir, 'broken.json');
    writeFileSync(path, '{ not json\n');
    const result = await run(['--golden', path]);
    expect(result.status, result.out).toBe(1);
    expect(result.out).toContain('check-rulegen-agreement: FAILED —');
  });

  it('refuses an argument it does not understand rather than ignoring it', async () => {
    // A `--golden` that swallowed the next flag would read the shipped file and pass, which is a
    // check reporting on a subject the caller did not name.
    //
    // The status is asserted beside the sentence, and that is the half this test was missing: the
    // site it proves is the `process.exit(1)` in the argument catch, and a version that kept the
    // message while exiting zero left it green -- `verify-sites-are-sensitive` reported exactly
    // that. A refusal that prints and then succeeds is a report, not a refusal.
    const missing = await run(['--golden']);
    expect(missing.out).toContain('--golden needs a path');
    expect(missing.status, missing.out).toBe(1);
    const unknown = await run(['--silent']);
    expect(unknown.out).toContain("unknown argument '--silent'");
    expect(unknown.status, unknown.out).toBe(1);
  });

  it('prints nothing but the verdict when asked to be quiet', async () => {
    const result = await run(['--quiet']);
    expect(result.status, result.out).toBe(0);
    expect(result.out).toBe('');
  });
});
