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
}

export interface EngineOptions {
  /** Field used to identify a record in quarantine reports. */
  idField?: string;
  /** Model identifier recorded in provenance when rules were LLM-generated. */
  modelId?: string;
  /** Prompt version recorded in provenance when rules were LLM-generated. */
  promptVersion?: string;
}

function recordIdOf(record: SourceRecord, index: number, idField?: string): string {
  if (idField) {
    const v = record[idField];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return `row-${index}`;
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

  input.forEach((source, index) => {
    const recordId = recordIdOf(source, index, options.idField);
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
  };
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
