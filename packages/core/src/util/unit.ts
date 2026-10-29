/**
 * Unit normalization built on a UCUM-inspired conversion table.
 *
 * Only conversions between units of the same *dimension* are allowed. Every
 * conversion is expressed as a linear factor against the dimension's base unit
 * so that the table stays small, exact and reviewable.
 */

export type Dimension = 'time' | 'bytes' | 'rate' | 'ratio' | 'count' | 'cores';

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
  /**
   * The largest reading this unit can carry, when it has one.
   *
   * Absent means unbounded, which is right for every unit that counts something: a duration, a byte
   * count, a rate and a count of restarts have no ceiling. A *share* does. `1` and `%` are the same
   * dimension with different factors and different ceilings, which is why this is per unit and not
   * per dimension -- a bound stated in base units would clamp 92 % to 1.
   */
  max?: number;
}

/**
 * Base units: time -> `s`, bytes -> `By`, rate -> `rps`, ratio -> `1`, count -> `1`,
 * cores -> `core`.
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
  '1': { dimension: 'ratio', num: 1, den: 1, base: '1', max: 1 },
  '%': { dimension: 'ratio', num: 1, den: 100, base: '1', max: 100 },
  // ── dimensionless count ───────────────────────────────────────────────
  count: { dimension: 'count', num: 1, den: 1, base: 'count' },
  // ── CPU cores, which the incident texts write in millicores ────────────
  //
  // A separate dimension rather than another `count`: `count` and `core` both mean "a number of
  // things", and a table that let them convert would add a restart count to a CPU quota without
  // complaining. `500m` in a Kubernetes-style text is `500 mcore`, and the 1/1000 factor is exact.
  core: { dimension: 'cores', num: 1, den: 1, base: 'core' },
  mcore: { dimension: 'cores', num: 1, den: 1e3, base: 'core' },
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

/** The range a reading in a unit can occupy: a lower bound and an upper one, possibly infinite. */
export interface MeasurementBounds {
  min: number;
  max: number;
}

/**
 * The range a reading in this unit can occupy, or `undefined` for a unit the table does not know.
 *
 * A reading is a *measurement*, and a measurement cannot report a value its unit does not admit: a
 * share above 100 % is not a noisy share, and a negative duration is not a small one. This is the
 * table's business because the table is the only place that knows what a unit is -- and the reason it
 * returns `undefined` rather than a guessed `[0, Infinity)` for an unknown unit is that a bound nobody
 * declared is a claim about someone else's unit (finding 252).
 *
 * The lower bound is zero for every unit here, and that is a statement rather than a default: time,
 * bytes, rate, ratio, count and cores are all counts of something, and none of them is signed. A
 * signed unit would need a `min` in `UnitDef` beside the `max`, and this table would grow one the day
 * a gauge like temperature arrives.
 */
export function measurementBounds(unit: string): MeasurementBounds | undefined {
  const def = UNITS[unit];
  if (def === undefined) return undefined;
  return { min: 0, max: def.max ?? Number.POSITIVE_INFINITY };
}

/**
 * Whether a reading in this unit can land between two whole numbers.
 *
 * A `count` is a number of things, and half of one is not a reading: a corpus that samples noise as
 * a fraction of the reading turned `200` records into `203.2` of them and one 504 response into
 * `1.02` of them (finding 284). Every other dimension in this table is a continuous quantity -- a
 * duration, a byte count, a rate and a share all land between two integers, and a share above a
 * ceiling is handled by `clampToUnit` rather than here. `cores` belongs with them rather than with
 * `count` for the reason its own comment gives: `500m` is a quantity stated in thousandths, not half
 * a processor.
 *
 * A unit the table does not know answers `true`. That is the same decision `measurementBounds` makes
 * when it returns `undefined` -- a rule nobody declared is a claim about someone else's unit -- and
 * the two have to agree in shape, or a guard built on this would refuse a reading the bounds could
 * not describe.
 */
export function admitsFraction(unit: string): boolean {
  const def = UNITS[unit];
  if (def === undefined) return true;
  return def.dimension !== 'count';
}

/**
 * A reading clamped into its unit's range.
 *
 * Used where a value is *derived* rather than declared: the corpus's sampling noise is a fraction of
 * the reading, so a share of exactly 1 came out as 1.02 -- a value no system can produce. At a bound
 * the noise is one-sided, which is what a real measurement at a ceiling looks like: there is nothing
 * above 100 % to be noisy about.
 *
 * Nothing is clamped when no unit is declared or the table does not know the unit, because there is
 * no bound to clamp against. `undefined` is returned never; the value comes back unchanged.
 */
export function clampToUnit(unit: string | undefined, value: number): number {
  if (unit === undefined) return value;
  const bounds = measurementBounds(unit);
  if (bounds === undefined) return value;
  return Math.min(Math.max(value, bounds.min), bounds.max);
}

/**
 * A reading put on the grid its unit admits, beside `clampToUnit`'s range.
 *
 * A unit says two things about a reading: how large it may be, and what it may land on. `clampToUnit`
 * holds the first and this holds the second, and the second exists because a corpus that samples
 * noise as a fraction of the reading produced `203.2` records and `1.02` of a 504 response -- values
 * inside the range of `count` and not on its grid (finding 284).
 *
 * Rounding rather than refusing, because the reader of a count is entitled to the nearest whole thing
 * and the direction is not a decision: a counter that accumulated 300 events over eight samples and a
 * reading that jitters around 200 have the same obligation, to land on an event.
 *
 * A unit the table does not know, and no unit at all, are returned unchanged -- the same decision
 * `admitsFraction` makes, for the same reason.
 */
export function quantizeToUnit(unit: string | undefined, value: number): number {
  if (unit === undefined) return value;
  return admitsFraction(unit) ? value : Math.round(value);
}

/** All units known to the converter, grouped by dimension. */export function knownUnits(): Record<Dimension, string[]> {
  const out: Record<Dimension, string[]> = {
    time: [],
    bytes: [],
    rate: [],
    ratio: [],
    count: [],
    cores: [],
  };
  for (const [name, def] of Object.entries(UNITS)) out[def.dimension].push(name);
  for (const key of Object.keys(out) as Dimension[]) out[key].sort();
  return out;
}
