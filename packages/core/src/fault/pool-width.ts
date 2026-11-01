/**
 * What narrowing the candidate pool to services would buy, and what it would cost.
 *
 * ## Why this is a module and not a paragraph
 *
 * v3.31 measured the pool the export hands the official loader -- 52 names, 35 of them a service,
 * 15 an entity of another kind, 2 that name nothing -- and decided to report rather than trim. The
 * reason was a sentence: both localisers rank every metric-bearing entity, so an export narrowed to
 * services would be narrower than the readings taken from it. A reason without a number is a
 * decision nobody can review, and this repository has watched two of those go stale in prose.
 *
 * So the decision is asked of the corpus on every run instead: rank both ways, count, print. What
 * the numbers say is not what the sentence predicted -- trimming *raises* rank 1 -- and that is the
 * point of measuring: the recommendation changes, the reason does not.
 *
 * ## Why narrowing cannot reorder the survivors
 *
 * A ranking here is one statistic per candidate, sorted descending with a name tiebreak, so
 * removing entries leaves the rest in the same order and can only move an answer *up*, or out of
 * the list entirely when the answer itself is not a service. `assessPoolNarrowing` therefore never
 * reports a run that got worse in place; `describePoolNarrowing` says outright that the runs it
 * gains are promotions inside a top-K that already held the answer, because a number that reads as
 * an improvement is exactly the number that gets quoted without its cost.
 */

/** One entry of a ranking: the name it puts forward, and the kind of entity that name is. */
export interface PoolCandidate {
  readonly name: string;
  /** A kind from `ENTITY_KINDS`, or `absent` for a name no entity in the graph carries. */
  readonly kind: string;
}

/** One baseline's ranking for one case. */
export interface PoolRun {
  readonly method: string;
  readonly candidates: readonly PoolCandidate[];
}

/** One case, with its answer and every baseline that ranked it. */
export interface PoolCase {
  readonly caseId: string;
  readonly answer: string;
  /** The kind of the answer entity. A corpus whose answer is not a service cannot survive the trim. */
  readonly answerKind: string;
  readonly runs: readonly PoolRun[];
}

/** One run's rank of the answer, before and after. `null` means the answer is not in the ranking. */
export interface RunComparison {
  readonly caseId: string;
  readonly method: string;
  readonly before: number | null;
  readonly after: number | null;
}

/** A case a services-only pool cannot score at all, and the reason it cannot. */
export interface UnscorableCase {
  readonly caseId: string;
  readonly answer: string;
  readonly kind: string;
}

/** Both tallies, over every run of every case. */
export interface PoolTally {
  readonly rank1: number;
  readonly top3: number;
  readonly absent: number;
}

export interface PoolNarrowing {
  readonly cases: number;
  readonly scorableCases: number;
  readonly unscorable: readonly UnscorableCase[];
  readonly runs: readonly RunComparison[];
  /** Runs the trim moves up, i.e. where a non-service was louder than the answer. */
  readonly gained: readonly RunComparison[];
  /** Runs whose answer leaves the pool, because the answer is not a service. */
  readonly lost: readonly RunComparison[];
  readonly before: PoolTally;
  readonly after: PoolTally;
}

const SERVICE = 'service';

/**
 * The ranking a services-only pool would produce: the same order, with everything else removed.
 *
 * `absent` is not a service, and neither is a kind this module does not recognise: the loader's
 * `-db` rewrites produce exactly such names, and admitting one as a service would put a candidate
 * back into the pool that the trim exists to remove.
 */
export function narrowToServices(candidates: readonly PoolCandidate[]): PoolCandidate[] {
  return candidates.filter((one) => one.kind === SERVICE);
}

/** Where the answer sits in a ranking, one-based, or `null` when it is not there at all. */
function rankIn(candidates: readonly PoolCandidate[], answer: string): number | null {
  const at = candidates.findIndex((one) => one.name === answer);
  return at === -1 ? null : at + 1;
}

function tally(runs: readonly RunComparison[], key: 'before' | 'after'): PoolTally {
  let rank1 = 0;
  let top3 = 0;
  let absent = 0;
  for (const one of runs) {
    const rank = one[key];
    if (rank === null) absent += 1;
    else {
      if (rank === 1) rank1 += 1;
      if (rank <= 3) top3 += 1;
    }
  }
  return { rank1, top3, absent };
}

/**
 * Rank every run both ways and count what moved.
 *
 * The tallies cover **every** run, including those of a case whose answer is not a service: the
 * reading being replaced is a share of all runs, so the replacement has to be a share of the same
 * denominator or the two numbers answer different questions. `scorableCases` is what carries the
 * cost, and it is the count of cases, not of runs, because a case lost is lost under both baselines.
 */
export function assessPoolNarrowing(cases: readonly PoolCase[]): PoolNarrowing {
  if (cases.length === 0) throw new Error('assessPoolNarrowing: no case to narrow');

  const runs: RunComparison[] = [];
  const unscorable: UnscorableCase[] = [];
  for (const one of cases) {
    if (one.answerKind !== SERVICE) unscorable.push({ caseId: one.caseId, answer: one.answer, kind: one.answerKind });
    for (const run of one.runs) {
      runs.push({
        caseId: one.caseId,
        method: run.method,
        before: rankIn(run.candidates, one.answer),
        after: rankIn(narrowToServices(run.candidates), one.answer),
      });
    }
  }

  const gained = runs.filter((one) => one.before !== null && one.after !== null && one.after < one.before);
  const lost = runs.filter((one) => one.before !== null && one.after === null);

  return {
    cases: cases.length,
    scorableCases: cases.length - unscorable.length,
    unscorable,
    runs,
    gained,
    lost,
    before: tally(runs, 'before'),
    after: tally(runs, 'after'),
  };
}

/**
 * How a kind reads inside the sentence, because "an external" is not English and "a external" is
 * worse. The fallback is not decoration: a corpus can grow a kind before this map does, and the
 * sentence still has to name the reason the case leaves rather than print `undefined`.
 */
const KIND_PHRASE: Record<string, string> = {
  service: 'a service',
  pod: 'a pod',
  container: 'a container',
  node: 'a node',
  db: 'a db',
  mq: 'a message queue',
  external: 'an external dependency',
  absent: 'a name no entity carries',
};

function kindPhrase(kind: string): string {
  return KIND_PHRASE[kind] ?? `a ${kind}`;
}

/**
 * The sentence the guard prints, which has to carry the cost in the same breath as the gain.
 *
 * Three things could hide behind "narrowing improves rank 1": that the improvements are promotions
 * inside a window that was already right, that each costs cases, and that the cases it costs are
 * the ones whose answer is not a service -- which is a fact about the corpus rather than the trim.
 */
export function describePoolNarrowing(reading: PoolNarrowing): string {
  const runs = reading.runs.length;
  const cost =
    reading.unscorable.length === 0
      ? 'every case keeps its answer'
      : reading.unscorable
          .map((one) => `'${one.caseId}' would stop being scorable (${one.answer} is ${kindPhrase(one.kind)})`)
          .join(', ');
  const movement =
    reading.gained.length === 0 && reading.lost.length === 0
      ? 'no case moves'
      : `${String(reading.gained.length)} run(s) it moves up are promotions inside a top-3 that already ` +
        `held the answer, and ${String(reading.lost.length)} run(s) lose it outright`;
  return (
    `narrowing the pool to services: rank 1 ${String(reading.before.rank1)} of ${String(runs)} -> ` +
    `${String(reading.after.rank1)} of ${String(runs)}, top-3 ${String(reading.before.top3)} -> ` +
    `${String(reading.after.top3)}, absent ${String(reading.before.absent)} -> ${String(reading.after.absent)}; ` +
    `${cost}; ${movement}`
  );
}
