import {
  NUMERIC_COMPARATORS,
  SERIES_POINTS,
  isVocabularyMember,
  type NumericComparator,
  type SeriesPoint,
} from '../ir/types.js';
import { convertUnit, dimensionOf, isConvertible, type Dimension } from '../util/unit.js';

/**
 * The arithmetic a `derived` checkpoint states, and the only thing that can check it.
 *
 * ## The defect this exists for
 *
 * A derived checkpoint used to be a number and a `signalRef` naming one series -- and the number was
 * not that series' post value. `cp-processing-tripled` asserted `== 3` over
 * `per_message_processing_seconds`, whose post value is `0.06 s`; the 3 was `0.06 / 0.02`, and the
 * divisor appeared nowhere in the annotation. The guard could only check that the series existed, so
 * **two derived checkpoints could name the same series with different arithmetic and nothing would
 * disagree** (finding 244 left this open, finding 245 closes it).
 *
 * The repair is to make the arithmetic part of the annotation and evaluate it. This module is the
 * evaluator: a deliberately small grammar, no `eval`, and a unit algebra that catches the mistake a
 * number alone cannot -- `900 ms - 11 ms` is `889 ms`, while `900 ms - 11 s` is not a quantity at
 * all.
 *
 * ## The grammar
 *
 * ```
 * expression := term (('+' | '-') term)*
 * term       := unary (('*' | '/') unary)*
 * unary      := '-' unary | primary
 * primary    := number | reference | '(' expression ')'
 * number     := digit+ ('.' digit+)? (('e' | 'E') ('+' | '-')? digit+)?
 * reference  := identifier ('@' entity)? '.' point
 * identifier := [A-Za-z_][A-Za-z0-9_]*
 * entity     := [A-Za-z0-9_-]+
 * point      := a member of SERIES_POINTS
 * ```
 *
 * Thirteen lines of grammar is the whole language, and that is a decision rather than a limitation.
 * Every operator added is an operator the guard must evaluate the same way the annotator meant, and
 * an expression language that grew functions and conditionals would be a programming language with
 * no specification. Multiplication, division, addition, subtraction and parentheses cover every
 * derived quantity this corpus can state: a ratio of two readings and a difference of two readings.
 *
 * ## A reference names an entity as well as a metric
 *
 * `request_duration_p99_ms` is not a series. It is half of one: a reading is a quantity taken *on*
 * something, and production telemetry carries the same metric on many things at once -- every node
 * of a cluster reports its own view of the member count, and a partition is precisely the case where
 * two of them disagree. The first version of this module resolved a bare identifier against a map
 * keyed on the metric name and read whichever entry came first, and that was safe only because the
 * corpus guard refused two series with one name: **a rule that held because another rule refused the
 * input**. The moment a case may declare one metric on two entities, the evaluator has to answer the
 * question itself -- and it is the only place that can, because a checkpoint's `entityRef` is not part
 * of the arithmetic.
 *
 * So a reference may name the entity, as `cluster_members_visible@search-node-4.post`, and a bare
 * reference resolves only when exactly one entity carries the metric. Two carriers is a refusal
 * naming both; a named entity that carries nothing is a refusal listing the carriers. The entity is
 * spelled the way the signals file spells a series' `service`, because that is the string both sides
 * of the join actually hold.
 *
 * ## Units: symbols with exponents, and the repository's conversion table where it applies
 *
 * A quantity here is `(number, unit)`, where the unit is a map from symbol to integer exponent. `*`
 * and `/` add and subtract exponents; `+` and `-` need the two sides to be the same quantity, which
 * is a weaker condition than "the same spelling":
 *
 * - the same map is the same unit, so `ms + ms` adds directly;
 * - two *atomic* units that `util/unit.ts` calls convertible are the same dimension, so the right
 *   operand is converted into the left one's unit before the addition -- `900 ms - 0.9 s` is `0 ms`,
 *   and `50 % + 0.2 1` is `70 %`;
 * - anything else is a mismatch, and the message names both dimensions when the table knows them.
 *
 * The first draft required the *same spelling* for `+` and `-`, which refused `ms + s` -- a
 * legitimate conversion stated as an error. `util/unit.ts` already held the conversion factors and
 * was already what G2 asks whether a unit exists, so the algebra had a second, stricter opinion
 * about units than the rest of the package (finding 246).
 *
 * **The limit that remains:** compound units are compared structurally, not dimensionally. `MiB/s`
 * and `KiB/s` are different units to this module even though a conversion exists between them,
 * because turning a compound into base dimensions would also have to decide what `MiB/s` *renders*
 * as after an addition, and a rendering nobody wrote is worse than a refusal. A series whose unit is
 * not made of atomic symbols joined by `*`, `/` or `^` is reported as unsupported rather than guessed
 * at.
 *
 * ## Floating point, stated rather than hidden
 *
 * `0.06 / 0.02` is `2.9999999999999996`, so an exact `==` would reject the correct annotation. The
 * comparisons therefore allow a relative tolerance of `1e-9`, applied so that a difference inside the
 * tolerance counts as *equal* for every comparator -- `>` is `computed - stated > tolerance`, not
 * `computed > stated`. The alternative, tolerance only for `==`, would let `>=` fail on a value that
 * came out one ulp low, which is the same defect at a different operator.
 *
 * ## One problem per call
 *
 * Evaluation stops at the first problem. An expression is one assertion, and after a reference fails
 * to resolve the remaining terms are not values -- reporting a second and third consequence of the
 * first mistake would say less than reporting the first.
 */

/** The relative tolerance within which two computed quantities count as equal. */
export const RELATIVE_TOLERANCE = 1e-9;

/** How deeply parentheses may nest before the parser refuses the expression. */
export const MAX_EXPRESSION_DEPTH = 32;

/**
 * One series as an expression sees it: which entity carries it, its metric name, its unit, and the
 * points it declares.
 *
 * `entity` is required rather than optional. A reading is a quantity on something, and an optional
 * field would let a caller build a series with no carrier -- which is the shape the module comment
 * calls out: the reference is a pair, or it is not a reference.
 */
export interface ExpressionSeries {
  /** The entity the reading was taken on, spelled as the signals file spells a series' `service`. */
  entity: string;
  metric: string;
  unit: string;
  points: Partial<Record<SeriesPoint, number>>;
}

/** One reading an expression took, named by the pair that identifies it. */
export interface ExpressionReference {
  entity: string;
  metric: string;
  point: SeriesPoint;
}

/** What an expression evaluated to: a number, the unit that number is in, and what it read. */
export interface ExpressionValue {
  value: number;
  unit: string;
  references: ExpressionReference[];
}

/**
 * Why an expression could not be evaluated.
 *
 * Each kind is one repair. `at` is a character offset into the text so the message can point at the
 * position rather than describe the concept -- an author looking at `2 * 3 +` needs the end of the
 * string, not "syntax error".
 */
export type ExpressionProblem =
  | { kind: 'syntax'; at: number; expected: string }
  | { kind: 'tooDeep'; at: number }
  | { kind: 'unknownPoint'; at: number; point: string }
  | { kind: 'unknownSeries'; metric: string }
  /** A reference named an entity, and no declared series carries that metric there. */
  | { kind: 'unknownEntity'; metric: string; entity: string; carriers: string[] }
  /** A bare reference to a metric that more than one entity carries. */
  | { kind: 'ambiguousSeries'; metric: string; carriers: string[] }
  | { kind: 'missingPoint'; metric: string; point: SeriesPoint }
  | { kind: 'unsupportedUnit'; unit: string }
  | {
      kind: 'unitMismatch';
      operator: '+' | '-';
      left: string;
      right: string;
      /** The dimension `util/unit.ts` gives the left unit, when it knows the unit at all. */
      leftDimension?: Dimension;
      rightDimension?: Dimension;
    }
  | { kind: 'divisionByZero'; at: number }
  | { kind: 'notFinite' };

/** Evaluation either produced a quantity or named the one thing that stopped it. */
export type ExpressionOutcome = { ok: true; value: ExpressionValue } | { ok: false; problem: ExpressionProblem };

type ReferenceNode = {
  kind: 'reference';
  /** Present only when the text named one: a bare reference is resolved, not assumed. */
  entity?: string;
  metric: string;
  point: SeriesPoint;
  at: number;
};

type Node =
  | { kind: 'number'; value: number }
  | ReferenceNode
  | { kind: 'negate'; operand: Node }
  | { kind: 'binary'; operator: '+' | '-' | '*' | '/'; left: Node; right: Node; at: number };

/** A unit as symbol-exponent pairs. Empty means dimensionless, which is written `1`. */
type Unit = Map<string, number>;

interface Cursor {
  text: string;
  at: number;
  depth: number;
}

class Unreadable extends Error {
  constructor(readonly problem: ExpressionProblem) {
    super(problem.kind);
  }
}

function skipSpace(cursor: Cursor): void {
  while (cursor.at < cursor.text.length && /\s/.test(cursor.text.charAt(cursor.at))) cursor.at += 1;
}

function readPattern(cursor: Cursor, pattern: RegExp): string | undefined {
  const match = pattern.exec(cursor.text.slice(cursor.at));
  if (match === null) return undefined;
  cursor.at += match[0].length;
  return match[0];
}

/**
 * The two leaves, and why they answer `undefined` instead of raising.
 *
 * A number leaf cannot fail: the caller has already looked at the first character and only calls it
 * when that character is a digit, so its own "not a number" throw was unreachable -- a refusal that
 * no input could produce, in the parser whose whole job is refusing. Returning `undefined` moves the
 * refusal to the one place that knows what the alternatives were, and leaves each leaf with a single
 * question: can I read something here?
 */
function numberNode(cursor: Cursor): Node | undefined {
  const literal = readPattern(cursor, /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (literal === undefined) return undefined;
  return { kind: 'number', value: Number(literal) };
}

function referenceNode(cursor: Cursor): Node | undefined {
  const at = cursor.at;
  const metric = readPattern(cursor, /^[A-Za-z_][A-Za-z0-9_]*/);
  if (metric === undefined) return undefined;
  let entity: string | undefined;
  if (cursor.text.charAt(cursor.at) === '@') {
    cursor.at += 1;
    const entityAt = cursor.at;
    entity = readPattern(cursor, /^[A-Za-z0-9_-]+/);
    if (entity === undefined) {
      throw new Unreadable({ kind: 'syntax', at: entityAt, expected: `an entity name after the '@' on '${metric}'` });
    }
  }
  const written = entity === undefined ? metric : `${metric}@${entity}`;
  if (cursor.text.charAt(cursor.at) !== '.') {
    throw new Unreadable({ kind: 'syntax', at: cursor.at, expected: `"." after the series name '${written}'` });
  }
  cursor.at += 1;
  const pointAt = cursor.at;
  const point = readPattern(cursor, /^[A-Za-z][A-Za-z0-9_]*/);
  if (point === undefined) {
    throw new Unreadable({ kind: 'syntax', at: cursor.at, expected: 'a series point after the "."' });
  }
  const known = SERIES_POINTS.some((candidate) => candidate === point);
  if (!known) {
    // The offset is the point's, not the reference's: `foo.after` is wrong at `after`, and a caret
    // under `foo` would send the author to the metric name, which is right.
    throw new Unreadable({ kind: 'unknownPoint', at: pointAt, point });
  }
  return entity === undefined
    ? { kind: 'reference', metric, point: point as SeriesPoint, at }
    : { kind: 'reference', entity, metric, point: point as SeriesPoint, at };
}

function primary(cursor: Cursor): Node {
  skipSpace(cursor);
  if (cursor.text.charAt(cursor.at) === '(') {
    const opened = cursor.at;
    cursor.at += 1;
    cursor.depth += 1;
    if (cursor.depth > MAX_EXPRESSION_DEPTH) {
      throw new Unreadable({ kind: 'tooDeep', at: opened });
    }
    const inner = sum(cursor);
    skipSpace(cursor);
    if (cursor.text.charAt(cursor.at) !== ')') {
      throw new Unreadable({ kind: 'syntax', at: cursor.at, expected: '")"' });
    }
    cursor.at += 1;
    cursor.depth -= 1;
    return inner;
  }
  const number = numberNode(cursor);
  if (number !== undefined) return number;
  const reference = referenceNode(cursor);
  if (reference !== undefined) return reference;
  throw new Unreadable({
    kind: 'syntax',
    at: cursor.at,
    expected: cursor.at >= cursor.text.length ? 'more of the expression' : 'a number, a series reference or "("',
  });
}

function unary(cursor: Cursor): Node {
  skipSpace(cursor);
  if (cursor.text.charAt(cursor.at) === '-') {
    cursor.at += 1;
    return { kind: 'negate', operand: unary(cursor) };
  }
  return primary(cursor);
}

function product(cursor: Cursor): Node {
  let left = unary(cursor);
  for (;;) {
    skipSpace(cursor);
    const operator = cursor.text.charAt(cursor.at);
    if (operator !== '*' && operator !== '/') return left;
    const at = cursor.at;
    cursor.at += 1;
    left = { kind: 'binary', operator, left, right: unary(cursor), at };
  }
}

function sum(cursor: Cursor): Node {
  let left = product(cursor);
  for (;;) {
    skipSpace(cursor);
    const operator = cursor.text.charAt(cursor.at);
    if (operator !== '+' && operator !== '-') return left;
    const at = cursor.at;
    cursor.at += 1;
    left = { kind: 'binary', operator, left, right: product(cursor), at };
  }
}

/**
 * Parse an expression, or name the position at which it stopped being one.
 *
 * Trailing text is a failure rather than a suffix to ignore: `3 4` and `a.post b.post` are two
 * quantities with no operator between them, and reading the first and discarding the second would
 * report a value for an expression nobody wrote.
 */
function parseExpression(text: string): Node {
  const cursor: Cursor = { text, at: 0, depth: 0 };
  const node = sum(cursor);
  skipSpace(cursor);
  if (cursor.at < text.length) {
    throw new Unreadable({ kind: 'syntax', at: cursor.at, expected: 'an operator, or the end of the expression' });
  }
  return node;
}

/**
 * A unit string as symbol-exponent pairs, or `undefined` when this module cannot read it.
 *
 * Supported: atomic symbols (`ms`, `%`, `count`, `MiB`), `1` for dimensionless, `*` and `·` between
 * factors, `/` for a denominator, and `^` with a positive integer exponent. Anything else -- a
 * function, a bracket, a decimal exponent -- is unsupported, and the caller reports that rather than
 * treating the unit as dimensionless, which would silently make the arithmetic check nothing.
 */
function parseUnit(text: string): Unit | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const exponents: Unit = new Map();
  let at = 0;
  let sign = 1;
  let expectingAtom = true;
  while (at < trimmed.length) {
    const char = trimmed.charAt(at);
    if (/\s/.test(char)) {
      at += 1;
      continue;
    }
    if (char === '*' || char === '·' || char === '/') {
      if (expectingAtom) return undefined;
      sign = char === '/' ? -1 : 1;
      expectingAtom = true;
      at += 1;
      continue;
    }
    if (char === '1') {
      // `1` is how a dimensionless quantity is written; `1` inside a product (`1/s`) means the same.
      if (!expectingAtom) return undefined;
      at += 1;
      expectingAtom = false;
      continue;
    }
    const symbol = /^[A-Za-z%µ][A-Za-z0-9%_]*/.exec(trimmed.slice(at));
    if (symbol === null || !expectingAtom) return undefined;
    at += symbol[0].length;
    let exponent = 1;
    if (trimmed.charAt(at) === '^') {
      const digits = /^\^(\d+)/.exec(trimmed.slice(at));
      if (digits === null) return undefined;
      exponent = Number(digits[1]);
      if (exponent === 0) return undefined;
      at += digits[0].length;
    }
    const total = (exponents.get(symbol[0]) ?? 0) + sign * exponent;
    if (total === 0) exponents.delete(symbol[0]);
    else exponents.set(symbol[0], total);
    expectingAtom = false;
  }
  if (expectingAtom) return undefined;
  return exponents;
}

/** A unit in the one spelling a checkpoint has to match: sorted, `·`-joined, `/` before the denominator. */
function renderUnit(unit: Unit): string {
  if (unit.size === 0) return '1';
  // Two entries never share a symbol -- `Unit` is a `Map`, and `combineUnits` deletes a symbol whose
  // exponent reaches zero -- so the comparator has two outcomes rather than three. The `0` arm this
  // used to carry was unreachable, and a sort comparator with an arm no input can produce is the
  // same defect as a refusal no input can reach.
  const entries = [...unit.entries()].sort((left, right) => (left[0] < right[0] ? -1 : 1));
  const factor = (symbol: string, exponent: number): string => (exponent === 1 ? symbol : `${symbol}^${String(exponent)}`);
  const numerator = entries
    .filter(([, exponent]) => exponent > 0)
    .map(([symbol, exponent]) => factor(symbol, exponent))
    .join('·');
  const denominator = entries
    .filter(([, exponent]) => exponent < 0)
    .map(([symbol, exponent]) => factor(symbol, -exponent))
    .join('·');
  if (denominator === '') return numerator;
  return `${numerator === '' ? '1' : numerator}/${denominator}`;
}

function combineUnits(left: Unit, right: Unit, scale: 1 | -1): Unit {
  const combined: Unit = new Map(left);
  for (const [symbol, exponent] of right) {
    const total = (combined.get(symbol) ?? 0) + scale * exponent;
    if (total === 0) combined.delete(symbol);
    else combined.set(symbol, total);
  }
  return combined;
}

function sameUnit(left: Unit, right: Unit): boolean {
  if (left.size !== right.size) return false;
  for (const [symbol, exponent] of left) {
    if (right.get(symbol) !== exponent) return false;
  }
  return true;
}

/**
 * The symbol of a unit that is one symbol to the first power, `'1'` for dimensionless, and
 * `undefined` for anything else.
 *
 * Dimensionless is `'1'` rather than nothing because that is what it is called: the empty map renders
 * as `1`, and `util/unit.ts` has an entry for it in the `ratio` dimension beside `%`. Returning
 * `undefined` would make `50 % + 0.2` a mismatch between a ratio and nothing, which is a refusal of
 * a conversion the table can do.
 */
function atomicSymbol(unit: Unit): string | undefined {
  // Counted in the loop rather than checked against `size` first, so every branch here is reachable:
  // an early `size === 1` guard would leave a destructuring that the compiler types as possibly
  // absent and a bound check that no input could ever take.
  let symbol: string | undefined = '1';
  let seen = 0;
  for (const [name, exponent] of unit) {
    if (exponent !== 1) return undefined;
    symbol = name;
    seen += 1;
  }
  return seen > 1 ? undefined : symbol;
}

/** `dimensionOf`, for a symbol that may not be a unit the repository knows. */
function dimensionOfSymbol(symbol: string | undefined): Dimension | undefined {
  if (symbol === undefined) return undefined;
  try {
    return dimensionOf(symbol);
  } catch {
    return undefined;
  }
}

/**
 * `+` and `-`, with the conversions `util/unit.ts` knows.
 *
 * The result keeps the *left* operand's unit, because that is the spelling the author wrote first
 * and the one they will read the answer in. Converting to a canonical base instead would render
 * `900 ms - 0.9 s` as `0 s`, which is the same quantity and not the same sentence.
 */
function addOrSubtract(operator: '+' | '-', left: Quantity, right: Quantity): Quantity {
  if (sameUnit(left.unit, right.unit)) {
    return {
      value: operator === '+' ? left.value + right.value : left.value - right.value,
      unit: left.unit,
    };
  }
  const leftSymbol = atomicSymbol(left.unit);
  const rightSymbol = atomicSymbol(right.unit);
  if (leftSymbol !== undefined && rightSymbol !== undefined && isConvertible(rightSymbol, leftSymbol)) {
    const converted = convertUnit(right.value, rightSymbol, leftSymbol);
    return {
      value: operator === '+' ? left.value + converted : left.value - converted,
      unit: left.unit,
    };
  }
  // Both dimensions or neither: the message prints them as a pair, and a problem carrying one half
  // would describe a fact the reader never sees -- the same shape as a field nothing reads.
  const leftDimension = dimensionOfSymbol(leftSymbol);
  const rightDimension = dimensionOfSymbol(rightSymbol);
  const dimensions =
    leftDimension === undefined || rightDimension === undefined
      ? {}
      : { leftDimension, rightDimension };
  throw new Unreadable({
    kind: 'unitMismatch',
    operator,
    left: renderUnit(left.unit),
    right: renderUnit(right.unit),
    ...dimensions,
  });
}

interface Quantity {
  value: number;
  unit: Unit;
}

/**
 * What an evaluation carries: the series it may read, keyed by metric, and the readings it took.
 *
 * Keyed by metric and holding a *list*, because the metric alone does not identify a series. The
 * empty bucket is not possible here -- the index is built from the series, one push per series -- so
 * a metric that is in the map has at least one carrier, which is what lets `resolveSeries` treat
 * "absent" and "present but empty" as one case.
 */
interface Evaluation {
  readonly index: ReadonlyMap<string, readonly ExpressionSeries[]>;
  readonly references: ExpressionReference[];
}

/**
 * The series a reference names, or the one thing that stopped it resolving.
 *
 * Three outcomes rather than two, and the third is the point of the pair. `unknownSeries` is a metric
 * no entity carries; `unknownEntity` is a metric that exists on other entities; `ambiguousSeries` is
 * a bare reference to a metric more than one entity carries. Collapsing the last two into "not
 * found" would tell an author their metric does not exist when what is missing is a decision.
 */
function resolveSeries(
  index: ReadonlyMap<string, readonly ExpressionSeries[]>,
  node: ReferenceNode,
): ExpressionSeries {
  const candidates = index.get(node.metric);
  if (candidates === undefined) throw new Unreadable({ kind: 'unknownSeries', metric: node.metric });
  const carriers = candidates.map((one) => one.entity);
  if (node.entity !== undefined) {
    const named = candidates.filter((one) => one.entity === node.entity);
    if (named.length === 1) return named[0]!;
    // Two series with one metric on one entity is refused by the signals file, so this arm is not
    // reachable from a well-formed case. It is here because the module is total: a caller that
    // handed in a duplicate gets a refusal, not whichever came first.
    if (named.length > 1) throw new Unreadable({ kind: 'ambiguousSeries', metric: node.metric, carriers });
    throw new Unreadable({ kind: 'unknownEntity', metric: node.metric, entity: node.entity, carriers });
  }
  if (candidates.length === 1) return candidates[0]!;
  throw new Unreadable({ kind: 'ambiguousSeries', metric: node.metric, carriers });
}

function evaluate(node: Node, state: Evaluation): Quantity {
  switch (node.kind) {
    case 'number':
      return { value: node.value, unit: new Map() };
    case 'negate': {
      const operand = evaluate(node.operand, state);
      return { value: -operand.value, unit: operand.unit };
    }
    case 'reference': {
      const declared = resolveSeries(state.index, node);
      const unit = parseUnit(declared.unit);
      if (unit === undefined) throw new Unreadable({ kind: 'unsupportedUnit', unit: declared.unit });
      const value = declared.points[node.point];
      if (typeof value !== 'number') {
        throw new Unreadable({ kind: 'missingPoint', metric: node.metric, point: node.point });
      }
      // Recorded where it resolved, not by a second walk of the tree: a walk would look the metric up
      // again and could name an entity this evaluation never read, which is two answers to one
      // question. The reading is the pair, so the reference reports the pair.
      const seen = state.references.some(
        (one) => one.entity === declared.entity && one.metric === node.metric && one.point === node.point,
      );
      if (!seen) state.references.push({ entity: declared.entity, metric: node.metric, point: node.point });
      return { value, unit };
    }
    case 'binary': {
      const left = evaluate(node.left, state);
      const right = evaluate(node.right, state);
      if (node.operator === '+' || node.operator === '-') {
        return addOrSubtract(node.operator, left, right);
      }
      if (node.operator === '*') {
        return { value: left.value * right.value, unit: combineUnits(left.unit, right.unit, 1) };
      }
      if (right.value === 0) throw new Unreadable({ kind: 'divisionByZero', at: node.at });
      return { value: left.value / right.value, unit: combineUnits(left.unit, right.unit, -1) };
    }
  }
}

/**
 * Evaluate an expression against the series a case declares.
 *
 * The series are passed in rather than looked up by the caller so that "the metric does not exist"
 * and "the metric has no value at that point" are problems this module names, in the position they
 * were read -- a caller with its own lookup would have to invent both messages, and two callers would
 * invent them differently.
 */
export function evaluateExpression(text: string, series: readonly ExpressionSeries[]): ExpressionOutcome {
  const index = new Map<string, ExpressionSeries[]>();
  for (const one of series) {
    const bucket = index.get(one.metric);
    if (bucket === undefined) index.set(one.metric, [one]);
    else bucket.push(one);
  }
  const state: Evaluation = { index, references: [] };
  let quantity: Quantity;
  // One `catch`, so there is one place that decides what an unreadable expression is and one place
  // that rethrows something else. Two of each is two chances to swallow a bug as a syntax error --
  // and `Unreadable` is the only thing this module throws on purpose.
  try {
    const node = parseExpression(text);
    quantity = evaluate(node, state);
  } catch (error) {
    if (error instanceof Unreadable) return { ok: false, problem: error.problem };
    throw error;
  }
  if (!Number.isFinite(quantity.value)) return { ok: false, problem: { kind: 'notFinite' } };
  return {
    ok: true,
    value: { value: quantity.value, unit: renderUnit(quantity.unit), references: state.references },
  };
}

/**
 * Whether a computed value satisfies a numeric assertion, allowing for floating point.
 *
 * See the module comment: a difference inside the tolerance counts as equal for every comparator, so
 * `2.9999999999999996 >= 3` holds and `2.9999999999999996 > 3` does not.
 */
export function holdsWithTolerance(
  comparator: NumericComparator,
  computed: number,
  stated: number,
): boolean {
  const scale = Math.max(Math.abs(computed), Math.abs(stated), 1);
  const difference = computed - stated;
  if (Math.abs(difference) <= RELATIVE_TOLERANCE * scale) {
    // Inside the tolerance the two are *equal*, and `>` and `<` are false of equal numbers.
    return comparator === '==' || comparator === '>=' || comparator === '<=';
  }
  return compareExactly(comparator, computed, stated);
}

/**
 * Whether two numbers satisfy a comparator, exactly.
 *
 * The one implementation of "compare two numbers with a comparator" in the package. It was three:
 * the corpus guard had a ternary chain of its own for a series' post value, this module had a switch
 * for computed values, and the configuration branch would have needed a third. Three copies of four
 * operators is three chances for one of them to treat `>=` as `>`.
 *
 * Exact, not tolerant: a series' post value and a case's declared parameter are both literals someone
 * wrote, so a difference between them is a mistake rather than floating-point drift. The tolerance
 * belongs to values this package *computed*, which is why it lives in `holdsWithTolerance`.
 */
export function compareExactly(comparator: NumericComparator, left: number, right: number): boolean {
  switch (comparator) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '==':
      return left === right;
    case '!=':
      return left !== right;
  }
}

/**
 * Whether a comparator is one this module can evaluate.
 *
 * Reads `NUMERIC_COMPARATORS` through `isVocabularyMember`, the helper `ir/types.ts` provides for
 * exactly this -- so the tuple stays the only place the members are written, and the narrowing to
 * the member type comes from the tuple rather than from a cast at the call site.
 */
export function isNumericComparator(comparator: string): comparator is NumericComparator {
  return isVocabularyMember(NUMERIC_COMPARATORS, comparator);
}

/** One sentence per problem, in the terms the annotation is written in. */
export function describeExpressionProblem(problem: ExpressionProblem): string {
  switch (problem.kind) {
    case 'syntax':
      return `is not arithmetic I can read: at character ${String(problem.at)} I expected ${problem.expected}`;
    case 'tooDeep':
      return `nests parentheses more than ${String(MAX_EXPRESSION_DEPTH)} deep, which is past the limit this grammar accepts`;
    case 'unknownPoint':
      return (
        `reads the point '${problem.point}' at character ${String(problem.at)}, ` +
        `which is not one of ${SERIES_POINTS.join(', ')}`
      );
    case 'unknownSeries':
      return `reads '${problem.metric}', which the signals file does not declare`;
    case 'unknownEntity':
      return (
        `reads '${problem.metric}@${problem.entity}', and no declared series carries '${problem.metric}' ` +
        `on that entity (it is carried by: ${problem.carriers.join(', ')})`
      );
    case 'ambiguousSeries':
      return (
        `reads '${problem.metric}', which ${String(problem.carriers.length)} entities carry ` +
        `(${problem.carriers.join(', ')}), so a reference to it has to say which: ` +
        `'${problem.metric}@<entity>.post'`
      );
    case 'missingPoint':
      return `reads '${problem.metric}.${problem.point}', and that series declares no ${problem.point} value`;
    case 'unsupportedUnit':
      return `works over a unit '${problem.unit}' that this grammar cannot multiply (atomic symbols, '*' or '/', and '^' exponents)`;
    case 'unitMismatch': {
      const dimensions =
        problem.leftDimension === undefined || problem.rightDimension === undefined
          ? ''
          : ` (${problem.leftDimension} and ${problem.rightDimension})`;
      return (
        `'${problem.operator}' joins '${problem.left}' and '${problem.right}', ` +
        `which are not the same unit${dimensions}`
      );
    }
    case 'divisionByZero':
      return `divides by zero at character ${String(problem.at)}`;
    case 'notFinite':
      return 'evaluates to a value that is not finite';
  }
}
