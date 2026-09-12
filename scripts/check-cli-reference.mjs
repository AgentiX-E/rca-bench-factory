#!/usr/bin/env node
/**
 * Check `docs/cli-reference.md` against the real CLI.
 *
 * Two independent drifts are possible, and this catches both:
 *
 *  1. A command documented in the reference that the binary does not implement,
 *     or one the binary implements but the reference omits.
 *  2. A command whose `--help` output and whose reference section disagree about
 *     the flag set -- the reference documents flags in prose, which no test can
 *     see into, so the flag lists are compared instead.
 *
 * The reference is read from the file and the CLI is executed as a subprocess:
 * neither side is duplicated here, so this fails exactly when the two disagree.
 *
 *   node scripts/check-cli-reference.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REFERENCE = resolve(ROOT, 'docs/cli-reference.md');
const BIN = resolve(ROOT, 'packages/cli/dist/main.js');

/** Run the built CLI. `--help` exits 0 on success. */
function cli(...args) {
  return execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: ROOT });
}

const markdown = readFileSync(REFERENCE, 'utf8');

/**
 * Commands the reference documents, taken only from the "Implemented commands"
 * table.
 *
 * Scoping matters: the document has other tables (report fields, for example)
 * whose first column also looks like ``| `name` |``. Reading the whole file
 * would pull those in and report them as documented commands.
 */
function documentedCommands() {
  const section = markdown.split('## Implemented commands')[1]?.split(/^## /m)[0] ?? '';
  return [...section.matchAll(/^\|\s*`([a-z][\w-]*)`\s*\|/gm)].map((m) => m[1]);
}

const documented = documentedCommands();
if (documented.length === 0) {
  console.error('CLI reference check FAILED: no command table found in docs/cli-reference.md');
  process.exit(1);
}

const failures = [];

const topLevelHelp = cli('--help');

// The command list the binary actually advertises: the indented entries under
// `Commands:` in the top-level help. The `Usage:` line is excluded because it
// holds a placeholder, not a command name.
function advertisedCommands() {
  const section = topLevelHelp.split('Commands:')[1]?.split('\n\n')[0] ?? '';
  return [...section.matchAll(/^ {2}([a-z][\w-]*)\s{2,}\S/gm)].map((m) => m[1]);
}

const advertised = advertisedCommands();

// `help` and `version` are real commands but carry no flags, so they are not
// expected to have a per-command reference section.
const topics = advertised.filter((c) => c !== 'help' && c !== 'version');

for (const topic of topics) {
  if (!documented.includes(topic)) {
    failures.push(`command '${topic}' is implemented but not listed in docs/cli-reference.md`);
  }
}

/**
 * Does the reference mention this exact flag?
 *
 * A plain `includes` is not enough: `--lead-ms-X` contains `--lead-ms`, so a
 * renamed flag would still look documented. The trailing boundary rejects a
 * flag character following the name, which is what makes a rename visible.
 */
function mentionsFlag(markdown, flag) {
  const pattern = new RegExp(`${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);
  return pattern.test(markdown);
}

for (const topic of topics) {
  let help;
  try {
    help = cli(topic, '--help');
  } catch {
    failures.push(`command '${topic}' rejected --help`);
    continue;
  }

  // Every flag the help advertises must appear somewhere in the reference
  // document. The prose around it is free-form; the flag name is the contract.
  const flags = [...help.matchAll(/^ {2}(--[\w-]+)/gm)].map((m) => m[1]);
  if (flags.length === 0) {
    failures.push(`command '${topic}' advertises no flags, which cannot be right`);
  }
  for (const flag of flags) {
    if (!mentionsFlag(markdown, flag)) {
      failures.push(`'${flag}' is accepted by '${topic}' but absent from docs/cli-reference.md`);
    }
  }
}

// A section header for a command that does not exist is a documentation bug of
// its own: readers follow it and hit `unknown command`.
for (const heading of [...markdown.matchAll(/^### `rca-bench ([\w-]+)`/gm)].map((m) => m[1])) {
  if (!topics.includes(heading)) {
    failures.push(`docs/cli-reference.md documents '${heading}', which is not an implemented command`);
  }
}

if (failures.length > 0) {
  console.error('CLI reference check FAILED:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`CLI reference check PASSED (${topics.length} commands, ${documented.length} documented)`);
