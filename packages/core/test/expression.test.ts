import { describe, expect, it } from 'vitest';

import { NUMERIC_COMPARATORS, SERIES_POINTS } from '../src/ir/types.js';
import {
  MAX_EXPRESSION_DEPTH,
  RELATIVE_TOLERANCE,
  describeExpressionProblem,
  evaluateExpression,
  holdsWithTolerance,
  isNumericComparator,
  type ExpressionSeries,
} from '../src/fault/expression.js';

/**
 * The arithmetic a `derived` checkpoint states.
 *
 * The defect this module answers (finding 245) was that a derived checkpoint named one series and
 * kept its computation in its number, so `== 3` over a series whose post value is `0.06` was a claim
 * nothing could check -- and two derived checkpoints could state different arithmetic over the same
 * series and both pass. Every test below therefore asserts a *value that came out of the data*, not
 * that the parser accepted the text.
 *
 * The evaluator is a recursive-descent parser over twelve lines of grammar, so the tests are the
 * grammar: precedence, associativity, unary minus, every leaf, every refusal. A grammar tested only
 * on the expressions the corpus happens to contain is a grammar whose other half is untested until
 * an author writes it.
 */

function series(metric: string, unit: string, points: Partial<Record<'baseline' | 'post', number>>): ExpressionSeries {
  return { metric, unit, points };
}

/** The processing time a `tripled` claim is about: 0.02 s before the change, 0.06 s after. */
const PROCESSING = series('per_message_processing_seconds', 's', { baseline: 0.02, post: 0.06 });
const CLIENT = series('client_span_duration_ms', 'ms', { baseline: 12, post: 900 });
const HANDLER = series('server_handler_time_ms', 'ms', { baseline: 11, post: 11 });

function valueOf(text: string, seriesList: readonly ExpressionSeries[] = [PROCESSING, CLIENT, HANDLER]): number {
  const outcome = evaluateExpression(text, seriesList);
  if (!outcome.ok) throw new Error(`expected '${text}' to evaluate, got ${describeExpressionProblem(outcome.problem)}`);
  return outcome.value.value;
}

function problemOf(text: string, seriesList: readonly ExpressionSeries[] = [PROCESSING, CLIENT, HANDLER]) {
  const outcome = evaluateExpression(text, seriesList);
  if (outcome.ok) throw new Error(`expected '${text}' to be refused, got ${String(outcome.value.value)}`);
  return outcome.problem;
}

describe('expression · arithmetic', () => {
  it('multiplies before it adds', () => {
    expect(valueOf('2 + 3 * 4')).toBe(14);
    expect(valueOf('(2 + 3) * 4')).toBe(20);
  });

  it('subtracts and divides from the left, the way the operators are written', () => {
    // `10 - 3 - 4` is 3 and not 11, and `8 / 4 / 2` is 1 and not 4. A right-associative reading of
    // either would still parse, so this is the assertion that pins which one the grammar is.
    expect(valueOf('10 - 3 - 4')).toBe(3);
    expect(valueOf('8 / 4 / 2')).toBe(1);
    expect(valueOf('20 / 4 - 2')).toBe(3);
  });

  it('reads a decimal and an exponent', () => {
    expect(valueOf('0.5 * 4')).toBe(2);
    expect(valueOf('1e3 + 1')).toBe(1001);
    expect(valueOf('1.5e-2 * 100')).toBeCloseTo(1.5, 12);
  });

  it('negates, and negates a parenthesised sum', () => {
    expect(valueOf('-2 * 3')).toBe(-6);
    expect(valueOf('-(2 + 3)')).toBe(-5);
    expect(valueOf('--3')).toBe(3);
  });

  it('ignores whitespace anywhere between tokens', () => {
    expect(valueOf('  2  *  ( 3 + 4 )  ')).toBe(14);
  });
});

describe('expression · references', () => {
  it('reads the point the reference names, and only that point', () => {
    // The two points of one series are different numbers; a parser that accepted `.post` and read
    // `baseline` would pass a test that only ever used one of them.
    expect(valueOf('per_message_processing_seconds.post')).toBe(0.06);
    expect(valueOf('per_message_processing_seconds.baseline')).toBe(0.02);
  });

  it('computes the ratio the corpus states, to a value in 1', () => {
    const outcome = evaluateExpression(
      'per_message_processing_seconds.post / per_message_processing_seconds.baseline',
      [PROCESSING],
    );
    if (!outcome.ok) throw new Error(describeExpressionProblem(outcome.problem));
    expect(outcome.value.unit).toBe('1');
    // `0.06 / 0.02` is 2.9999999999999996 in binary floating point, which is the whole reason the
    // comparison is tolerant. Asserting `3` exactly here would test the FPU, not the grammar.
    expect(holdsWithTolerance('==', outcome.value.value, 3)).toBe(true);
  });

  it('computes the difference between two series, in the unit they share', () => {
    const outcome = evaluateExpression('client_span_duration_ms.post - server_handler_time_ms.post', [
      CLIENT,
      HANDLER,
    ]);
    if (!outcome.ok) throw new Error(describeExpressionProblem(outcome.problem));
    expect(outcome.value).toEqual({
      value: 889,
      unit: 'ms',
      references: [
        { metric: 'client_span_duration_ms', point: 'post' },
        { metric: 'server_handler_time_ms', point: 'post' },
      ],
    });
  });

  it('reports each reading once, however often it is written', () => {
    const outcome = evaluateExpression(
      'client_span_duration_ms.post - client_span_duration_ms.post + client_span_duration_ms.baseline',
      [CLIENT],
    );
    if (!outcome.ok) throw new Error(describeExpressionProblem(outcome.problem));
    expect(outcome.value.references).toEqual([
      { metric: 'client_span_duration_ms', point: 'post' },
      { metric: 'client_span_duration_ms', point: 'baseline' },
    ]);
    expect(outcome.value.value).toBe(12);
  });

  it('resolves a metric declared twice to the first, so the guard can report the ambiguity', () => {
    // The evaluator does not refuse a duplicate: naming it is the corpus guard's job, and it does.
    // What this pins is that the evaluator is deterministic about which one it read, because
    // `new Map(pairs)` and a `for` loop would differ and only one of them is testable here.
    const first = series('request_duration_p99_ms', 'ms', { post: 4300 });
    const second = series('request_duration_p99_ms', 'ms', { post: 1 });
    expect(valueOf('request_duration_p99_ms.post', [first, second])).toBe(4300);
  });
});

describe('expression · units', () => {
  it('cancels a unit against itself', () => {
    expect(evaluateExpression('client_span_duration_ms.post / server_handler_time_ms.post', [CLIENT, series('server_handler_time_ms', 'ms', { post: 900 })])).toMatchObject({
      ok: true,
      value: { unit: '1', value: 1 },
    });
  });

  it('keeps the unit of a difference and of a sum', () => {
    expect(evaluateExpression('client_span_duration_ms.post - client_span_duration_ms.baseline', [CLIENT])).toMatchObject({
      ok: true,
      value: { unit: 'ms' },
    });
    expect(evaluateExpression('client_span_duration_ms.post + client_span_duration_ms.baseline', [CLIENT])).toMatchObject({
      ok: true,
      value: { unit: 'ms', value: 912 },
    });
  });

  it('multiplies units into a compound one', () => {
    const rate = series('bytes_per_second', 'MiB/s', { post: 4 });
    const seconds = series('window_seconds', 's', { post: 3 });
    expect(evaluateExpression('bytes_per_second.post * window_seconds.post', [rate, seconds])).toMatchObject({
      ok: true,
      value: { unit: 'MiB', value: 12 },
    });
  });

  it('renders a reciprocal with the 1 a person writes', () => {
    const perSecond = series('requests_per_second', '1/s', { post: 20 });
    // `1/s` is how the corpus writes "per second"; the evaluator has to parse it and render it back
    // in the same spelling, or a checkpoint could never state the unit it computes.
    expect(evaluateExpression('requests_per_second.post', [perSecond])).toMatchObject({ ok: true, value: { unit: '1/s' } });
    // And a unit with a numerator as well as a denominator renders both, which is the spelling a
    // checkpoint has to match exactly.
    expect(evaluateExpression('bytes_per_second.post', [series('bytes_per_second', 'MiB/s', { post: 4 })])).toMatchObject({
      ok: true,
      value: { unit: 'MiB/s' },
    });
    // A denominator whose symbol sorts before the numerator's, so the render sorts *against* insertion
    // order rather than passing through what the string said. `s/MiB` and `MiB/s` are different units
    // (seconds per byte, bytes per second) and the renderer has to keep them apart.
    expect(evaluateExpression('seconds_per_mib.post', [series('seconds_per_mib', 's/MiB', { post: 2 })])).toMatchObject({
      ok: true,
      value: { unit: 's/MiB' },
    });
    expect(evaluateExpression('1 / requests_per_second.post', [perSecond])).toMatchObject({ ok: true, value: { unit: 's' } });
  });

  it('renders a squared symbol with an exponent and reads it back', () => {
    expect(evaluateExpression('1 * 1', [])).toMatchObject({ ok: true, value: { unit: '1', value: 1 } });
    const area = series('area_m2', 'm^2', { post: 6 });
    const length = series('length_m', 'm', { post: 3 });
    expect(evaluateExpression('area_m2.post / length_m.post', [area, length])).toMatchObject({
      ok: true,
      value: { unit: 'm', value: 2 },
    });
    expect(evaluateExpression('length_m.post * length_m.post', [length])).toMatchObject({
      ok: true,
      value: { unit: 'm^2', value: 9 },
    });
  });

  it('reads a unit written with * as a product, and cancels a symbol against itself', () => {
    // The same algebra the expression operators use, applied to the unit string: `m*m/m` is `m`,
    // and a unit that writes its factors out is a unit this grammar has to read rather than a
    // spelling it can only refuse.
    const squared = series('flow_m_per_s', 'm*s/s', { post: 7 });
    expect(evaluateExpression('flow_m_per_s.post', [squared])).toMatchObject({ ok: true, value: { unit: 'm', value: 7 } });
  });

  it('refuses a unit that starts with an operator, which is a unit with no numerator', () => {
    expect(problemOf('odd.post', [series('odd', '*ms', { post: 1 })])).toEqual({ kind: 'unsupportedUnit', unit: '*ms' });
    expect(problemOf('odd.post', [series('odd', '/s', { post: 1 })])).toEqual({ kind: 'unsupportedUnit', unit: '/s' });
    expect(problemOf('odd.post', [series('odd', 'ms 1', { post: 1 })])).toEqual({ kind: 'unsupportedUnit', unit: 'ms 1' });
  });

  it('refuses to add quantities whose units differ in more than their symbol', () => {
    // `ms` and `ms·s` differ in size, not just in the exponent of one symbol: the comparison is over
    // the whole map, so a subset is not a match.
    const plain = series('plain_ms', 'ms', { post: 3 });
    const compound = series('compound_ms_s', 'ms*s', { post: 3 });
    expect(problemOf('plain_ms.post + compound_ms_s.post', [plain, compound])).toEqual({
      kind: 'unitMismatch',
      operator: '+',
      left: 'ms',
      right: 'ms·s',
    });
  });

  it('converts an atomic unit the repository already knows how to convert', () => {
    // The first draft refused this: `ms` and `s` are different symbols, so `+` and `-` demanded the
    // same *spelling*. `util/unit.ts` had the factors all along and G2 already asks it whether a
    // checkpoint's unit exists, so the algebra was the only place in the package that answered
    // "are these the same quantity?" with "are these the same word?" (finding 246).
    expect(
      valueOf('client_span_duration_ms.post - slow_seconds.post', [
        CLIENT,
        series('slow_seconds', 's', { post: 0.9 }),
      ]),
    ).toBe(0);
    expect(
      evaluateExpression('client_span_duration_ms.post - slow_seconds.post', [
        CLIENT,
        series('slow_seconds', 's', { post: 0.9 }),
      ]),
    ).toMatchObject({ ok: true, value: { unit: 'ms' } });
  });

  it('keeps the left operand\'s unit, which is the spelling the author wrote', () => {
    // Converting to a canonical base would render `1 min + 30 s` as `90 s`, the same quantity and not
    // the same sentence. The answer comes back in the unit the expression opened with.
    expect(
      evaluateExpression('window_minutes.post + window_seconds.post', [
        series('window_minutes', 'min', { post: 1 }),
        series('window_seconds', 's', { post: 30 }),
      ]),
    ).toMatchObject({ ok: true, value: { unit: 'min', value: 1.5 } });
  });

  it('converts between the two spellings of a ratio', () => {
    // `%` and `1` are the same dimension with different factors: 20 % is 0.2, so 50 % + 0.2 is 70 %.
    expect(
      evaluateExpression('failure_share_percent.post + failure_share.post', [
        series('failure_share_percent', '%', { post: 50 }),
        series('failure_share', '1', { post: 0.2 }),
      ]),
    ).toMatchObject({ ok: true, value: { unit: '%', value: 70 } });
  });

  it('refuses to add two quantities of different dimensions, and names both', () => {
    // The mistake a number alone cannot catch: `900 ms - 11 count` is not 889 of anything.
    expect(
      problemOf('client_span_duration_ms.post - restart_count.post', [
        CLIENT,
        series('restart_count', 'count', { post: 11 }),
      ]),
    ).toEqual({
      kind: 'unitMismatch',
      operator: '-',
      left: 'ms',
      right: 'count',
      leftDimension: 'time',
      rightDimension: 'count',
    });
  });

  it('reports no dimensions when the table does not know one of the units', () => {
    // `x` is not a unit `util/unit.ts` has an entry for, so the parenthetical is omitted rather than
    // half-filled: `(time and undefined)` would be a claim about a dimension nobody declared.
    const odd = series('odd_unit', 'x', { post: 2 });
    expect(problemOf('client_span_duration_ms.post + odd_unit.post', [CLIENT, odd])).toEqual({
      kind: 'unitMismatch',
      operator: '+',
      left: 'ms',
      right: 'x',
    });
  });

  it('compares a compound unit structurally, and says so when the table cannot help', () => {
    // A conversion exists between `MiB/s` and `KiB/s`, and this module does not apply it: making a
    // compound dimensional would also decide what it *renders* after an addition. The refusal is the
    // documented limit, and the message carries no dimensions because the table has no entry for a
    // compound.
    const left = series('throughput_mib', 'MiB/s', { post: 4 });
    const right = series('throughput_kib', 'KiB/s', { post: 4 });
    expect(problemOf('throughput_mib.post + throughput_kib.post', [left, right])).toEqual({
      kind: 'unitMismatch',
      operator: '+',
      left: 'MiB/s',
      right: 'KiB/s',
    });
  });

  it('refuses a unit it cannot read rather than treating it as dimensionless', () => {
    // A unit this module cannot multiply is a unit whose arithmetic it cannot check. Silently
    // reading it as `1` would make every comparison downstream meaningless.
    expect(problemOf('odd.post', [series('odd', 'per request', { post: 1 })])).toEqual({
      kind: 'unsupportedUnit',
      unit: 'per request',
    });
    expect(problemOf('odd.post', [series('odd', '', { post: 1 })])).toEqual({ kind: 'unsupportedUnit', unit: '' });
    expect(problemOf('odd.post', [series('odd', 'ms^', { post: 1 })])).toEqual({ kind: 'unsupportedUnit', unit: 'ms^' });
    expect(problemOf('odd.post', [series('odd', 'ms^0', { post: 1 })])).toEqual({ kind: 'unsupportedUnit', unit: 'ms^0' });
    expect(problemOf('odd.post', [series('odd', 'ms/', { post: 1 })])).toEqual({ kind: 'unsupportedUnit', unit: 'ms/' });
    expect(problemOf('odd.post', [series('odd', 'ms ms', { post: 1 })])).toEqual({ kind: 'unsupportedUnit', unit: 'ms ms' });
  });
});

describe('expression · refusal', () => {
  it('names the position at which a text stopped being arithmetic', () => {
    expect(problemOf('')).toEqual({ kind: 'syntax', at: 0, expected: 'more of the expression' });
    expect(problemOf('2 +')).toEqual({ kind: 'syntax', at: 3, expected: 'more of the expression' });
    expect(problemOf('2 * 3 + 4)')).toEqual({ kind: 'syntax', at: 9, expected: 'an operator, or the end of the expression' });
    expect(problemOf('(2 + 3')).toEqual({ kind: 'syntax', at: 6, expected: '")"' });
    expect(problemOf('2 3')).toEqual({ kind: 'syntax', at: 2, expected: 'an operator, or the end of the expression' });
    expect(problemOf('* 2')).toEqual({ kind: 'syntax', at: 0, expected: 'a number, a series reference or "("' });
  });

  it('requires the series name to be followed by a point', () => {
    expect(problemOf('per_message_processing_seconds')).toEqual({
      kind: 'syntax',
      at: 30,
      expected: '"." after the series name \'per_message_processing_seconds\'',
    });
    expect(problemOf('a.')).toEqual({ kind: 'syntax', at: 2, expected: 'a series point after the "."' });
  });

  it('reads the point from SERIES_POINTS, so a third point is a refusal rather than a wildcard', () => {
    const problem = problemOf('client_span_duration_ms.after');
    expect(problem).toEqual({ kind: 'unknownPoint', at: 24, point: 'after' });
    expect(describeExpressionProblem(problem)).toContain(`which is not one of ${SERIES_POINTS.join(', ')}`);
  });

  it('refuses a metric the signals file does not declare', () => {
    expect(problemOf('nope.post')).toEqual({ kind: 'unknownSeries', metric: 'nope' });
  });

  it('refuses a point the series declares no value for', () => {
    // A captured series may have no baseline; an expression over it is unanswerable, and the
    // difference between "no such metric" and "no such reading" is the difference between two
    // repairs.
    expect(valueOf('only_post.post', [series('only_post', 'count', { post: 4 })])).toBe(4);
    expect(problemOf('only_post.baseline', [series('only_post', 'count', { post: 4 })])).toEqual({
      kind: 'missingPoint',
      metric: 'only_post',
      point: 'baseline',
    });
  });

  it('refuses a division by zero at the position of the operator', () => {
    // Both sides are in `ms` so the subtraction is a quantity, and that quantity is zero: the
    // divisor is the difference of a reading from itself, not a bare `900` (which is dimensionless
    // and would have failed the unit algebra first -- correctly).
    expect(problemOf('client_span_duration_ms.post / (client_span_duration_ms.post - client_span_duration_ms.post)')).toEqual({
      kind: 'divisionByZero',
      at: 29,
    });
  });

  it('refuses a value that is not finite instead of reporting it', () => {
    // Guarded because `Infinity` in a checkpoint's number would satisfy `>=` against everything.
    expect(problemOf('1e308 * 1e308')).toEqual({ kind: 'notFinite' });
  });

  it('refuses parentheses past the depth limit rather than overflowing the stack', () => {
    const deep = `${'('.repeat(MAX_EXPRESSION_DEPTH + 1)}1${')'.repeat(MAX_EXPRESSION_DEPTH + 1)}`;
    expect(problemOf(deep)).toEqual({ kind: 'tooDeep', at: MAX_EXPRESSION_DEPTH });
    // One shallower and the same expression is fine, which is what makes the limit a limit rather
    // than a fence around the syntax.
    const allowed = `${'('.repeat(MAX_EXPRESSION_DEPTH)}1${')'.repeat(MAX_EXPRESSION_DEPTH)}`;
    expect(valueOf(allowed)).toBe(1);
  });

  it('lets a genuine bug through instead of reporting it as a bad expression', () => {
    // The evaluator rethrows anything it did not raise itself. A `SyntaxError` from a getter is a
    // defect in the data plumbing, and reporting it as "an expression I cannot read" would send the
    // author to the wrong file.
    const hostile = {
      metric: 'hostile',
      unit: 'ms',
      get points(): Partial<Record<'baseline' | 'post', number>> {
        throw new SyntaxError('the points object is a function, not a record');
      },
    };
    expect(() => evaluateExpression('hostile.post', [hostile])).toThrow(SyntaxError);
  });
});

describe('expression · the comparison the guard uses', () => {
  it('treats a difference inside the tolerance as equal for every comparator', () => {
    const computed = 0.06 / 0.02;
    expect(holdsWithTolerance('==', computed, 3)).toBe(true);
    expect(holdsWithTolerance('==', 3.0000001, 3)).toBe(false);
    expect(holdsWithTolerance('!=', computed, 3)).toBe(false);
    expect(holdsWithTolerance('!=', 3.001, 3)).toBe(true);
  });

  it('does not let the tolerance turn an ordering comparator into its opposite', () => {
    // `>` against a value that came out one ulp low is not `>`: the author wrote an assertion about
    // the data, and the tolerance exists to absorb binary representation, not to widen it.
    expect(holdsWithTolerance('>', 3, 3)).toBe(false);
    expect(holdsWithTolerance('>', 3.001, 3)).toBe(true);
    expect(holdsWithTolerance('>=', 2.9999999999999996, 3)).toBe(true);
    expect(holdsWithTolerance('<', 3, 3)).toBe(false);
    expect(holdsWithTolerance('<', 2.999, 3)).toBe(true);
    expect(holdsWithTolerance('<=', 3.0000000000000004, 3)).toBe(true);
    expect(holdsWithTolerance('>=', 4, 3)).toBe(true);
    expect(holdsWithTolerance('>=', 2, 3)).toBe(false);
    expect(holdsWithTolerance('<=', 2, 3)).toBe(true);
    expect(holdsWithTolerance('<=', 4, 3)).toBe(false);
  });

  it('scales the tolerance by the magnitude of the value, not by a fixed epsilon', () => {
    // A 1e-9 absolute epsilon would call `1e9` and `1e9 + 1` equal. The tolerance is relative, at
    // `RELATIVE_TOLERANCE`, and both boundaries are asserted here so neither can drift.
    expect(holdsWithTolerance('==', 1e9, 1e9 + 1e9 * RELATIVE_TOLERANCE * 0.5)).toBe(true);
    expect(holdsWithTolerance('==', 1e9, 1e9 + 1e9 * RELATIVE_TOLERANCE * 2)).toBe(false);
  });

  it('reads its vocabulary from NUMERIC_COMPARATORS, not from a list of its own', () => {
    for (const comparator of NUMERIC_COMPARATORS) expect(isNumericComparator(comparator)).toBe(true);
    expect(isNumericComparator('contains')).toBe(false);
    expect(isNumericComparator('matches')).toBe(false);
    expect(isNumericComparator('')).toBe(false);
  });
});

describe('expression · the sentences a problem becomes', () => {
  it('says where a syntax problem stopped, in characters', () => {
    expect(describeExpressionProblem({ kind: 'syntax', at: 4, expected: 'a number' })).toBe(
      'is not arithmetic I can read: at character 4 I expected a number',
    );
  });

  it('names the limit, the point, the metric, the unit and the operator it refused', () => {
    expect(describeExpressionProblem({ kind: 'tooDeep', at: 3 })).toContain(String(MAX_EXPRESSION_DEPTH));
    expect(describeExpressionProblem({ kind: 'unknownPoint', at: 24, point: 'after' })).toBe(
      "reads the point 'after' at character 24, which is not one of baseline, post",
    );
    expect(describeExpressionProblem({ kind: 'unknownSeries', metric: 'nope' })).toBe(
      "reads 'nope', which the signals file does not declare",
    );
    expect(describeExpressionProblem({ kind: 'missingPoint', metric: 'm', point: 'baseline' })).toBe(
      "reads 'm.baseline', and that series declares no baseline value",
    );
    expect(describeExpressionProblem({ kind: 'unsupportedUnit', unit: 'per request' })).toContain(
      "works over a unit 'per request'",
    );
    expect(
      describeExpressionProblem({
        kind: 'unitMismatch',
        operator: '-',
        left: 'ms',
        right: 'count',
        leftDimension: 'time',
        rightDimension: 'count',
      }),
    ).toBe("'-' joins 'ms' and 'count', which are not the same unit (time and count)");
    // No dimensions when the table does not know one of the two, because a parenthetical with one
    // half missing reads as a claim about the other half.
    expect(describeExpressionProblem({ kind: 'unitMismatch', operator: '-', left: 'ms', right: 'x' })).toBe(
      "'-' joins 'ms' and 'x', which are not the same unit",
    );
    expect(describeExpressionProblem({ kind: 'divisionByZero', at: 29 })).toBe('divides by zero at character 29');
    expect(describeExpressionProblem({ kind: 'notFinite' })).toBe('evaluates to a value that is not finite');
  });
});
