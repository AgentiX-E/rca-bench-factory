import { exportAioPs2025 } from '../export/aiops2025.js';
import { exportCloudOpsBench } from '../export/cloudopsbench.js';
import { exportItBench } from '../export/itbench.js';
import { exportOpenRca } from '../export/openrca.js';
import { exportOpenRca2 } from '../export/openrca2.js';
import { exportRca100 } from '../export/rca100.js';
import { exportRcaEval } from '../export/rcaeval.js';
import type { ExportOutcome } from '../export/openrca.js';
import type { RcaEvalSuite } from '../export/rcaeval.js';
import type { IrBundle } from '../ir/types.js';
import type { ExportTarget } from '../cli/args.js';
import type { ScoreTargetId } from './score.js';

/**
 * The one place a score target is mapped onto an exporter.
 *
 * `export`, `report`, `official` and the official-metric regression script all
 * ask the same question - "what does this target do with this bundle?" - and
 * three of them used to carry their own hand-written answer. Two chains over one
 * mapping is a list that must drift from the thing it describes, and it did: the
 * CLI's score chain took only `.files` and threw `skipped` away, so `report`
 * scored a shrunken export and printed "score 100" with no denominator.
 *
 * The third copy lived in `scripts/check-official.mjs`, which is outside this
 * package and therefore outside coverage's reach. Its drift was *silent*: the
 * script pinned `rcaeval-re3`'s skip by hand, and RE1 and RE2 are separated by a
 * structural check the scorer performs, so a wrong suite there tripped something
 * else first. Only RE2 against RE3 - same file names, different admitted cases -
 * had nothing left to notice. It now reads this table instead of restating it.
 */

/**
 * What every exporter returns, re-exported so callers of this module need only
 * one import.
 *
 * `/ir/types.js` owns the IR; `openrca.js` owns the exporter result shape,
 * because the OpenRCA exporter is the one the other six were modelled on. The
 * CLI used to declare its own copy of this interface, down to the doc comment,
 * differing only in a `readonly` on `skipped` that the exporters never asked
 * for - two types for one fact is a divergence waiting for an assignment that
 * compiles one way and not the other.
 */
export type { ExportOutcome };

/**
 * Every exporter, keyed by the target id the `export` command spells.
 *
 * `rcaeval` is the one exporter a suite parameterises, so the table takes the
 * suite uniformly and the exporters that have no use for it ignore it.
 */
export const EXPORTERS: Record<ExportTarget, (bundle: IrBundle, suite: RcaEvalSuite) => ExportOutcome> = {
  'openrca-1.0': (bundle) => exportOpenRca(bundle),
  'openrca-2.0': (bundle) => exportOpenRca2(bundle),
  rcaeval: (bundle, suite) => exportRcaEval(bundle, suite),
  rca100: (bundle) => exportRca100(bundle),
  aiops2025: (bundle) => exportAioPs2025(bundle),
  'cloud-opsbench': (bundle) => exportCloudOpsBench(bundle),
  itbench: (bundle) => exportItBench(bundle),
};

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

/** Export a bundle for a score target, keeping the whole result. */
export function exportForScoreTarget(bundle: IrBundle, target: ScoreTargetId): ExportOutcome {
  const { id, suite } = scoreTargetInvocation(target);
  return EXPORTERS[id](bundle, suite);
}
