import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportOpenRca } from '../src/export/openrca.js';
import { exportRcaEval as exportRcaEvalSuite } from '../src/export/rcaeval.js';
import { sha256 } from '../src/util/hash.js';
// The comparison `golden-master/verify.mjs` performs, imported rather than
// re-implemented: a second copy would be a second answer to "does this file
// match its anchor", and the two would eventually disagree.
import { compareAnchors } from '../../../golden-master/anchors.mjs';

/**
 * The Golden Master anchor, checked where changes are made.
 *
 * `golden-master/verify.mjs` re-exports the committed fixture through the built
 * package and compares every emitted byte against `expected.json`. Until this file
 * existed, **nothing in the suite ran that comparison**: it was wired into CI at
 * one step and nowhere else.
 *
 * That is the drift this repository spends a lot of machinery preventing. v2.07
 * renamed an exported column; `pnpm test`, `pnpm lint`, `pnpm typecheck`,
 * `pnpm docs:check`, `pnpm official:check` and every example check were green, and
 * CI failed at the one step a local run never reached:
 *
 *     Golden Master verification FAILED
 *       - files/order-prod/query.csv: expected aec9318e… got 469715c7…
 *
 * ## Why this compares `src` and not the spawn
 *
 * The obvious version of this test spawns `verify.mjs`. It was written, it passed,
 * and it then failed once in a full `--coverage` run and did not fail again. The
 * cause is structural rather than random: `verify.mjs` imports
 * `packages/core/dist`, and other files in this suite mutate `packages/core/src`
 * and rebuild while they run. A spawned verification can therefore read a `dist`
 * built from a mutated source and report a byte mismatch that no committed file
 * has. That is a false red on a guard whose whole purpose is to be trusted.
 *
 * So the export is computed here from `src` -- the same modules the rest of the
 * suite exercises -- and only the *comparison* is shared with the script. The
 * built artefact is still verified, by CI, where nothing else is writing to it.
 *
 * ## The second defect, which only a failure test could see
 *
 * `expected.json` records `sha256` **and** `bytes` per file. The verifier compared
 * only the digest. A recorded field that is never read is worse than an absent one:
 * a reader takes the byte count as checked, and the file it lives in is the one
 * `check-no-vendored-data.mjs` exempts from its size rule on the strength of being
 * an index rather than data. Both are compared now, each with its own message, so
 * neither comparison can be deleted without a red.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface AnchorFile {
  sha256: string;
  bytes: number;
}

interface Anchors {
  irVersion: string;
  target: string;
  files: Record<string, AnchorFile>;
  rcaevalRe2Files: Record<string, AnchorFile>;
}

const EXPECTED = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'expected.json'), 'utf8'),
) as Anchors;
const FIXTURE = JSON.parse(
  readFileSync(resolve(ROOT, 'golden-master', 'fixture.json'), 'utf8'),
);

/** What the exporters produce right now, in the anchor's own shape. */
function produced(): Record<string, Record<string, AnchorFile>> {
  const digest = (files: Record<string, string>): Record<string, AnchorFile> =>
    Object.fromEntries(
      Object.entries(files).map(([path, body]) => [path, { sha256: sha256(body), bytes: body.length }]),
    );
  return {
    files: digest(exportOpenRca(FIXTURE).files),
    rcaevalRe2Files: digest(exportRcaEvalSuite(FIXTURE, 'RE2').files),
  };
}

/** The shipped anchors, in the shape `compareAnchors` takes. */
const shipped = {
  files: EXPECTED.files,
  rcaevalRe2Files: EXPECTED.rcaevalRe2Files,
};

describe('golden-master/expected.json', () => {
  it('matches what the exporters produce from the committed fixture', () => {
    // The one assertion that makes a moved byte a local failure. Its message is
    // the script's own, so a reader who sees it in CI sees the same words.
    expect(compareAnchors(shipped, produced())).toEqual([]);
  });

  it('anchors both export targets, so neither can drift out of coverage', () => {
    // Two groups, two producers. A fixture that lost one of them would leave the
    // other's agreement looking like general agreement.
    expect(Object.keys(shipped.files).length).toBeGreaterThan(0);
    expect(Object.keys(shipped.rcaevalRe2Files).length).toBeGreaterThan(0);
  });
});

describe('compareAnchors', () => {
  const one = { 'files': { 'a.csv': { sha256: 'a'.repeat(64), bytes: 3 } } };
  const same = { 'files': { 'a.csv': { sha256: 'a'.repeat(64), bytes: 3 } } };

  it('says nothing when everything matches', () => {
    expect(compareAnchors(one, same)).toEqual([]);
  });

  it('names a digest that moved', () => {
    const actual = { files: { 'a.csv': { sha256: 'b'.repeat(64), bytes: 3 } } };
    expect(compareAnchors(one, actual)).toEqual([
      `files/a.csv: sha256 expected ${'a'.repeat(64)} got ${'b'.repeat(64)}`,
    ]);
  });

  it('names a byte count that moved, independently of the digest', () => {
    // The branch that did not exist. It must be reported on its own line, because
    // a reader who is told only "the digest moved" cannot tell a renamed column
    // from a reordered file.
    const actual = { files: { 'a.csv': { sha256: 'a'.repeat(64), bytes: 4 } } };
    expect(compareAnchors(one, actual)).toEqual(['files/a.csv: bytes expected 3 got 4']);
  });

  it('reports a file the anchor has and the export does not', () => {
    expect(compareAnchors(one, { files: {} })).toEqual([
      `files/a.csv: sha256 expected ${'a'.repeat(64)} got <missing>`,
      'files/a.csv: bytes expected 3 got <missing>',
    ]);
  });

  it('reports a file the export has and the anchor does not', () => {
    const actual = { files: { 'b.csv': { sha256: 'c'.repeat(64), bytes: 9 } } };
    // Only the digest line: there is no expected byte count to disagree with, and
    // inventing one would be a second verdict on the same absence.
    expect(compareAnchors({ files: {} }, actual)).toEqual([
      `files/b.csv: sha256 expected <missing> got ${'c'.repeat(64)}`,
    ]);
  });

  it('reports a group the other side does not carry at all', () => {
    expect(compareAnchors(one, {})).toEqual([
      `files/a.csv: sha256 expected ${'a'.repeat(64)} got <missing>`,
      'files/a.csv: bytes expected 3 got <missing>',
    ]);
  });
});
