/**
 * Whether the index's entries cover the sample set, which is not the same as being as long as it.
 *
 * `check-fault-cases` prints one sentence about coverage:
 *
 * ```
 * OK (30 of 30 sample(s) carry a four-layer case; ... floor 30)
 * ```
 *
 * The numerator is `index.cases.length` and the denominator is the number of samples in the
 * extraction key, and until this module existed **nothing compared the sets those two numbers
 * count**. An entry names its sample with `sampleId`, the guard resolved that id against the key so
 * a typo was refused, and no rule asked whether two entries named the *same* sample. The sentence
 * was therefore true only while every author happened to use a distinct id.
 *
 * ## Why this becomes invisible exactly when it matters
 *
 * A duplicate has a different visible effect at each end of the annotation schedule, and the two
 * effects point in opposite directions.
 *
 * At twenty-seven of thirty, the entries are fewer than the samples, so a duplicate makes the
 * numerator smaller than it would otherwise be: `27 of 30` becomes `27 of 30` with one sample
 * silently skipped, and the next round's "which samples are left" question is answered wrongly. The
 * number is still visibly short of the denominator, so a reader at least knows something is open.
 *
 * At thirty of thirty -- the milestone this corpus reached in v3.17 -- the two counts agree **by
 * construction**: thirty entries, thirty samples, and the report says every sample is covered while
 * one of them is covered twice and another not at all. The arithmetic has stopped carrying
 * information, and it stopped at the exact moment the corpus declared its annotation finished.
 *
 * That is the whole finding: **a progress counter loses its error-detecting power at the target it
 * was built to measure.** It is not a mistake in the counter, it is what a pair of independent
 * counts does — and the repair is to compare the sets rather than the totals.
 *
 * ## Why the missing arm is conditional
 *
 * A sample with no case is *progress* until the index is as long as the set: at twenty of thirty,
 * ten samples have no case because the next ten rounds have not happened. Reporting that would make
 * every round before the target a failing one, which is how a rule teaches people to skip it. So the
 * missing arm fires only when the entries have caught up with the set, where a gap can no longer be
 * explained by work not yet done.
 */

/** One entry of the corpus index, as much of it as coverage needs. */
export interface CoverageEntry {
  caseId: string;
  sampleId: string;
}

/** Join names the way a sentence reads rather than the way an array prints. */
function joinNames(names: readonly string[]): string {
  const quoted = names.map((one) => `'${one}'`);
  if (quoted.length <= 1) return quoted.join('');
  // `slice(-1)` rather than an index. `quoted[quoted.length - 1]` is `string | undefined` under
  // `noUncheckedIndexedAccess`, so it needs a `?? ''` that satisfies the compiler and describes a
  // branch no input can take -- a list with one element removed still has a last one. The coverage
  // report counts that fallback as untested code, which is exactly what it is.
  return `${quoted.slice(0, -1).join(', ')} and ${quoted.slice(-1).join('')}`;
}

/**
 * Problems with what this index covers, rather than with how long it is.
 *
 * Returns strings rather than a verdict, like every other rule in this directory: the guard prints
 * them beside the other problems, and a run with a duplicate and a gap is one repair with two
 * places to make it.
 */
export function checkSampleCoverage(input: {
  entries: readonly CoverageEntry[];
  knownSampleIds: readonly string[];
}): string[] {
  const problems: string[] = [];
  const coveredBy = new Map<string, string[]>();
  for (const entry of input.entries) {
    const ids = coveredBy.get(entry.sampleId) ?? [];
    ids.push(entry.caseId);
    coveredBy.set(entry.sampleId, ids);
  }

  // Sorted, so two runs over the same index report in the same order and a reader can diff them.
  // The entries are read once and filtered before sorting, rather than iterating the keys and looking
  // each value up: a lookup returns `string[] | undefined` and the `?? []` that satisfies the
  // compiler is a branch no input can take, because every key came from this map.
  const duplicated = [...coveredBy.entries()]
    .filter(([, ids]) => ids.length > 1)
    .sort((left, right) => left[0].localeCompare(right[0]));
  for (const [sampleId, ids] of duplicated) {
    problems.push(
      `${joinNames(ids)} annotate sample '${sampleId}', which is one sample covered twice: a second ` +
        'case for a sample the corpus already carries is an annotation of nothing, and it makes the ' +
        'coverage count a number about the index rather than about the samples',
    );
  }

  // Only once the index has caught up. Before that the gaps are the schedule, not a defect.
  if (input.entries.length >= input.knownSampleIds.length) {
    const missing = input.knownSampleIds.filter((one) => !coveredBy.has(one)).sort();
    if (missing.length > 0) {
      const what = missing.length === 1 ? 'sample' : 'samples';
      problems.push(
        `no case annotates ${what} ${joinNames(missing)}, and the index is as long as the sample ` +
          'set, so the count that says every sample is covered is counting entries rather than samples',
      );
    }
  }

  return problems;
}
