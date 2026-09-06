import { TimeParseError, parseTimestamp, type TimeLayout } from '../util/time.js';
import { UnitError, convertUnit, isConvertible } from '../util/unit.js';

/**
 * Transform strategies.
 *
 * Every strategy is a pure function: same input + same rule => same output.
 * A strategy never throws for a *data* problem; it returns a discriminated
 * failure so the engine can quarantine the record and keep going.
 */

export type SourceRecord = Record<string, unknown>;

/** Result of applying one rule to one record. */
export type StrategyResult =
  | { ok: true; fields: Record<string, unknown> }
  | { ok: false; code: StrategyErrorCode; message: string };

export type StrategyErrorCode =
  | 'MISSING_INPUT'
  | 'BAD_TIMESTAMP'
  | 'UNIT_CONVERT_FAILED'
  | 'UNMAPPED_VALUE'
  | 'PATTERN_MISMATCH'
  | 'NO_TEMPLATE'
  | 'LOOKUP_MISS'
  | 'EXPR_FAILED'
  | 'AMBIGUOUS_LOOKUP';

export interface TimeRule {
  id: string;
  kind: 'time';
  from: string;
  /** Target field path. Defaults to `from`. */
  to?: string;
  layout: TimeLayout;
  /** Required when the source value carries no UTC offset. */
  assumeOffsetMinutes?: number;
  /** Emit the offset into this field path. */
  emitOffsetTo?: string;
}

export interface UnitRule {
  id: string;
  kind: 'unit';
  from: string;
  to?: string;
  fromUnit: string;
  toUnit: string;
}

export interface MapRule {
  id: string;
  kind: 'map';
  from: string;
  to?: string;
  mapping: Record<string, string>;
  /** When absent, an unmapped value is a failure rather than a silent pass-through. */
  default?: string;
}

export interface RegexRule {
  id: string;
  kind: 'regex';
  from: string;
  pattern: string;
  /** Maps named capture groups to output field paths. */
  emit: Record<string, string>;
}

export interface TemplateRule {
  id: string;
  kind: 'template';
  from: string;
  /** Template id -> template string with `{param}` placeholders. */
  templates: Record<string, string>;
  /** Field path receiving the matched template id. */
  toTemplateId?: string;
  /** Field path receiving the extracted parameters object. */
  toParams?: string;
}

export interface LookupRule {
  id: string;
  kind: 'lookup';
  from: string;
  to: string;
  table: Record<string, string>;
  /** When true, a key matching several aliases is an error instead of first-wins. */
  strictAmbiguity?: boolean;
  default?: string;
}

/**
 * Restricted expression rule. Deliberately NOT `eval`: only the operators below
 * are supported, so no property access, no function calls and no I/O are reachable.
 */
export interface ExprRule {
  id: string;
  kind: 'expr';
  to: string;
  /** e.g. `duration_ms / 1000` or `a + b` - see `evalExpr` for the grammar. */
  expression: string;
}

export type TransformRule =
  | TimeRule
  | UnitRule
  | MapRule
  | RegexRule
  | TemplateRule
  | LookupRule
  | ExprRule;

function read(record: SourceRecord, path: string): unknown {
  if (!path.includes('.')) return record[path];
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, record);
}

/** Number of leading spaces normalised to a single space; used for template matching. */
function normalizeWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

/** Escape a template literal and turn `{param}` into a named capture group. */
function templateToRegExp(template: string): RegExp | null {
  const names: string[] = [];
  let pattern = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i] ?? '';
    if (ch === '{') {
      const end = template.indexOf('}', i);
      if (end === -1) return null;
      const name = template.slice(i + 1, end);
      if (name === '' || names.includes(name)) return null;
      names.push(name);
      pattern += '(?<p' + String(names.length - 1) + '>.+?)';
      i = end + 1;
    } else {
      pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i += 1;
    }
  }
  return new RegExp('^' + pattern + '$');
}

/** Extract `{param}` names in order of appearance. */
function templateParamNames(template: string): string[] {
  const out: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) out.push(m[1] as string);
  return out;
}

export function applyTime(rule: TimeRule, record: SourceRecord): StrategyResult {
  const raw = read(record, rule.from);
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, code: 'MISSING_INPUT', message: `field '${rule.from}' is missing` };
  }
  if (typeof raw !== 'string') {
    return { ok: false, code: 'BAD_TIMESTAMP', message: `field '${rule.from}' is not a string` };
  }
  try {
    const parsed = parseTimestamp(raw, rule.layout, rule.assumeOffsetMinutes);
    const fields: Record<string, unknown> = { [rule.to ?? rule.from]: parsed.isoUtc };
    if (rule.emitOffsetTo) fields[rule.emitOffsetTo] = parsed.offsetMinutes;
    return { ok: true, fields };
  } catch (err) {
    const msg = err instanceof TimeParseError ? err.message : String(err);
    return { ok: false, code: 'BAD_TIMESTAMP', message: `cannot parse '${rule.from}': ${msg}` };
  }
}

export function applyUnit(rule: UnitRule, record: SourceRecord): StrategyResult {
  const raw = read(record, rule.from);
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, code: 'MISSING_INPUT', message: `field '${rule.from}' is missing` };
  }
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) {
    return { ok: false, code: 'UNIT_CONVERT_FAILED', message: `field '${rule.from}' is not numeric` };
  }
  if (!isConvertible(rule.fromUnit, rule.toUnit)) {
    return {
      ok: false,
      code: 'UNIT_CONVERT_FAILED',
      message: `'${rule.fromUnit}' is not convertible to '${rule.toUnit}'`,
    };
  }
  try {
    return { ok: true, fields: { [rule.to ?? rule.from]: convertUnit(num, rule.fromUnit, rule.toUnit) } };
  } catch (err) {
    const msg = err instanceof UnitError ? err.message : String(err);
    return { ok: false, code: 'UNIT_CONVERT_FAILED', message: msg };
  }
}

export function applyMap(rule: MapRule, record: SourceRecord): StrategyResult {
  const raw = read(record, rule.from);
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, code: 'MISSING_INPUT', message: `field '${rule.from}' is missing` };
  }
  const key = String(raw);
  const hit = Object.prototype.hasOwnProperty.call(rule.mapping, key) ? rule.mapping[key] : undefined;
  if (hit !== undefined) return { ok: true, fields: { [rule.to ?? rule.from]: hit } };
  if (rule.default !== undefined) {
    return { ok: true, fields: { [rule.to ?? rule.from]: rule.default } };
  }
  return { ok: false, code: 'UNMAPPED_VALUE', message: `no mapping for value '${key}'` };
}

/** Compile cache so the same pattern is never recompiled across a batch. */
const regexCache = new Map<string, RegExp>();

function compiled(pattern: string): RegExp {
  const hit = regexCache.get(pattern);
  if (hit) return hit;
  const re = new RegExp(pattern);
  regexCache.set(pattern, re);
  return re;
}

export function applyRegex(rule: RegexRule, record: SourceRecord): StrategyResult {
  const raw = read(record, rule.from);
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, code: 'MISSING_INPUT', message: `field '${rule.from}' is missing` };
  }
  const text = String(raw);
  const m = compiled(rule.pattern).exec(text);
  if (!m) {
    return { ok: false, code: 'PATTERN_MISMATCH', message: `pattern did not match '${rule.from}'` };
  }
  const fields: Record<string, unknown> = {};
  for (const [group, path] of Object.entries(rule.emit)) {
    const value = m.groups?.[group];
    if (value === undefined) {
      return {
        ok: false,
        code: 'PATTERN_MISMATCH',
        message: `capture group '${group}' is missing (use named groups)`,
      };
    }
    fields[path] = value;
  }
  return { ok: true, fields };
}

export function applyTemplate(rule: TemplateRule, record: SourceRecord): StrategyResult {
  const raw = read(record, rule.from);
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, code: 'MISSING_INPUT', message: `field '${rule.from}' is missing` };
  }
  const text = normalizeWhitespace(String(raw));
  for (const [id, template] of Object.entries(rule.templates)) {
    const re = templateToRegExp(normalizeWhitespace(template));
    if (!re) continue;
    const m = re.exec(text);
    if (!m) continue;
    const fields: Record<string, unknown> = {};
    if (rule.toTemplateId) fields[rule.toTemplateId] = id;
    if (rule.toParams && m.groups) {
      const names = templateParamNames(template);
      const params: Record<string, string> = {};
      names.forEach((name, idx) => {
        const v = m.groups?.[`p${idx}`];
        if (v !== undefined) params[name] = v;
      });
      fields[rule.toParams] = params;
    }
    return { ok: true, fields };
  }
  return { ok: false, code: 'NO_TEMPLATE', message: `no template matched '${rule.from}'` };
}

export function applyLookup(rule: LookupRule, record: SourceRecord): StrategyResult {
  const raw = read(record, rule.from);
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, code: 'MISSING_INPUT', message: `field '${rule.from}' is missing` };
  }
  const key = String(raw);
  if (rule.strictAmbiguity) {
    // An alias that maps to two different entities is a data bug, not a coin flip.
    const targets = new Set<string>();
    for (const [alias, target] of Object.entries(rule.table)) {
      if (alias === key) targets.add(target);
    }
    if (targets.size > 1) {
      return {
        ok: false,
        code: 'AMBIGUOUS_LOOKUP',
        message: `alias '${key}' resolves to ${targets.size} distinct targets`,
      };
    }
  }
  const hit = Object.prototype.hasOwnProperty.call(rule.table, key) ? rule.table[key] : undefined;
  if (hit !== undefined) return { ok: true, fields: { [rule.to]: hit } };
  if (rule.default !== undefined) return { ok: true, fields: { [rule.to]: rule.default } };
  return { ok: false, code: 'LOOKUP_MISS', message: `lookup miss for '${key}'` };
}

/**
 * Tiny expression evaluator. Grammar:
 *
 *   expr    := term (('+' | '-') term)*
 *   term    := factor (('*' | '/') factor)*
 *   factor  := number | field | '(' expr ')'
 *   field   := [A-Za-z_][A-Za-z0-9_.]*
 *
 * Division by zero is an error rather than `Infinity`, so bad data is quarantined
 * instead of silently poisoning downstream statistics.
 */
export function evalExpr(expression: string, record: SourceRecord): number {
  let pos = 0;

  const peek = (): string => expression[pos] ?? '';
  const skipWs = (): void => {
    while (pos < expression.length && /\s/.test(expression[pos] as string)) pos += 1;
  };

  function parseFactor(): number {
    skipWs();
    const ch = peek();
    if (ch === '(') {
      pos += 1;
      const v = parseExpr();
      skipWs();
      if (peek() !== ')') throw new Error(`expected ')' at position ${pos}`);
      pos += 1;
      return v;
    }
    if (ch === '-') {
      pos += 1;
      return -parseFactor();
    }
    if (ch === '+') {
      pos += 1;
      return parseFactor();
    }
    if (ch >= '0' && ch <= '9') {
      const start = pos;
      while (pos < expression.length && /[0-9.]/.test(expression[pos] as string)) pos += 1;
      const n = Number(expression.slice(start, pos));
      if (!Number.isFinite(n)) throw new Error(`malformed number at position ${start}`);
      return n;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = pos;
      while (pos < expression.length && /[A-Za-z0-9_.]/.test(expression[pos] as string)) pos += 1;
      const name = expression.slice(start, pos);
      const v = read(record, name);
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) throw new Error(`field '${name}' is not numeric`);
      return n;
    }
    throw new Error(`unexpected character '${ch}' at position ${pos}`);
  }

  function parseTerm(): number {
    let left = parseFactor();
    for (;;) {
      skipWs();
      const op = peek();
      if (op !== '*' && op !== '/') return left;
      pos += 1;
      const right = parseFactor();
      if (op === '*') left = left * right;
      else {
        if (right === 0) throw new Error('division by zero');
        left = left / right;
      }
    }
  }

  function parseExpr(): number {
    let left = parseTerm();
    for (;;) {
      skipWs();
      const op = peek();
      if (op !== '+' && op !== '-') return left;
      pos += 1;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
  }

  const value = parseExpr();
  skipWs();
  if (pos !== expression.length) {
    throw new Error(`unexpected trailing input at position ${pos}`);
  }
  return value;
}

export function applyExpr(rule: ExprRule, record: SourceRecord): StrategyResult {
  try {
    return { ok: true, fields: { [rule.to]: evalExpr(rule.expression, record) } };
  } catch (err) {
    return { ok: false, code: 'EXPR_FAILED', message: err instanceof Error ? err.message : String(err) };
  }
}

/** Dispatch a single rule against a single record. */
export function applyRule(rule: TransformRule, record: SourceRecord): StrategyResult {
  switch (rule.kind) {
    case 'time':
      return applyTime(rule, record);
    case 'unit':
      return applyUnit(rule, record);
    case 'map':
      return applyMap(rule, record);
    case 'regex':
      return applyRegex(rule, record);
    case 'template':
      return applyTemplate(rule, record);
    case 'lookup':
      return applyLookup(rule, record);
    case 'expr':
      return applyExpr(rule, record);
    default: {
      const never: never = rule;
      throw new Error(`unsupported rule kind: ${JSON.stringify(never)}`);
    }
  }
}
