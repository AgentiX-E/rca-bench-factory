#!/usr/bin/env node
/**
 * The verdict for the progress log's split: four volumes, one index, one order.
 *
 * The reading -- which volumes exist, which rounds each holds, whether the index
 * agrees, whether the numbering advances -- is in `progress-volumes.mjs`, and it is
 * there for the reason `check-audit-volumes.mjs` learned the expensive way: this
 * file is a gate, `verify-gates-are-testable.mjs` proves a gate by emptying it, and
 * an emptied file that a test imports kills the worker before it can name a failing
 * test. `UNATTRIBUTED` is not a proof, and the meta-gate says so.
 *
 * `RCA_PROGRESS_DIR` and `RCA_PROGRESS_INDEX` point it at a fixture, the same way
 * `check-audit-volumes.mjs` takes `RCA_AUDIT_DIR`: the volume rules have more
 * failure modes than the real log will ever exhibit, and a rule nobody has seen
 * fail is a rule nobody has seen.
 */

import { readFileSync } from 'node:fs';
import { INDEX, VOLUMES, check } from './progress-volumes.mjs';

const cliDir = process.env['RCA_PROGRESS_DIR'] ?? VOLUMES;
const cliIndex = process.env['RCA_PROGRESS_INDEX'] ?? INDEX;

if (process.argv[1] !== undefined && process.argv[1].endsWith('check-progress-volumes.mjs')) {
  const result = check(readFileSync(cliIndex, 'utf8'), cliDir);
  process.stdout.write(`${result.summary}\n`);
  for (const error of result.errors) process.stderr.write(`  ${error}\n`);
  process.exit(result.ok ? 0 : 1);
}
