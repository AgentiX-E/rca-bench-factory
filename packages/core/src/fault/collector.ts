import { FAULT_CATEGORIES, isVocabularyMember, type FaultCategory } from '../ir/types.js';
import { isRecord } from '../util/json.js';

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

/**
 * Ordered keyword table for category inference.
 *
 * ## Order is the mechanism, not an accident
 *
 * Earlier rows win, so `network-delay` is classified as network (not resource)
 * and `cpu-saturation` as resource. Two orderings below are load-bearing and are
 * asserted in `fault.test.ts` and `validity.test.ts`:
 *
 *   - **`middleware` before `code`.** The middleware row carries `lag`, the code
 *     row carries `error`. A `kafka-lag` names middleware; a slug that carries
 *     both words is decided by this order. It is also the order that made the
 *     substring defect in `keywordMatchesToken` silent: `flag` contains `lag`, so
 *     a `feature-flag-misconfiguration` was read as middleware before the config
 *     row was ever reached.
 *   - **`middleware` before `network` is *not* what is wanted**, which is why the
 *     `middleware` row is moved above `network` below. `redis-latency` names a
 *     *middleware* fault whose mechanism is latency; `network-delay` names a
 *     *network* fault. Both slugs contain a latency keyword, so keyword presence
 *     alone cannot separate them -- the subject (`redis`) has to outrank the
 *     mechanism (`latency`), and the only way to express that in an ordered table
 *     is to test the row that holds the subjects first. This is the dataset's own
 *     convention, not a preference: `golden-master/fault-extraction/samples.json`
 *     records `redis-latency` as middleware and `network-delay` as network.
 *
 * The entries are matched *words* rather than letter sequences -- see
 * `keywordMatchesToken` for why, and for what each match form is for.
 */
const CATEGORY_KEYWORDS: ReadonlyArray<{ category: FaultCategory; keywords: readonly string[] }> = [
  { category: 'middleware', keywords: ['database', 'db', 'redis', 'kafka', 'mq', 'queue', 'cache', 'sql', 'mysql', 'postgres', 'lag'] },
  { category: 'network', keywords: ['network', 'latency', 'delay', 'loss', 'partition', 'bandwidth', 'dns', 'packet', 'drop', 'net'] },
  { category: 'resource', keywords: ['cpu', 'memory', 'mem', 'disk', 'stress', 'capacity', 'oom', 'saturation', 'leak'] },
  { category: 'runtime', keywords: ['pod', 'kill', 'crash', 'restart', 'evict', 'container', 'panic'] },
  { category: 'code', keywords: ['exception', 'error', 'bug', 'null', 'stack', 'throw', 'logic', 'regex', 'backtracking'] },
  { category: 'config', keywords: ['config', 'setting', 'env', 'yaml', 'property', 'mismatch'] },
  { category: 'dependency', keywords: ['dependency', 'upstream', 'downstream', 'third-party', 'sdk', 'library'] },
];

/**
 * Prefixes that negate or qualify the word after them, so a keyword can sit at a
 * morpheme boundary that is not the start of the token.
 *
 * The list is closed and deliberately short. `misconfiguration` is
 * `mis` + `configuration`, and `configuration` begins with `config`, so the
 * match is an **infix** and a plain `startsWith` cannot see it. `de` is *not* in
 * the list even though it is a real English prefix, because `de` + `bug` is
 * `debugger` -- a false positive -- and no fault type in the corpus needs it.
 */
const NEGATION_PREFIXES = ['mis', 'non', 'un'] as const;

/**
 * The shortest keyword allowed to match as a prefix of a token, and the shortest
 * allowed to match as a plural.
 *
 * Both floors are load-bearing and neither is arbitrary:
 *
 *   - **prefix, 5.** A three-letter keyword used as a prefix matches a large part
 *     of the dictionary: `mem` matches `member`, `remember` and `memento`; `oom`
 *     matches `room`, `zoom` and `bloom`; `net` matches `planet`, `magnet`,
 *     `cabinet` and `tenet`. Five characters is short enough that `evict` still
 *     reaches `eviction` and `config` still reaches `configuration`, and long
 *     enough that the collisions above are excluded. `memory` is six, which is
 *     why `memoryless` is still classified `resource` -- correctly, it names a
 *     memory fault.
 *   - **plural, 4.** `db` + `s` must not match an unrelated `dbs`; four
 *     characters keeps `dependencies` reachable from `dependency`.
 */
const MIN_PREFIX_LENGTH = 5;
const MIN_PLURAL_LENGTH = 4;

/**
 * Does `keyword` name the word `token`, or one of its forms?
 *
 * Replaces an earlier `normalized.includes(keyword)`, which searched the whole
 * slug for a letter *sequence*. That is a different question from whether the
 * slug uses the *word*, and it produced answers nothing downstream could use:
 *
 *     inferFaultCategory('feature-flag-misconfiguration') === 'middleware'
 *
 * because `flag` contains `lag` and the middleware row is tested before the
 * config row. The slug names a configuration fault; `flag` is one word and `lag`
 * is not a part of it. The same defect reached `planet` -> `network` (via `net`),
 * `room` -> `resource` (via `oom`), `skill` -> `runtime` (via `kill`),
 * `debugger` -> `code` (via `bug`) and `dropdown` -> `network` (via `drop`).
 *
 * The cost of those false positives is not local: `category` selects the row of
 * the validity gate's mechanism table that decides which telemetry would evidence
 * a fault, and it is exported into the benchmark artefacts as `scenario_class`,
 * `fault_taxonomy` and `fault_category`.
 *
 * A keyword therefore has to sit on a word boundary. Four forms are accepted,
 * and each is here because a real fault type needs it:
 *
 * | form      | example                      |
 * |-----------|------------------------------|
 * | exact     | `kafka-lag` -> `lag`         |
 * | plural    | `dependencies` -> `dependency` |
 * | prefix    | `eviction` -> `evict`        |
 * | negation  | `misconfiguration` -> `config` |
 */
function keywordMatchesToken(keyword: string, token: string): boolean {
  if (token === keyword) {
    return true;
  }
  if (
    keyword.length >= MIN_PLURAL_LENGTH &&
    (token === `${keyword}s` || token === `${keyword}es`)
  ) {
    return true;
  }
  if (keyword.length >= MIN_PREFIX_LENGTH && token.startsWith(keyword)) {
    return true;
  }
  for (const negation of NEGATION_PREFIXES) {
    if (token.startsWith(negation) && token.slice(negation.length).startsWith(keyword)) {
      return true;
    }
  }
  return false;
}

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
  const tokens = normalized.split('-').filter((token) => token !== '');
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    for (const keyword of keywords) {
      // A keyword may itself span several tokens (`third-party`), and there is
      // no way to express that as a single-token comparison, so it is matched
      // against the normalised slug as a whole. The boundary condition is the
      // same one: the keyword has to be preceded and followed by a hyphen or by
      // the end of the string, so `third-party` cannot match `fourth-party`.
      if (keyword.includes('-')) {
        if (tokens.some((_, index) => tokens.slice(index).join('-').startsWith(keyword))) {
          return category;
        }
        continue;
      }
      if (tokens.some((token) => keywordMatchesToken(keyword, token))) {
        return category;
      }
    }
  }
  return 'unknown';
}

function isFaultCategory(value: string): value is FaultCategory {
  return isVocabularyMember(FAULT_CATEGORIES, value);
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
