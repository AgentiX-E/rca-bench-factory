import { normalizeFaultType } from '../fault/collector.js';
import type { FaultCase, FaultCategory, IrBundle } from '../ir/types.js';
import type { ExportedFiles } from './openrca.js';

/**
 * Cloud-OpsBench exporter (outcome ground-truth contract).
 *
 * Cloud-OpsBench (arXiv 2603.00468) is an agentic, State-Snapshot benchmark. Its
 * per-case layout is:
 *
 *   benchmark/<system>/<fault_category>/<case_id>/
 *     metadata.json       # fault label + namespace + query + difficulty + ground truth
 *     tool_cache.json     # pre-rendered tool responses (the Digital Twin)
 *     code/               # trimmed source (Online Boutique only)
 *     raw_data/
 *       alert.json        # alert + anomaly evidence
 *       k8s_states.json   # Kubernetes object snapshots
 *       logs.json         # service/container logs
 *       metrics.csv       # time-series metrics (absent for early-lifecycle faults)
 *
 * The `result` object of `metadata.json` is the outcome ground truth
 * ⟨Stage, Component, Root Cause⟩ = ⟨fault_taxonomy, fault_object, root_cause⟩,
 * which drives the Component/ Fault-Type/ Joint-RCA accuracy scores.
 *
 * This exporter emits the verifiable, static part - `metadata.json` - and is
 * deliberately honest about the rest: `tool_cache.json`, `k8s_states.json` and
 * `code/` require a live Kubernetes snapshot, and `process-label/`/`golden-
 * trajectory/` require expert annotation, so they are not produced from a
 * per-case IR (same boundary as the AIOps2025 Parquet telemetry).
 */

export const CLOUD_OPSBENCH_TARGET_ID = 'cloud-opsbench';
export const CLOUD_OPSBENCH_CONTRACT_VERSION = 'v1';

/**
 * Map an IR fault *mechanism* category onto a Cloud-OpsBench *lifecycle-stage*
 * taxonomy. The two vocabularies are orthogonal, so this is a documented
 * best-effort mapping, not a one-to-one equivalence.
 */
const TAXONOMY_BY_CATEGORY: Record<FaultCategory, string> = {
  resource: 'Performance_Fault',
  network: 'Infrastructure_Fault',
  runtime: 'Runtime_Fault',
  middleware: 'Service_Fault',
  code: 'Code_Fault',
  config: 'Startup_Fault',
  dependency: 'Service_Fault',
  unknown: 'Runtime_Fault',
};

/** Map an IR difficulty level onto the Cloud-OpsBench easy/medium/hard vocabulary. */
function difficultyFor(level: FaultCase['difficulty']): string {
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

/** Normalise the fault type to Cloud-OpsBench's snake_case root-cause token. */
function rootCauseFor(faultType: string): string {
  return normalizeFaultType(faultType).replace(/-/g, '_');
}

/** Build the `metadata.json` object for one case. */
export function buildCloudOpsBenchMetadata(fc: FaultCase): Record<string, unknown> {
  return {
    namespace: fc.system,
    query: fc.query ?? fc.groundTruth.rootCauseReason,
    difficulty: difficultyFor(fc.difficulty),
    result: {
      fault_taxonomy: TAXONOMY_BY_CATEGORY[fc.fault.category],
      fault_object: fc.groundTruth.rootCauseComponent,
      root_cause: rootCauseFor(fc.fault.type),
    },
  };
}

export interface CloudOpsBenchExportResult {
  files: ExportedFiles;
  skipped: Array<{ caseId: string; reason: string }>;
}

/**
 * Export a bundle to the Cloud-OpsBench `metadata.json` contract.
 *
 * Cases with no root-cause component are skipped with a reason, never silently
 * dropped (the outcome ground truth would be unanswerable without a component).
 */
export function exportCloudOpsBench(bundle: IrBundle): CloudOpsBenchExportResult {
  const files: ExportedFiles = {};
  const skipped: Array<{ caseId: string; reason: string }> = [];

  for (const fc of bundle.cases) {
    if (fc.groundTruth.rootCauseComponent === '') {
      skipped.push({ caseId: fc.caseId, reason: 'missing root-cause component' });
      continue;
    }
    files[`cases/${fc.caseId}/metadata.json`] = JSON.stringify(buildCloudOpsBenchMetadata(fc), null, 2) + '\n';
  }

  return { files, skipped };
}
