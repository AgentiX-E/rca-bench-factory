import { parseFaultSpec, type InjectionMethod } from '../fault/collector.js';
import { irBundleSchema } from './schema.js';
import { IR_VERSION, type EntityGraph, type FaultCase, type FaultCategory, type GroundTruth, type IrBundle, type TelemetrySignal } from './types.js';

/**
 * Bundle assembler.
 *
 * The `case` command's core: turn a loose authoring draft into a validated
 * `IrBundle`. The fault type is a free string that is normalised (and its
 * category inferred when absent) by `parseFaultSpec`; the assembled bundle is
 * then checked against `irBundleSchema` so a malformed draft surfaces as an
 * explicit error instead of a silently broken benchmark case.
 */

export interface CaseDraft {
  caseId: string;
  system: string;
  environment?: FaultCase['environment'];
  /** Canonical UTC ISO-8601 injection / onset time. */
  injectTime: string;
  window: FaultCase['window'];
  fault: {
    type: string;
    category?: FaultCategory;
    injectionMethod?: InjectionMethod;
    parameters?: Record<string, unknown>;
  };
  groundTruth: GroundTruth;
  query?: string;
  difficulty?: FaultCase['difficulty'];
  answerKeyIsolated?: boolean;
}

export interface BundleDraft {
  irVersion?: string;
  graph: EntityGraph;
  case: CaseDraft;
  signals: TelemetrySignal[];
}

export type BundleAssemblyResult = { ok: true; bundle: IrBundle } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Assemble a bundle from an untrusted draft.
 *
 * The draft comes from JSON, so its shape is validated before any nested access;
 * the fault is then normalised and the finished bundle is schema-checked. Every
 * failure returns a reason - the function never throws for a data problem.
 */
export function assembleBundle(draft: unknown): BundleAssemblyResult {
  if (
    !isRecord(draft) ||
    !isRecord(draft.case) ||
    !isRecord(draft.case.fault) ||
    !isRecord(draft.graph) ||
    !Array.isArray(draft.signals)
  ) {
    return { ok: false, error: 'draft must contain case, case.fault, graph and signals' };
  }

  const d = draft as unknown as BundleDraft;
  const faultResult = parseFaultSpec(d.case.fault, d.case.fault.injectionMethod ?? 'manual');
  if (!faultResult.ok) return { ok: false, error: faultResult.error };

  const fc: FaultCase = {
    caseId: d.case.caseId,
    system: d.case.system,
    environment: d.case.environment ?? { system: d.case.system },
    injectTime: d.case.injectTime,
    window: d.case.window,
    fault: faultResult.spec,
    groundTruth: d.case.groundTruth,
    ...(d.case.query !== undefined ? { query: d.case.query } : {}),
    ...(d.case.difficulty !== undefined ? { difficulty: d.case.difficulty } : {}),
    ...(d.case.answerKeyIsolated !== undefined ? { answerKeyIsolated: d.case.answerKeyIsolated } : {}),
  };

  const bundle: IrBundle = {
    irVersion: d.irVersion ?? IR_VERSION,
    graph: d.graph,
    cases: [fc],
    signals: { [fc.caseId]: d.signals },
  };

  const parsed = irBundleSchema.safeParse(bundle);
  if (!parsed.success) {
    // A failed zod parse always carries at least one issue.
    return { ok: false, error: parsed.error.issues[0]!.message };
  }
  return { ok: true, bundle };
}
