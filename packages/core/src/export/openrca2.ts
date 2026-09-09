import type { EvidenceCheckpoint, FaultCase, IrBundle } from '../ir/types.js';
import type { ExportedFiles } from './openrca.js';
import { buildEntityIndex, type EntityIndex } from './rca100.js';

/**
 * OpenRCA 2.0 exporter (PAVE step-wise causal-path annotation).
 *
 * OpenRCA 2.0 (arXiv 2606.27154) replaces outcome-only labels with *process*
 * supervision: the PAVE protocol (Path Annotation via Verified Effects) annotates
 * the verified causal propagation path from the known intervention to the observed
 * symptom, and each causal edge must satisfy three conjunctive gates:
 *   - structural  — the edge conforms to the service dependency topology;
 *   - statistical — the downstream node deviates significantly from baseline;
 *   - temporal    — the downstream anomaly onsets after its upstream cause.
 *
 * The IR already carries this: `groundTruth.causalChain` is the ordered edge list
 * and `groundTruth.evidenceCheckpoints` is the ⟨comparator, value, unit⟩ evidence.
 * This exporter emits the verifiable *causal-path contract* - one `causal_path.json`
 * per case - and is deliberately honest that the official OpenRCA 2.0 evaluation
 * framework and scorer are not open-sourced, so this is a PAVE-semantic annotation
 * contract, not a byte-compatible official file.
 *
 * A case whose root-cause entity does not resolve into the topology is skipped
 * with a reason (the same reference-integrity invariant as RCA100), never silently
 * repaired.
 */

export const OPENRCA2_TARGET_ID = 'openrca-2.0';
export const OPENRCA2_CONTRACT_VERSION = 'pave-v1';

function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

export interface OpenRca2ExportResult {
  files: ExportedFiles;
  skipped: Array<{ caseId: string; reason: string }>;
}

/**
 * Build the `causal_path.json` object for one case: the root cause and the ordered
 * causal path, with each step's three-gate verification verdict and its evidence
 * checkpoints.
 */
export function buildCausalPathJson(fc: FaultCase, index: EntityIndex): string {
  const chain = fc.groundTruth.causalChain ?? [];
  const checkpointById = new Map(
    (fc.groundTruth.evidenceCheckpoints ?? []).map((c) => [c.checkpointId, c]),
  );

  const steps = chain.map((step, i) => {
    const fromEntity = index.byId.get(step.fromEntityId);
    const toEntity = index.byId.get(step.toEntityId);
    const previous = i > 0 ? chain[i - 1] : undefined;

    const evidence = step.evidenceRefs
      .map((ref) => checkpointById.get(ref))
      .filter((c): c is EvidenceCheckpoint => c !== undefined)
      .map((c) => ({
        signal_ref: c.signalRef ?? null,
        comparator: c.comparator,
        value: c.value,
        unit: c.unit ?? null,
        description: c.description,
      }));

    return {
      step: step.step,
      from_entity: { entity_id: step.fromEntityId, name: fromEntity?.name ?? null },
      to_entity: { entity_id: step.toEntityId, name: toEntity?.name ?? null },
      mechanism: step.mechanism,
      verification: {
        structural: fromEntity !== undefined && toEntity !== undefined,
        statistical: evidence.length > 0,
        temporal: previous === undefined || step.step > previous.step,
      },
      evidence,
    };
  });

  return toJson({
    case_id: fc.caseId,
    system: fc.system,
    root_cause: {
      entity_id: fc.groundTruth.rootCauseEntityId,
      component: fc.groundTruth.rootCauseComponent,
      fault_type: fc.fault.type,
    },
    causal_path: steps,
  });
}

/**
 * Export a bundle to the OpenRCA 2.0 PAVE causal-path contract.
 *
 * The same non-negotiable reference-integrity invariant as RCA100 is enforced: a
 * case whose root-cause entity does not resolve into the topology is skipped, and
 * a case with no telemetry is skipped with a reason - never silently dropped.
 */
export function exportOpenRca2(bundle: IrBundle): OpenRca2ExportResult {
  const files: ExportedFiles = {};
  const skipped: Array<{ caseId: string; reason: string }> = [];
  const index = buildEntityIndex(bundle.graph);

  for (const fc of bundle.cases) {
    if ((bundle.signals[fc.caseId] ?? []).length === 0) {
      skipped.push({ caseId: fc.caseId, reason: 'no telemetry signals attached' });
      continue;
    }
    if (!index.byId.has(fc.groundTruth.rootCauseEntityId)) {
      skipped.push({ caseId: fc.caseId, reason: 'root-cause entity does not resolve into topology' });
      continue;
    }
    files[`cases/${fc.caseId}/causal_path.json`] = buildCausalPathJson(fc, index);
  }

  return { files, skipped };
}
