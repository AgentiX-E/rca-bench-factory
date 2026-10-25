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
