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
 * The reference's per-command sections, keyed by the command each one documents.
 *
 * ## Why this exists, and the defect it fixes
 *
 * The first version of this gate looked a flag up in the **whole document**:
 *
 *   `mentionsFlag(markdown, flag)` -- over `markdown`
 *
 * while the header above claims it catches "a command whose `--help` output and
 * whose reference **section** disagree". Both halves of that were false, and
 * both were measured rather than reasoned about:
 *
 *  - a real flag could be deleted from its own command's section and written
 *    under another command's heading, and the gate stayed green, because the
 *    name was still somewhere in the file;
 *  - a flag **no command accepts** could be written in a section, and the gate
 *    stayed green too, because every check ran from the help text towards the
 *    document and none ran back.
 *
 * A section runs from its own `### \`rca-bench X\`` heading to the next heading
 * at the same or a higher level. That is the same rule `check-open-list.mjs`
 * needed for its second list (finding 162): the subject is the section, and a
 * document-wide search is a different subject wearing the same name.
 *
 * ## What is deliberately not compared
 *
 * The text before the first per-command heading documents global behaviour --
 * `--help`, `-h`, `help <command>` -- which no command advertises as its own
 * flag and every command accepts. Holding that preamble to a command's flag set
 * would report a disagreement where there is none, so the per-command sections
 * are the contract and the preamble is prose. Said here rather than left as a
 * silent gap.
 */
function commandSections(markdown) {
  const sections = new Map();
  let current;
  for (const line of markdown.split('\n')) {
    const heading = /^### `rca-bench ([\w-]+)`\s*$/.exec(line);
    if (heading !== null) {
      current = heading[1];
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (/^#{1,3} /.test(line)) {
      current = undefined;
      continue;
    }
    if (current !== undefined) sections.get(current).push(line);
  }
  return sections;
}

/**
 * Every flag written in a block of text, as a set.
 *
 * The leading boundary rejects a flag glued to a word, so prose about
 * `x--flag` is not read as a mention; the trailing side needs no boundary here
 * because the comparison is set membership -- `--lead-ms-X` is simply not
 * `--lead-ms`, which is what makes a rename visible.
 */
function flagsIn(lines) {
  // `--` followed by a lowercase letter: a flag starts with a word, and a
  // Markdown table rule is `| --- |`. Without that letter the rule's own dashes
  // read as a flag named `---`, which is what the first run of this check
  // reported under `official` before it was narrowed.
  return new Set([...lines.join('\n').matchAll(/(?<![\w-])(--[a-z][\w-]*)/g)].map((m) => m[1]));
}

const sections = commandSections(markdown);

for (const topic of topics) {
  let help;
  try {
    help = cli(topic, '--help');
  } catch {
    failures.push(`command '${topic}' rejected --help`);
    continue;
  }

  const flags = [...help.matchAll(/^ {2}(--[\w-]+)/gm)].map((m) => m[1]);
  if (flags.length === 0) {
    failures.push(`command '${topic}' advertises no flags, which cannot be right`);
  }

  const section = sections.get(topic);
  if (section === undefined) {
    failures.push(`command '${topic}' has no \`### rca-bench ${topic}\` section in docs/cli-reference.md`);
    continue;
  }
  const written = flagsIn(section);

  // Direction one: every flag the help advertises must be written down in the
  // section a reader would follow to find out what it does.
  for (const flag of flags) {
    if (!written.has(flag)) {
      failures.push(`'${flag}' is accepted by '${topic}' but absent from docs/cli-reference.md's section for it`);
    }
  }

  // Direction two: every flag written in the section must be one the command
  // accepts. This is the direction that reads a reference when the flag has
  // been removed from the binary -- the moment a stale document misleads.
  for (const flag of written) {
    if (!flags.includes(flag)) {
      failures.push(`'${flag}' is written under '${topic}', which does not accept it`);
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
