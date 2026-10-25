import { ZodError } from 'zod';

/**
 * The one line of a schema failure that names the field and the reason.
 *
 * `check-fault-cases` reports a case that does not parse as an unreadable input rather than as an
 * incomplete annotation -- `FaultCase` failed its contract, which is a different repair from "the
 * evidence layer is empty". To do that it printed `String(error.message).split('\n')[0]`, and for a
 * zod failure that line is `[`: the issue list is JSON, pretty-printed, so the case id was followed
 * by a bracket and the field, the path and the reason were on the lines that got dropped.
 *
 * That was survivable while the only schema refusals were missing required strings -- the type error
 * said enough. It stopped being survivable when `evidenceCheckpointSchema` gained a biconditional
 * (finding 245): "a derived checkpoint states the arithmetic that produces its value, and this one
 * has none" is the entire diagnosis, and the guard printed `does not parse: [`. A refusal whose
 * reason is not in the message teaches the author to read the schema to find out what happened.
 *
 * The form is `path: message`, the same shape the guard's own problems use, so a parse refusal and a
 * guard refusal read alike. A non-zod throw is reported as its first line: this function describes a
 * failure, it does not decide what kind it is.
 */
export function describeSchemaFailure(error: unknown): string {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    if (first !== undefined) {
      const path = first.path.join('.');
      return path === '' ? first.message : `${path}: ${first.message}`;
    }
  }
  if (error instanceof Error) {
    const newline = error.message.indexOf('\n');
    return newline === -1 ? error.message : error.message.slice(0, newline);
  }
  return String(error);
}
