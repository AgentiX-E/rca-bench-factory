import { IR_VERSION } from '../ir/types.js';
import type {
  LogPayload,
  MetricPayload,
  SignalPayload,
  TelemetrySignal,
  TracePayload,
} from '../ir/types.js';
import { telemetrySignalSchema } from '../ir/schema.js';
import { parseTimestamp, TimeParseError, type ParsedTime, type TimeLayout } from '../util/time.js';

/**
 * File ingest: turn flat files (CSV / TSV / JSONL / JSON arrays) into IR signals.
 *
 * Two invariants are enforced, not by convention:
 *   1. Zero silent loss - every non-blank source record is either a validated
 *      `TelemetrySignal` or a quarantine entry with a reason; nothing is dropped.
 *   2. Data problems become quarantine entries, never thrown exceptions. Only a
 *      programmer error (e.g. an unknown format) throws.
 *
 * Timestamps are parsed through `util/time.ts`, so an offset is never guessed:
 * an offset-less value without `assumeOffsetMinutes` is quarantined.
 */

export type FileFormat = 'csv' | 'tsv' | 'jsonl' | 'json';
export type FileSignalKind = 'metric' | 'log' | 'trace';

/** Column mapping from source column names to IR fields. */
export interface FileLayout {
  timestamp?: string;
  service?: string;
  // metric
  metricName?: string;
  metricValue?: string;
  metricUnit?: string;
  semanticType?: MetricPayload['semanticType'];
  // log
  logBody?: string;
  severity?: string;
  // trace
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  spanName?: string;
  durationMs?: string;
  status?: string;
}

export interface FileIngestOptions {
  format: FileFormat;
  signalKind: FileSignalKind;
  layout: FileLayout;
  /** Defaults to `iso8601`. */
  timeLayout?: TimeLayout;
  /** Required when the source timestamp carries no UTC offset. */
  assumeOffsetMinutes?: number;
  /** Defaults to `,` for csv and `\t` for tsv. */
  delimiter?: string;
  /** Whether the first delimited row is a header. Defaults to `true`. */
  hasHeader?: boolean;
  /** Fallback `service.name` when no service column maps. */
  serviceName?: string;
}

export interface FileParseError {
  /** 1-based source line (or array index for JSON arrays). */
  line: number;
  reason: string;
}

export interface FileQuarantineRecord {
  line: number;
  reason: string;
  record: string;
}

export interface FileIngestResult {
  signals: TelemetrySignal[];
  quarantine: FileQuarantineRecord[];
}

export interface DelimitedParseResult {
  rows: string[][];
  errors: FileParseError[];
}

export interface JsonlParseResult {
  records: Record<string, unknown>[];
  errors: FileParseError[];
}

/** Internal record carrying its 1-based source line. */
interface ParsedRecord {
  line: number;
  data: Record<string, unknown>;
}

const SEVERITY_LEVELS: readonly string[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const SPAN_STATUSES: readonly string[] = ['OK', 'ERROR', 'UNSET'];

/**
 * Parse CSV/TSV text into rows of cells, honouring quoted fields, escaped quotes
 * (`""`) and multi-line quoted fields. Blank lines are skipped without being
 * counted. An unterminated quote is reported as an error, not thrown.
 */
export function parseDelimited(text: string, delimiter: string): DelimitedParseResult {
  const rows: string[][] = [];
  const errors: FileParseError[] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  let i = 0;
  const n = text.length;

  const isBlankRow = (r: string[]): boolean => r.every((c) => c.trim() === '');

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        cell += '\n';
        line += 1;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (!isBlankRow(row)) rows.push(row);
      row = [];
      line += 1;
      rowStartLine = line;
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }

  if (inQuotes) {
    errors.push({ line: rowStartLine, reason: 'unterminated quoted field' });
  } else if (cell !== '' || row.length > 0) {
    row.push(cell);
    if (!isBlankRow(row)) rows.push(row);
  }

  return { rows, errors };
}

function parseJsonlLines(text: string): { records: ParsedRecord[]; errors: FileParseError[] } {
  const records: ParsedRecord[] = [];
  const errors: FileParseError[] = [];
  let line = 0;
  for (const rawLine of text.split('\n')) {
    line += 1;
    const raw = rawLine.trim();
    if (raw === '') continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      errors.push({ line, reason: 'malformed JSON line' });
      continue;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push({ line, reason: 'JSONL line is not an object' });
      continue;
    }
    records.push({ line, data: value as Record<string, unknown> });
  }
  return { records, errors };
}

function parseJsonArrayLines(text: string): { records: ParsedRecord[]; errors: FileParseError[] } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { records: [], errors: [{ line: 1, reason: 'malformed JSON document' }] };
  }
  if (!Array.isArray(value)) {
    return { records: [], errors: [{ line: 1, reason: 'top-level JSON value is not an array' }] };
  }
  const records: ParsedRecord[] = [];
  const errors: FileParseError[] = [];
  value.forEach((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      errors.push({ line: index + 1, reason: 'array element is not an object' });
      return;
    }
    records.push({ line: index + 1, data: item as Record<string, unknown> });
  });
  return { records, errors };
}

/** Parse one JSON object per non-blank line. */
export function parseJsonl(text: string): JsonlParseResult {
  const { records, errors } = parseJsonlLines(text);
  return { records: records.map((r) => r.data), errors };
}

/** Parse a top-level JSON array of objects. */
export function parseJsonArray(text: string): JsonlParseResult {
  const { records, errors } = parseJsonArrayLines(text);
  return { records: records.map((r) => r.data), errors };
}

function normalizeColumn(name: string): string {
  return name.toLowerCase().replace(/[_\-.@\s]/g, '');
}

const COLUMN_ALIASES = {
  timestamp: ['time', 'timestamp', 'ts', 'datetime', 'time_stamp', '@timestamp', 'date'],
  service: ['service', 'service.name', 'service_name', 'svc', 'cmdb_id', 'app', 'application', 'pod', 'host'],
  metricName: ['metric', 'metric_name', 'kpi_name', 'name', 'metricname', 'indicator'],
  metricValue: ['value', 'val', 'metric_value'],
  logBody: ['message', 'msg', 'body', 'log', 'content', 'line', 'text'],
  severity: ['severity', 'level', 'sev', 'log_level', 'loglevel'],
  traceId: ['trace_id', 'traceid', 'trace'],
  spanId: ['span_id', 'spanid', 'span'],
  parentSpanId: ['parent_span_id', 'parentspanid', 'parent_span', 'parentspan'],
  spanName: ['span_name', 'spanname', 'operation', 'operation_name'],
  durationMs: ['duration_ms', 'durationms', 'duration', 'latency_ms', 'latency'],
  status: ['status', 'status_code', 'statuscode'],
} as const;

/**
 * Deterministically infer a column layout from header names. No LLM involved.
 * Returns only the fields whose columns are present; absent fields are omitted.
 */
export function detectFileLayout(headers: string[], signalKind: FileSignalKind): FileLayout {
  const normalized = headers.map((raw) => ({ raw, norm: normalizeColumn(raw) }));
  const find = (aliases: readonly string[]): string | undefined => {
    const set = new Set(aliases.map(normalizeColumn));
    for (const h of normalized) {
      if (set.has(h.norm)) return h.raw;
    }
    return undefined;
  };

  const layout: FileLayout = {};
  const timestamp = find(COLUMN_ALIASES.timestamp);
  if (timestamp !== undefined) layout.timestamp = timestamp;
  const service = find(COLUMN_ALIASES.service);
  if (service !== undefined) layout.service = service;

  if (signalKind === 'metric') {
    const metricName = find(COLUMN_ALIASES.metricName);
    if (metricName !== undefined) layout.metricName = metricName;
    const metricValue = find(COLUMN_ALIASES.metricValue);
    if (metricValue !== undefined) layout.metricValue = metricValue;
  } else if (signalKind === 'log') {
    const logBody = find(COLUMN_ALIASES.logBody);
    if (logBody !== undefined) layout.logBody = logBody;
    const severity = find(COLUMN_ALIASES.severity);
    if (severity !== undefined) layout.severity = severity;
  } else {
    const traceId = find(COLUMN_ALIASES.traceId);
    if (traceId !== undefined) layout.traceId = traceId;
    const spanId = find(COLUMN_ALIASES.spanId);
    if (spanId !== undefined) layout.spanId = spanId;
    const parentSpanId = find(COLUMN_ALIASES.parentSpanId);
    if (parentSpanId !== undefined) layout.parentSpanId = parentSpanId;
    const spanName = find(COLUMN_ALIASES.spanName);
    if (spanName !== undefined) layout.spanName = spanName;
    const durationMs = find(COLUMN_ALIASES.durationMs);
    if (durationMs !== undefined) layout.durationMs = durationMs;
    const status = find(COLUMN_ALIASES.status);
    if (status !== undefined) layout.status = status;
  }

  return layout;
}

function zip(headers: string[], row: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  headers.forEach((h, i) => {
    out[h] = row[i];
  });
  return out;
}

function parseByFormat(
  text: string,
  options: FileIngestOptions,
): { records: ParsedRecord[]; errors: FileParseError[] } {
  switch (options.format) {
    case 'csv':
    case 'tsv': {
      const delimiter =
        options.format === 'csv' ? (options.delimiter ?? ',') : (options.delimiter ?? '\t');
      const { rows, errors } = parseDelimited(text, delimiter);
      const hasHeader = options.hasHeader ?? true;
      if (hasHeader) {
        const first = rows[0];
        if (first === undefined) return { records: [], errors };
        const records = rows.slice(1).map((row, i) => ({ line: i + 2, data: zip(first, row) }));
        return { records, errors };
      }
      const first = rows[0];
      const colCount = first === undefined ? 0 : first.length;
      const headers = Array.from({ length: colCount }, (_, i) => `col_${i}`);
      const records = rows.map((row, i) => ({ line: i + 1, data: zip(headers, row) }));
      return { records, errors };
    }
    case 'jsonl':
      return parseJsonlLines(text);
    case 'json':
      return parseJsonArrayLines(text);
    default: {
      const never: never = options.format;
      throw new Error(`unsupported format ${String(never)}`);
    }
  }
}

function summarize(record: Record<string, unknown>): string {
  const s = JSON.stringify(record);
  return s.length > 200 ? `${s.slice(0, 200)}...` : s;
}

type BuildResult = { ok: true; signal: TelemetrySignal } | { ok: false; reason: string };

function asText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : s;
}

function buildSignal(record: Record<string, unknown>, options: FileIngestOptions): BuildResult {
  const { layout, signalKind } = options;
  const get = (col: string | undefined): unknown => (col === undefined ? undefined : record[col]);

  const rawTs = asText(get(layout.timestamp));
  if (rawTs === undefined) {
    return { ok: false, reason: `missing required column '${layout.timestamp ?? '(none)'}' (timestamp)` };
  }
  let parsed: ParsedTime;
  try {
    parsed = parseTimestamp(rawTs, options.timeLayout ?? 'iso8601', options.assumeOffsetMinutes);
  } catch (e) {
    // `parseTimestamp` throws `TimeParseError` exclusively (see its contract),
    // so the cast below is safe and avoids an unreachable `instanceof` branch.
    return { ok: false, reason: `timestamp parse failed: ${(e as TimeParseError).message}` };
  }

  const rawService = asText(get(layout.service));
  const serviceName = rawService ?? options.serviceName;
  if (serviceName === undefined || serviceName === '') {
    return {
      ok: false,
      reason: `missing service name (column '${layout.service ?? '(none)'}' or options.serviceName)`,
    };
  }

  let payload: SignalPayload;
  if (signalKind === 'metric') {
    const name = asText(get(layout.metricName));
    if (name === undefined) {
      return { ok: false, reason: `missing required column '${layout.metricName ?? '(none)'}' (metric name)` };
    }
    const rawValue = asText(get(layout.metricValue));
    if (rawValue === undefined) {
      return { ok: false, reason: `missing required column '${layout.metricValue ?? '(none)'}' (metric value)` };
    }
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      return { ok: false, reason: `metric value '${rawValue}' is not a finite number` };
    }
    const unit = asText(get(layout.metricUnit));
    const metric: MetricPayload = {
      kind: 'metric',
      name,
      value,
      ...(unit !== undefined ? { unit } : {}),
      ...(layout.semanticType !== undefined ? { semanticType: layout.semanticType } : {}),
    };
    payload = metric;
  } else if (signalKind === 'log') {
    const body = asText(get(layout.logBody));
    if (body === undefined) {
      return { ok: false, reason: `missing required column '${layout.logBody ?? '(none)'}' (log body)` };
    }
    const rawSeverity = asText(get(layout.severity));
    let severityText: LogPayload['severityText'];
    if (rawSeverity !== undefined) {
      const upper = rawSeverity.toUpperCase();
      if (!SEVERITY_LEVELS.includes(upper)) {
        return { ok: false, reason: `invalid severity '${rawSeverity}'` };
      }
      severityText = upper as LogPayload['severityText'];
    }
    payload = { kind: 'log', body, ...(severityText !== undefined ? { severityText } : {}) };
  } else {
    const traceId = asText(get(layout.traceId));
    if (traceId === undefined) {
      return { ok: false, reason: `missing required column '${layout.traceId ?? '(none)'}' (trace id)` };
    }
    const spanId = asText(get(layout.spanId));
    if (spanId === undefined) {
      return { ok: false, reason: `missing required column '${layout.spanId ?? '(none)'}' (span id)` };
    }
    const spanName = asText(get(layout.spanName));
    if (spanName === undefined) {
      return { ok: false, reason: `missing required column '${layout.spanName ?? '(none)'}' (span name)` };
    }
    const rawDuration = asText(get(layout.durationMs));
    if (rawDuration === undefined) {
      return { ok: false, reason: `missing required column '${layout.durationMs ?? '(none)'}' (span duration)` };
    }
    const durationMs = Number(rawDuration);
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return { ok: false, reason: `span duration '${rawDuration}' is not a non-negative number` };
    }
    const parentSpanId = asText(get(layout.parentSpanId));
    const rawStatus = asText(get(layout.status));
    let status: TracePayload['status'];
    if (rawStatus !== undefined) {
      const upper = rawStatus.toUpperCase();
      if (!SPAN_STATUSES.includes(upper)) {
        return { ok: false, reason: `invalid span status '${rawStatus}'` };
      }
      status = upper as TracePayload['status'];
    }
    payload = {
      kind: 'trace',
      traceId,
      spanId,
      ...(parentSpanId !== undefined ? { parentSpanId } : {}),
      spanName,
      durationMs,
      ...(status !== undefined ? { status } : {}),
    };
  }

  const signal: TelemetrySignal = {
    irVersion: IR_VERSION,
    resource: { 'service.name': serviceName },
    timestamp: parsed.isoUtc,
    rawOffsetMinutes: parsed.offsetMinutes,
    signal: signalKind,
    payload,
  };

  const check = telemetrySignalSchema.safeParse(signal);
  if (!check.success) {
    // A failed zod parse always carries at least one issue, so the non-null
    // assertion is guaranteed by the zod contract.
    const issue = check.error.issues[0]!;
    return { ok: false, reason: `schema validation failed: ${issue.message}` };
  }
  return { ok: true, signal };
}

/** Ingest a flat file into IR signals with zero silent loss. */
export function ingestFile(text: string, options: FileIngestOptions): FileIngestResult {
  const { records, errors } = parseByFormat(text, options);
  const signals: TelemetrySignal[] = [];
  const quarantine: FileQuarantineRecord[] = [];

  for (const e of errors) {
    quarantine.push({ line: e.line, reason: e.reason, record: '' });
  }
  for (const rec of records) {
    const result = buildSignal(rec.data, options);
    if (result.ok) {
      signals.push(result.signal);
    } else {
      quarantine.push({ line: rec.line, reason: result.reason, record: summarize(rec.data) });
    }
  }

  return { signals, quarantine };
}
