import { normalizeFaultType } from '../fault/collector.js';
import type { Entity, EntityGraph, EntityKind, FaultCase, IrBundle, RootCauseIndicator } from '../ir/types.js';
import type { ExportedFiles } from './openrca.js';
import { assertExportableBundle } from './guard.js';

/**
 * AIOps2025 exporter (2025 CCF AIOps Challenge).
 *
 * The dataset's field contract is two metadata artefacts:
 *   - `input.json`       — one entry per case: uuid, description, time window.
 *   - `groundtruth.jsonl` — one line per case: fault label plus the per-modality
 *     key-evidence reasoning label (`key_observations` split into log/metric/trace).
 *
 * The bulk telemetry (18 daily Parquet archives, shared across cases) is day-based
 * and therefore not produced from a per-case IR; the exporter emits the reasoning
 * contract, which is the verifiable, agent-facing part of the benchmark.
 */

export const AIOPS2025_TARGET_ID = 'aiops2025';
export const AIOPS2025_CONTRACT_VERSION = 'ccf2025';

/** AIOps2025 fault-type (normalised) → broad fault category. */
const AIOPS2025_CATEGORY: Record<string, string> = {
  'network-delay': 'network',
  'network-loss': 'network',
  'network-corrupt': 'network',
  'cpu-stress': 'stress',
  'memory-stress': 'stress',
  'node-cpu': 'node',
  'node-disk': 'node',
  'node-network-loss': 'node',
  'node-network-delay': 'node',
  'pod-failure': 'pod',
  'pod-kill': 'pod',
  'jvm-exception': 'jvm',
  'jvm-gc': 'jvm',
  'jvm-latency': 'jvm',
  'jvm-cpu-stress': 'jvm',
  'dns-error': 'dns',
  'target-port-misconfig': 'misconfiguration',
  'erroneous-code': 'erroneous-change',
  'io-fault': 'io',
};

function findEntity(graph: EntityGraph, entityId: string): Entity | undefined {
  return graph.entities.find((e) => e.entityId === entityId);
}

/** Project an IR entity kind onto the AIOps2025 `instance_type` vocabulary. */
function instanceTypeOf(kind: EntityKind): 'service' | 'pod' | 'node' {
  switch (kind) {
    case 'pod':
    case 'container':
      return 'pod';
    case 'node':
    case 'host':
      return 'node';
    default:
      return 'service';
  }
}

function stringParam(fc: FaultCase, key: string): string | undefined {
  const value = fc.fault.parameters?.[key];
  return typeof value === 'string' ? value : undefined;
}

function modalityObservations(indicators: RootCauseIndicator[], type: RootCauseIndicator['type']): Array<{ ref: string; description: string }> {
  return indicators.filter((i) => i.type === type).map((i) => ({ ref: i.ref, description: i.description }));
}

/** Build one `groundtruth.jsonl` line object. */
export function buildAioPs2025GroundTruth(fc: FaultCase, graph: EntityGraph): Record<string, unknown> {
  const rootEntity = findEntity(graph, fc.groundTruth.rootCauseEntityId);
  const faultType = fc.fault.type;
  const faultCategory = AIOPS2025_CATEGORY[normalizeFaultType(faultType)] ?? fc.fault.category;
  const indicators = fc.groundTruth.rootCauseIndicators ?? [];
  const source = stringParam(fc, 'source');
  const destination = stringParam(fc, 'destination');

  return {
    uuid: fc.caseId,
    fault_category: faultCategory,
    fault_type: faultType,
    instance_type: rootEntity === undefined ? 'service' : instanceTypeOf(rootEntity.kind),
    service: fc.groundTruth.rootCauseComponent,
    instance: rootEntity?.name ?? fc.groundTruth.rootCauseComponent,
    ...(source !== undefined ? { source } : {}),
    ...(destination !== undefined ? { destination } : {}),
    start_time: fc.window.start,
    end_time: fc.window.end,
    key_observations: {
      log: modalityObservations(indicators, 'log'),
      metric: modalityObservations(indicators, 'metric'),
      trace: modalityObservations(indicators, 'trace'),
    },
    key_metrics: indicators.filter((i) => i.type === 'metric').map((i) => i.ref),
    fault_description: fc.groundTruth.rootCauseReason,
  };
}

/** Build one `input.json` entry object. */
export function buildAioPs2025Input(fc: FaultCase): Record<string, unknown> {
  return {
    uuid: fc.caseId,
    description: fc.query ?? fc.groundTruth.rootCauseReason,
    start_time: fc.window.start,
    end_time: fc.window.end,
  };
}

export interface AioPs2025ExportResult {
  files: ExportedFiles;
  skipped: Array<{ caseId: string; reason: string }>;
}

/**
 * Export a bundle to the AIOps2025 field contract (`input.json` + `groundtruth.jsonl`).
 *
 * Cases with no telemetry are skipped with a reason, never silently dropped.
 */
export function exportAioPs2025(bundle: IrBundle): AioPs2025ExportResult {
  assertExportableBundle(bundle);
  const input: Array<Record<string, unknown>> = [];
  const groundTruthLines: string[] = [];
  const skipped: Array<{ caseId: string; reason: string }> = [];

  for (const fc of bundle.cases) {
    if ((bundle.signals[fc.caseId] ?? []).length === 0) {
      skipped.push({ caseId: fc.caseId, reason: 'no telemetry signals attached' });
      continue;
    }
    input.push(buildAioPs2025Input(fc));
    groundTruthLines.push(JSON.stringify(buildAioPs2025GroundTruth(fc, bundle.graph)));
  }

  return {
    files: {
      'input.json': JSON.stringify(input, null, 2) + '\n',
      'groundtruth.jsonl': groundTruthLines.join('\n') + '\n',
    },
    skipped,
  };
}
