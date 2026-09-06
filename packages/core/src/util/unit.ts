/**
 * Unit normalization built on a UCUM-inspired conversion table.
 *
 * Only conversions between units of the same *dimension* are allowed. Every
 * conversion is expressed as a linear factor against the dimension's base unit
 * so that the table stays small, exact and reviewable.
 */

export type Dimension = 'time' | 'bytes' | 'rate' | 'ratio' | 'count';

interface UnitDef {
  dimension: Dimension;
  /**
   * Conversion into the dimension base unit, held as an exact rational so that
   * integer conversions (us -> ns, ms -> s) stay exact instead of drifting by
   * one floating-point ulp.
   */
  num: number;
  den: number;
  base: string;
}

/**
 * Base units: time -> `s`, bytes -> `By`, rate -> `rps`, ratio -> `1`, count -> `1`.
 */
const UNITS: Record<string, UnitDef> = {
  // ── time ──────────────────────────────────────────────────────────────
  ns: { dimension: 'time', num: 1, den: 1e9, base: 's' },
  us: { dimension: 'time', num: 1, den: 1e6, base: 's' },
  ms: { dimension: 'time', num: 1, den: 1e3, base: 's' },
  s: { dimension: 'time', num: 1, den: 1, base: 's' },
  min: { dimension: 'time', num: 60, den: 1, base: 's' },
  h: { dimension: 'time', num: 3600, den: 1, base: 's' },
  // ── bytes ─────────────────────────────────────────────────────────────
  By: { dimension: 'bytes', num: 1, den: 1, base: 'By' },
  KiBy: { dimension: 'bytes', num: 1024, den: 1, base: 'By' },
  MiBy: { dimension: 'bytes', num: 1024 ** 2, den: 1, base: 'By' },
  GiBy: { dimension: 'bytes', num: 1024 ** 3, den: 1, base: 'By' },
  // ── rate (requests per second) ────────────────────────────────────────
  rps: { dimension: 'rate', num: 1, den: 1, base: 'rps' },
  QPS: { dimension: 'rate', num: 1, den: 1, base: 'rps' },
  TPS: { dimension: 'rate', num: 1, den: 1, base: 'rps' },
  'rps/min': { dimension: 'rate', num: 1, den: 60, base: 'rps' },
  // ── ratio / percentage ────────────────────────────────────────────────
  '1': { dimension: 'ratio', num: 1, den: 1, base: '1' },
  '%': { dimension: 'ratio', num: 1, den: 100, base: '1' },
  // ── dimensionless count ───────────────────────────────────────────────
  count: { dimension: 'count', num: 1, den: 1, base: 'count' },
};

export class UnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitError';
  }
}

/** Look up a unit definition; throws when the unit is unknown. */
export function getUnitDef(unit: string): UnitDef {
  const def = UNITS[unit];
  if (!def) throw new UnitError(`unknown unit '${unit}'`);
  return def;
}

/** Dimension of a unit; throws when the unit is unknown. */
export function dimensionOf(unit: string): Dimension {
  return getUnitDef(unit).dimension;
}

/** True when both units exist and share the same dimension. */
export function isConvertible(from: string, to: string): boolean {
  try {
    return getUnitDef(from).dimension === getUnitDef(to).dimension;
  } catch {
    return false;
  }
}

/**
 * Convert a numeric value from one unit to another.
 *
 * @throws {UnitError} when either unit is unknown or the dimensions differ.
 */
export function convertUnit(value: number, from: string, to: string): number {
  const a = getUnitDef(from);
  const b = getUnitDef(to);
  if (a.dimension !== b.dimension) {
    throw new UnitError(`cannot convert '${from}' (${a.dimension}) to '${to}' (${b.dimension})`);
  }
  if (a.num === b.num && a.den === b.den) return value;
  // value * (a.num / a.den) / (b.num / b.den)
  return (value * a.num * b.den) / (a.den * b.num);
}

/** All units known to the converter, grouped by dimension. */
export function knownUnits(): Record<Dimension, string[]> {
  const out: Record<Dimension, string[]> = {
    time: [],
    bytes: [],
    rate: [],
    ratio: [],
    count: [],
  };
  for (const [name, def] of Object.entries(UNITS)) out[def.dimension].push(name);
  for (const key of Object.keys(out) as Dimension[]) out[key].sort();
  return out;
}
