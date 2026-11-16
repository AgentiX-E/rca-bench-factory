import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  describeDurationClaim,
  readDurationClaim,
  readEpisodeLength,
  type DurationClaimFault,
} from '../src/fault/duration-claim.js';
import { readParameterRoles, type EpisodeDeclaration } from '../src/fault/parameter-role.js';
import type { SeriesDeclaration } from '../src/fault/derived-telemetry.js';

/**
 * How long the fault lasted, as the file claims it and as the samples draw it.
 *
 * The case below is the v3.71 merge-burst before its window was repaired: a 28-minute post side
 * divided into eight samples, so one sample is 3.5 minutes. It is the fixture for every refusal,
 * because it is the case whose `burstMinutes: 4` beside `hold: 4` read as one fact written twice when
 * it was four samples against fourteen minutes (finding 490).
 *
 * Which parameter is the episode is no longer this module's question: `fault/parameter-role.ts`
 * reads it off the parameter, and the declaration arrives here as one value in a unit of time. What
 * is left is arithmetic -- one number against the episode the samples draw.
 */
const BURST = {
  windowStart: '2026-11-05T14:00:00.000Z',
  onset: '2026-11-05T14:12:00.000Z',
  windowEnd: '2026-11-05T14:40:00.000Z',
};

const series = (over: Partial<SeriesDeclaration> = {}): SeriesDeclaration => ({
  service: 'search-cluster',
  metric: 'search_merge_thread_utilisation',
  unit: '1',
  baseline: 0.12,
  post: 0.98,
  hold: 4,
  ...over,
});

/** The declaration a case writes, as `readParameterRoles` hands it over. */
const episode = (value: number, unit = 'min'): EpisodeDeclaration => ({ parameter: 'burstMinutes', value, unit });

describe('readEpisodeLength', () => {
  it('reads an excursion as its hold times one sample, and ignores a series that never leaves its baseline', () => {
    // The control series holds for a different number of samples on purpose: a control that held for
    // four would contribute the same length as the excursion, and a test that expects 840_000 would
    // pass with the skip inverted -- which is what the injection battery found when it was asked.
    const measured = readEpisodeLength({
      series: [series(), series({ metric: 'flat', baseline: 0, post: 0, hold: 1 })],
      when: BURST,
    });
    expect(measured.spacingMs).toBe(210_000);
    expect(measured.lengths).toEqual([840_000]);
    expect(measured.holds).toEqual([4]);
  });

  it('reads a series that declares no hold as the whole post side, which is what two corpus cases missed', () => {
    // An absent `hold` is a declaration that the excursion lasts every sample of the side, and an
    // absent `noise` still says the value is exact. So the length is the side's, and no case can call
    // that "no duration of its own" (findings 492 and 493).
    const measured = readEpisodeLength({ series: [series({ hold: undefined })], when: BURST });
    expect(measured.lengths).toEqual([1_680_000]);
    expect(measured.holds).toEqual([8]);
  });

  it('keeps every distinct length, sorted, when the case\'s series do not agree', () => {
    const measured = readEpisodeLength({
      series: [series({ hold: 6 }), series({ metric: 'b', hold: 4 }), series({ metric: 'c', hold: 6 })],
      when: BURST,
    });
    expect(measured.lengths).toEqual([840_000, 1_260_000]);
    expect(measured.holds).toEqual([4, 6]);
  });

  it('reads no length at all from a case whose every series is flat', () => {
    expect(readEpisodeLength({ series: [series({ baseline: 1, post: 1 })], when: BURST }).lengths).toEqual([]);
  });
});

describe('readDurationClaim', () => {
  const read = (declared: EpisodeDeclaration | null, over: { series?: SeriesDeclaration[]; when?: typeof BURST } = {}) =>
    readDurationClaim({ declared, series: over.series ?? [series()], when: over.when ?? BURST });

  it('says nothing at all when the case declares no episode', () => {
    // A case may hold only knobs, and a case that states no length makes no claim: silence is not a
    // defect here, which is the opposite of the decision `fault.parameters`' own `role` makes about a
    // length that states nothing.
    expect(read(null)).toEqual({ parameter: null, measured: null, fault: null });
  });

  it('refuses a length the case has no excursion to draw', () => {
    const fault = read(episode(4), { series: [series({ baseline: 2, post: 2 })] }).fault as DurationClaimFault;
    expect(fault).toEqual({ kind: 'no-episode', parameter: 'burstMinutes', statedMs: 240_000, unit: 'min' });
    expect(describeDurationClaim(fault)).toBe(
      'fault.parameters.burstMinutes states 4 min, and the case shows no excursion: every series ' +
        'either returns to its own baseline or never leaves it, so the stated length is one nothing ' +
        'in the case draws',
    );
  });

  it('refuses one number for a case whose series hold for two different lengths', () => {
    const fault = read(episode(4), { series: [series({ hold: 6 }), series({ metric: 'b', hold: 4 })] })
      .fault as DurationClaimFault;
    expect(fault).toEqual({
      kind: 'ambiguous',
      parameter: 'burstMinutes',
      statedMs: 240_000,
      unit: 'min',
      measuredMs: [840_000, 1_260_000],
    });
    expect(describeDurationClaim(fault)).toBe(
      "fault.parameters.burstMinutes states 4 min, and the case's series hold for lengths that do " +
        'not agree (14 min, 21 min): one number cannot be the length of all of them',
    );
  });

  it('refuses a stated length the samples contradict, naming all three numbers', () => {
    const fault = read(episode(5)).fault as DurationClaimFault;
    expect(fault).toEqual({
      kind: 'disagrees',
      parameter: 'burstMinutes',
      statedMs: 300_000,
      measuredMs: 840_000,
      unit: 'min',
      hold: 4,
      spacingMs: 210_000,
    });
    // The case the v3.72 rule could not see: five is not four, so nothing compared the number with
    // the episode, and the episode was fourteen minutes.
    expect(describeDurationClaim(fault)).toBe(
      'fault.parameters.burstMinutes states 5 min as the length of this episode, and its 4 ' +
        "sample(s) at 3.5 min each are 14 min: the file's length and the data's are one episode, " +
        'so they cannot be two numbers',
    );
  });

  it('accepts a stated length the samples draw, and reports the episode it was read against', () => {
    const report = read(episode(14));
    expect(report.fault).toBeNull();
    expect(report.parameter).toBe('burstMinutes');
    expect(report.measured?.lengths).toEqual([840_000]);
  });

  it('accepts the same length stated in another unit of time', () => {
    // 840 seconds is 14 minutes, and the table converts rather than the author having to.
    expect(read(episode(840, 's')).fault).toBeNull();
    expect(read(episode(0.2333, 'h')).fault).not.toBeNull();
  });

  it('treats a difference below a millisecond as no difference, and one above it as one', () => {
    // A post side that does not divide into eight whole milliseconds leaves a fractional spacing, and
    // that remainder is arithmetic rather than a disagreement: a stated length is a whole number of a
    // unit no smaller than a second, so a millisecond is below every resolution the file can write.
    // Four samples of a minute are 240_000 ms; the windows below draw 240_000.5 and 240_005.
    const four = episode(4);
    const at = (windowEnd: string) => read(four, { when: { ...BURST, windowEnd } });
    expect(at('2026-11-05T14:20:00.001Z').fault).toBeNull();
    expect(at('2026-11-05T14:20:00.010Z').fault?.kind).toBe('disagrees');
  });
});

/**
 * The shipped corpus, which is where the rule stops being a property of a fixture.
 *
 * Every case that declares an episode has the number read against its own window: a case whose
 * window is edited no longer agrees, and this fails rather than the guard telling a reader in prose.
 * The five cases are named rather than counted, because a corpus that lost its declarations would
 * keep the guard green -- silence is not this rule's refusal, and `parameter-role.test.ts` is where
 * the silence itself is refused.
 */
describe('the shipped corpus · the length each case claims', () => {
  const CASES = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'golden-master', 'fault-cases');
  const index = JSON.parse(readFileSync(join(CASES, 'index.json'), 'utf8')) as { cases: Array<{ case?: string }> };
  const names = index.cases
    .map((entry) => entry.case)
    .filter((name): name is string => typeof name === 'string');
  const declared = names.flatMap((name) => {
    const raw = JSON.parse(readFileSync(join(CASES, name), 'utf8')) as {
      caseId: string;
      injectTime: string;
      window: { start: string; end: string };
      fault: { parameters?: Record<string, unknown> };
    };
    const roles = readParameterRoles(raw.fault.parameters ?? {});
    if (roles.episode === null) return [];
    const signals = JSON.parse(readFileSync(join(CASES, name.replace(/\.json$/, '.signals.json')), 'utf8')) as {
      series: SeriesDeclaration[];
    };
    return [
      {
        caseId: raw.caseId,
        report: readDurationClaim({
          declared: roles.episode,
          series: signals.series,
          when: { windowStart: raw.window.start, onset: raw.injectTime, windowEnd: raw.window.end },
        }),
      },
    ];
  });

  it('has five, and every one of them agrees with the samples it holds', () => {
    expect(declared.map((one) => one.caseId).sort()).toEqual([
      'history-dependency-schema-change-currency-feed',
      'history-dependency-upstream-5xx-pricing',
      'history-network-partition-search-cluster',
      'history-queue-disk-watermark-batch-drain',
      'history-resource-merge-burst-search-cluster',
    ]);
    for (const one of declared) expect(one.report.fault).toBeNull();
  });

  it('reads the same length from both halves of each case: the parameter and the episode', () => {
    // Named rather than counted, because the two numbers are the point: the corpus says 4, 6, 17,
    // 18 and 120 minutes, and the windows draw exactly those. Keyed by case rather than read in
    // index order, so a case that moves in the index does not move the assertion.
    const minutes = Object.fromEntries(
      declared.map((one) => [one.caseId, (one.report.measured?.lengths[0] ?? 0) / 60_000]),
    );
    expect(minutes).toEqual({
      'history-dependency-schema-change-currency-feed': 120,
      'history-dependency-upstream-5xx-pricing': 18,
      'history-network-partition-search-cluster': 17,
      'history-queue-disk-watermark-batch-drain': 6,
      'history-resource-merge-burst-search-cluster': 4,
    });
  });
});
