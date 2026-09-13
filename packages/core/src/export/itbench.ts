import type { FaultCase, FaultCategory, GroundTruth, IrBundle } from '../ir/types.js';
import type { ExportedFiles } from './openrca.js';
import { assertExportableBundle } from './guard.js';

/**
 * ITBench exporter (SRE Diagnosis reasoning contract).
 *
 * ITBench (arXiv 2502.05352, IBM Research) evaluates AI agents on live IT
 * automation tasks. Each scenario is a tuple <M, E, T, D> and carries a
 * specification with `scenario_name`, `scenario_description`, `scenario_domain`
 * (SRE / CISO / FinOps), `scenario_class`, `scenario_complexity` and
 * `scenario_groundtruth`. For the SRE *Diagnosis* task the ground truth records:
 *
 *   - the entities involved in the fault-propagation chain,
 *   - the actual fault-propagation chain(s),
 *   - the fault conditions.
 *
 * Those three map one-to-one onto the IR `GroundTruth` (`rootCauseEntityId` +
 * `causalChain` + `evidenceCheckpoints`), so this exporter emits the verifiable,
 * agent-facing `scenario.json` reasoning contract.
 *
 * The ITBench-Lite *snapshot body* (alerts/, metrics/, k8s_events_raw.tsv,
 * k8s_objects_raw.tsv, otel_logs_raw.tsv, otel_traces_raw.tsv) is a frozen
 * Kubernetes snapshot and the full ITBench harness is a live, perturbable
 * cluster - neither is producible from a static per-case IR, so they are
 * deliberately out of scope (the same boundary as the AIOps2025 Parquet
 * telemetry and the Cloud-OpsBench State Snapshot).
 */

export const ITBENCH_TARGET_ID = 'itbench';
export const ITBENCH_CONTRACT_VERSION = 'v1';

/** The only persona this RCA-oriented converter targets. */
export const ITBENCH_SRE_DOMAIN = 'SRE';

/**
 * Map an IR fault *mechanism* category onto an ITBench SRE *scenario class*.
 *
 * ITBench scenario classes are concrete incident groupings (the paper names
 * `CacheFailure`, `HighCPU`, `CorruptImage`, `Kyverno-opa`, `Kyverno-update`).
 * The IR category vocabulary is a mechanism taxonomy, so this is a documented
 * best-effort projection, not a one-to-one equivalence; the precise fault type
 * is preserved verbatim inside `scenario_groundtruth`.
 */
const CLASS_BY_CATEGORY: Record<FaultCategory, string> = {
  resource: 'HighCPU',
  network: 'NetworkPartition',
  runtime: 'CrashLoopBackOff',
  middleware: 'ServiceDegradation',
  code: 'CorruptImage',
  config: 'Misconfiguration',
  dependency: 'DependencyFailure',
  unknown: 'Unknown',
};

/** Map an IR difficulty level onto an ITBench scenario complexity token. */
function complexityFor(level: FaultCase['difficulty']): string {
  switch (level) {
    case 'L1':
      return 'easy';
    case 'L2':
      return 'medium';
    case 'L3':
    case 'L4':
      return 'hard';
    default:
      return 'medium';
  }
}

/** Collect the unique entities in the fault-propagation chain, root cause first. */
function diagnosisEntities(gt: GroundTruth): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (id: string): void => {
    if (id !== '' && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  push(gt.rootCauseEntityId);
  for (const step of gt.causalChain ?? []) {
    push(step.fromEntityId);
    push(step.toEntityId);
  }
  return out;
}

/** Serialize the ordered causal chain into ITBench fault-propagation steps. */
function propagationChain(gt: GroundTruth): Array<Record<string, unknown>> {
  return (gt.causalChain ?? []).map((s) => ({
    step: s.step,
    from_entity: s.fromEntityId,
    to_entity: s.toEntityId,
    mechanism: s.mechanism,
  }));
}

/** Serialize the evidence checkpoints into ITBench fault conditions. */
function faultConditions(gt: GroundTruth): Array<Record<string, unknown>> {
  return (gt.evidenceCheckpoints ?? []).map((c) => ({
    checkpoint_id: c.checkpointId,
    entity: c.entityRef,
    ...(c.signalRef !== undefined ? { signal_ref: c.signalRef } : {}),
    comparator: c.comparator,
    value: c.value,
    ...(c.unit !== undefined ? { unit: c.unit } : {}),
    description: c.description,
  }));
}

/** Build the `scenario.json` object for one case. */
export function buildItBenchScenarioSpec(fc: FaultCase): Record<string, unknown> {
  const gt = fc.groundTruth;
  return {
    scenario_name: fc.caseId,
    scenario_description: fc.query ?? gt.rootCauseReason,
    scenario_domain: ITBENCH_SRE_DOMAIN,
    scenario_class: CLASS_BY_CATEGORY[fc.fault.category],
    scenario_complexity: complexityFor(fc.difficulty),
    scenario_groundtruth: {
      diagnosis: {
        entities: diagnosisEntities(gt),
        fault_propagation_chain: propagationChain(gt),
        fault_conditions: faultConditions(gt),
      },
    },
  };
}

export interface ItBenchExportResult {
  files: ExportedFiles;
  skipped: Array<{ caseId: string; reason: string }>;
}

/**
 * Export a bundle to the ITBench SRE scenario specification contract.
 *
 * Cases with no root-cause component are skipped with a reason, never silently
 * dropped (the diagnosis ground truth would be unanswerable without one).
 */
export function exportItBench(bundle: IrBundle): ItBenchExportResult {
  assertExportableBundle(bundle);
  const files: ExportedFiles = {};
  const skipped: Array<{ caseId: string; reason: string }> = [];

  for (const fc of bundle.cases) {
    if (fc.groundTruth.rootCauseComponent === '') {
      skipped.push({ caseId: fc.caseId, reason: 'missing root-cause component' });
      continue;
    }
    files[`scenarios/${fc.caseId}/scenario.json`] = JSON.stringify(buildItBenchScenarioSpec(fc), null, 2) + '\n';
  }

  return { files, skipped };
}
