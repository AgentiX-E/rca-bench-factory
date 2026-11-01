import { describe, expect, it } from 'vitest';
import {
  describeCorpusFault,
  RCAEVAL_CORPUS_FAULTS,
  RCAEVAL_FAULT_TAXONOMY_SOURCE,
  readCorpusCategory,
  readCorpusFault,
} from '../src/fault/corpus-fault-taxonomy.js';
import { FAULT_CATEGORIES, inferFaultCategory } from '../src/index.js';

/**
 * The fault-type tokens the published corpus actually uses, measured from the nine
 * archives' own central directories (735 case directories, 2026-11-01).
 *
 * This list is the point of the file: it is read off the data, not off the
 * documentation, and every assertion below is anchored on it. A token the corpus
 * stops using, or starts using, fails here rather than drifting in prose.
 */
const MEASURED_TOKENS = [
  'cpu',
  'mem',
  'disk',
  'delay',
  'loss',
  'socket',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f3_1',
] as const;

describe('RCAEVAL_CORPUS_FAULTS', () => {
  it('names every fault type the corpus uses', () => {
    const named = RCAEVAL_CORPUS_FAULTS.map((one) => one.token);
    for (const token of MEASURED_TOKENS) {
      // `f3_1` is a label with an instance suffix; it is read as `f3` by stem and
      // must not be enumerated as a fault of its own.
      const expected = token === 'f3_1' ? 'f3' : token;
      expect(named, `${token} is in the corpus and not in the taxonomy`).toContain(expected);
    }
  });

  it('has eleven rows: six injected faults and five code-level ones', () => {
    expect(RCAEVAL_CORPUS_FAULTS).toHaveLength(11);
    expect(RCAEVAL_CORPUS_FAULTS.filter((one) => one.category === 'code')).toHaveLength(5);
    expect(RCAEVAL_CORPUS_FAULTS.filter((one) => one.category === 'resource')).toHaveLength(4);
    expect(RCAEVAL_CORPUS_FAULTS.filter((one) => one.category === 'network')).toHaveLength(2);
  });

  it('never contradicts the classifier where the classifier speaks', () => {
    // The taxonomy may only *extend* the general reading, never overrule it. If
    // this fails, the two tables disagree about a word and the disagreement would
    // read as a property of the corpus.
    for (const row of RCAEVAL_CORPUS_FAULTS) {
      const inferred = inferFaultCategory(row.token);
      if (inferred === 'unknown') continue;
      expect(row.category, `${row.token}: taxonomy says ${row.category}, classifier says ${inferred}`).toBe(inferred);
    }
  });

  it('uses only categories the vocabulary admits', () => {
    for (const row of RCAEVAL_CORPUS_FAULTS) {
      expect(FAULT_CATEGORIES).toContain(row.category);
    }
  });

  it('cites a source that names every one of the five code-level faults', () => {
    expect(RCAEVAL_FAULT_TAXONOMY_SOURCE.url).toMatch(/^https:\/\//);
    for (const phrase of [
      'Incorrect parameter values',
      'Missing parameters',
      'Missing Function Call',
      'Incorrect Return Values',
      'Missing Exception Handlers',
    ]) {
      expect(RCAEVAL_FAULT_TAXONOMY_SOURCE.faultNames).toContain(phrase);
    }
  });
});

describe('readCorpusFault', () => {
  it('reads the four resource faults the corpus injects', () => {
    expect(readCorpusFault('cpu')?.name).toBe('CPU hog');
    expect(readCorpusFault('mem')?.name).toBe('Memory leak');
    expect(readCorpusFault('disk')?.name).toBe('Disk stress');
    // The one the shipped classifier cannot name, and the reason this module exists.
    expect(readCorpusFault('socket')).toEqual({ token: 'socket', name: 'Socket stress', category: 'resource' });
  });

  it('reads the two network faults', () => {
    expect(readCorpusFault('delay')?.category).toBe('network');
    expect(readCorpusFault('loss')?.category).toBe('network');
  });

  it('reads all five code-level faults by name', () => {
    expect(readCorpusFault('f1')?.name).toBe('Incorrect parameter values');
    expect(readCorpusFault('f2')?.name).toBe('Missing parameters');
    expect(readCorpusFault('f3')?.name).toBe('Missing Function Call');
    expect(readCorpusFault('f4')?.name).toBe('Incorrect Return Values');
    expect(readCorpusFault('f5')?.name).toBe('Missing Exception Handlers');
    for (const token of ['f1', 'f2', 'f3', 'f4', 'f5']) {
      expect(readCorpusFault(token)?.category).toBe('code');
    }
  });

  it('reads a label with an instance suffix by its stem', () => {
    // `RE3-TT/ts-route-service_f3_1/1` is one directory out of ninety whose fault
    // label carries a suffix of its own. Refusing it would take the corpus's
    // category count from 90 to 87 for a reason that is a spelling, not a fault.
    expect(readCorpusFault('f3_1')).toEqual({ token: 'f3', name: 'Missing Function Call', category: 'code' });
    expect(readCorpusFault('F3_1')?.token).toBe('f3');
  });

  it('refuses a stem followed by something that is not an instance number', () => {
    // Otherwise `cpu_delay` would be read as a CPU hog and the network fault it
    // names would disappear from every count.
    expect(readCorpusFault('cpu_delay')).toBeUndefined();
    expect(readCorpusFault('f3_extra')).toBeUndefined();
    expect(readCorpusFault('socket_close')).toBeUndefined();
  });

  it('refuses tokens the taxonomy does not name', () => {
    expect(readCorpusFault('net_cpu_node')).toBeUndefined();
    expect(readCorpusFault('redis-latency')).toBeUndefined();
    expect(readCorpusFault('')).toBeUndefined();
  });

  it('ignores surrounding whitespace and case', () => {
    expect(readCorpusFault('  CPU  ')?.token).toBe('cpu');
    expect(readCorpusFault('Socket')?.category).toBe('resource');
  });
});

describe('describeCorpusFault', () => {
  it('says the classifier read a token it already knew', () => {
    expect(describeCorpusFault('cpu')).toEqual({
      type: 'cpu',
      category: 'resource',
      name: 'CPU hog',
      readAs: 'classifier',
    });
  });

  it('says the taxonomy read a token the classifier could not name', () => {
    expect(describeCorpusFault('socket')).toEqual({
      type: 'socket',
      category: 'resource',
      name: 'Socket stress',
      readAs: 'taxonomy',
    });
    expect(describeCorpusFault('f4')).toEqual({
      type: 'f4',
      category: 'code',
      name: 'Incorrect Return Values',
      readAs: 'taxonomy',
    });
  });

  it('says nothing read a token neither table names', () => {
    expect(describeCorpusFault('mystery')).toEqual({
      type: 'mystery',
      category: 'unknown',
      name: null,
      readAs: 'unknown',
    });
  });

  it('keeps the classifier verdict for a token the taxonomy happens not to name', () => {
    // `net_cpu_node` is a fault the classifier reads and the corpus taxonomy does
    // not describe. Its category must survive even though no name exists.
    expect(describeCorpusFault('net_cpu_node')).toEqual({
      type: 'net_cpu_node',
      category: 'network',
      name: null,
      readAs: 'classifier',
    });
  });

  it('does not let the taxonomy overrule a category the name carries', () => {
    // The rule finding 343 was about: a category the label states wins.
    expect(describeCorpusFault('cpu').readAs).toBe('classifier');
    expect(describeCorpusFault('loss').category).toBe(inferFaultCategory('loss'));
  });
});

describe('readCorpusCategory', () => {
  /**
   * The helper exists so a caller can hand a category to a schema without restating the
   * direction rule. `undefined` is the whole contract: it means "this table does not
   * decide", and a caller must fall through to whatever it would have done otherwise.
   */
  it('answers for a label only the corpus names', () => {
    // Measured: `inferFaultCategory('socket')` is `unknown` -- `socket` is a word this
    // repository's keyword table does not carry -- and the corpus injects it as the
    // fourth resource fault with stress-ng.
    expect(readCorpusCategory('socket')).toBe('resource');
    expect(readCorpusCategory('f1')).toBe('code');
  });

  it('reads a stem-plus-instance label the same way the full description does', () => {
    expect(readCorpusCategory('f3_1')).toBe('code');
    expect(describeCorpusFault('f3_1').readAs).toBe('taxonomy');
  });

  it('says nothing where the classifier spoke', () => {
    // `cpu` carries a category word, so the table does not get a vote -- and a helper
    // that answered here would be a second classifier wearing a reader's name.
    expect(readCorpusCategory('cpu')).toBeUndefined();
    expect(readCorpusCategory('net_cpu_node')).toBeUndefined();
  });

  it('says nothing where neither reading names the label', () => {
    expect(readCorpusCategory('zzz')).toBeUndefined();
    expect(readCorpusCategory('   ')).toBeUndefined();
  });
});

describe('a fault name is not a fault token', () => {
  /**
   * The five code-level names, and the reason they have no consumer.
   *
   * v3.35 read them out of the corpus's paper and printed them in the census. The
   * question the next round asked was whether any score target needs one, and the
   * answer is no -- but "no" is only useful if it is a property rather than a
   * coincidence. This block pins the property: the paper's name is a
   * *description* of a token, and naming a fault by its description is not a
   * spelling of its token, so a submission that answers `Incorrect Return Values`
   * where the corpus writes `f4` is not answering in the corpus's vocabulary.
   *
   * If this ever became an alias, `readCorpusCategory` would start answering for
   * an answer key's prose, and the runner would accept a sentence where it
   * requires a token -- the direction finding 343 removed.
   */
  it("does not read the paper's name back as the corpus token", () => {
    expect(RCAEVAL_FAULT_TAXONOMY_SOURCE.faultNames).toContain('Incorrect Return Values');
    expect(readCorpusFault('Incorrect Return Values')).toBeUndefined();
    expect(readCorpusFault('incorrect return values')).toBeUndefined();
    // The token still reads, and still carries that name.
    expect(readCorpusFault('f4')).toMatchObject({ token: 'f4', name: 'Incorrect Return Values' });
  });

  it('gives every token a name, and no two tokens the same one', () => {
    const names = RCAEVAL_CORPUS_FAULTS.map((f) => f.name);
    expect(names.every((name) => name.trim() !== '')).toBe(true);
    // A shared name would make the name ambiguous as a description: two rows
    // would print the same sentence for two different faults, and a reader
    // diffing the census against the paper could not tell which moved.
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps every name out of the token vocabulary', () => {
    // A row whose name *was* a token would make the two spellings
    // indistinguishable in a printout, which is the one way a description could
    // be mistaken for an alias.
    const tokens = new Set(RCAEVAL_CORPUS_FAULTS.map((f) => f.token));
    for (const fault of RCAEVAL_CORPUS_FAULTS) {
      expect(tokens.has(fault.name.toLowerCase())).toBe(false);
    }
  });
});
