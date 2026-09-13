import { ISO_UTC_PATTERN } from '../util/time.js';
import {
  entityId as buildEntityId,
  findAmbiguousAliases,
  findDanglingEdgeRefs,
  indexGraph,
  resolveEntityRef,
  VALID_RELATIONS,
} from '../entity/graph.js';
import { detectFileLayout, ingestFile, type FileFormat, type FileLayout, type FileSignalKind } from './file.js';
import { irBundleSchema } from '../ir/schema.js';
import { parseFaultSpec, type FaultSpec } from '../fault/collector.js';
import { IR_VERSION } from '../ir/types.js';
import type { TimeLayout } from '../util/time.js';
import type { Entity, EntityEdge, EntityGraph, FaultCase, IrBundle, TelemetrySignal } from '../ir/types.js';

/**
 * Prime-dataset ingest: turn an official benchmark dataset slice into an IR bundle.
 *
 * This is the `ingest` half of the L4 round trip. The export half has always
 * existed; this module closes the loop so official data can be replayed through
 * our IR and then scored by the official evaluator.
 *
 * Four invariants hold by construction, not by convention:
 *
 *   1. Zero silent loss. Every file is routed to a case and every source record
 *      is either a validated signal or a quarantine entry. Files that no case
 *      claims are reported in `unclaimed`, never quietly ignored.
 *   2. Labels are supplied, never guessed. The root-cause component, the fault
 *      type and the injection time arrive in the descriptor and are validated.
 *      An inferred label would make the reproduction circular.
 *   3. Reference integrity. An unresolvable root cause fails here rather than
 *      producing a bundle the G2 gate would later reject.
 *   4. Determinism. Files are visited in sorted order, entities are sorted by id
 *      and edges are deduplicated, so identical input yields an identical bundle.
 *
 * The module is pure: it takes a `path -> text` map and returns a bundle, so the
 * entire contract is testable with string literals and licensed data never
 * enters the repository. All filesystem access stays in the CLI.
 */

/** Datasets the ingest path understands. */
export type PrimeDatasetId =
  | 'rcaeval'
  | 'openrca-1.0'
  | 'openrca-2.0'
  | 'rca100'
  | 'aiops2025'
  | 'cloud-opsbench'
  | 'itbench';

export const PRIME_DATASET_IDS: readonly PrimeDatasetId[] = [
  'rcaeval',
  'openrca-1.0',
  'openrca-2.0',
  'rca100',
  'aiops2025',
  'cloud-opsbench',
  'itbench',
];

/** How one file is read. Omitted fields fall back to detection, then defaults. */
export interface PrimeFileSpec {
  /** Exact key in the file map. */
  path: string;
  format?: FileFormat;
  signalKind?: FileSignalKind;
  layout?: FileLayout;
  timeLayout?: TimeLayout;
  /** Required when the source timestamp carries no UTC offset. */
  assumeOffsetMinutes?: number;
  delimiter?: string;
  hasHeader?: boolean;
  /** Fallback `service.name` when the file has no service column. */
  serviceName?: string;
}

/** One benchmark case: where its telemetry lives and what the answer is. */
export interface PrimeCaseSource {
  caseId: string;
  /** Root-cause component, spelled exactly as the dataset spells it. */
  component: string;
  /** Fault type as the dataset spells it; normalised by `parseFaultSpec`. */
  faultType: string;
  /** Canonical UTC ISO-8601 injection time. */
  injectTime: string;
  /** Observation window; derived from `leadMs` / `lagMs` when absent. */
  window?: { start: string; end: string };
  /** Natural-language task text, required by OpenRCA-style benchmarks. */
  query?: string;
  difficulty?: 'L1' | 'L2' | 'L3' | 'L4';
  /** Prefixes selecting this case's files. Absent means "every file". */
  pathPrefixes?: string[];
  /** Per-file overrides for files auto-detection cannot read correctly. */
  files?: PrimeFileSpec[];
}

/** Fallback applied to every file no `PrimeFileSpec` covers. */
export interface PrimeIngestDefaults {
  format?: FileFormat;
  signalKind?: FileSignalKind;
  layout?: FileLayout;
  timeLayout?: TimeLayout;
  assumeOffsetMinutes?: number;
  delimiter?: string;
  hasHeader?: boolean;
  serviceName?: string;
}

export interface PrimeIngestOptions {
  dataset: PrimeDatasetId;
  /** Entity namespace and `FaultCase.system`. */
  system: string;
  cases: PrimeCaseSource[];
  defaults?: PrimeIngestDefaults;
  /** Entities seeded into the graph beyond those observed in signals. */
  extraEntities?: Entity[];
  /** Topology edges merged into the graph. */
  extraEdges?: EntityEdge[];
  /** Context before the injection time. Defaults to 10 minutes. */
  leadMs?: number;
  /** Context after the injection time. Defaults to `leadMs`. */
  lagMs?: number;
}

/** A source record that could not become a signal, and why. */
export interface PrimeQuarantineRecord {
  file: string;
  /** 1-based source line, or 0 when the whole file was rejected. */
  line: number;
  reason: string;
  record: string;
}

export interface PrimeCaseReport {
  caseId: string;
  signals: number;
  quarantine: PrimeQuarantineRecord[];
  /** Files routed to this case, sorted. */
  files: string[];
}

export interface PrimeIngestSuccess {
  ok: true;
  bundle: IrBundle;
  report: PrimeCaseReport[];
  /** Files that matched no case. Empty when no case declares prefixes. */
  unclaimed: string[];
  /**
   * Cases that were never actually read: no file matched, or every file was
   * quarantined before a single row was parsed. Empty means the ingest is sound.
   * A non-empty list does not abort the bundle, but it does mean the caller must
   * not treat the affected cases as reproduced.
   */
  hardErrors: string[];
}

export type PrimeIngestResult = PrimeIngestSuccess | { ok: false; error: string };

const DEFAULT_LEAD_MS = 10 * 60_000;

const EXTENSION_FORMATS = new Map<string, FileFormat>([
  ['csv', 'csv'],
  ['tsv', 'tsv'],
  ['jsonl', 'jsonl'],
  ['ndjson', 'jsonl'],
  ['json', 'json'],
]);

/** Whole path segments that name a signal kind. Checked longest-first. */
const KIND_SEGMENTS: ReadonlyArray<{ kind: FileSignalKind; names: readonly string[] }> = [
  { kind: 'trace', names: ['traces', 'trace', 'spans', 'span'] },
  { kind: 'log', names: ['logs', 'log'] },
  { kind: 'metric', names: ['metrics', 'metric'] },
];

/** File name stems that name a signal kind: `metrics.csv`, `logs.jsonl`. */
const KIND_STEMS: ReadonlyArray<{ kind: FileSignalKind; stem: string }> = [
  { kind: 'metric', stem: 'metrics' },
  { kind: 'metric', stem: 'metric' },
  { kind: 'log', stem: 'logs' },
  { kind: 'log', stem: 'log' },
  { kind: 'trace', stem: 'traces' },
  { kind: 'trace', stem: 'trace' },
  { kind: 'trace', stem: 'spans' },
];

/** Fields a signal kind cannot do without. A missing one quarantines the file. */
const REQUIRED_FIELDS: Record<FileSignalKind, ReadonlyArray<keyof FileLayout>> = {
  metric: ['timestamp', 'metricName', 'metricValue'],
  log: ['timestamp', 'logBody'],
  trace: ['timestamp', 'traceId', 'spanId', 'spanName', 'durationMs'],
};

function extensionOf(path: string): string {
  const base = fileNameOf(path);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot + 1).toLowerCase();
}

/** The final path segment, which is never empty for a key in the file map. */
function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Infer the signal kind from the path, or `undefined` when unclear.
 *
 * A whole segment claims the kind first (`traces/…`, `…/logs/…`), then the file
 * name stem (`metrics.csv`). Anything else is deliberately undecidable: guessing
 * here would silently relabel a metric series as a log body and corrupt the
 * export, so the caller is asked for an explicit `PrimeFileSpec` instead.
 */
function inferSignalKind(path: string): FileSignalKind | undefined {
  const lower = path.toLowerCase();
  const segments = lower.split('/');
  for (const { kind, names } of KIND_SEGMENTS) {
    if (segments.some((s) => names.includes(s))) return kind;
  }
  const ext = extensionOf(lower);
  const base = fileNameOf(lower);
  const stem = ext === '' ? base : base.slice(0, -(ext.length + 1));
  return KIND_STEMS.find(({ stem: s }) => s === stem)?.kind;
}
/** Strip a BOM and normalise line endings so line numbers match the source. */
function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
}

/**
 * Split a header line, honouring quoted cells. This is a header-only reader, so
 * the full multi-line quoter in `parseDelimited` is unnecessary here.
 */
function splitHeader(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * Infer a column layout from the file itself: the header row for delimited
 * formats, the first record's keys for JSON. No LLM, and no guessing beyond the
 * deterministic alias table in `detectFileLayout`.
 *
 * JSON is parsed as a whole document rather than line by line: an array may be
 * pretty-printed across many lines, so slicing the first line would misread a
 * perfectly valid file as headerless.
 */
function inferLayout(text: string, format: FileFormat, signalKind: FileSignalKind): FileLayout | undefined {
  const normalized = normalizeText(text);

  if (format === 'json') {
    let doc: unknown;
    try {
      doc = JSON.parse(normalized);
    } catch {
      return undefined;
    }
    const first = Array.isArray(doc) ? doc[0] : doc;
    if (typeof first !== 'object' || first === null || Array.isArray(first)) return undefined;
    return detectFileLayout(Object.keys(first as Record<string, unknown>), signalKind);
  }

  if (format === 'jsonl') {
    // A JSONL file with no non-blank line has nothing to infer from; the caller
    // sees the same "no readable header" reason as any other headerless file.
    const firstLine = normalized.split('\n').find((l) => l.trim() !== '');
    if (firstLine === undefined) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(firstLine);
    } catch {
      return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    return detectFileLayout(Object.keys(parsed as Record<string, unknown>), signalKind);
  }

  const firstLine = normalized.split('\n').find((l) => l.trim() !== '');
  if (firstLine === undefined) return undefined;
  const delimiter = format === 'tsv' ? '\t' : ',';
  return detectFileLayout(splitHeader(firstLine, delimiter), signalKind);
}

function missingFields(layout: FileLayout, kind: FileSignalKind): string[] {
  return REQUIRED_FIELDS[kind].filter((f) => layout[f] === undefined).map(String);
}

/** The `ingestFile` options for one file, or the reason it cannot be read. */
type ResolvedFile =
  | { ok: true; options: Parameters<typeof ingestFile>[1] }
  | { ok: false; reason: string };

function resolveFileOptions(
  path: string,
  text: string,
  spec: PrimeFileSpec | undefined,
  defaults: PrimeIngestDefaults | undefined,
): ResolvedFile {
  const format = spec?.format ?? defaults?.format ?? EXTENSION_FORMATS.get(extensionOf(path));
  if (format === undefined) {
    return { ok: false, reason: `cannot determine the file format of '${path}'` };
  }

  const signalKind = spec?.signalKind ?? defaults?.signalKind ?? inferSignalKind(path);
  if (signalKind === undefined) {
    return {
      ok: false,
      reason: `cannot determine the signal kind of '${path}'; pass an explicit file spec`,
    };
  }

  const layout = spec?.layout ?? defaults?.layout ?? inferLayout(text, format, signalKind);
  if (layout === undefined) {
    return { ok: false, reason: `'${path}' has no readable header to infer columns from` };
  }
  const missing = missingFields(layout, signalKind);
  if (missing.length > 0) {
    return { ok: false, reason: `'${path}' is missing required column(s): ${missing.join(', ')}` };
  }

  // `spec` wins over `defaults` field by field; the spread order below makes
  // that explicit rather than relying on any later overwrite.
  const merged: PrimeIngestDefaults = { ...defaults, ...spec };
  return {
    ok: true,
    options: {
      format,
      signalKind,
      layout,
      ...(merged.timeLayout !== undefined ? { timeLayout: merged.timeLayout } : {}),
      ...(merged.assumeOffsetMinutes !== undefined ? { assumeOffsetMinutes: merged.assumeOffsetMinutes } : {}),
      ...(merged.delimiter !== undefined ? { delimiter: merged.delimiter } : {}),
      ...(merged.hasHeader !== undefined ? { hasHeader: merged.hasHeader } : {}),
      ...(merged.serviceName !== undefined ? { serviceName: merged.serviceName } : {}),
    },
  };
}

function serviceEntity(system: string, name: string): Entity {
  return { entityId: buildEntityId('service', system, name), kind: 'service', name, namespace: system, aliases: [] };
}

function dedupeEdges(edges: readonly EntityEdge[]): EntityEdge[] {
  const seen = new Set<string>();
  const out: EntityEdge[] = [];
  for (const e of edges) {
    if (e.from === e.to) continue; // a self edge asserts nothing
    const key = `${e.from}\u0000${e.to}\u0000${e.relation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) =>
    `${a.from}\u0000${a.to}\u0000${a.relation}`.localeCompare(`${b.from}\u0000${b.to}\u0000${b.relation}`),
  );
}

/**
 * Route every file to exactly one case.
 *
 * A case with `pathPrefixes` claims the files those prefixes select. A case
 * without prefixes claims everything left, which is the usual shape when the
 * caller has already narrowed the map to one case. A file claimed by no case is
 * returned separately rather than being dropped.
 */
function routeFiles(
  paths: readonly string[],
  cases: readonly PrimeCaseSource[],
): { routed: Map<string, string[]>; unclaimed: string[] } {
  const routed = new Map<string, string[]>(cases.map((c) => [c.caseId, []]));
  // A case is selective when it declares at least one prefix, and a catch-all
  // otherwise; the two filters are exact complements, so every case lands in
  // exactly one list. Narrowing `pathPrefixes` into a non-optional field here
  // saves a `??` per lookup in the loop below.
  const selective = cases
    .filter((c) => c.pathPrefixes !== undefined && c.pathPrefixes.length > 0)
    .map((c) => ({ caseId: c.caseId, pathPrefixes: c.pathPrefixes! }));
  // A prefixless case is a catch-all: it claims whatever no selective case did.
  // Every prefixless case is considered, not just the first, so a descriptor
  // that lists a selective case before a catch-all still routes correctly.
  const catchAlls = cases.filter((c) => c.pathPrefixes === undefined || c.pathPrefixes.length === 0);
  const unclaimed: string[] = [];

  for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
    // The fallback is load-bearing, not defensive: a descriptor made up entirely
    // of selective cases has *no* catch-all, and a file none of them claims is
    // then unclaimed by design. That is why the undefined branch below is real.
    const owner =
      selective.find((c) => c.pathPrefixes.some((p) => path.startsWith(p))) ?? catchAlls[0];
    if (owner === undefined) {
      unclaimed.push(path);
      continue;
    }
    // `routed` above seeded a bucket for every case, so this lookup is total.
    routed.get(owner.caseId)!.push(path);
  }
  unclaimed.sort((a, b) => a.localeCompare(b));
  return { routed, unclaimed };
}

/**
 * Validate the descriptor and parse every case's fault spec.
 *
 * Parsing here rather than in the main loop is deliberate: `parseFaultSpec`
 * fails only for a blank or non-string `type`, which is exactly what this
 * function rejects, so the returned specs are usable without a second check.
 */
function validateDescriptor(
  options: PrimeIngestOptions,
): { ok: true; faults: FaultSpec[] } | { ok: false; error: string } {
  if (options.system.trim() === '') return { ok: false, error: 'ingest requires a non-blank system' };
  if (!PRIME_DATASET_IDS.includes(options.dataset)) {
    return { ok: false, error: `unknown dataset '${String(options.dataset)}'` };
  }
  if (options.cases.length === 0) return { ok: false, error: 'ingest requires at least one case' };

  const seen = new Set<string>();
  const faults: FaultSpec[] = [];
  for (const c of options.cases) {
    if (c.caseId.trim() === '') return { ok: false, error: 'every case needs a non-blank caseId' };
    if (seen.has(c.caseId)) return { ok: false, error: `duplicate caseId '${c.caseId}'` };
    seen.add(c.caseId);
    if (c.component.trim() === '') {
      return { ok: false, error: `case '${c.caseId}' is missing the root-cause component` };
    }
    if (!ISO_UTC_PATTERN.test(c.injectTime)) {
      return {
        ok: false,
        error: `case '${c.caseId}' injectTime must be canonical UTC ISO-8601, got '${c.injectTime}'`,
      };
    }
    // The parse *is* the fault-type validation: a blank or non-string type is
    // the one thing it refuses, and its message names the problem better than a
    // separate emptiness check would.
    const fault = parseFaultSpec({ type: c.faultType }, 'historical');
    if (!fault.ok) return { ok: false, error: `case '${c.caseId}' is missing the fault type` };
    faults.push(fault.spec);
  }
  return { ok: true, faults };
}

/** Does this string carry any content at all? */
function isBlank(value: string): boolean {
  return value.trim() === '';
}

/**
 * Validate the caller's hand-written declarations.
 *
 * `extraEntities` and `extraEdges` are the only part of the graph the caller
 * authors directly, so they are the only part that can be internally
 * inconsistent. Shape problems are rejected here, at the boundary that produced
 * them:
 *
 *  - a blank id, name or endpoint, which the IR schema would eventually reject
 *    with a message naming no field ("String must contain at least 1
 *    character(s)") and which, for a blank *name*, is worse than missing: it
 *    becomes a `byAlias` key, so a pair of them manufactures an alias ambiguity
 *    that then gets blamed on an unrelated root cause.
 *
 * The dangling-endpoint check does *not* live here, because answering it
 * requires the finished graph: an edge may legitimately point at an entity that
 * telemetry proves even when it was never declared. `validateEndpointRefs` below
 * owns that check and runs once the graph exists.
 */
function validateDeclarations(
  options: PrimeIngestOptions,
): { ok: true } | { ok: false; error: string } {
  for (const entity of options.extraEntities ?? []) {
    if (isBlank(entity.entityId)) {
      return { ok: false, error: 'declared entity has a non-blank entityId requirement: entityId is blank' };
    }
    if (isBlank(entity.name)) {
      return { ok: false, error: `declared entity '${entity.entityId}' needs a non-blank name` };
    }
    for (const alias of entity.aliases) {
      if (isBlank(alias)) {
        return { ok: false, error: `declared entity '${entity.entityId}' has a blank alias` };
      }
    }
  }

  for (const edge of options.extraEdges ?? []) {
    // The relation is a closed set and needs no graph context, so it is checked
    // here rather than at the graph stage. An out-of-contract relation is a
    // more fundamental defect than a malformed endpoint, and reporting the
    // endpoint first would bury it.
    if (!VALID_RELATIONS.includes(edge.relation)) {
      return { ok: false, error: `unknown relation '${edge.relation}' (expected ${VALID_RELATIONS.join('|')})` };
    }
  }

  return { ok: true };
}

/**
 * Reject a blank endpoint once the graph stage has had its say.
 *
 * A blank endpoint is a missing reference and a dangling one is a wrong
 * reference, and both are decidable from the finished graph -- so both are
 * checked there, in severity order, instead of splitting them across two
 * stages. Splitting them is what made the diagnosis order-dependent: the blank
 * check ran first over the raw list and returned immediately, so an edge list
 * containing a blank endpoint *and* a dangling reference was reported according
 * to which edge the caller typed first. The dangling reference is also the more
 * useful of the two, because it names the entity that is actually missing --
 * and a blank endpoint hides it whenever it appears earlier in the list.
 *
 * `findDanglingEdgeRefs` already distinguishes the two reasons, so both
 * verdicts come from the same detector that G2 uses and cannot drift from it.
 */
function validateEndpointRefs(graph: EntityGraph): { ok: true } | { ok: false; error: string } {
  const issues = findDanglingEdgeRefs(graph);

  const dangling = issues.find((issue) => issue.reason === 'dangling');
  if (dangling !== undefined) {
    return {
      ok: false,
      error: `edge ${dangling.where} references '${dangling.ref}' which is not an entity in the graph`,
    };
  }

  const empty = issues.find((issue) => issue.reason === 'empty');
  if (empty !== undefined) {
    // `where` carries the offending side (`edge.from` / `edge.to`), so the
    // message points at a field rather than at "an edge" the caller then has to
    // inspect by hand.
    return { ok: false, error: `edge ${empty.where} has a non-blank requirement: the value is blank` };
  }

  return { ok: true };
}

function deriveWindow(
  spec: PrimeCaseSource,
  leadMs: number,
  lagMs: number,
): { start: string; end: string } {
  const at = Date.parse(spec.injectTime);
  return {
    start: new Date(at - leadMs).toISOString(),
    end: new Date(at + lagMs).toISOString(),
  };
}

/**
 * Build an IR bundle from a prime-dataset slice.
 *
 * `files` maps a relative path to its text body. The finished bundle is checked
 * against `irBundleSchema`, so a descriptor that cannot produce a scorable case
 * fails here with an explicit reason instead of surfacing later as a gate
 * violation.
 */
export function ingestPrimeDataset(
  files: Record<string, string>,
  options: PrimeIngestOptions,
): PrimeIngestResult {
  const descriptor = validateDescriptor(options);
  if (!descriptor.ok) return { ok: false, error: descriptor.error };

  const declaration = validateDeclarations(options);
  if (!declaration.ok) return { ok: false, error: declaration.error };

  const paths = Object.keys(files);
  if (paths.length === 0) {
    return {
      ok: false,
      error: `no files supplied for case(s) ${options.cases.map((c) => c.caseId).join(', ')}`,
    };
  }

  const { routed, unclaimed } = routeFiles(paths, options.cases);
  const leadMs = options.leadMs ?? DEFAULT_LEAD_MS;
  const lagMs = options.lagMs ?? leadMs;

  // Seed the graph with the entities the caller declared. Declared root causes
  // are deliberately *not* seeded here: a component nobody vouches for must not
  // acquire an entity just because a descriptor mentioned it.
  //
  // Deduplication is by entity id only. Two different kinds may legitimately
  // carry the same name (a service and the pod backing it); collapsing them by
  // name would delete a real node, so the caller is trusted to declare one
  // entity per thing and aliases are what merge them.
  const entities = new Map<string, Entity>();
  const addEntity = (e: Entity): void => {
    if (!entities.has(e.entityId)) entities.set(e.entityId, e);
  };
  for (const e of options.extraEntities ?? []) addEntity(e);

  const report: PrimeCaseReport[] = [];
  const signalsByCase: Record<string, TelemetrySignal[]> = {};
  const cases: FaultCase[] = [];
  const hardErrors: string[] = [];
  // Services the caller or the telemetry vouches for. A root cause must be one
  // of these; a bare name is never accepted, because the reproduction would
  // then be scored against an answer nobody actually recorded.
  const vouchedNames = new Set(
    (options.extraEntities ?? []).filter((e) => e.kind === 'service').map((e) => e.name),
  );

  for (const [index, spec] of options.cases.entries()) {
    const fault = descriptor.faults[index] as FaultSpec;

    // `routeFiles` inserts a bucket for every case, and `options.cases` is the
    // same list it was given, so this lookup is total.
    const filesForCase = routed.get(spec.caseId)!;
    if (filesForCase.length === 0) {
      hardErrors.push(
        `case '${spec.caseId}': no files matched; the case was not read (unclaimed: ${unclaimed.length})`,
      );
    }
    const byPath = new Map((spec.files ?? []).map((f) => [f.path, f]));
    const quarantine: PrimeQuarantineRecord[] = [];
    const signals: TelemetrySignal[] = [];

    for (const path of filesForCase) {
      const resolved = resolveFileOptions(path, files[path] as string, byPath.get(path), options.defaults);
      if (!resolved.ok) {
        quarantine.push({ file: path, line: 0, reason: resolved.reason, record: '' });
        continue;
      }
      const ingested = ingestFile(normalizeText(files[path] as string), resolved.options);
      signals.push(...ingested.signals);
      for (const q of ingested.quarantine) {
        quarantine.push({ file: path, line: q.line, reason: q.reason, record: q.record });
      }
    }

    for (const s of signals) {
      const name = s.resource['service.name'];
      addEntity(serviceEntity(options.system, name));
      vouchedNames.add(name);
    }

    if (vouchedNames.has(spec.component)) addEntity(serviceEntity(options.system, spec.component));

    signalsByCase[spec.caseId] = signals;
    report.push({ caseId: spec.caseId, signals: signals.length, quarantine, files: filesForCase });
    cases.push({
      caseId: spec.caseId,
      system: options.system,
      environment: { system: options.system },
      injectTime: spec.injectTime,
      window: spec.window ?? deriveWindow(spec, leadMs, lagMs),
      fault: { type: fault.type, category: fault.category, injectionMethod: 'historical' },
      groundTruth: {
        rootCauseEntityId: '',
        rootCauseComponent: spec.component,
        rootCauseReason: fault.type,
      },
      ...(spec.query !== undefined ? { query: spec.query } : {}),
      ...(spec.difficulty !== undefined ? { difficulty: spec.difficulty } : {}),
    });
  }

  // The root cause is anchored to telemetry we actually read, or to a service
  // the caller declared. Everything else fails here, before the bundle exists.
  //
  // The remedy named in the message has to be one the caller can act on. The
  // API-level name is `extraEntities`, but a CLI user reaches it as
  // `--entities`; naming only the former told them to supply something no flag
  // could express. Both are named so the remedy is reachable from either entry
  // point.
  for (const fc of cases) {
    const component = fc.groundTruth.rootCauseComponent;
    if (!vouchedNames.has(component)) {
      return {
        ok: false,
        error: `case '${fc.caseId}': root-cause component '${component}' does not resolve to an entity in the graph; declare it via extraEntities (CLI: --entities) when the telemetry does not carry it`,
      };
    }
  }

  for (const rep of report) {
    if (rep.signals === 0 && rep.quarantine.length > 0) {
      hardErrors.push(`case '${rep.caseId}': every file was rejected before any row could be parsed`);
    }
  }

  const graph: EntityGraph = {
    entities: [...entities.values()].sort((a, b) => a.entityId.localeCompare(b.entityId)),
    edges: dedupeEdges(options.extraEdges ?? []),
  };

  // Checked against the finished graph, not the declared subset: an edge may
  // legitimately point at an entity that telemetry proves without anyone having
  // declared it.
  const refs = validateEndpointRefs(graph);
  if (!refs.ok) return { ok: false, error: refs.error };

  // Resolve each root cause onto the entity the guard above vouched for.
  //
  // Ambiguity is the only way this can still fail, and it must be tested over
  // *aliases*, not just names: `resolveEntityRef` resolves through `byAlias`, so
  // a collision can arrive via any entity's alias. A names-only check would let
  // an alias collision through and report it as unresolvable -- telling the
  // caller to "declare" a label that is already contested, which cannot help.
  // `findAmbiguousAliases` owns this rule; reuse it rather than restating it.
  //
  // Past this check the resolution below is total, which is why there is no
  // null branch: the guard admitted only components that telemetry or
  // `extraEntities` vouches for, and registered `serviceEntity(system, name)`
  // for each, so `byAlias` always has exactly one hit.
  const index = indexGraph(graph);
  const ownersByAlias = new Map(
    findAmbiguousAliases(graph).map((a) => [a.alias, a.owners] as const),
  );
  for (const fc of cases) {
    const component = fc.groundTruth.rootCauseComponent;
    const owners = ownersByAlias.get(component.toLowerCase());
    if (owners !== undefined) {
      return {
        ok: false,
        error: `case '${fc.caseId}': root-cause component '${component}' is ambiguous; it names ${owners.join(', ')}`,
      };
    }
    // Past the ambiguity check this reference has exactly one claimant, so the
    // lookup is total. `resolveEntityRef` is fallible by contract -- it returns
    // null for an unknown reference and for an ambiguous one -- and the check
    // above has already ruled out both causes. The cast records *why* the
    // fallible call cannot fail here rather than adding a branch that no input
    // can reach. If the graph-construction above ever stops registering a
    // service for every vouched name, this line becomes a type error instead of
    // silently writing an empty root cause that only the G2 gate would catch.
    fc.groundTruth.rootCauseEntityId = resolveEntityRef(component, index) as NonNullable<
      ReturnType<typeof resolveEntityRef>
    >;
  }

  const bundle: IrBundle = { irVersion: IR_VERSION, graph, cases, signals: signalsByCase };
  // `safeParse` validates the finish line, but the typed bundle is what we
  // return: zod widens `quality` to `unknown`, so round-tripping through
  // `parsed.data` would erase the very type the caller depends on.
  const parsed = irBundleSchema.safeParse(bundle);
  if (!parsed.success) {
    return { ok: false, error: `assembled bundle failed validation: ${parsed.error.issues[0]!.message}` };
  }
  return { ok: true, bundle, report, unclaimed, hardErrors };
}
