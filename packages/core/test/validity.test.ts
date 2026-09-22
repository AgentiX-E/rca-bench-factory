import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  expectedSignalsFor,
  verifyFaultValidity,
  FAULT_EXPECTATIONS,
} from '../src/gates/validity.js';
import { checkG3Validity } from '../src/gates/gates.js';
import { FAULT_CATEGORIES } from '../src/ir/types.js';
import type { FaultCase, IrBundle, TelemetrySignal } from '../src/ir/types.js';
import { BASELINE_CPU, metricAt, validBundle, validCase, cpuSignals, logAt } from './fixtures.js';

/**
 * Fault validity verification.
 *
 * G3 asks whether *some* metric moved a statistically significant amount. This
 * asks the prior question: did **this** fault happen? The two are genuinely
 * different, and the difference is not subtle -- a `cpu` fault and a `network`
 * fault are evaluated by identical logic in G3, so a case whose ground truth
 * names CPU saturation passes while the only thing that moved is request latency.
 *
 * The tests below are organised as a falsification matrix rather than as a
 * checklist of features. Each of the six checks gets a case that must make it
 * fail, and a paired control that must pass. A check that cannot be made to fail
 * is not a check, and this suite would be the place that claim decayed quietly.
 *
 * Independence is itself asserted (see the last describe block). P1-1's exit
 * condition is explicit that the verification path must not reuse the generation
 * path, and "we were careful" is not an assertion.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** A bundle whose only difference from `validBundle()` is the fault it declares. */
function bundleWithFault(
  fault: FaultCase['fault'],
  signals?: TelemetrySignal[],
  groundTruth?: Partial<FaultCase['groundTruth']>,
): IrBundle {
  const base = validBundle();
  const fc = validCase();
  return {
    ...base,
    cases: [
      {
        ...fc,
        fault,
        groundTruth: { ...fc.groundTruth, ...groundTruth },
      },
    ],
    signals: { 'case-001': signals ?? cpuSignals() },
  };
}

/**
 * CPU is already at 95% *before* injection and stays there.
 *
 * The first draft of this fixture used a baseline of `[95, 96, 97, ...]`, which
 * is constant *relative to itself*: sigma is 0.88, so |Z| never reaches 2 and the
 * series is not anomalous by its own baseline. That made the check pass, and the
 * check was right to pass. A "pre-existing anomaly" only exists against a
 * baseline that was normal at some point and then moved, so the fixture now has
 * six normal samples followed by four saturated ones -- all before injection.
 */
function preexistingSaturation(): TelemetrySignal[] {
  const out: TelemetrySignal[] = [];
  for (let i = 0; i < 6; i += 1) out.push(metricAt(i * 30, 'cpu_usage', BASELINE_CPU[i]));
  // Saturated at t=180s, which is 420s before the injection at t=600s.
  for (let i = 0; i < 4; i += 1) out.push(metricAt(180 + i * 30, 'cpu_usage', 95 + (i % 2)));
  for (let i = 0; i < 5; i += 1) out.push(metricAt(600 + i * 30, 'cpu_usage', 96 + (i % 3)));
  return out;
}

/** CPU stays flat across injection -- the fault did not manifest. */
function noSaturation(): TelemetrySignal[] {
  const out: TelemetrySignal[] = [];
  for (let i = 0; i < 15; i += 1) out.push(metricAt(i * 30, 'cpu_usage', 20 + (i % 3)));
  return out;
}

/** The anomaly appears, but four minutes late. */
function lateOnset(): TelemetrySignal[] {
  const out: TelemetrySignal[] = [];
  for (let i = 0; i < 10; i += 1) out.push(metricAt(i * 30, 'cpu_usage', 20 + (i % 2)));
  // 600s is injection; the crossing starts at 840s, i.e. +240s.
  for (let i = 0; i < 4; i += 1) out.push(metricAt(600 + i * 30, 'cpu_usage', 21));
  for (let i = 0; i < 5; i += 1) out.push(metricAt(840 + i * 30, 'cpu_usage', 97 + (i % 2)));
  return out;
}

/** Only a latency series moves; the declared fault is CPU saturation. */
function latencyOnly(): TelemetrySignal[] {
  const out: TelemetrySignal[] = [];
  for (let i = 0; i < 10; i += 1) {
    const s = metricAt(i * 30, 'request_latency_ms', 100 + (i % 3));
    out.push({ ...s, payload: { kind: 'metric', name: 'request_latency_ms', value: 100 + (i % 3), unit: 'ms', semanticType: 'latency' } });
  }
  for (let i = 0; i < 5; i += 1) {
    const v = 900 + i * 10;
    const s = metricAt(600 + i * 30, 'request_latency_ms', v);
    out.push({ ...s, payload: { kind: 'metric', name: 'request_latency_ms', value: v, unit: 'ms', semanticType: 'latency' } });
  }
  return out;
}

/** Telemetry that the mechanism could never move: no series at all. */
const noMetrics: TelemetrySignal[] = [logAt(610, 'something happened', 'order')];

describe('the report is a report of checks', () => {
  it('produces a check per assertion, each with an id, a verdict and a detail', () => {
    const report = verifyFaultValidity(validBundle());
    expect(report.checks.length).toBeGreaterThanOrEqual(6);
    for (const c of report.checks) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.passed).toBe('boolean');
      expect(c.detail.length).toBeGreaterThan(0);
    }
  });

  it('gives every check an id that is unique within the report', () => {
    const ids = verifyFaultValidity(validBundle()).checks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports the case id it was given', () => {
    expect(verifyFaultValidity(validBundle()).caseId).toBe('case-001');
  });

  it('names the target entity and service it resolved', () => {
    const report = verifyFaultValidity(validBundle());
    expect(report.target.entityId).toBe('service:default/order');
    expect(report.target.service).toBe('order');
  });

  it('reports the series that moved, not just a count', () => {
    const report = verifyFaultValidity(validBundle());
    expect(report.observed.affectedSeries).toContain('order|cpu_usage');
  });
});

describe('valid: a resource fault that really happened', () => {
  it('reaches the valid verdict on the reference fixture', () => {
    expect(verifyFaultValidity(validBundle()).verdict).toBe('valid');
  });

  it('passes every check on the reference fixture', () => {
    const failed = verifyFaultValidity(validBundle()).checks.filter((c) => !c.passed);
    expect(failed.map((c) => c.id)).toEqual([]);
  });
});

describe('invalid: six ways a case can fail to be a case', () => {
  it('target-resolves fails when the ground-truth entity is not in the graph', () => {
    const bundle = bundleWithFault(validCase().fault, undefined, {
      rootCauseEntityId: 'service:default/ghost',
    });
    const report = verifyFaultValidity(bundle);
    expect(report.checks.find((c) => c.id === 'target-resolves')?.passed).toBe(false);
    expect(report.verdict).toBe('invalid');
  });

  it('target-observed fails when the target entity has no telemetry', () => {
    // All series belong to `cart`; the target is `order`.
    const migrated = cpuSignals().map((s) => ({
      ...s,
      resource: { ...s.resource, 'service.name': 'cart' },
    }));
    const report = verifyFaultValidity(bundleWithFault(validCase().fault, migrated));
    expect(report.checks.find((c) => c.id === 'target-observed')?.passed).toBe(false);
  });

  it('mechanism-manifested fails when only an unrelated metric moved', () => {
    const report = verifyFaultValidity(bundleWithFault(validCase().fault, latencyOnly()));
    const check = report.checks.find((c) => c.id === 'mechanism-manifested');
    expect(check?.passed).toBe(false);
    expect(check?.detail).toMatch(/cpu|saturation/i);
  });

  it('mechanism-manifested fails when nothing moved at all', () => {
    const report = verifyFaultValidity(bundleWithFault(validCase().fault, noSaturation()));
    expect(report.checks.find((c) => c.id === 'mechanism-manifested')?.passed).toBe(false);
  });

  it('onset-precision fails when the anomaly lands far from the injection time', () => {
    const report = verifyFaultValidity(bundleWithFault(validCase().fault, lateOnset()));
    expect(report.checks.find((c) => c.id === 'onset-precision')?.passed).toBe(false);
  });

  it('no-preexisting-anomaly fails when the series was already anomalous beforehand', () => {
    // The check G3 does not have. A CPU metric that was already at 95% before
    // injection is not evidence that the injection caused anything.
    const report = verifyFaultValidity(bundleWithFault(validCase().fault, preexistingSaturation()));
    expect(report.checks.find((c) => c.id === 'no-preexisting-anomaly')?.passed).toBe(false);
  });

  it('sustained-duration fails when the anomaly is a single sample', () => {
    const out: TelemetrySignal[] = [];
    for (let i = 0; i < 10; i += 1) out.push(metricAt(i * 30, 'cpu_usage', 20 + (i % 2)));
    out.push(metricAt(600, 'cpu_usage', 99));
    out.push(metricAt(630, 'cpu_usage', 21));
    out.push(metricAt(660, 'cpu_usage', 20));
    const report = verifyFaultValidity(bundleWithFault(validCase().fault, out));
    expect(report.checks.find((c) => c.id === 'sustained-duration')?.passed).toBe(false);
  });
});

describe('unverifiable is not invalid', () => {
  it('reports unverifiable when the telemetry could not show the fault either way', () => {
    // No metric series exist, so no mechanism could have manifested. Saying
    // "the fault did not happen" would be a claim the data cannot support.
    const report = verifyFaultValidity(bundleWithFault(validCase().fault, noMetrics));
    expect(report.verdict).toBe('unverifiable');
  });

  it('reports unverifiable for a fault category with no defined mechanism', () => {
    const fault = { type: 'something-exotic', category: 'unknown' as const };
    const report = verifyFaultValidity(bundleWithFault(fault));
    expect(report.verdict).toBe('unverifiable');
  });

  it('does not report valid when the verdict is unverifiable', () => {
    const report = verifyFaultValidity(bundleWithFault(validCase().fault, noMetrics));
    expect(report.verdict).not.toBe('valid');
  });

  it('still emits the checks it could evaluate', () => {
    const report = verifyFaultValidity(bundleWithFault(validCase().fault, noMetrics));
    expect(report.checks.length).toBeGreaterThan(0);
  });
});

describe('the mechanism table covers the fault taxonomy', () => {
  it('answers for every category the IR admits', () => {
    for (const category of FAULT_CATEGORIES) {
      expect(FAULT_EXPECTATIONS[category], `${category} has no expectation`).toBeDefined();
    }
  });

  it('carries no category the IR does not admit', () => {
    expect(Object.keys(FAULT_EXPECTATIONS).sort()).toEqual([...FAULT_CATEGORIES].sort());
  });

  it.each(FAULT_CATEGORIES)('%s names what must move, or says it cannot be checked', (category) => {
    const expectation = expectedSignalsFor({ type: 't', category });
    // Either the mechanism is known (some semantic type or name pattern), or the
    // category is explicitly declared unverifiable. Silence is not an option.
    const specified = expectation.semanticTypes.length > 0 || expectation.namePattern !== undefined;
    expect(specified || expectation.unverifiable === true).toBe(true);
  });

  it('marks a resource fault as needing saturation or an infrastructure metric', () => {
    const expectation = expectedSignalsFor({ type: 'cpu', category: 'resource' });
    expect(expectation.semanticTypes).toContain('saturation');
  });

  it('marks a network fault as needing latency, errors or throughput', () => {
    const expectation = expectedSignalsFor({ type: 'delay', category: 'network' });
    expect(
      expectation.semanticTypes.some((t) => t === 'latency' || t === 'error_rate' || t === 'throughput'),
    ).toBe(true);
  });
});

describe('each category detects its own fault and not another', () => {
  it('accepts a network fault when latency moves', () => {
    const fault = { type: 'network-delay', category: 'network' as const };
    const report = verifyFaultValidity(bundleWithFault(fault, latencyOnly()));
    expect(report.checks.find((c) => c.id === 'mechanism-manifested')?.passed).toBe(true);
  });

  it('rejects a network fault when only CPU moves', () => {
    // The cross-category discrimination G3 cannot make: same telemetry, different
    // declared fault, different verdict.
    const cpuMoved = cpuSignals().map((s) => {
      const payload = s.payload;
      return { ...s, payload: { ...payload, name: 'cpu_usage' } };
    });
    const asNetwork = verifyFaultValidity(
      bundleWithFault({ type: 'network-delay', category: 'network' }, cpuMoved),
    );
    const asResource = verifyFaultValidity(
      bundleWithFault({ type: 'cpu', category: 'resource' }, cpuMoved),
    );
    expect(asResource.checks.find((c) => c.id === 'mechanism-manifested')?.passed).toBe(true);
    expect(asNetwork.checks.find((c) => c.id === 'mechanism-manifested')?.passed).toBe(false);
  });
});

describe('the verifier is independent of the generation path', () => {
  /**
   * P1-1's exit condition: the verification must not reuse the criteria that
   * generated the case, or it only confirms that what we produced matches what we
   * assumed. Cloud-OpsBench reaches this with a separate agent; we reach it by
   * construction, and by construction is exactly the kind of claim that needs an
   * assertion rather than a comment.
   */
  const source = readFileSync(resolve(HERE, '..', 'src', 'gates', 'validity.ts'), 'utf8');

  it('imports nothing from the generation path', () => {
    const imports = [...source.matchAll(/^import[\s\S]*?from\s+'([^']+)';/gm)].map((m) => m[1]);
    const forbidden = ['assembler', 'importer', 'collector'];
    for (const specifier of imports) {
      for (const name of forbidden) {
        expect(
          specifier,
          `validity.ts imports '${specifier}', which is part of the path that builds cases`,
        ).not.toContain(name);
      }
    }
  });

  it('imports only types from the IR, never the vocabularies that decide what is legal', () => {
    // `import type` erases; a value import would mean the verifier reads the same
    // vocabulary the generator wrote with.
    const valueImports = [...source.matchAll(/^import\s+(?!type\b)([\s\S]*?)from\s+'([^']+)';/gm)]
      .map((m) => m[2])
      .filter((s) => s.includes('/ir/'));
    expect(valueImports).toEqual([]);
  });

  it('receives no fault parameters, so it cannot echo back what was injected', () => {
    // The signature takes an IrBundle. A `parameters`-aware verifier could confirm
    // a fault by reading `intensity: 90` rather than by looking at telemetry.
    //
    // Comments are removed first. The module's own header says it never reads
    // `fault.parameters`, and a scan that could not tell a comment from code would
    // fail on that sentence -- then the obvious "fix" is to delete the sentence,
    // which removes the documentation rather than the behaviour. Stripping
    // comments makes the assertion about what the code does.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n');
    expect(code).not.toMatch(/\.parameters\b/);
  });
});

describe('G3 carries the mechanistic findings when asked', () => {
  it('reports nothing new when validity is not enabled', () => {
    // The opt-in boundary. A caller that has not asked for mechanistic
    // verification must not start quarantining cases because this module landed.
    const report = checkG3Validity(bundleWithFault(validCase().fault, latencyOnly()));
    expect(report.violations.filter((x) => x.code.startsWith('VALIDITY_'))).toEqual([]);
  });

  it('keeps its own statistical violations when validity is enabled', () => {
    // `noSaturation` is the fixture where the statistical half *does* fire: the
    // CPU series never moves, so nothing sustains |Z| >= 2 and G3 reports
    // WEAK_ANOMALY_SIGNAL. `latencyOnly` would not work here -- latency moves
    // just as convincingly as CPU does, which is precisely the blindness the
    // mechanistic half exists to cover.
    const report = checkG3Validity(bundleWithFault(validCase().fault, noSaturation()), {
      validity: {},
    });
    expect(report.violations.some((x) => x.code === 'WEAK_ANOMALY_SIGNAL')).toBe(true);
    // And the mechanistic half reports alongside it rather than instead of it.
    expect(report.violations.map((x) => x.code)).toContain('VALIDITY_MECHANISM_MANIFESTED');
  });

  it('appends a VALIDITY_ violation naming the mechanism that did not appear', () => {
    const report = checkG3Validity(bundleWithFault(validCase().fault, latencyOnly()), {
      validity: {},
    });
    const codes = report.violations.map((x) => x.code);
    expect(codes).toContain('VALIDITY_MECHANISM_MANIFESTED');
  });

  it('appends a VALIDITY_ violation for a pre-existing anomaly', () => {
    // The finding G3 structurally cannot produce on its own, since it has no
    // concept of a baseline that was already abnormal.
    const report = checkG3Validity(bundleWithFault(validCase().fault, preexistingSaturation()), {
      validity: {},
    });
    expect(report.violations.map((x) => x.code)).toContain('VALIDITY_NO_PREEXISTING_ANOMALY');
  });

  it('appends nothing for an unverifiable case', () => {
    // No metric series means the mechanism could not have shown either way, so
    // there is no finding to report. This is the boundary between "we checked
    // and it failed" and "we could not check", kept visible at the gate level.
    const report = checkG3Validity(bundleWithFault(validCase().fault, noMetrics), { validity: {} });
    expect(report.violations.filter((x) => x.code.startsWith('VALIDITY_'))).toEqual([]);
  });

  it('passes G3 entirely on the reference fixture with validity enabled', () => {
    // The negative control: the new half must not find defects in a case that
    // has none. Without this, "it reports violations" would be satisfied by a
    // check that reports them always.
    const report = checkG3Validity(validBundle(), { validity: {} });
    expect(report.violations).toEqual([]);
    expect(report.status).toBe('passed');
  });
});

/**
 * The three paths the first draft of this file did not reach.
 *
 * Coverage on this module was 93.7% statements and 89.24% branches while the
 * package average read 99.95/99.93, which is the argument for measuring a new
 * file on its own: the average is a statement about the package, and a file can
 * be well under the floor without moving it. Each case below is a real path,
 * not a line added to a coverage report.
 */
describe('the paths that are awkward to reach are still paths', () => {
  /**
   * A category outside the union.
   *
   * TypeScript forbids this at a call site, so it looks unreachable -- but a
   * bundle is parsed from JSON and the parser is not the only way in. A run
   * whose telemetry names a category this build has never heard of must be
   * reported as unverifiable, not as invalid: the honest answer is that we do
   * not know what this fault should look like, and saying so is the whole
   * reason the third verdict exists.
   */
  it('reports an unrecognised category as unverifiable rather than invalid', () => {
    const alien = { type: 'cpu', category: 'not-a-category-in-this-build' } as unknown as FaultCase['fault'];
    const expectation = expectedSignalsFor(alien);
    expect(expectation.unverifiable).toBe(true);
    expect(expectation.semanticTypes).toEqual([]);
  });

  it('carries that unverifiability through to the verdict', () => {
    const alien = { type: 'cpu', category: 'not-a-category-in-this-build' } as unknown as FaultCase['fault'];
    const report = verifyFaultValidity(bundleWithFault(alien));
    expect(report.verdict).toBe('unverifiable');
    // The distinction that matters: nothing was found wrong with this case.
    expect(report.verdict).not.toBe('invalid');
  });

  it('still resolves every category that does exist, so the fallback is not the common path', () => {
    for (const category of FAULT_CATEGORIES) {
      const expectation = expectedSignalsFor({ type: 'cpu', category });
      expect(expectation).toBe(FAULT_EXPECTATIONS[category]);
    }
  });

  /**
   * A bundle with no cases.
   *
   * `bundle.cases[0]` is then undefined. This is the empty-input case every
   * function of a collection has, and the temptation is to let it throw and
   * call the throw the contract. It must not throw: the caller is a gate that
   * iterates cases, and a gate that dies on an empty bundle reports a crash
   * instead of a finding.
   */
  it('reports a case-less bundle instead of throwing on it', () => {
    const empty: IrBundle = { ...validBundle(), cases: [], signals: {} };
    const report = verifyFaultValidity(empty);
    expect(report.verdict).toBe('unverifiable');
    expect(report.checks).toHaveLength(1);
    expect(report.checks[0].id).toBe('case-present');
    expect(report.checks[0].passed).toBe(false);
  });

  // A positive control for the branch above: one case, and the empty-bundle
  // path is not taken, so the check list is the six real checks.
  it('does not take that path for a bundle that has a case', () => {
    const report = verifyFaultValidity(validBundle());
    expect(report.checks).toHaveLength(6);
    expect(report.checks.map((c) => c.id)).not.toContain('case-present');
  });

  /**
   * A series with no sample at or after onset.
   *
   * The duration check asks how long an anomaly ran, by counting the leading
   * run of anomalous samples from onset. A series that simply stops before
   * onset has an empty tail, and the count is then over no samples. The result
   * has to be zero rather than a throw: a truncated series is a data problem,
   * and it belongs in the finding, not in a stack trace.
   */
  it('treats a series that ends before onset as an anomaly of zero length', () => {
    const base = validBundle();
    const fc = validCase({ fault: { type: 'cpu', category: 'resource' } });
    // Each signal is one sample, so the tail is emptied by moving every
    // timestamp an hour into the past rather than by dropping points.
    const early: TelemetrySignal[] = cpuSignals().map((s) => ({
      ...s,
      timestamp: new Date(Date.parse(s.timestamp) - 3_600_000).toISOString(),
    }));
    const truncated: IrBundle = {
      ...base,
      cases: [fc],
      signals: { 'case-001': early },
    };
    const report = verifyFaultValidity(truncated);
    const duration = report.checks.find((c) => c.id === 'sustained-duration');
    expect(duration).toBeDefined();
    expect(duration!.passed).toBe(false);
    // The claim is about the run length, and a run over nothing is zero.
    expect(duration!.detail).toMatch(/0/);
  });

  /**
   * Two series, and the run is taken from the later one.
   *
   * `sustainedRun` is a `Math.max` over per-series runs measured *from the
   * earliest onset across all series*. A series whose own onset is later than
   * that global onset has fewer samples after it, so the maximum can come from
   * a series that did not supply the onset. This is the branch where the
   * spread's fallback is the only survivor, and it is reached by making the
   * second series the longer one:
   *
   *   - `cpu_usage` moves first and sustains exactly three samples;
   *   - `load_average` moves later and sustains six.
   *
   * The global onset is cpu_usage's. Measured from there, cpu_usage has a run
   * of three and load_average has a run of six, so the reported duration must
   * be six and must come from the second series. A `Math.max` that stopped at
   * the first argument would report three and quietly understate how long the
   * fault lasted -- and three is still above the threshold, so the check would
   * pass while reporting the wrong number. The assertion is on the value, not
   * just on `passed`.
   */
  it('takes the run from the longest series, not the one that moved first', () => {
    const base = validBundle();
    const fc = validCase({ fault: { type: 'cpu', category: 'resource' } });
    const t0 = Date.parse(base.cases[0].window.start);
    const inject = Date.parse(fc.injectTime);

    // Six normal samples, then a saturated tail.
    const at = (offsetSeconds: number, name: string, value: number, semanticType: string) => ({
      ...metricAt(0, name, value),
      timestamp: new Date(t0 + offsetSeconds * 1000).toISOString(),
      payload: { kind: 'metric' as const, name, value, unit: '%', semanticType },
    });

    const cpu: TelemetrySignal[] = [];
    for (let i = 0; i < 6; i += 1) cpu.push(at(i * 30, 'cpu_usage', 20 + (i % 2), 'saturation'));
    // Three saturated samples, then a return to normal.
    for (let i = 0; i < 3; i += 1) cpu.push(at(600 + i * 30, 'cpu_usage', 99, 'saturation'));
    for (let i = 0; i < 4; i += 1) cpu.push(at(900 + i * 30, 'cpu_usage', 20, 'saturation'));

    const load: TelemetrySignal[] = [];
    for (let i = 0; i < 6; i += 1) load.push(at(i * 30, 'load_average', 1 + (i % 2), 'saturation'));
    // Onset later than cpu's, and a longer run.
    for (let i = 0; i < 6; i += 1) load.push(at(780 + i * 30, 'load_average', 88, 'saturation'));

    const bundle: IrBundle = {
      ...base,
      cases: [fc],
      signals: { 'case-001': [...cpu, ...load] },
    };

    const report = verifyFaultValidity(bundle);
    const duration = report.checks.find((c) => c.id === 'sustained-duration');
    expect(duration).toBeDefined();
    expect(duration!.passed).toBe(true);
    // Six, from load_average, not three from the series that moved first.
    expect(duration!.detail).toMatch(/6 sample/);
    expect(inject).toBeLessThan(t0 + 600 * 1000 + 1);
  });
});

/**
 * The remaining branch sites, each reached through the public surface.
 *
 * The module keeps `mean`, `stddev` and `toSeries` private on purpose -- they
 * are deliberate re-implementations of statistics that also live in `gates.ts`,
 * and publishing them would invite the two to be reconciled, which is the one
 * thing that must not happen to this module. So these are exercised the way a
 * caller exercises them: through a bundle whose shape forces the branch.
 */
describe('the branches a well-formed bundle never takes', () => {
  /** `mean([])` and `stddev` below two samples. */
  it('treats a series with a single usable sample as having no spread', () => {
    const base = validBundle();
    const fc = validCase({ fault: { type: 'cpu', category: 'resource' } });
    // One baseline sample, so `mean`/`stddev` get one value. The run is
    // undecidable rather than broken, and the verdict has to say so instead of
    // dividing by zero: stddev over one sample is 0, and a sigma of 0 would
    // make every later sample infinitely anomalous, which is the opposite of
    // what a one-sample baseline can support.
    const lonely: TelemetrySignal[] = [
      {
        ...metricAt(0, 'cpu_usage', 20, 'order', '%'),
        payload: { kind: 'metric' as const, name: 'cpu_usage', value: 20, unit: '%', semanticType: 'saturation' },
      },
    ];
    const bundle: IrBundle = { ...base, cases: [fc], signals: { 'case-001': lonely } };
    const report = verifyFaultValidity(bundle);
    // A sigma of zero must not manufacture an onset out of nothing.
    const mechanism = report.checks.find((c) => c.id === 'mechanism-manifested');
    expect(mechanism).toBeDefined();
    expect(report.verdict).not.toBe('valid');
  });

  /**
   * A case whose id is missing from `bundle.signals`.
   *
   * The lookup is `bundle.signals[caseId] ?? []`, and the `?? []` is the branch.
   * A bundle assembled from a partial pipeline can carry a case and no signals
   * for it, and that must read as "nothing was observed", not as a crash.
   */
  it('reads a case with no signals at all as unverifiable rather than invalid', () => {
    const base = validBundle();
    const fc = validCase({ fault: { type: 'cpu', category: 'resource' } });
    const bundle: IrBundle = { ...base, cases: [fc], signals: {} };
    const report = verifyFaultValidity(bundle);
    const observed = report.checks.find((c) => c.id === 'target-observed');
    expect(observed).toBeDefined();
    expect(observed!.passed).toBe(false);
    expect(report.observed.affectedSeries).toEqual([]);
    // Not `invalid`. With no series there was nothing to check, and the third
    // verdict exists precisely so that an absence of evidence is not reported
    // as evidence. The check that failed is a real failure; the conclusion is
    // still withheld, because the data cannot support one either way.
    expect(report.verdict).toBe('unverifiable');
  });

  /**
   * Non-metric signals, and a timestamp that does not parse.
   *
   * `toSeries` skips both. They are not exotic: a bundle carries logs and traces
   * alongside metrics, and a malformed timestamp is exactly the kind of thing
   * that arrives from a real telemetry export. Skipping is the correct
   * behaviour and the branch has to be exercised for that to be a claim.
   */
  it('ignores logs and unparseable timestamps when building series', () => {
    const base = validBundle();
    const fc = validCase({ fault: { type: 'cpu', category: 'resource' } });
    const mixed: TelemetrySignal[] = [
      ...cpuSignals(),
      logAt(10, 'a log line that is not a metric'),
      {
        ...metricAt(0, 'cpu_usage', 20, 'order', '%'),
        timestamp: 'not-a-timestamp',
        payload: { kind: 'metric' as const, name: 'cpu_usage', value: 20, unit: '%', semanticType: 'saturation' },
      },
    ];
    const bundle: IrBundle = { ...base, cases: [fc], signals: { 'case-001': mixed } };
    const report = verifyFaultValidity(bundle);
    expect(report.verdict).toBe('valid');
    // The metric that did parse is still seen; the junk did not replace it.
    expect(report.observed.affectedSeries).toContain('order|cpu_usage');
  });

  /**
   * A metric with no `semanticType` at all.
   *
   * `Series.semanticType` is optional and built conditionally, so this reaches
   * the object-spread branch at line 239. A metric from an older exporter may
   * simply not carry one, and the series still has to exist so that a
   * name-pattern expectation can match it.
   */
  it('keeps a metric that carries no semantic type', () => {
    const base = validBundle();
    const fc = validCase({ fault: { type: 'cpu', category: 'resource' } });
    const untyped = {
      ...metricAt(0, 'cpu_usage', 99, 'order', '%'),
      payload: { kind: 'metric' as const, name: 'cpu_usage', value: 99, unit: '%' },
    } as TelemetrySignal;
    const bundle: IrBundle = { ...base, cases: [fc], signals: { 'case-001': [untyped] } };
    const report = verifyFaultValidity(bundle);
    // No crash, and the absence of a semantic type is a fact about the input.
    expect(report.checks.length).toBeGreaterThan(0);
  });

  /**
   * A semantic type outside the expectation, matched instead by name pattern.
   *
   * This is the fall-through at line 255: the first `if` is entered, the type is
   * not in the list, and the name pattern is what decides. A `network` fault
   * expects latency-flavoured types; a series typed `throughput` whose *name*
   * matches the pattern must still be recognised. Without this branch the
   * matcher would only ever work when the type and the pattern agreed.
   */
  it('matches on the name pattern when the semantic type is present but unexpected', () => {
    const base = validBundle();
    const fc = validCase({
      fault: { type: 'network_delay', category: 'network' },
      groundTruth: { rootCauseEntityId: 'service:default/order', rootCauseComponent: 'order' },
    });
    // `network` expects ['latency', 'error_rate', 'throughput']. The declared
    // type below is none of them -- `saturation` belongs to `resource` -- so the
    // first `if` is entered, fails, and the name pattern is what decides. The
    // name carries the token the pattern looks for.
    const samples: TelemetrySignal[] = [];
    for (let i = 0; i < 6; i += 1) {
      samples.push({
        ...metricAt(i * 30, 'request_latency_p99', 5 + (i % 2), 'order', 'ms'),
        payload: {
          kind: 'metric' as const,
          name: 'request_latency_p99',
          value: 5 + (i % 2),
          unit: 'ms',
          semanticType: 'saturation',
        },
      });
    }
    const inject = Date.parse(fc.injectTime);
    const t0 = Date.parse(base.cases[0].window.start);
    const offset = Math.round((inject - t0) / 1000);
    for (let i = 0; i < 3; i += 1) {
      samples.push({
        ...metricAt(offset + i * 30, 'request_latency_p99', 900, 'order', 'ms'),
        payload: {
          kind: 'metric' as const,
          name: 'request_latency_p99',
          value: 900,
          unit: 'ms',
          semanticType: 'saturation',
        },
      });
    }
    const bundle: IrBundle = { ...base, cases: [fc], signals: { 'case-001': samples } };
    const report = verifyFaultValidity(bundle);
    // Recognised by name alone: the type said `saturation`, which `network`
    // does not expect, and the series was still read and still moved.
    expect(report.observed.affectedSeries).toContain('order|request_latency_p99');
  });

  /**
   * An onset before the injection.
   *
   * The detail string prefixes a sign only for a positive offset. An onset
   * earlier than `injectTime` is unusual but not impossible -- the window and
   * the injection are recorded independently -- and it produces a negative
   * offset whose rendering must not carry a stray `+`.
   */
  /**
   * The onset offset is always non-negative, and that is a fact about the code.
   *
   * This replaces a test that tried to force a negative offset and could not,
   * because `onsetMs` is only ever drawn from samples at or after `injectMs` --
   * an anomaly that starts earlier is in the baseline window and is therefore
   * not an onset at all. The ternary that rendered a negative offset was
   * unreachable and has been removed; this pins the invariant that made it so,
   * so a future change that moves the onset search into the baseline fails here
   * instead of quietly reinstating a signed offset.
   */
  it('reports an onset offset that is never negative', () => {
    const base = validBundle();
    const fc = validCase({ fault: { type: 'cpu', category: 'resource' } });
    const report = verifyFaultValidity({ ...base, cases: [fc], signals: { 'case-001': cpuSignals() } });
    const onset = report.checks.find((c) => c.id === 'onset-precision');
    expect(onset).toBeDefined();
    expect(onset!.detail).toContain('at +');
    // The rendered offset, parsed back, must be >= 0.
    const rendered = Number(/([+-]\d+)s/.exec(onset!.detail)![1]);
    expect(rendered).toBeGreaterThanOrEqual(0);
  });
});

/**
 * A baseline too thin to define normal.
 *
 * This is the defect the coverage pass found rather than the suite. The comment
 * in `readSeries` said that a baseline with fewer than `minSustainedSamples`
 * samples would be treated as unverifiable by the caller. Nothing enforced it,
 * and a bundle with two baseline samples and a saturated tail was reported
 * **valid** with all six checks green.
 *
 * The arithmetic is what makes it a defect and not a matter of taste:
 * `stddev([20, 21])` is 0.707, so a later sample of 99 sits at |Z| = 111. Any
 * injected fault at all clears |Z| = 2 against a two-sample baseline, which
 * means the check was not testing whether the fault happened but whether two
 * numbers happened to be close together. A verifier that says yes to everything
 * is worse than no verifier, because it is believed.
 */
describe('a baseline too thin to establish normal', () => {
  /** A series with exactly `baselineSamples` pre-injection points, then six saturated ones. */
  function thinBaseline(baselineSamples: number): IrBundle {
    const base = validBundle();
    const fc = validCase({ fault: { type: 'cpu', category: 'resource' } });
    const t0 = Date.parse(base.cases[0].window.start);
    const offset = Math.round((Date.parse(fc.injectTime) - t0) / 1000);

    const samples: TelemetrySignal[] = [];
    for (let i = 0; i < baselineSamples; i += 1) {
      samples.push(metricAt(i * 30, 'cpu_usage', 20 + (i % 2), 'order', '%'));
    }
    for (let i = 0; i < 6; i += 1) {
      samples.push(metricAt(offset + i * 30, 'cpu_usage', 99, 'order', '%'));
    }
    return { ...base, cases: [fc], signals: { 'case-001': samples } };
  }

  it('refuses to call a fault valid when only two samples define normal', () => {
    const report = verifyFaultValidity(thinBaseline(2));
    expect(report.verdict).toBe('unverifiable');
    expect(report.verdict).not.toBe('valid');
  });

  it('refuses at one sample, and at zero', () => {
    for (const n of [0, 1]) {
      const report = verifyFaultValidity(thinBaseline(n));
      expect(report.verdict).toBe('unverifiable');
    }
  });

  // The boundary, from both sides. Three samples is the configured minimum, so
  // it must establish; two must not. Asserting only one side would leave the
  // comparison itself untested.
  it('establishes normal at exactly three samples', () => {
    const report = verifyFaultValidity(thinBaseline(3));
    expect(report.verdict).toBe('valid');
    const mechanism = report.checks.find((c) => c.id === 'mechanism-manifested');
    expect(mechanism!.passed).toBe(true);
    expect(mechanism!.detail).toContain('order|cpu_usage');
  });

  it('does not report a thin baseline as a fault that did not happen', () => {
    // `invalid` would be a claim, and the data cannot support one. The whole
    // reason `unverifiable` exists as a third verdict is this case.
    const report = verifyFaultValidity(thinBaseline(2));
    const observed = report.checks.find((c) => c.id === 'target-observed');
    // The service *was* observed -- there are samples for it. What is missing
    // is a baseline, which is a different failure and must not be conflated.
    expect(observed!.passed).toBe(true);
    expect(report.verdict).toBe('unverifiable');
  });

  it('honours a raised minSustainedSamples rather than hard-coding three', () => {
    // With the minimum raised to 6, a 3-sample baseline is no longer enough.
    // A implementation that compared against a literal 3 would pass this and
    // miss the point, so the threshold is exercised through the option.
    const report = verifyFaultValidity(thinBaseline(3), { minSustainedSamples: 6 });
    expect(report.verdict).toBe('unverifiable');
  });
});
