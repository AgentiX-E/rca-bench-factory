import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_METRICS } from '../src/score/official.js';
import { SCORE_TARGET_IDS } from '../src/score/targets.js';

/**
 * The oracle census: what upstream artefact defines each number, and can it be
 * replayed here?
 *
 * ## Why this file exists
 *
 * Pass 58 established the standard on OpenRCA: *a rule transcribed by the author
 * of the scorer is not an oracle*. Nine targets were carrying a `source` string
 * and a `provenance` label, and nobody had counted how many of those strings
 * pointed at something runnable. The answer, measured rather than assumed:
 *
 * | class | meaning | targets |
 * | --- | --- | --- |
 * | `code` | released evaluator, replayed case by case | OpenRCA 1.0, RCAEval ×3, Cloud-OpsBench |
 * | `rubric` | machine-readable scoring data, no evaluator | RCA100 |
 * | `prose` | only a paper or a dataset README describes it | AIOps2025 |
 * | `absent` | the citation itself says no scorer is published | OpenRCA 2.0, ITBench |
 *
 * The census found two things on the day it was taken: Cloud-OpsBench *had* a
 * runnable evaluator and disagreed with this repository on nine of twenty-two
 * pairs (finding 182), and RCA100's upstream ships a three-tier scoring rubric
 * that this repository flattens to a coin flip (recorded as a `gap` on the row,
 * not as a passing claim).
 *
 * ## What these tests can and cannot do
 *
 * They assert **internal consistency**: every target has a row, every row's
 * classes are legal, every `code` row is backed by a corpus that really contains
 * the digests it cites, and every row is dated. They cannot assert that the
 * census is *true about the world* -- a static inventory of external facts ages,
 * and no test can re-probe GitHub from inside a suite. The only honest claim a
 * census can make about itself is that it was taken on a date, so `takenAt` and a
 * per-row `probe` record are required fields rather than decoration.
 *
 * The direction that *is* falsifiable, and is asserted below: a row cannot claim
 * `code` without a corpus, so a future pass that quietly downgrades a target to
 * "transcription" has to delete a file that another test replays.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CENSUS = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'oracle-census.json'), 'utf8'),
) as Census;

interface Digest {
  path: string;
  bytes?: number;
  sha256: string;
}

interface Probe {
  what: string;
  returned: string;
  http: number;
  takenAt: string;
}

interface Row {
  target: string;
  metricSource: string;
  class: 'code' | 'rubric' | 'prose' | 'absent';
  cited: string;
  upstream: { kind: string; repository?: string; commit?: string; files?: Digest[]; sha256?: string } | null;
  corpus: string | null;
  probe: Probe;
  corroboration?: { quote: string };
  gap?: { summary: string; evidence: string; next: string };
}

interface Census {
  schema: string;
  takenAt: string;
  question: string;
  classes: Record<string, string>;
  rows: Row[];
}

const CLASSES = ['code', 'rubric', 'prose', 'absent'] as const;
const ROWS = new Map(CENSUS.rows.map((row) => [row.target, row]));

describe('every target is counted, and nothing else is', () => {
  it('has exactly one row per score target', () => {
    // The whole point of a census: an omission is a target nobody is accountable
    // for, and a row for a target that no longer exists is a claim about a
    // benchmark this repository does not score.
    expect([...ROWS.keys()].sort()).toEqual([...SCORE_TARGET_IDS].sort());
    expect(new Set(CENSUS.rows.map((r) => r.target)).size).toBe(CENSUS.rows.length);
  });

  it('uses only the four documented classes', () => {
    expect(Object.keys(CENSUS.classes).sort()).toEqual([...CLASSES].sort());
    for (const row of CENSUS.rows) {
      expect(CLASSES, `${row.target} declares an unknown class`).toContain(row.class);
      expect(CENSUS.classes[row.class]?.length, `${row.target}'s class is undocumented`).toBeGreaterThan(20);
    }
  });

  it('describes the claim the code actually ships', () => {
    // Two copies of one string, held in step by an assertion instead of by
    // discipline: editing `OFFICIAL_METRICS[...].source` without revisiting the
    // census turns this red, and so does the reverse.
    const drifted = CENSUS.rows
      .filter((row) => OFFICIAL_METRICS[row.target]?.source !== row.metricSource)
      .map((row) => `${row.target}: census says "${row.metricSource}", code says "${OFFICIAL_METRICS[row.target]?.source}"`);
    expect(drifted, 'the census and the shipped metric spec disagree').toEqual([]);
  });
});

describe('a claim that the rule can be replayed is backed by a corpus that replays it', () => {
  it('names a corpus only where a corpus exists', () => {
    // `code` rows have to name one (next test). The rows that are *not* code may also name
    // one -- a `prose` target's corpus is the set of sentences its rule is held to -- and
    // either way the file has to be there. Before `openrca-2.0` became `prose`, no
    // non-`code` row named a corpus, so this half was vacuous and nothing noticed a row
    // pointing at a file nobody wrote.
    const missing = CENSUS.rows
      .filter((row) => row.corpus !== null && !existsSync(resolve(ROOT, row.corpus)))
      .map((row) => `${row.target}: ${String(row.corpus)} does not exist`);
    expect(missing).toEqual([]);
  });

  it('names a corpus for every code row', () => {
    for (const row of CENSUS.rows) {
      if (row.class !== 'code') continue;
      expect(row.corpus, `${row.target} claims released code and names no corpus`).not.toBeNull();
      expect(existsSync(resolve(ROOT, row.corpus!)), `${row.corpus} does not exist`).toBe(true);
    }
  });

  it('carries the digests the corpus was taken at', () => {
    // The identity of the artefact, at the level the census makes claims at:
    // repository, commit and per-file digest. Every digest named in the row has to
    // appear in the corpus, so a row cannot point at a corpus taken from another
    // commit -- which is the failure mode of a table maintained by hand.
    for (const row of CENSUS.rows) {
      if (row.class !== 'code') continue;
      const text = readFileSync(resolve(ROOT, row.corpus!), 'utf8');
      expect(row.upstream?.commit, `${row.target} names no commit`).toMatch(/^[0-9a-f]{40}$/);
      expect(text, `${row.corpus} does not mention ${String(row.upstream?.commit)}`).toContain(
        row.upstream!.commit!,
      );
      const files = row.upstream?.files ?? [];
      expect(files.length, `${row.target} names no file`).toBeGreaterThan(0);
      for (const file of files) {
        expect(file.sha256, `${row.target}: ${file.path} has no digest`).toMatch(/^[0-9a-f]{64}$/);
        expect(
          text,
          `${row.corpus} does not carry the digest of ${file.path}, so the row and the corpus were taken from different trees`,
        ).toContain(file.sha256);
      }
    }
  });

  it('does not claim code for a target whose citation says none is published', () => {
    // `absent` means the citation itself denies a scorer exists. Such a row must
    // not carry an upstream block: naming a file and denying it exists in the same
    // row is the kind of contradiction a reader stops trusting the table over.
    for (const row of CENSUS.rows) {
      if (row.class !== 'absent') continue;
      expect(row.upstream, `${row.target} is absent and names an artefact`).toBeNull();
      expect(row.corpus, `${row.target} is absent and names a corpus`).toBeNull();
    }
  });
});

describe('every row is dated, and dates what it measured', () => {
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  it('records when it was taken, and none of its probes is later', () => {
    expect(CENSUS.schema).toBe('rca-bench-oracle-census/1');
    expect(CENSUS.takenAt).toMatch(ISO_DATE);
    expect(CENSUS.question.length).toBeGreaterThan(40);
    for (const row of CENSUS.rows) {
      expect(row.probe.what.length, `${row.target} does not say what was probed`).toBeGreaterThan(30);
      expect(row.probe.returned.length, `${row.target} does not say what came back`).toBeGreaterThan(30);
      expect(row.probe.http, `${row.target} records no status`).toBeGreaterThan(0);
      expect(row.probe.takenAt).toMatch(ISO_DATE);
      expect(
        row.probe.takenAt <= CENSUS.takenAt,
        `${row.target} was probed after the census was dated`,
      ).toBe(true);
    }
  });

  it('states a gap only where a gap can exist, with an argument and a next step', () => {
    // A `code` row with a gap would mean a corpus passes while the rule inside it
    // is known to differ -- the one combination that turns a replay into a
    // ritual. The gap belongs on the row that has no replay.
    for (const row of CENSUS.rows) {
      if (row.gap === undefined) continue;
      expect(row.class, `${row.target} claims released code and admits a gap`).not.toBe('code');
      expect(row.gap.summary.length).toBeGreaterThan(60);
      expect(row.gap.evidence.length).toBeGreaterThan(30);
      expect(row.gap.next.length).toBeGreaterThan(30);
    }
  });

  it('counts the classes it found, so the count can be quoted without recounting', () => {
    const counted = (kind: string): number => CENSUS.rows.filter((r) => r.class === kind).length;
    // These four numbers are the pass's headline. Asserting them means a future
    // row cannot change the story without changing the test that tells it.
    expect(counted('code')).toBe(5);
    expect(counted('rubric')).toBe(1);
    expect(counted('prose')).toBe(2);
    expect(counted('absent')).toBe(1);
  });
});
