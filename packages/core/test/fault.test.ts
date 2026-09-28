import { describe, expect, it } from 'vitest';
import {
  inferFaultCategory,
  normalizeFaultType,
  parseFaultSpec,
} from '../src/fault/collector.js';

/**
 * Fault collector tests.
 *
 * `normalizeFaultType`, `inferFaultCategory` and `parseFaultSpec` are pure
 * functions: they turn a fault injection event or a historical fault record
 * into the IR `FaultCase.fault` spec. No IO, no mocks.
 */

describe('normalizeFaultType', () => {
  it('lower-cases and turns spaces into hyphens', () => {
    expect(normalizeFaultType('CPU Saturation')).toBe('cpu-saturation');
  });

  it('turns underscores into hyphens', () => {
    expect(normalizeFaultType('network_delay')).toBe('network-delay');
  });

  it('collapses surrounding and repeated whitespace', () => {
    expect(normalizeFaultType('  Disk   IO  ')).toBe('disk-io');
  });

  it('strips non-alphanumeric characters', () => {
    expect(normalizeFaultType('Pod-Kill!')).toBe('pod-kill');
    expect(normalizeFaultType('db.timeout#v2')).toBe('dbtimeoutv2');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeFaultType('   ')).toBe('');
  });
});

describe('inferFaultCategory', () => {
  it('classifies CPU and memory faults as resource', () => {
    expect(inferFaultCategory('cpu-saturation')).toBe('resource');
    expect(inferFaultCategory('memory-leak')).toBe('resource');
    expect(inferFaultCategory('oom-kill')).toBe('resource');
  });

  it('classifies latency and partition faults as network', () => {
    expect(inferFaultCategory('network-delay')).toBe('network');
    expect(inferFaultCategory('packet-loss')).toBe('network');
    expect(inferFaultCategory('network-partition')).toBe('network');
  });

  it('classifies pod and container faults as runtime', () => {
    expect(inferFaultCategory('pod-failure')).toBe('runtime');
    expect(inferFaultCategory('container-kill')).toBe('runtime');
    expect(inferFaultCategory('node-evict')).toBe('runtime');
  });

  it('classifies database and queue faults as middleware', () => {
    expect(inferFaultCategory('database-timeout')).toBe('middleware');
    expect(inferFaultCategory('redis-outage')).toBe('middleware');
    expect(inferFaultCategory('kafka-lag')).toBe('middleware');
  });

  it('classifies exception and bug faults as code', () => {
    expect(inferFaultCategory('null-pointer-exception')).toBe('code');
    expect(inferFaultCategory('logic-error')).toBe('code');
  });

  it('classifies configuration faults as config', () => {
    expect(inferFaultCategory('config-change')).toBe('config');
    expect(inferFaultCategory('env-mismatch')).toBe('config');
  });

  it('classifies dependency faults as dependency', () => {
    expect(inferFaultCategory('dependency-upgrade')).toBe('dependency');
    expect(inferFaultCategory('upstream-outage')).toBe('dependency');
  });

  it('returns unknown for an unrecognised type', () => {
    expect(inferFaultCategory('mystery-fault')).toBe('unknown');
  });
});

describe('inferFaultCategory matches words rather than letter sequences', () => {
  // The defect this block guards, stated concretely because it is invisible in a
  // diff that only shows the final matcher.
  //
  // The table's `middleware` row carries the keyword `lag`, and the matcher was
  // `normalized.includes(keyword)`, so the *whole slug* was searched for the
  // letter sequence `l-a-g`. `flag` contains it, and the middleware row is
  // tested before the config row, so:
  //
  //     inferFaultCategory('feature-flag-misconfiguration') === 'middleware'
  //
  // when the answer is `config`. The suite did not catch it because the one
  // `lag` assertion it carried -- `kafka-lag` -> `middleware` -- passes under
  // both the broken and the fixed matcher: `kafka-lag` splits into the tokens
  // `kafka` and `lag`, and `lag` is a whole token there. A test that passes for
  // a reason unrelated to the property it names is how this survived.
  it('classifies a feature-flag misconfiguration as config, not middleware', () => {
    expect(inferFaultCategory('feature-flag-misconfiguration')).toBe('config');
  });

  it('classifies a config fault whose name contains another category keyword', () => {
    // `misconfiguration` is `mis` + `configuration`, and `configuration` starts
    // with `config`. On its own it is a config fault, and it is reached as an
    // *infix* rather than a prefix because `mis` precedes the match.
    expect(inferFaultCategory('misconfiguration')).toBe('config');
    expect(inferFaultCategory('api-misconfiguration')).toBe('config');
    expect(inferFaultCategory('non-configurable-setting')).toBe('config');
  });

  it('keeps kafka-lag middleware, because lag is a whole token there', () => {
    // Restated inside this block on purpose: the assertion above and this one
    // differ in exactly the property the fix turns on, and keeping them adjacent
    // is what stops a future reader concluding the fix was about `lag`.
    expect(inferFaultCategory('kafka-lag')).toBe('middleware');
    expect(inferFaultCategory('consumer-lag')).toBe('middleware');
  });

  it('does not classify a word merely because it contains a keyword', () => {
    // Each row is (input, the keyword it contains, what the substring matcher
    // wrongly returned). None of these names a fault at all.
    const contained: ReadonlyArray<[string, string, string]> = [
      ['planetary-drift', 'net', 'network'],
      ['magnetometer-reset', 'net', 'network'],
      ['tenet-violation', 'net', 'network'],
      ['room-assignment', 'oom', 'resource'],
      ['zoom-level-change', 'oom', 'resource'],
      ['bloom-filter-miss', 'oom', 'resource'],
      ['skill-inventory', 'kill', 'runtime'],
      ['member-enrollment', 'mem', 'resource'],
      ['remember-me-token', 'mem', 'resource'],
      ['memento-restore', 'mem', 'resource'],
      ['debugger-attached', 'bug', 'code'],
      ['ladybug-release', 'bug', 'code'],
      ['terrorism-filter', 'error', 'code'],
      ['dropdown-rendering', 'drop', 'network'],
      ['backdrop-image', 'drop', 'network'],
      ['raindrop-detector', 'drop', 'network'],
      ['envelope-encoding', 'env', 'config'],
      ['flagship-rollout', 'lag', 'middleware'],
      ['lagoon-navigation', 'lag', 'middleware'],
      ['adbc-driver', 'db', 'middleware'],
      ['dbnull-guard', 'db', 'middleware'],
    ];
    for (const [input, keyword, wrong] of contained) {
      const actual = inferFaultCategory(input);
      expect(actual, `'${input}' contains '${keyword}' but names no ${wrong} fault`).not.toBe(wrong);
      expect(actual, `'${input}' names no fault at all`).toBe('unknown');
    }
  });

  it('classifies log-aggregation-failure as unknown, though it contains lag', () => {
    // The sharpest case in the set: `aggregation` genuinely contains the letters
    // `lag`, and unlike `flag` there is no other keyword in the slug to rescue
    // the answer. A substring matcher returns `middleware` for a fault whose
    // actual type is an aggregation failure.
    expect(inferFaultCategory('log-aggregation-failure')).toBe('unknown');
  });

  it('matches a keyword that is a prefix of a token', () => {
    // `evict` / `eviction` and `mismatch` / `mismatches` are the reason a prefix
    // form exists at all rather than pure token equality.
    expect(inferFaultCategory('node-eviction')).toBe('runtime');
    expect(inferFaultCategory('field-mismatches')).toBe('config');
    expect(inferFaultCategory('config-mismatched')).toBe('config');
  });

  it('matches a keyword that follows a negation prefix', () => {
    // `misconfiguration` is `mis` + `configuration`, and `configuration` starts
    // with `config`. This is an infix, not a prefix, so it needs its own clause.
    expect(inferFaultCategory('feature-misconfiguration')).toBe('config');
    expect(inferFaultCategory('non-configurable-default')).toBe('config');
  });

  it('matches a multi-token keyword against the slug', () => {
    expect(inferFaultCategory('third-party-outage')).toBe('dependency');
  });

  // Ordering is the mechanism the whole table runs on, and two orderings are
  // load-bearing rather than incidental. Both are asserted here because both have
  // already been the site of a defect: the middleware row's position against
  // `code` is what the substring bug exploited, and its position against
  // `network` is what decides a latency fault on a named system.
  it('lets the named subject outrank the mechanism when both are present', () => {
    // `redis-latency` and `network-delay` carry the same mechanism and belong to
    // different categories. Keyword presence alone cannot separate them, so the
    // table is ordered with the row holding the subjects first. This is the
    // golden dataset's own convention: samples.json records `redis-latency` as
    // middleware and `network-delay` as network.
    expect(inferFaultCategory('redis-latency')).toBe('middleware');
    expect(inferFaultCategory('redis-single-thread-cpu-saturation')).toBe('middleware');
    expect(inferFaultCategory('network-delay')).toBe('network');
    expect(inferFaultCategory('database-latency')).toBe('middleware');
  });

  it('classifies a catastrophic-backtracking fault as code', () => {
    // The `code` row originally had no keyword a regex fault could reach, so the
    // type inferred `unknown` -- which `expectedSignalsFor` reads as unverifiable
    // and exempts from mechanistic checking. `unknown` is the honest answer for a
    // type the table has never seen, and a false answer for a type it has.
    expect(inferFaultCategory('regex-catastrophic-backtracking')).toBe('code');
    expect(inferFaultCategory('catastrophic-regex-backtracking')).toBe('code');
    // And the word-order permutation the model answered with is the same fault.
    expect(inferFaultCategory('catastrophic-regex-backtracking')).toBe(
      inferFaultCategory('regex-catastrophic-backtracking'),
    );
  });

  // The two length floors are load-bearing, so each is asserted at its boundary:
  // the assertion is not that some input works, but that removing the floor
  // changes the answer. A three-letter keyword as a prefix matches far too much.
  it('does not let a short keyword act as a prefix', () => {
    // `mem` (3) must not prefix-match `member`; `oom` (3) must not match `room`;
    // `net` (3) must not match `planet`. `memory` (6) may prefix-match
    // `memoryless`, and that one is intended -- it names a memory fault.
    expect(inferFaultCategory('member-enrollment')).toBe('unknown');
    expect(inferFaultCategory('room-assignment')).toBe('unknown');
    expect(inferFaultCategory('planetary-drift')).toBe('unknown');
    expect(inferFaultCategory('memoryless-pool')).toBe('resource');
  });
});

describe('parseFaultSpec', () => {
  it('parses a full record with an explicit category', () => {
    const result = parseFaultSpec(
      { type: 'CPU Saturation', category: 'resource', parameters: { intensity: 90 } },
      'chaos-mesh',
    );
    expect(result).toEqual({
      ok: true,
      spec: {
        type: 'cpu-saturation',
        category: 'resource',
        injectionMethod: 'chaos-mesh',
        parameters: { intensity: 90 },
      },
    });
  });

  it('infers the category when it is absent', () => {
    const result = parseFaultSpec({ type: 'network-delay' }, 'litmus');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.spec.category).toBe('network');
      expect(result.spec.type).toBe('network-delay');
    }
  });

  it('omits parameters when they are absent', () => {
    const result = parseFaultSpec({ type: 'pod-failure' }, 'chaosblade');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.parameters).toBeUndefined();
  });

  it('fails on a non-object input', () => {
    const result = parseFaultSpec('not-an-object', 'historical');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/object/i);
  });

  it('fails when the type is missing', () => {
    const result = parseFaultSpec({ category: 'code' }, 'manual');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/type/i);
  });

  it('fails on a blank type', () => {
    const result = parseFaultSpec({ type: '   ' }, 'manual');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/type/i);
  });

  it('fails on an invalid category', () => {
    const result = parseFaultSpec({ type: 'cpu', category: 'bogus' }, 'chaos-mesh');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/category/i);
  });

  it('fails when parameters are present but not an object', () => {
    const result = parseFaultSpec({ type: 'cpu', parameters: 'not-object' }, 'chaos-mesh');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/parameters/i);
  });
});
