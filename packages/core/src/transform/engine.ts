import type { FieldProvenance } from '../ir/types.js';
import {
  applyRule,
  type SourceRecord,
  type StrategyErrorCode,
  type TransformRule,
} from './strategies.js';

/**
 * Deterministic transform engine.
 *
 * Contract (enforced by tests, not by convention):
 *  1. A data problem NEVER throws and NEVER silently drops a record - it goes to quarantine.
 *  2. inputCount === outputCount + quarantineCount, always.
 *  3. Same input + same rule set => byte-identical output (idempotent).
 */

/** A record that could not be converted, together with the reason why. */
export interface QuarantineRecord {
  recordId: string;
  ruleId: string;
  code: StrategyErrorCode;
  raw: unknown;
  message: string;
}

export interface TransformResult {
  outputs: Array<{ recordId: string; record: SourceRecord; provenance: Record<string, FieldProvenance> }>;
  quarantined: QuarantineRecord[];
  counts: { input: number; output: number; quarantine: number };
  /**
   * How many records the requested `idField` could not identify, so a positional
   * `row-N` id was used instead.
   *
   * `recordId` is what a human uses to find the row that went wrong, and what a
   * downstream tool keys on. When `idField` names a column no record carries,
   * every id silently degrades to positional order: the caller's identifier
   * scheme is inert while the output still looks well-formed. This counter is how
   * that becomes visible. It is `0` when no `idField` was requested, because
   * positional ids are then the contract rather than a fallback.
   */
  idFieldMisses: number;
  /**
   * Id values carried by more than one record in this batch, in first-seen order.
   *
   * A duplicated id stops being an identifier: two quarantined rows under the
   * same id cannot be told apart from one row reported twice. Each value appears
   * once regardless of how many records carry it. Positional ids are never
   * listed, being unique by construction.
   */
  duplicateIds: string[];
}

export interface EngineOptions {
  /** Field used to identify a record in quarantine reports. */
  idField?: string;
  /** Model identifier recorded in provenance when rules were LLM-generated. */
  modelId?: string;
  /** Prompt version recorded in provenance when rules were LLM-generated. */
  promptVersion?: string;
}

/** Outcome of deriving one record's id, keeping the fallback visible to the caller. */
interface ResolvedId {
  id: string;
  /** True when the requested `idField` was asked for but produced no usable value. */
  missed: boolean;
}

function recordIdOf(record: SourceRecord, index: number, idField?: string): ResolvedId {
  if (idField) {
    const v = record[idField];
    // `''` is not an identifier, and neither is `null`/`undefined`; `0` IS one.
    if (v !== undefined && v !== null && v !== '') return { id: String(v), missed: false };
    return { id: `row-${index}`, missed: true };
  }
  return { id: `row-${index}`, missed: false };
}

function setPath(target: SourceRecord, path: string, value: unknown): void {
  if (!path.includes('.')) {
    target[path] = value;
    return;
  }
  const keys = path.split('.');
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i] as string;
    const next = cursor[key];
    if (next === null || typeof next !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1] as string] = value;
}

/**
 * Apply `rules` to every record in `input`.
 *
 * The first failing rule quarantines the record; later rules are not attempted.
 * This keeps the failure reason unambiguous instead of reporting a pile of
 * cascading errors caused by one bad field.
 */
export function transformBatch(
  input: SourceRecord[],
  rules: TransformRule[],
  options: EngineOptions = {},
): TransformResult {
  const outputs: TransformResult['outputs'] = [];
  const quarantined: QuarantineRecord[] = [];
  // Every id assigned in this batch, in assignment order, used to spot duplicates
  // across outputs and quarantine entries alike.
  const assignedIds: string[] = [];
  let idFieldMisses = 0;

  const assignId = (record: SourceRecord, index: number): string => {
    const resolved = recordIdOf(record, index, options.idField);
    if (resolved.missed) idFieldMisses += 1;
    assignedIds.push(resolved.id);
    return resolved.id;
  };

  input.forEach((source, index) => {
    const recordId = assignId(source, index);
    const working: SourceRecord = { ...source };
    const provenance: Record<string, FieldProvenance> = {};

    for (const rule of rules) {
      const result = applyRule(rule, working);
      if (!result.ok) {
        quarantined.push({
          recordId,
          ruleId: rule.id,
          code: result.code,
          raw: source,
          message: result.message,
        });
        return;
      }
      for (const [path, value] of Object.entries(result.fields)) {
        setPath(working, path, value);
        const base: FieldProvenance = { source: 'derived', ruleId: rule.id };
        if (options.modelId) base.modelId = options.modelId;
        if (options.promptVersion) base.promptVersion = options.promptVersion;
        provenance[path] = base;
      }
    }

    outputs.push({ recordId, record: working, provenance });
  });

  return {
    outputs,
    quarantined,
    counts: {
      input: input.length,
      output: outputs.length,
      quarantine: quarantined.length,
    },
    idFieldMisses,
    duplicateIds: findDuplicates(assignedIds),
  };
}

/**
 * Values occurring more than once, in first-seen order.
 *
 * Order is the order of first occurrence rather than sorted, so the report reads
 * in the order a human scanning the source file would encounter them.
 */
function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const duplicates: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      if (!reported.has(value)) {
        reported.add(value);
        duplicates.push(value);
      }
      continue;
    }
    seen.add(value);
  }
  return duplicates;
}

/**
 * Invariant check used by the G3 gate and by CI.
 * Returns the violation count; zero means no record was silently lost.
 */
export function checkNoSilentLoss(result: TransformResult): number {
  return result.counts.input - (result.counts.output + result.counts.quarantine);
}

/**
 * Trace-aware transform.
 *
 * Traces MUST be converted as a batch because `parentSpanId` relationships cannot
 * be reconstructed once spans are processed independently. This function first
 * indexes every span id, then validates that each non-root parent exists.
 */
export interface SpanRecord extends SourceRecord {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
}

export interface TraceTransformResult {
  spans: SpanRecord[];
  /** Span ids referenced as a parent but absent from the batch. */
  danglingParents: string[];
}

export function transformTraceBatch(
  spans: SpanRecord[],
  rules: TransformRule[],
  options: EngineOptions = {},
): TraceTransformResult {
  const result = transformBatch(spans as SourceRecord[], rules, options);
  const converted = result.outputs.map((o) => o.record as unknown as SpanRecord);

  const present = new Set(converted.map((s) => `${s.trace_id}:${s.span_id}`));
  const seen = new Set<string>();
  const danglingParents: string[] = [];
  for (const span of converted) {
    const parent = span.parent_span_id;
    if (!parent) continue;
    const key = `${span.trace_id}:${parent}`;
    if (!present.has(key) && !seen.has(key)) {
      seen.add(key);
      danglingParents.push(parent);
    }
  }
  return { spans: converted, danglingParents };
}
