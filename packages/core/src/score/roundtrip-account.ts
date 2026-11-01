/**
 * The round trip's enumeration gate, as an arithmetic value rather than a branch.
 *
 * ## The contradiction this replaces
 *
 * `scripts/check-official.mjs` states the rule twice, in two places, and the two
 * statements disagreed. The skip paragraph says a case the target refuses by its
 * own contract "is not a pass and not a failure -- it is reported and not
 * counted". The gate at the bottom compared `roundTripped` against `declared`,
 * which makes every such refusal a gap as well: `2 declared, 1 round-tripped` is
 * an inequality whatever the missing case's status is, and the sentence it printed
 * -- "no finding names the difference" -- was false, because the difference had a
 * name.
 *
 * Nothing could have noticed. Reaching the gate needs a run with no failure
 * recorded, and on every corpus this repository had ever round-tripped there was
 * no refusal to make one; the branch was published as `proved` on the strength of
 * a test that mentions the script (finding 342), and finding 343 is where the
 * disagreement was finally exercised -- by letting a directory's own fault
 * category survive the RE3 default, which produced the first refusal any corpus
 * here had ever carried.
 *
 * ## Why the arithmetic is a module
 *
 * Because the branch cannot be taken on purpose. Every path that drops a case
 * records a failure first, so a run that reaches the gate and fails it means a
 * path was added that drops a case silently -- and there is no input to write for
 * a path that does not exist. Extracting the sum turns the part that *can* be
 * tested -- the arithmetic, the sentence, the gap it names -- into a value with a
 * signature, and leaves the script holding one `if` whose only job is to exit.
 *
 * The equality is also printed on the passing path, by `line`, so it is evaluated
 * on every run instead of only on the runs that fail. A gate that is read only
 * when it fires is a gate whose arithmetic nobody has checked.
 */

/** The three numbers the gate compares. */
export interface RoundTripTally {
  /** Cases the descriptor file declares. */
  readonly declared: number;
  /** Cases that reached a score under the target's own rule. */
  readonly roundTripped: number;
  /** Cases the target refused by its own contract, each named by the exporter. */
  readonly refused: number;
}

/** What the gate prints, and whether it has anything to complain about. */
export interface RoundTripAccount {
  /** Every declared case is either round-tripped or refused by contract. */
  readonly accounted: boolean;
  /** The equality, in the form the run prints whether or not it holds. */
  readonly line: string;
  /**
   * What is missing, for a caller to print as the failure. Empty when accounted.
   *
   * The refusal count is named in the gap rather than left implicit, because the
   * two ways a case can be absent are the whole subject: a reader who sees
   * `3 declared, 1 round-tripped` cannot tell a contract from a hole, and this
   * sentence is the only place that can.
   */
  readonly gap: string;
}

function requireCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${String(value)}`);
  }
}

/**
 * Compare what the round trip declared against what it accounted for.
 *
 * Throws on a count that cannot be one. A negative or fractional tally is not a
 * comparison with a surprising answer, it is a caller that computed the wrong
 * thing, and returning `accounted: false` for it would report that as a corpus
 * with missing cases.
 */
export function accountRoundTrip(tally: RoundTripTally): RoundTripAccount {
  requireCount('declared', tally.declared);
  requireCount('roundTripped', tally.roundTripped);
  requireCount('refused', tally.refused);

  const accounted = tally.roundTripped + tally.refused === tally.declared;
  return {
    accounted,
    line:
      `ROUNDTRIP ACCOUNTED ${String(tally.declared)} = ${String(tally.roundTripped)} round-tripped ` +
      `+ ${String(tally.refused)} refused by contract`,
    gap: accounted
      ? ''
      : `${String(tally.declared)} case(s) declared, ${String(tally.roundTripped)} round-tripped and ` +
        `${String(tally.refused)} refused by the target's own contract, and no finding names the rest`,
  };
}
