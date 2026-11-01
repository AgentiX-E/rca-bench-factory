import { describe, expect, it } from 'vitest';

import { accountRoundTrip } from '../src/score/roundtrip-account.js';

/**
 * The enumeration gate's arithmetic.
 *
 * The branch this replaces cannot be taken on purpose -- every path that drops a
 * case records a failure first -- so what can be tested is the sum, the sentence
 * it prints, and the gap it names. Each case below is one of the shapes the gate
 * has to tell apart.
 */
describe('accountRoundTrip', () => {
  it('counts a refusal as accounted for, which is the whole point', () => {
    // The pre-fix gate compared round-tripped against declared and called the
    // difference a gap. This tally is the one a corpus with an RE3 refusal
    // produces, and it is the tally that turned the run red while every case in
    // it had a name.
    const account = accountRoundTrip({ declared: 2, roundTripped: 1, refused: 1 });
    expect(account.accounted).toBe(true);
    expect(account.gap).toBe('');
  });

  it('prints the equality in the same shape whether or not it holds', () => {
    // One template for both outcomes, so a reader compares runs by reading the
    // same line rather than by noticing which of two sentences appeared.
    expect(accountRoundTrip({ declared: 2, roundTripped: 1, refused: 1 }).line).toBe(
      'ROUNDTRIP ACCOUNTED 2 = 1 round-tripped + 1 refused by contract',
    );
    expect(accountRoundTrip({ declared: 4, roundTripped: 2, refused: 1 }).line).toBe(
      'ROUNDTRIP ACCOUNTED 4 = 2 round-tripped + 1 refused by contract',
    );
  });

  it('says zero refusals out loud rather than leaving the term off', () => {
    // A line that drops the term when it is zero makes two runs with different
    // populations print the same width, and the reader has to remember which
    // shape means which.
    const account = accountRoundTrip({ declared: 3, roundTripped: 3, refused: 0 });
    expect(account.accounted).toBe(true);
    expect(account.line).toContain('+ 0 refused by contract');
  });

  it('accounts for an empty corpus, and leaves the vacuity rule to its caller', () => {
    // `0 = 0 + 0` is an identity, not evidence. The script refuses an empty
    // descriptor before it reaches the gate, and keeping that rule out of here is
    // what stops this function from reporting two different complaints at once.
    const account = accountRoundTrip({ declared: 0, roundTripped: 0, refused: 0 });
    expect(account.accounted).toBe(true);
  });

  it('names both counts when a case is missing, so a contract is not read as a hole', () => {
    const account = accountRoundTrip({ declared: 4, roundTripped: 2, refused: 1 });
    expect(account.accounted).toBe(false);
    expect(account.gap).toBe(
      "4 case(s) declared, 2 round-tripped and 1 refused by the target's own contract, " +
        'and no finding names the rest',
    );
    expect(account.gap).not.toContain('no finding names the difference');
  });

  it('treats more accounted cases than declared as a gap rather than as a surplus', () => {
    // Only reachable from a caller that counted a case twice, and the gate's job
    // is to refuse the arithmetic rather than to explain it: a run that scored
    // more cases than it declared is reading a population it has already lost
    // track of.
    expect(accountRoundTrip({ declared: 1, roundTripped: 2, refused: 0 }).accounted).toBe(false);
    expect(accountRoundTrip({ declared: 2, roundTripped: 1, refused: 2 }).accounted).toBe(false);
  });

  it('refuses a tally that cannot be a count, instead of reporting it as missing cases', () => {
    // A negative or fractional number is a caller that computed the wrong thing.
    // Returning `accounted: false` would file that as a corpus defect, which is
    // the opposite of where the bug is.
    expect(() => accountRoundTrip({ declared: -1, roundTripped: 0, refused: 0 })).toThrow(
      'declared must be a non-negative integer, got -1',
    );
    expect(() => accountRoundTrip({ declared: 1, roundTripped: 0.5, refused: 0 })).toThrow(
      'roundTripped must be a non-negative integer, got 0.5',
    );
    expect(() => accountRoundTrip({ declared: 1, roundTripped: 1, refused: Number.NaN })).toThrow(
      'refused must be a non-negative integer, got NaN',
    );
  });
});
