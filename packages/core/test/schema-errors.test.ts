import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { describeSchemaFailure } from '../src/ir/schema-errors.js';
import { faultCaseSchema } from '../src/ir/schema.js';

/**
 * A schema refusal whose reason is in the message.
 *
 * `check-fault-cases` reports a case that does not parse as an unreadable input (exit 1) rather than
 * as an incomplete annotation (exit 2), and to do that it printed the first line of
 * `error.message`. For a zod failure that line is `[`: the case id, a bracket, and nothing about the
 * field or the reason. This module is what turns the issue list into `path: message`.
 *
 * The tests drive it through a real schema as well as through constructed errors, because a helper
 * that is only tested on constructed input is a helper that has never seen the shape it exists for.
 */

const MISSING_FIELD = faultCaseSchema.safeParse({ caseId: 'c' });
const EMPTY_CASE = faultCaseSchema.safeParse({});

describe('describeSchemaFailure · a real parse', () => {
  it('names the field path and the reason', () => {
    expect(MISSING_FIELD.success).toBe(false);
    const description = describeSchemaFailure(MISSING_FIELD.error);
    // `system` is the first field the schema requires and `caseId` is present, so the refusal is
    // about `system` and says so.
    expect(description).toContain('system:');
    expect(description).not.toContain('[');
    expect(description.split('\n')).toHaveLength(1);
  });

  it('reports the first issue, because the rest are usually consequences of it', () => {
    expect(EMPTY_CASE.success).toBe(false);
    const issues = EMPTY_CASE.error.issues;
    expect(issues.length).toBeGreaterThan(1);
    expect(describeSchemaFailure(EMPTY_CASE.error)).toContain(issues[0]!.path.join('.'));
  });
});

describe('describeSchemaFailure · everything else', () => {
  it('drops the path when the issue is about the document as a whole', () => {
    const error = new ZodError([{ code: 'custom', path: [], message: 'the case names no sample' }]);
    expect(describeSchemaFailure(error)).toBe('the case names no sample');
  });

  it('falls back to the error for a ZodError that carries no issue', () => {
    // Not reachable through `parse`, and stated rather than assumed: the fallback is what a future
    // zod version would hit, and the alternative is a helper that returns `undefined`.
    expect(describeSchemaFailure(new ZodError([]))).toBe('[]');
  });

  it('reports the first line of an ordinary error, which is where the message is', () => {
    expect(describeSchemaFailure(new Error('EACCES: permission denied\n  at fs.readFileSync'))).toBe(
      'EACCES: permission denied',
    );
  });

  it('reports a thrown non-error as itself', () => {
    expect(describeSchemaFailure('a string, thrown by code that should have thrown an Error')).toBe(
      'a string, thrown by code that should have thrown an Error',
    );
    expect(describeSchemaFailure(undefined)).toBe('undefined');
  });
});
