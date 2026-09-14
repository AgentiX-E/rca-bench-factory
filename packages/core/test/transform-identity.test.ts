import { describe, expect, it } from 'vitest';
import {
  checkNoSilentLoss,
  transformBatch,
  type TransformResult,
} from '../src/transform/engine.js';
import type { TransformRule } from '../src/transform/strategies.js';

/**
 * `transform` is the one engine in the pipeline whose declared contract is an
 * arithmetic invariant:
 *
 *     inputCount === outputCount + quarantineCount, always.
 *
 * This suite treats that sentence as a claim to be tested rather than a
 * description of how `counts` happens to be assembled. It pins three things the
 * existing tests did not:
 *
 *  1. The invariant holds for the *content*, not just the counters. A result
 *     whose arrays disagree with its own `counts` must be detectable.
 *  2. A quarantine entry names the record it rejected in terms the caller can
 *     act on. `--id-field` naming a column no record carries is not a silent
 *     cosy fallback to positional ids - that reads as success while the caller's
 *     identifier scheme is inert.
 *  3. Two records sharing an id are reported, because then the id no longer
 *     names a record.
 */

const mapRules: TransformRule[] = [
  { id: 'r1', kind: 'map', from: 'level', to: 'level_norm', mapping: { W: 'WARN', I: 'INFO' } },
];

function ids(result: TransformResult): string[] {
  return result.outputs.map((o) => o.recordId);
}

describe('transform · the silent-loss invariant is about content, not counters', () => {
  it('holds when every record is converted', () => {
    const res = transformBatch([{ level: 'W' }, { level: 'I' }], mapRules);
    expect(checkNoSilentLoss(res)).toBe(0);
    expect(res.outputs).toHaveLength(res.counts.output);
    expect(res.quarantined).toHaveLength(res.counts.quarantine);
  });

  it('holds when every record is rejected', () => {
    const res = transformBatch([{ level: 'X' }, { level: 'Y' }], mapRules);
    expect(checkNoSilentLoss(res)).toBe(0);
    expect(res.counts).toEqual({ input: 2, output: 0, quarantine: 2 });
  });

  it('holds on a mixed batch, which is the only case where a mismatch could hide', () => {
    const res = transformBatch([{ level: 'W' }, { level: 'X' }, { level: 'I' }], mapRules);
    expect(checkNoSilentLoss(res)).toBe(0);
    expect(res.counts).toEqual({ input: 3, output: 2, quarantine: 1 });
  });

  it('reports a non-zero violation when a caller hands in an inconsistent result', () => {
    // The check must be able to FAIL. A guard that cannot fail is worth nothing,
    // so it is exercised against a result that violates the invariant rather
    // than only against results that satisfy it.
    const real = transformBatch([{ level: 'W' }], mapRules);
    const forged: TransformResult = {
      ...real,
      counts: { input: 3, output: 1, quarantine: 0 },
    };
    expect(checkNoSilentLoss(forged)).toBe(2);
  });
});

describe('transform · the id field must name a record or say it cannot', () => {
  it('uses the caller id when the field exists', () => {
    const res = transformBatch([{ id: 'rec-42', level: 'X' }], mapRules, { idField: 'id' });
    expect(res.quarantined[0]?.recordId).toBe('rec-42');
  });

  it('uses the caller id for converted records too, not only quarantined ones', () => {
    const res = transformBatch([{ id: 'rec-42', level: 'W' }], mapRules, { idField: 'id' });
    expect(ids(res)).toEqual(['rec-42']);
  });

  it('falls back to a positional id when no id field was requested', () => {
    const res = transformBatch([{ level: 'W' }, { level: 'X' }], mapRules);
    expect(ids(res)).toEqual(['row-0']);
    expect(res.quarantined[0]?.recordId).toBe('row-1');
  });

  it('falls back to a positional id when the requested field is absent', () => {
    const res = transformBatch([{ level: 'X' }], mapRules, { idField: 'id' });
    expect(res.quarantined[0]?.recordId).toBe('row-0');
  });

  it('counts every record for which the requested id field yielded nothing', () => {
    // Three records, none carrying `id`. The caller asked for identity and got
    // positional order instead; the engine must say so, not imply it worked.
    const res = transformBatch([{ level: 'W' }, { level: 'W' }, { level: 'W' }], mapRules, {
      idField: 'id',
    });
    expect(res.idFieldMisses).toBe(3);
  });

  it('reports zero id-field misses when the field resolves everywhere', () => {
    const res = transformBatch([{ id: 'a', level: 'W' }, { id: 'b', level: 'W' }], mapRules, {
      idField: 'id',
    });
    expect(res.idFieldMisses).toBe(0);
  });

  it('does not count an empty-string id as a miss it cannot see', () => {
    // `recordIdOf` treats '' as absent, so it must be counted as a miss - the
    // caller asked for an identity and the record has none.
    const res = transformBatch([{ id: '', level: 'W' }], mapRules, { idField: 'id' });
    expect(res.idFieldMisses).toBe(1);
    expect(ids(res)).toEqual(['row-0']);
  });

  it('reports zero misses when no id field was requested at all', () => {
    // Positional ids are then the documented contract, not a fallback, so there
    // is nothing to warn about.
    const res = transformBatch([{ level: 'W' }], mapRules);
    expect(res.idFieldMisses).toBe(0);
  });

  it('treats a null id as absent', () => {
    const res = transformBatch([{ id: null, level: 'W' }], mapRules, { idField: 'id' });
    expect(res.idFieldMisses).toBe(1);
    expect(ids(res)).toEqual(['row-0']);
  });

  it('does not treat 0 as absent, because 0 is a real identifier', () => {
    const res = transformBatch([{ id: 0, level: 'W' }], mapRules, { idField: 'id' });
    expect(res.idFieldMisses).toBe(0);
    expect(ids(res)).toEqual(['0']);
  });
});

describe('transform · a duplicated id no longer identifies a record', () => {
  it('reports the id values that occur more than once', () => {
    const res = transformBatch(
      [{ id: 'dup', level: 'W' }, { id: 'dup', level: 'I' }],
      mapRules,
      { idField: 'id' },
    );
    expect(res.duplicateIds).toEqual(['dup']);
  });

  it('reports duplicates regardless of whether the records were converted', () => {
    // The ambiguity is about identity, not about success: two records may share
    // an id and both be quarantined, which still makes the id ambiguous.
    const res = transformBatch(
      [{ id: 'dup', level: 'W' }, { id: 'dup', level: 'X' }],
      mapRules,
      { idField: 'id' },
    );
    expect(res.duplicateIds).toEqual(['dup']);
  });

  it('reports nothing when every id is unique', () => {
    const res = transformBatch([{ id: 'a', level: 'W' }, { id: 'b', level: 'W' }], mapRules, {
      idField: 'id',
    });
    expect(res.duplicateIds).toEqual([]);
  });

  it('lists each duplicated id once, in first-seen order', () => {
    const res = transformBatch(
      [
        { id: 'b', level: 'W' },
        { id: 'a', level: 'W' },
        { id: 'b', level: 'W' },
        { id: 'a', level: 'W' },
        { id: 'c', level: 'W' },
      ],
      mapRules,
      { idField: 'id' },
    );
    expect(res.duplicateIds).toEqual(['b', 'a']);
  });

  it('does not report positional ids as duplicates', () => {
    // `row-N` is generated from the index, so it is unique by construction;
    // reporting it would be pure noise.
    const res = transformBatch([{ level: 'W' }, { level: 'W' }], mapRules);
    expect(res.duplicateIds).toEqual([]);
  });

  it('does not report two rows as duplicates when the id field was missing for both', () => {
    // Both fell back to positional ids, which differ; the engine must not
    // confuse "both lacked an id" with "both had the same id".
    const res = transformBatch([{ level: 'W' }, { level: 'W' }], mapRules, { idField: 'id' });
    expect(res.duplicateIds).toEqual([]);
    expect(res.idFieldMisses).toBe(2);
  });
});
