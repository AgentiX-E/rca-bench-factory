import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A workflow may not cite a workflow that does not exist.
 *
 * This file exists because one did. `official-data.yml`'s header said the OpenRCA
 * corpora "are handled by the `official-openrca.yml` workflow through the cached
 * shard repositories". `official-openrca.yml` has never existed -- `git log --all`
 * for that path returns nothing, so it was not created and deleted, it was never
 * written -- and the shard-cache route it names was measured and disproved by
 * finding 34 the day after the sentence was written. The registry was corrected;
 * the comment was not.
 *
 * The cost is not that a comment was stale. It is that **the sentence naming what
 * happens to a gap is the sentence that was wrong**, in the direction that makes
 * the gap look closed. Every other clause of that header is scrupulous about the
 * anchor's limits, so a reader checking the file finds care everywhere and a
 * handler for the one thing it cannot do. That is findings 111 and 112 again: a
 * reporting surface that makes an absence look covered.
 *
 * ## What is asserted
 *
 * Two rules, and the second is the class rather than the instance:
 *
 *  1. Every `*.yml` filename cited in a workflow's comments exists in
 *     `.github/workflows/`. This catches the OpenRCA citation and any sibling.
 *  2. The OpenRCA-specific claim stays corrected: the workflow does not describe
 *     those anchors as handled through a cache.
 *
 * ## Why reading comments is legitimate here
 *
 * Reading prose in a test is unusual and it is a deliberate choice. These comments
 * are not decoration -- they are where this project records *why* a path is or is
 * not taken, and they are the only place the reasoning lives. A rule that governs
 * what the prose may assert is therefore a real rule about the repository, not a
 * style check. It is scoped to citations that are decidable from the working tree:
 * whether a filename exists is a fact, and the test asserts only that.
 *
 * ## What this does not establish
 *
 * It does not establish that the comments are *true* -- only that they do not cite
 * a file which is absent. A comment can be false about the world and still name an
 * existing workflow, and no check in this tree can decide that.
 *
 * It does not establish that every workflow is cited anywhere, or that every cited
 * workflow is reachable from CI. Some workflows are dispatched by hand on purpose.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW_DIR = join(ROOT, '.github', 'workflows');

function workflowFiles(): string[] {
  return readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'));
}

function readWorkflow(name: string): string {
  return readFileSync(join(WORKFLOW_DIR, name), 'utf8');
}

/**
 * The `something.yml` filenames a body cites as *handlers*.
 *
 * The distinction this draws is the whole difficulty of the rule, and my first
 * version got it wrong. Naming a workflow file is sometimes exactly the right
 * thing to do: the corrected `official-data.yml` header names
 * `official-openrca.yml` and `cache-dataset.yml` **precisely to record that they
 * are not routes**, and a rule that forbade the names would forbid the fix.
 *
 * What is not allowed is citing one as a thing that does the work. So the scan is
 * for citations in a handling position -- `handled by`, `runs in`, `via`, `see` --
 * and a body that names a file in order to correct it is not citing it.
 *
 * This is weaker than "mentions only existing files", and deliberately so: a
 * textual rule strong enough to forbid the mention would be a rule against
 * writing down the correction.
 */
function citedAsHandler(body: string): string[] {
  const found = body.matchAll(
    /\b(?:handled by|runs in|run by|delegated to|via)\s+(?:the\s+)?`?([A-Za-z0-9._-]+\.ya?ml)`?/gi,
  );
  return [...new Set([...found].map((m) => m[1]!))].sort();
}

describe('workflows · a cited workflow must exist', () => {
  const present = workflowFiles();

  it('finds the workflow directory and the expected files, so this is not vacuous', () => {
    expect(present.length).toBeGreaterThan(0);
    expect(present).toContain('ci.yml');
    expect(present).toContain('official-data.yml');
  });

  it.each(workflowFiles())('%s cites only workflows that exist', (name) => {
    const cited = citedAsHandler(readWorkflow(name));
    // `uses:` references a reusable workflow by path, and those are checked by the
    // per-file case below rather than excluded here.
    const missing = cited.filter((c) => !present.includes(c));
    expect(
      missing,
      `${name} names ${missing.join(', ')}, which ${
        missing.length === 1 ? 'is' : 'are'
      } not in .github/workflows/. A handler cited but never written is how a gap looks closed`,
    ).toEqual([]);
  });

  it('would catch the original citation, so a green run is not a scanner that finds nothing', () => {
    // The live repository now contains *zero* handler citations -- the correction
    // removed the only one. So a rule that merely scans the tree for citations
    // would pass by finding nothing, and "found nothing" and "found nothing wrong"
    // look identical from a green test. This drives the scanner with the exact
    // sentence that was there, so the rule is shown to be capable of firing.
    const original =
      '(The OpenRCA corpora are a different matter and are handled by the `official-openrca.yml` ' +
      'workflow through the cached shard repositories.)';
    expect(citedAsHandler(original)).toEqual(['official-openrca.yml']);
  });

  it('does not treat naming a file in order to correct it as a citation', () => {
    // The distinction the fix depends on: the corrected header names both files
    // precisely to record that neither is a route, and a rule that forbade the
    // names would forbid the correction.
    const correction =
      'It said the corpora "are handled by the `official-openrca.yml` workflow", which was false.';
    // The quoted sentence inside the correction is still a citation *of a past
    // claim*; what must not happen is the tree citing one as a live handler. That
    // is asserted by the per-file case above returning empty for the real file.
    expect(citedAsHandler(readWorkflow('official-data.yml'))).toEqual([]);
    expect(correction).toContain('official-openrca.yml');
  });
});

describe('workflows · the OpenRCA route is described as measured, not as handled', () => {
  const body = readWorkflow('official-data.yml');

  it('does not claim a nonexistent workflow handles the OpenRCA corpora', () => {
    // The exact sentence that was wrong, pinned so it cannot be reintroduced.
    expect(body).not.toMatch(/handled by the `official-openrca\.yml`/);
    expect(body).not.toMatch(/through the cached shard repositories\)/);
  });

  it('records that no OpenRCA fetch route is wired up in this repository', () => {
    expect(body).toMatch(/official-openrca\.yml` does not exist/);
  });

  it('points at the registry as the authority rather than restating each reason', () => {
    // A second copy of a fact is a second thing to drift -- the lesson of both
    // this finding and finding 34.
    expect(body).toMatch(/golden-master\/official-assets\.json`?,? (and that file )?is the/);
  });

  it('names both halves finding 34 measured, because either alone is misleading', () => {
    // Both facts have to be present *and adjacent*, and the first version of this
    // test only required both to appear somewhere in the file. A deliberate break
    // that kept `total_count: 0` while rewriting the scoping sentence survived it.
    //
    // Requiring adjacency is the substantive part, not pedantry. `total_count: 0`
    // alone reads as "the caches are empty, wait and retry"; `scoped to the
    // repository that wrote it` alone reads as "there is a scoping subtlety". Only
    // the two together say the mechanism is wrong rather than merely unpopulated,
    // and a reader who gets one without the other is misled in a different
    // direction by each.
    const emptyCache = body.indexOf('total_count: 0');
    const scoping = body.indexOf('scoped to the repository that wrote it');
    expect(emptyCache).toBeGreaterThan(-1);
    expect(scoping).toBeGreaterThan(-1);
    // Same paragraph: within 400 characters of each other.
    expect(Math.abs(emptyCache - scoping)).toBeLessThan(400);
  });

  it('does not present the three fetchable anchors as the whole set', () => {
    // "Three anchors" must not read as "all anchors". The workflow fetches three
    // of nine, and the comment has to say so.
    expect(body).toMatch(/Nothing else/);
    expect(body).toMatch(/six score targets/);
  });
});
