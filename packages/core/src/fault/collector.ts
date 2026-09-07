import type { FaultCategory } from '../ir/types.js';

/**
 * Fault collector.
 *
 * Turns a fault injection event (Chaos Mesh / Litmus / ChaosBlade) or a
 * historical fault record into the IR `FaultCase.fault` spec. The three entry
 * points are pure functions: type normalisation, category inference and spec
 * parsing. They are the M12 (injector) / M13 (importer) input channel.
 */

export type InjectionMethod = 'chaos-mesh' | 'litmus' | 'chaosblade' | 'historical' | 'manual';

export interface FaultSpec {
  type: string;
  category: FaultCategory;
  injectionMethod: InjectionMethod;
  parameters?: Record<string, unknown>;
}

export type FaultSpecParseResult = { ok: true; spec: FaultSpec } | { ok: false; error: string };

const FAULT_CATEGORIES: readonly string[] = [
  'resource',
  'network',
  'runtime',
  'middleware',
  'code',
  'config',
  'dependency',
  'unknown',
];

/**
 * Ordered keyword table for category inference. Order matters: earlier rows
 * win, so `network-delay` is classified as network (not resource) and
 * `cpu-saturation` as resource.
 */
const CATEGORY_KEYWORDS: ReadonlyArray<{ category: FaultCategory; keywords: readonly string[] }> = [
  { category: 'network', keywords: ['network', 'latency', 'delay', 'loss', 'partition', 'bandwidth', 'dns', 'packet', 'drop', 'net'] },
  { category: 'resource', keywords: ['cpu', 'memory', 'mem', 'disk', 'stress', 'capacity', 'oom', 'saturation', 'leak'] },
  { category: 'runtime', keywords: ['pod', 'kill', 'crash', 'restart', 'evict', 'container', 'panic'] },
  { category: 'middleware', keywords: ['database', 'db', 'redis', 'kafka', 'mq', 'queue', 'cache', 'sql', 'mysql', 'postgres', 'lag'] },
  { category: 'code', keywords: ['exception', 'error', 'bug', 'null', 'stack', 'throw', 'logic'] },
  { category: 'config', keywords: ['config', 'setting', 'env', 'yaml', 'property', 'mismatch'] },
  { category: 'dependency', keywords: ['dependency', 'upstream', 'downstream', 'third-party', 'sdk', 'library'] },
];

/**
 * Normalise a fault type into a stable identifier: lower-case, whitespace and
 * underscores collapsed to hyphens, non-alphanumerics stripped.
 */
export function normalizeFaultType(type: string): string {
  return type
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Infer a `FaultCategory` from a fault type string. */
export function inferFaultCategory(type: string): FaultCategory {
  const normalized = normalizeFaultType(type);
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => normalized.includes(k))) {
      return category;
    }
  }
  return 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFaultCategory(value: string): value is FaultCategory {
  return (FAULT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Parse a fault spec from an injection event or historical record.
 *
 * The `type` is required and normalised; `category` is optional and inferred
 * from the type when absent; `parameters` is optional and must be an object.
 */
export function parseFaultSpec(input: unknown, method: InjectionMethod): FaultSpecParseResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'fault spec is not an object' };
  }

  const rawType = input['type'];
  if (typeof rawType !== 'string' || normalizeFaultType(rawType) === '') {
    return { ok: false, error: "fault spec is missing a non-blank 'type'" };
  }
  const type = normalizeFaultType(rawType);

  let category: FaultCategory;
  const rawCategory = input['category'];
  if (rawCategory !== undefined) {
    if (typeof rawCategory !== 'string' || !isFaultCategory(rawCategory)) {
      return { ok: false, error: `invalid fault category '${String(rawCategory)}'` };
    }
    category = rawCategory;
  } else {
    category = inferFaultCategory(type);
  }

  let parameters: Record<string, unknown> | undefined;
  const rawParameters = input['parameters'];
  if (rawParameters !== undefined) {
    if (!isRecord(rawParameters)) {
      return { ok: false, error: "'parameters' must be an object" };
    }
    parameters = rawParameters;
  }

  return {
    ok: true,
    spec: {
      type,
      category,
      injectionMethod: method,
      ...(parameters !== undefined ? { parameters } : {}),
    },
  };
}
