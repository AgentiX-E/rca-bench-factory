import type { DeclaredQuantity } from './types.js';

/**
 * Reading a quantity a case declares about itself.
 *
 * `FaultCase.fault.parameters` is an open record: the injector's knobs, which differ per fault kind.
 * Most of them are scalars -- `container: 'checkout-api-app'`, `limitMillicores: 500` -- and a
 * configuration checkpoint that cites one is citing the case's own statement about how the system was
 * configured. A scalar has no unit, though, so a checkpoint citing it may not state one either: a
 * unit beside a number that carries none is a claim nothing in the file can check.
 *
 * A parameter may also be written as a quantity, `{ "value": 500, "unit": "mcore" }`, and then the
 * unit travels with the value and a checkpoint can be checked against both. The reader is here rather
 * than in the guard for the reason `assembly` lives in `core`: the guard is a script, and a rule that
 * only a script can exercise is a rule whose tests are all subprocess spawns.
 *
 * ## What is deliberately not accepted
 *
 * Anything that is not a number, a string, or an object with a numeric `value`: a boolean, an array,
 * a nested object without `value`. Those are parameters a checkpoint cannot cite, and the guard says
 * so by name rather than comparing `undefined` with something. An object whose `unit` is present but
 * not a string is refused for the same reason -- the shape is not a quantity, and reading it as one
 * would invent a unit from whatever was there.
 */

/** Whether a value is a quantity this repository will read: a number, or `{ value, unit? }`. */
export function readDeclaredQuantity(value: unknown): DeclaredQuantity | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { value } : undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.value !== 'number' || !Number.isFinite(record.value)) return undefined;
  if (record.unit === undefined) return { value: record.value };
  if (typeof record.unit !== 'string' || record.unit.trim() === '') return undefined;
  return { value: record.value, unit: record.unit };
}

/**
 * A reading a signals file declares: a literal, or a reference to a quantity the case declares.
 *
 * A series' `baseline` and `post` are numbers today, and the same number often appears twice: the
 * pool's ceiling is a reading (`connections in use == 20`) and a parameter (`poolSize: 20`), and two
 * checkpoints make them agree without making one *read* the other. That is a pair that stays in step
 * by being edited together, which is the defect this reader removes (finding 258).
 */
export type ReadingResolution =
  | { kind: 'literal'; value: number }
  | { kind: 'parameter'; parameter: string };

/**
 * Read a declared reading, without resolving the parameter it names.
 *
 * The split is deliberate: this module knows how to read the *shape*, and the guard knows the
 * parameters of the case in hand. A function that took both would be a function whose caller could
 * not tell a malformed reference from a reference to something absent, and those are two different
 * repairs.
 *
 * `undefined` means the value is neither a finite number nor `{ parameter: <non-empty string> }`.
 * `{ parameter: 3 }` is not a reference -- a parameter's name is a name -- and neither is a bare
 * string, which is what the previous shape of this field used to be mistaken for.
 */
export function readDeclaredReading(value: unknown): ReadingResolution | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { kind: 'literal', value } : undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.parameter !== 'string' || record.parameter.trim() === '') return undefined;
  // A reading that carries a value *and* a parameter is two claims about one number, and nothing
  // would say which of them the sample used.
  if (Object.keys(record).length !== 1) return undefined;
  return { kind: 'parameter', parameter: record.parameter };
}
