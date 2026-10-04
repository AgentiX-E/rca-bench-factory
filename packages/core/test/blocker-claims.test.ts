import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A stated blocker must name the observation that established it.
 *
 * This file exists because I stated one for three iterations without making the
 * call that would have tested it. From v1.51 through v1.53, every closing section
 * of the audit and the tracker said P0-1 -- pinning `rcaeval-re1` and
 * `rcaeval-re3` -- could not be advanced from here, and gave the sandbox's
 * allow-listed egress as the reason:
 *
 *     "P0-1 is blocked because the sandbox cannot reach zenodo.org"
 *
 * The egress measurement was real (finding 55) and it was not the question. The
 * fetch runs on `ubuntu-latest`, and `official-data.yml`'s own header had said so
 * since it was written -- "the runner has general internet access. The corpora are
 * on Zenodo, which is a plain HTTPS host." The question was never whether *this
 * machine* reaches Zenodo. It was whether the *runner* can and whether anything
 * here can start it, and I answered the first and reported it as the second.
 *
 * Then, measured, the second question was decided by one call:
 *
 *     POST /repos/…/actions/workflows/official-data.yml/dispatches  ->  HTTP 204
 *
 * The run was created fifteen seconds later. The permission probe that would have
 * told me is a single response header, `x-accepted-github-permissions: actions=read`,
 * present on every Actions response including the ones I was already reading.
 *
 * ## The class this asserts
 *
 * Finding 114 is the fifth in a row of the same shape: **a reporting surface that
 * makes an unexamined state look examined.** Findings 111-113 did it to a table, a
 * cell, and a citation. This one did it to a blocker. The mark is identical in all
 * five: the claim was cheap to check and the check was available at the moment the
 * claim was made.
 *
 * So the rule is about *how a blocker is stated*, not about whether one exists.
 * A real blocker is a finding and must be writable -- finding 34 records one, and
 * a rule strong enough to forbid all blocker language would forbid finding 34. What
 * is asserted is narrower: **when the documents say a thing cannot be done from
 * here, a measurement must be adjacent to the claim.**
 *
 * ## Why prose is the right thing to read
 *
 * These documents are the deliverable, not commentary on it. `09-推进进度追踪.md`
 * is what a reader consults to learn the project's state, and the closing sections
 * of each iteration are where the state is summarised. A rule governing what those
 * sections may assert is therefore a rule about the repository. It is scoped to
 * claims that are decidable: whether a measurement is named next to a blocker
 * sentence is a fact about the text, and the test asserts only that.
 *
 * ## What this does not establish
 *
 * It does not establish that a named measurement is the *right* one, or that it
 * was taken rather than remembered. A finding reference beside a blocker sentence
 * makes the claim auditable by a reader; it does not make it true, and no check in
 * this tree can decide that.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Phrases that assert an *externally caused* blocker -- the shape that was wrong.
 *
 * Scoped tightly and on purpose. Describing an upstream limitation is legitimate
 * and frequent ("Zenodo rate-limits concurrent transfers", "the shards are in
 * another repository"), and none of those are claims about what *this* position
 * cannot do. What is matched is the first-person impossibility claim: the sentence
 * that tells a reader the work stops here.
 */
const BLOCKER_PHRASES: RegExp[] = [
  /blocked by the sandbox/i,
  /cannot be advanced from here/i,
  /can(?:no|')t be (?:done|advanced|reached|pinned|fetched) from (?:here|this (?:machine|sandbox|position))/i,
  /is blocked because the sandbox/i,
  /the sandbox cannot reach/i,
  /no channel (?:exists|is available)/i,
  /is not reachable from (?:here|this (?:machine|sandbox))/i,
  /must be (?:done|dispatched|run) by a human because/i,
];

/**
 * What counts as naming an observation.
 *
 * Three kinds, because the project uses all three: a finding reference (the audit
 * is where measurements live), an HTTP status (the form the dispatch answer took),
 * and a literal command or endpoint. A blocker that cites one of these can be
 * checked by a reader in one step. A blocker that cites none of them is the claim
 * this finding is about.
 */
const OBSERVATION_FORMS: RegExp[] = [
  /finding\s+\d+/i,
  /\bHTTP\s*\d{3}\b|\b\d{3}\b(?=[^.]{0,40}\b(?:status|response|code)\b)/i,
  /`[^`]*(?:curl|gh |POST|GET|ls |pnpm |node |python3 )[^`]*`/i,
  /measured|measured directly|measured at|as measured/i,
];

/** The paragraph a match sits in, so adjacency is "same paragraph" not "same file". */
function paragraphAround(body: string, index: number): string {
  const before = body.lastIndexOf('\n\n', index);
  const after = body.indexOf('\n\n', index);
  return body.slice(before === -1 ? 0 : before, after === -1 ? body.length : after);
}

/**
 * Blocker claims in a body that do not name an observation in their own paragraph.
 *
 * Returning the offending text rather than a boolean is deliberate: a failure
 * message that quotes the sentence tells the next reader which one to fix, and a
 * bare `false` does not.
 */
export function unsupportedBlockers(body: string): string[] {
  const hits: string[] = [];
  for (const phrase of BLOCKER_PHRASES) {
    const re = new RegExp(phrase.source, 'gi');
    for (const m of body.matchAll(re)) {
      const para = paragraphAround(body, m.index!);
      if (!OBSERVATION_FORMS.some((o) => o.test(para))) {
        hits.push(para.trim().replace(/\s+/g, ' ').slice(0, 200));
      }
    }
  }
  return [...new Set(hits)];
}

function readDoc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

const TRACKER = 'docs/progress.md';
const AUDIT = 'docs/audit.md';

describe('prose · a blocker names what established it', () => {
  it('finds both documents, so a green run is not a file that was not read', () => {
    // The failure mode this guards against is a path that quietly moved and a test
    // that then scans a string it never loaded. `readDoc` throws on a missing file,
    // so reaching these assertions means both were read.
    expect(readDoc(TRACKER).length).toBeGreaterThan(1000);
    expect(readDoc(AUDIT).length).toBeGreaterThan(1000);
  });

  it('would catch the sentence I actually wrote, so the rule is not vacuous', () => {
    // Driven with the verbatim claim from the v1.52 and v1.53 closing sections.
    // Without this case a green run is indistinguishable from a scanner that
    // matches nothing -- the mistake the workflow-claims non-vacuity case records.
    const claim =
      'P0-1 remains blocked because the sandbox cannot reach zenodo.org, so the anchor ' +
      'cannot be advanced from here and must be done by a human because the token is read-only.';
    const found = unsupportedBlockers(claim);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join(' ')).toContain('sandbox cannot reach');
  });

  it('does not fire on a blocker that names its measurement', () => {
    // The corrected form. Every one of these must pass, or the rule is a ban on
    // writing down a real blocker rather than a requirement to evidence one.
    const evidenced = [
      'P0-1 is unblocked: `POST /actions/workflows/official-data.yml/dispatches` returned HTTP 204 and run 37192624818 was created.',
      'The OpenRCA route is closed because the shards are in six other repositories; finding 34 measured the caches at `total_count: 0` and scoped to the writing repository.',
      'The fetch could not be advanced from here until the dispatch above was tried; the measurement is the 204.',
    ];
    for (const doc of evidenced) {
      expect(unsupportedBlockers(doc), `this is an evidenced blocker and must pass: ${doc}`).toEqual([]);
    }
  });

  it('does not fire on a description of an upstream limitation', () => {
    // The distinction that keeps the rule writable. These are statements about the
    // world, not about what this position cannot do, and none of them is the claim
    // finding 114 is about.
    const descriptions = [
      'Zenodo rate-limits concurrent large transfers, which is why the concurrency group is keyed on the anchor.',
      'The six unfetchable targets have no channel in this repository; the registry records each one.',
      'Actions caches expire after thirty days, so the shards would need re-populating.',
    ];
    for (const doc of descriptions) {
      expect(unsupportedBlockers(doc)).toEqual([]);
    }
  });

  it.each([TRACKER, AUDIT])('%s states no unsupported blocker', (rel) => {
    const found = unsupportedBlockers(readDoc(rel));
    expect(
      found,
      `${rel} asserts a blocker in a paragraph that names no measurement:\n` +
        found.map((f) => `  - ${f}`).join('\n') +
        '\nA blocker is a finding, and a finding names the observation behind it.',
    ).toEqual([]);
  });
});
