import { checkG2Semantic } from '../gates/gates.js';
import type { IrBundle } from '../ir/types.js';

/**
 * The export boundary's integrity check.
 *
 * `export` is the last place a bundle can be stopped before it becomes a
 * published dataset, and it was the one boundary that had no check of its own:
 * it trusted whatever JSON it was handed. A bundle carrying an edge to an
 * entity the file never declares exported cleanly and exited 0, and only `gate`
 * raised G2 -- which a user running `export` alone never sees.
 *
 * The damage is not merely a missing node. `rca100`'s `buildTopologyJson` types
 * an unknown endpoint through `UMODEL_TYPE[byId.get(id)?.kind ?? 'external']`,
 * so the invented endpoint is emitted as `dst_type: "apm.external"`. The
 * exported dataset then asserts a router that was never observed, and no
 * consumer of that dataset can tell it apart from a genuinely observed external
 * dependency. A silent fabrication is worse than a refusal.
 *
 * The rule is not restated here: `checkG2Semantic` owns the definition of an
 * inconsistent graph, so the exporter and the gate cannot drift about it.
 * `G2`'s own `DANGLING_EDGE_REF` message is already phrased as
 * `<field> references '<ref>' which is not an entity`, which is exactly what an
 * operator holding an edge list needs, so its wording is reused rather than
 * re-derived.
 *
 * Every exporter calls this, including the four that never read `graph`
 * (`openrca`, `rcaeval`, `cloudopsbench`, `itbench`). A bundle describes one
 * system; letting target selection decide whether a contradiction is caught
 * would mean the same file is valid for one benchmark and not another.
 */
export function assertExportableBundle(bundle: IrBundle): void {
  const g2 = checkG2Semantic(bundle);
  if (g2.status === 'passed') return;

  const structural = g2.violations.filter((v) => STRUCTURAL_CODES.has(v.code));
  if (structural.length === 0) return;

  const first = structural[0]!;
  const extra = structural.length > 1 ? ` (and ${structural.length - 1} more)` : '';
  throw new Error(
    `bundle is not exportable: ${first.code}: ${first.message}${extra}. ` +
      'Run `rca-bench gate` to see every violation.',
  );
}

/**
 * The G2 codes that mean the bundle contradicts *itself* rather than merely
 * describing one weak case.
 *
 * This set is deliberately two entries wide. The distinction it encodes is
 * whether the defect can be handled per case:
 *
 *  - `graph` is shared by every case in the bundle, so a contradictory graph
 *    cannot be worked around by skipping one case. No export of that file can
 *    be correct.
 *  - A case-level reference failure can. An exporter already skips a case whose
 *    root cause does not resolve and continues with the rest, which is the
 *    right behaviour for a 1000-case bundle that contains one mistyped label.
 *    Failing the whole export there would lose 999 good cases to report one bad
 *    one, and it would disagree with `gate`, which *quarantines* such a bundle
 *    rather than rejecting it.
 *  - A completeness problem (`UNKNOWN_UNIT`, a non-monotonic timestamp) is one
 *    a consumer may want to export precisely in order to inspect it.
 *
 * `CAUSAL_CHAIN_BREAK` and `CAUSAL_HOP_NOT_IN_TOPOLOGY` check a causal chain
 * against the graph but are reported per case, and the exporters skip such
 * cases, so they belong on the case-level side.
 *
 * Every code G2 can emit is classified as either structural (here) or
 * case-level, and `guard.test.ts` fails if a code is left unclassified. Adding
 * a code to `gates.ts` therefore forces a decision rather than silently
 * inheriting this list's default.
 */
export const STRUCTURAL_CODES: ReadonlySet<string> = new Set([
  // An edge names an endpoint the file never declares, so the graph is not a
  // consistent description of one system.
  'DANGLING_EDGE_REF',
  // A relation outside the closed set means the graph says something the
  // contract cannot express.
  'INVALID_RELATION',
]);

/**
 * The G2 codes that are reported per case, so an exporter can skip the case
 * they belong to and still publish the rest.
 *
 * Listed explicitly, and asserted against G2's actual output, so the two sets
 * together are a total classification of everything G2 can report. A subset
 * alone would let a new code default to "not structural" without anyone
 * noticing that the decision was never made.
 */
export const CASE_LEVEL_CODES: ReadonlySet<string> = new Set([
  'UNRESOLVED_ROOT_CAUSE',
  'UNRESOLVED_CHECKPOINT_REF',
  'UNRESOLVED_EVIDENCE_REF',
  'UNRESOLVED_SERVICE_NAME',
  'UNRESOLVED_CAUSAL_FROM',
  'UNRESOLVED_CAUSAL_TO',
  'CAUSAL_HOP_NOT_IN_TOPOLOGY',
  'CAUSAL_CHAIN_BREAK',
  // Quality conditions: exportable so a consumer can inspect them.
  'BAD_SIGNAL_TIMESTAMP',
  'NON_MONOTONIC_TIMESTAMP',
  'INJECT_TIME_OUT_OF_WINDOW',
  'INVERTED_WINDOW',
  'UNKNOWN_UNIT',
  'NUMERIC_CHECKPOINT_WITHOUT_UNIT',
]);
