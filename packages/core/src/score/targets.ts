import type { RcaEvalSuite } from '../export/rcaeval.js';
import type { ExportTarget } from '../cli/args.js';

/**
 * The ledger of score targets: what each one is called, and which exporter and
 * suite answers it.
 *
 * This module exists so the two things that need to know a target's suite can
 * both read it rather than one of them re-deriving it. They are:
 *
 *   - `score/dispatch.ts`, which runs the exporter, and
 *   - `score/score.ts`, whose structural checks are suite-specific - RE1 expects
 *     two files per case, RE2 and RE3 expect four.
 *
 * It sits below both, and it is deliberately the bottom of the dependency graph:
 * it imports types only. `dispatch.ts` imports `score.ts` for other things, so
 * had `scoreTargetInvocation` stayed beside `EXPORTERS`, `score.ts` reaching for
 * it would have closed a cycle.
 *
 * The names live here rather than in `score.ts` for the same reason - a shared
 * fact cannot be owned by one of its consumers without the other depending on it.
 */

/**
 * Every target the scorer can verify, in canonical order.
 *
 * One list for the CLI, the site generator and the example pack, so a new target
 * cannot be added to one surface and forgotten in another.
 */
export const SCORE_TARGET_IDS = [
  'openrca-1.0',
  'openrca-2.0',
  'rcaeval-re1',
  'rcaeval-re2',
  'rcaeval-re3',
  'rca100',
  'aiops2025',
  'cloud-opsbench',
  'itbench',
] as const;

export type ScoreTargetId = (typeof SCORE_TARGET_IDS)[number];

/** Which exporter and which suite a score target means. */
export function scoreTargetInvocation(target: ScoreTargetId): { id: ExportTarget; suite: RcaEvalSuite } {
  // `rcaeval-re1|re2|re3` is one exporter parameterised by a suite; every other
  // score target names its exporter directly. Only that one fact is written down,
  // so the nine score targets need no table of their own.
  if (target === 'rcaeval-re1') return { id: 'rcaeval', suite: 'RE1' };
  if (target === 'rcaeval-re2') return { id: 'rcaeval', suite: 'RE2' };
  if (target === 'rcaeval-re3') return { id: 'rcaeval', suite: 'RE3' };
  return { id: target, suite: 'RE2' };
}
