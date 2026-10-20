#!/usr/bin/env node
/**
 * The verdict for the audit log's split: four volumes, one index, one heading form.
 *
 * ## Why the verdict is all that is here
 *
 * The reading -- which volumes exist, what each holds, whether the index agrees --
 * is in `audit-volumes.mjs`, and it moved there for a reason this repository has
 * now paid for twice.
 *
 * This file is a gate. `verify-gates-are-testable.mjs` proves a gate by emptying
 * it and requiring the suite to go red. A gate that a test *imports* cannot be
 * proved that way: the emptied file kills the worker at its first statement, and
 * the meta-gate reports "exited 1 and named no failing test" -- unattributed, and
 * therefore not a proof. The first version of this gate held both halves, and the
 * meta-gate said exactly that about it. So: the module holds the reading and is
 * imported, this file holds the verdict and is spawned.
 *
 * ## What it reads, and how it can be driven
 *
 * The repository's own log by default. `RCA_AUDIT_DIR` and `RCA_AUDIT_INDEX`
 * point it at a fixture instead, the same way `verify-local.mjs` takes
 * `RCA_CI_WORKFLOW` -- a gate whose failure cannot be produced is a gate nobody
 * has seen work, and the volume rules have more failure modes than the real log
 * will ever exhibit.
 *
 * ## The rules themselves
 *
 * See the header of `audit-volumes.mjs`: contiguous numbering, a byte budget per
 * volume, one heading form, and an index row per volume whose range and count are
 * the file's rather than the row's claim.
 */

import { readFileSync } from 'node:fs';
import { INDEX, VOLUMES, check } from './audit-volumes.mjs';

const cliDir = process.env['RCA_AUDIT_DIR'] ?? VOLUMES;
const cliIndex = process.env['RCA_AUDIT_INDEX'] ?? INDEX;

if (process.argv[1] !== undefined && process.argv[1].endsWith('check-audit-volumes.mjs')) {
  const result = check(readFileSync(cliIndex, 'utf8'), cliDir);
  process.stdout.write(`${result.summary}\n`);
  for (const error of result.errors) process.stderr.write(`  ${error}\n`);
  process.exit(result.ok ? 0 : 1);
}
