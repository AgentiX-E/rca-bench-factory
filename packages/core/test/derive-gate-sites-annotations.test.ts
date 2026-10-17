import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * An annotation survives an edit that moved it, and dies when its guard changed.
 *
 * ## The defect
 *
 * `golden-master/gate-sites.json` pairs each failure site with the test that
 * proves it. `derive-gate-sites.mjs` owns four derived columns and carries the
 * three hand-authored ones across a rewrite -- and it carried them **by
 * `script:line`**, saying so in a sentence that reads as a considered trade:
 *
 *   > Annotations are matched by `script:line` and dropped for a site that no
 *   > longer exists, so a moved guard loses a stale proof rather than inheriting
 *   > a wrong one.
 *
 * The second half is right. The first half is not what happens: **every edit
 * above a site moves its line**, so the proof is dropped for a site whose guard
 * did not change at all. Measured twice -- three sites in pass 56, one in pass 57
 * when a docstring above `measure-doc-counts.mjs`'s `fail()` grew -- and each
 * time the guard then failed on `main` with
 *
 *   scripts/measure-doc-counts.mjs:97 has status 'undefined'
 *
 * which names a coordinate rather than a defect, and reads like a missing proof
 * where there is a moved one.
 *
 * Worse, the file already computes the identifier that is stable under exactly
 * that edit. Its own header describes the fingerprint as "stable under
 * reindentation and reformatting", and `--check` compares fingerprints. Carrying
 * by line while checking by fingerprint was two answers to one question, and the
 * coordinate answer was wrong.
 *
 * ## What is asserted here, and why against the function rather than the tree
 *
 * Moving a line in a real script to test this would mean the suite editing the
 * tree it is grading, which is the class of accident this campaign keeps
 * finding. The carry is extracted and driven with two tables instead. What that
 * costs is a guarantee that `main()` calls it -- and that is exactly what
 * `gate-sites-are-proven.test.ts` asserts on the shipped table, where every one
 * of the 63 sites carries a status after a re-derivation.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'derive-gate-sites.mjs');

interface Site {
  script: string;
  line: number;
  condition?: string;
  diagnostic?: string;
  status?: string;
  provedBy?: string;
  reason?: string;
}

interface Carry {
  sites: Site[];
  carried: number;
  priorAnnotated: number;
  strays: string[];
}

const { carryAnnotations } = (await import(pathToFileURL(SCRIPT).href)) as {
  carryAnnotations: (sites: Site[], prior: Site[]) => Carry;
};

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-derive-annotations-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A derived site, as the scanner would produce it. */
function site(script: string, line: number, diagnostic = 'refused'): Site {
  return { script, line, diagnostic };
}

describe('an annotation is carried by what the guard says, not by where it sits', () => {
  it('keeps the proof when the site moved and nothing else changed', () => {
    const carried = carryAnnotations(
      [site('scripts/x.mjs', 97)],
      [{ ...site('scripts/x.mjs', 66), status: 'proved', provedBy: 'test/x.test.ts' }],
    );

    expect(carried.sites[0]).toEqual({
      script: 'scripts/x.mjs',
      line: 97,
      diagnostic: 'refused',
      status: 'proved',
      provedBy: 'test/x.test.ts',
    });
    expect(carried.carried).toBe(1);
    expect(carried.priorAnnotated).toBe(1);
  });

  it('drops the proof when the guard text changed, which is the trade the first version named', () => {
    // A proof points at a *claim*. If the claim changed, the proof may be about
    // the other one, so it is dropped and the guard asks for a new one.
    const carried = carryAnnotations(
      [site('scripts/x.mjs', 97, 'a different refusal')],
      [{ ...site('scripts/x.mjs', 97, 'refused'), status: 'proved', provedBy: 'test/x.test.ts' }],
    );

    expect(carried.sites[0]!.status).toBeUndefined();
    expect(carried.carried).toBe(0);
    expect(carried.priorAnnotated).toBe(1);
  });

  it('does not hand one proof to two sites with the same fingerprint', () => {
    // Two `process.exit(1)` calls with no diagnostic above them are the same
    // string. Carrying without consuming the prior would annotate both, and one
    // of them would be a proof about a line it is not.
    const carried = carryAnnotations(
      [site('scripts/x.mjs', 10), site('scripts/x.mjs', 20)],
      [{ ...site('scripts/x.mjs', 10), status: 'proved', provedBy: 'test/x.test.ts' }],
    );

    expect(carried.sites[0]!.status).toBe('proved');
    expect(carried.sites[1]!.status).toBeUndefined();
    expect(carried.carried).toBe(1);
  });

  it('falls back to the line when a fingerprint is shared, and refuses to guess when neither matches', () => {
    // With two identical fingerprints the line is the only evidence left, so an
    // unmoved candidate is preferred -- and when none of them sits at the line,
    // the annotation is dropped and named rather than attached to whichever
    // candidate came first.
    const prior: Site[] = [
      { ...site('scripts/x.mjs', 10), status: 'proved', provedBy: 'test/first.test.ts' },
      { ...site('scripts/x.mjs', 40), status: 'exempt', reason: 'the second one is exempt for its own reason' },
    ];
    const byPosition = carryAnnotations([site('scripts/x.mjs', 40)], prior);
    expect(byPosition.sites[0]!.status).toBe('exempt');
    expect(byPosition.carried).toBe(1);

    const ambiguous = carryAnnotations([site('scripts/x.mjs', 77)], prior);
    expect(ambiguous.sites[0]!.status).toBeUndefined();
    expect(ambiguous.strays).toEqual(['scripts/x.mjs:77']);
    expect(ambiguous.carried).toBe(0);
  });

  it('carries nothing into a site that did not exist before', () => {
    const carried = carryAnnotations(
      [site('scripts/new.mjs', 5)],
      [{ ...site('scripts/x.mjs', 5), status: 'proved', provedBy: 'test/x.test.ts' }],
    );

    expect(carried.sites[0]!.status).toBeUndefined();
    expect(carried.carried).toBe(0);
    expect(carried.strays).toEqual([]);
  });

  it('counts only annotated priors, so "nothing was lost" is a statement about proofs', () => {
    // A table with 63 sites and 63 proofs must report 63 of 63, not 63 of 63
    // whatever the sites carry -- otherwise the number printed after every
    // re-derivation would be true by construction.
    const carried = carryAnnotations(
      [site('scripts/x.mjs', 1), site('scripts/y.mjs', 2)],
      [site('scripts/x.mjs', 1), { ...site('scripts/y.mjs', 2), status: 'proved', provedBy: 'test/y.test.ts' }],
    );

    expect(carried.priorAnnotated).toBe(1);
    expect(carried.carried).toBe(1);
  });
});

describe('the shipped table is the evidence that main() calls the carry', () => {
  it('re-derives a copy of the committed table without losing a single proof', () => {
    // The end-to-end half of this file's subject, and it runs against a **copy**:
    // `--out` is both where the deriver reads its prior and where it writes, so
    // pointing it at a scratch copy exercises the real wiring without the suite
    // editing the tree it is grading -- the class of accident this campaign
    // keeps finding.
    //
    // A `carryAnnotations` that was perfect and unused would pass every case
    // above. This one fails if `main()` stops calling it, and it fails naming the
    // sites that lost their proof.
    const copy = join(scratch, 'gate-sites.json');
    const prior = JSON.parse(
      readFileSync(resolve(ROOT, 'golden-master', 'gate-sites.json'), 'utf8'),
    ) as { sites: Site[] };
    // Move every prior line, which is what any edit above a site does. Without
    // this the copy and the tree agree on every coordinate and the case would
    // pass against the line-keyed carry it is here to reject -- a test that
    // cannot fail for the defect it names.
    for (const entry of prior.sites) entry.line += 1000;
    writeFileSync(copy, JSON.stringify(prior, null, 2) + '\n');

    const output = execFileSync(process.execPath, [SCRIPT, '--out', copy], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const rewritten = JSON.parse(readFileSync(copy, 'utf8')) as { sites: Site[] };
    const committed = JSON.parse(
      readFileSync(resolve(ROOT, 'golden-master', 'gate-sites.json'), 'utf8'),
    ) as { sites: Site[] };

    const unannotated = rewritten.sites
      .filter((s) => s.status === undefined)
      .map((s) => `${s.script}:${s.line}`);
    expect(unannotated, 'these sites lost their proof in a re-derivation').toEqual([]);

    // And the proof *set* is the committed one, not a fresh grant: the carry
    // moves annotations, it does not invent them.
    const annotated = (table: { sites: Site[] }): string[] =>
      table.sites
        .filter((s) => s.status !== undefined)
        .map((s) => `${s.script}\u0000${s.status ?? ''}\u0000${s.provedBy ?? ''}\u0000${s.reason ?? ''}`)
        .sort();
    expect(annotated(rewritten)).toEqual(annotated(committed));
    expect(rewritten.sites.length).toBe(committed.sites.length);
    expect(output).toContain(`annotations: ${String(committed.sites.length)} of ${String(committed.sites.length)} carried`);
  });
});
