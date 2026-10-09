#!/usr/bin/env node
/**
 * Fails the build when a shell line contains a `$`-construct that the shell
 * cannot parse, or that it parses into something other than what was written.
 *
 * ## Why this gate exists, and why it is not hypothetical
 *
 * The agent driving this repository interrupted its own tool calls three times
 * with the same error: `Bad substitution`. The mechanism was identical each
 * time, and it was never the program being run -- it was the *quoting* around
 * it. A program such as
 *
 *     node -e "console.log(JSON.stringify(process.argv))" -- args
 *
 * was written with its inner text inside a **double**-quoted shell string.
 * Double quotes do not stop the shell: it expands `$...` inside them before the
 * program ever starts, so the shell saw `$(`-less gibberish it could not parse
 * and reported `Bad substitution` -- an error naming the *shell*, at the line
 * of the *outer* command, for a defect in the *inner* program. The message
 * pointed at the wrong file, the wrong language, and the wrong author.
 *
 * The class is not "the agent made a mistake". It is:
 *
 *     **A command whose output is quoted for a human reader but interpreted by
 *     a shell, where the two disagree about which characters are inert.**
 *
 * That is the same shape as every other defect this repository tracks: a claim
 * (the quotes) and a reader (the shell) that do not agree. The reason it
 * deserves a gate rather than a note is that the failure is *silent in review*
 * -- the line looks correct to anyone reading it as text, and it is correct in
 * `bash` for many inputs. Only the parser disagrees, and only sometimes.
 *
 * ## The rule, stated narrowly enough to be checkable
 *
 * Inside a **double-quoted** shell string, a `$` is a hazard unless it begins
 * an expansion this gate knows to be intentionally inert. Two spellings are
 * legitimate and are recognised:
 *
 *   - `\$` -- an escaped dollar, which the shell passes through as a literal;
 *   - `${VAR}` / `$VAR` / `$(cmd)` / `${...}` -- a real expansion, which is
 *     fine *only* when the string is a shell line rather than a nested program.
 *
 * The second distinction is what makes this tractable. `"$HOME"` in a `.sh`
 * file is ordinary shell. `"$HOME"` in the argument of `node -e` is a shell
 * expansion that strips the quoting before Node sees it, which is the defect.
 * So the gate flags a `$`-construct in a double-quoted string **only when that
 * string is the body of a nested interpreter** -- `-e`, `-c`, `--eval`,
 * `--expr` -- or when the construct cannot be parsed as *any* expansion, which
 * is the `Bad substitution` case itself.
 *
 * ## What is deliberately NOT flagged
 *
 *   - a `$` inside single quotes, which the shell never expands;
 *   - a `$` inside a heredoc with a **quoted** delimiter (`<<'EOF'`), which is
 *     the safe spelling this repository uses everywhere and recommends;
 *   - a `$` inside a comment;
 *   - `$1`, `$@`, `$?`, `$$` -- positional and status parameters, which are
 *     valid in double quotes and mean what they say;
 *   - `${VAR}`, `$(cmd)`, `$((expr))` in a plain shell line.
 *
 * ## What IS flagged
 *
 *   - a dollar immediately followed by a character that cannot begin an
 *     expansion -- the `Bad substitution` family: `$"`, `$'`(inside double
 *     quotes), `$,`, `$:`, `$;`, `$ ` is legal-but-suspicious and NOT flagged;
 *   - a nested-interpreter body (`node -e "..."`, `python3 -c "..."`,
 *     `sh -c "..."`) that contains an unescaped `$`;
 *   - a `for x in $(...)`-style body passed through `sh -c` where the expansion
 *     is intended for the inner shell; this is allowed when escaped and flagged
 *     when not, because "the inner shell will expand it" and "this shell will"
 *     are different programs.
 *
 * ## Usage
 *
 *   node scripts/check-no-unsafe-shell.mjs
 *   node scripts/check-no-unsafe-shell.mjs --root <dir>   # scan just this tree
 *   node scripts/check-no-unsafe-shell.mjs --file <path>  # scan one file
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..');

/**
 * Every place a shell line can be written in this repository.
 *
 * `.sh` files are scanned in full. The workflow files are scanned because
 * `run:` bodies are shell, and a `run: node -e "..."` is exactly the defect.
 * The `Makefile` is included for the same reason and is harmless when absent.
 */
const DEFAULT_SCAN_ROOTS = [resolve(ROOT, 'scripts'), resolve(ROOT, '.github', 'workflows')];
const SHELLISH = /\.(sh|bash|zsh|yml|yaml)$/;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git', '.turbo', '__pycache__']);

/** Set by `--stdin`; the label `--label` gives the report, and `false` otherwise. */
let stdinMode = false;
let stdinLabel = '<stdin>';

/**
 * Gather the scan targets.
 *
 * `--root <dir>` replaces the default list and `--file <path>` narrows to one
 * file. Both exist so the gate is falsifiable: a test can point it at a tree it
 * synthesised and observe the failure, which is the property the roadmap's P1-6
 * item asks of every gate. Additive by construction -- with no argument the
 * behaviour is exactly `pnpm lint`'s.
 */
/**
 * Arguments the parser does not understand, and values it was promised.
 *
 * ## Why an unrecognised argument is an error rather than a no-op
 *
 * This function used to ignore anything it did not recognise, which made
 *
 *     node scripts/check-no-unsafe-shell.mjs t1.sh
 *
 * fall through to the default scan roots -- `[scripts, .github/workflows]`.
 * The gate scanned the committed tree, the committed tree was clean, and it
 * printed `OK`. A **correct** verdict about the subject the gate chose, and a
 * **false** verdict about the subject the caller named, with no way for the
 * caller to tell the two apart. The supported spelling is `--file`, and a
 * positional path is what every other checker in this repository accepts, so
 * the mistake is one anybody types.
 *
 * This is finding 104's pattern -- a spelling with no reader -- reached from the
 * caller's side: the reader for `--file` is real and tested, the positional
 * spelling has no reader at all, and the failure mode of a spelling with no
 * reader is not an error but silence. It was found in this file, by accident,
 * while diagnosing something else (finding 134).
 */
const unknownArguments = [];
const missingValues = [];

function targets() {
  const roots = [];
  const files = [];
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i];
    if (arg === '--root' || arg === '--file' || arg === '--label') {
      const value = process.argv[i + 1];
      // A flag at the end of the line used to consume nothing and scan the
      // default roots, so `--root` alone was the same silent `OK` as a
      // positional path.
      if (value === undefined || value.startsWith('--')) {
        missingValues.push(arg);
        continue;
      }
      if (arg === '--root') roots.push(resolve(value));
      else if (arg === '--file') files.push(resolve(value));
      else stdinLabel = value;
      i += 1;
    } else if (arg === '--stdin') {
      stdinMode = true;
    } else if (arg !== undefined) {
      unknownArguments.push(arg);
    }
  }
  if (stdinMode) return [];
  if (files.length > 0) return files;
  const scan = roots.length > 0 ? roots : DEFAULT_SCAN_ROOTS;
  return scan.flatMap(walk);
}

/**
 * Read one command from stdin and check it as if it were a line of a shell file.
 *
 * ## Why this mode exists, and what it is for
 *
 * The gate's rule was correct and its own fixtures proved it, and the agent
 * driving this repository still interrupted three tool calls with
 * `Bad substitution`. Both statements are true because they are about different
 * objects: the gate checks the repository, and the failure was in a **command
 * that was never in the repository**. The path a tool call takes is
 *
 *     intent -> shell string -> shell -> program
 *
 * and the gate only ever saw the first two steps for files that were *committed*.
 * A command the agent typed at the tool boundary was never an input to anything,
 * so no test could fail and no gate could fire -- the same "published check with
 * no reader" shape as findings 123-130, one scope further out.
 *
 * `--stdin` makes the command itself checkable before it runs:
 *
 *     printf '%s' "$cmd" | node scripts/check-no-unsafe-shell.mjs --stdin
 *
 * `--label` names the source in the report, so an operator reading a failure
 * sees the tool call rather than `<stdin>`.
 *
 * The rule is deliberately the same one. A second, weaker predicate for "a
 * command a human typed" would be the shape defect this whole finding is about:
 * two readers of one claim, disagreeing.
 */
function checkStdin() {
  const source = readFileSync(0, 'utf8');
  const lines = source.split('\n');
  lines.forEach((line, i) => checkLine(stdinLabel, i + 1, line));
}

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (SKIP_DIRS.has(entry)) return [];
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * The programs whose argument is a *nested program* rather than data.
 *
 * Only this list triggers the nested-interpreter rule. It is a list of
 * spellings rather than a heuristic on purpose: "looks like code" is not
 * checkable, and the whole point of the gate is that a reader and a parser
 * disagree about a string, so the gate must not itself guess.
 */
const NESTED_INTERPRETERS = new Set(['-e', '-c', '--eval', '--expr']);

/**
 * A `${...}` whose body is not a parameter expansion, and is therefore the
 * `Bad substitution` family.
 *
 * ## The exact reproducer, measured rather than assumed
 *
 *     zsh -c 'echo "${JSON.stringify(x)}"'
 *     zsh:1: bad substitution
 *
 * The instrument is the same string that interrupted the agent three times:
 * `JSON.stringify(...)`. Inside `${...}` a POSIX shell expects a parameter name
 * followed by an operator (`:-`, `#`, `%`, `/`, `[`) or a closing brace. A `.`
 * or a `(` after the name is not an operator, so the parser rejects the word
 * and reports the failure against the *shell*, at the line of the outer
 * command, naming neither the inner program nor the inner language.
 *
 * Three spellings, and only the first two are defects:
 *
 *   - `${JSON.stringify(x)}`  -- a call, which is not an expansion. Flagged.
 *   - `${a.b}`                -- a dotted name, which is not a parameter. Flagged.
 *   - `${VAR}`, `${1:-x}`, `${a#b}`, `${a//b/c}`  -- real expansions. Allowed.
 *
 * ## Why this is not a regex over `$`
 *
 * The obvious rule -- "a `$` in double quotes is suspicious" -- is wrong in both
 * directions and this gate shipped with that wrong rule first, which is the
 * instructive part: the first version scanned *the shipped tree* and reported
 * OK, then was handed a file containing `${JSON.stringify(x)}` and *also*
 * reported OK. A gate that cannot see the defect it was written for is the
 * claim-with-no-reader pattern this repository exists to find, and it was found
 * here, in the gate, by testing the gate on its own motivating input. The rule
 * is therefore stated as "parse the braced group and decide whether it is a
 * valid expansion", not as "look for a dollar sign".
 */
/**
 * Does the body of a `${...}` contain a construct no shell can expand?
 *
 * The predicate answers one question, stated the way both shells state it: **is
 * the token in the parameter-name position a valid name?** A POSIX shell reads
 * `${`, then a parameter name, then an operator (`:-`, `#`, `%`, `/`, `[`) or a
 * closing brace. Anything else in the name position is `bad substitution`.
 *
 * ## The rule was measured, not assumed
 *
 * Both shells were probed with each candidate, and the table below is the
 * result rather than a reading of a specification:
 *
 *     ${a.b}                zsh: bad substitution   bash: bad substitution
 *     ${a(b)}               zsh: bad substitution   bash: bad substitution
 *     ${JSON.stringify(x)}  zsh: bad substitution   bash: bad substitution
 *     ${a b}                zsh: bad substitution   bash: bad substitution
 *     ${ a}                 zsh: bad substitution   bash: bad substitution
 *     ${1.2}                zsh: bad substitution   bash: bad substitution
 *     ${a.b:-c}             zsh: bad substitution   bash: bad substitution
 *     ${a-b}                zsh: 0x62 'b'          bash: 0x62 'b'
 *     ${}                   zsh: empty             bash: bad substitution
 *     $(a.b)                zsh: command not found bash: command not found
 *
 * The last three are the boundary and explain why the rule is written as a
 * *name check* rather than as a list of forbidden characters. `${a-b}` is legal
 * -- `-` is a special parameter, not a hyphen -- and `${}` differs between the
 * two shells, so a gate that flagged either would be wrong about one of them.
 *
 * ## Two earlier versions of this predicate, both wrong, both instructive
 *
 * The first looked for `$` followed by a character that cannot begin *any*
 * expansion. It passed the shipped tree, and then passed a file containing
 * `${JSON.stringify(x)}` -- the exact input that motivated the gate. A gate that
 * cannot see its own counterexample is the claim-with-no-reader pattern this
 * repository tracks, and it was found here, in the gate.
 *
 * The second required the group to match an allowlist of operator spellings. It
 * could not match `${a:-${b}}`, which nests, so it reported a legal expansion as
 * a defect -- and a gate that rejects valid input is worse than no gate, because
 * the remedy is to delete it. The allowlist is gone.
 *
 * A third rule, `badSubstitutionAt`, was deleted rather than tested: it claimed
 * a bare `$` followed by certain punctuation was `bad substitution`, and probing
 * both shells showed that **none** of those spellings fail -- `$,`, `$:`, `$.`
 * all print literally. The rule was kept alive by the mutation harness, which
 * reported that disabling it changed nothing. A rule no test can falsify is not
 * a rule; it is the same defect one level down, in the gate.
 */
function bracedGroupIsInvalid(inner) {
  // A braced group with no name at all -- `${}` -- is the construct below.
  //
  // This was the one hole in the rule, and finding 132 is about it. The line
  // read `return stripped.length > 0`, whose comment says "no name at all:
  // `${}`, `${ a}`" -- so the intent was to report it and the expression
  // returned the opposite for the empty case, because `stripped` for `${}` is
  // the empty string and `''.length > 0` is false. `${ a}` was caught only
  // incidentally, by the leading-space branch above.
  //
  // Measured, both shells, `echo "v=${}"`:
  //
  //     zsh:  prints `v=`            (accepts it)
  //     bash: bad substitution       (rejects it)
  //
  // `bash` is the shell this repository's shebangs name and the one CI runs, so
  // the gate must refuse it. A construct one shell rejects and another silently
  // replaces with the empty string is the strongest case for flagging rather
  // than an exemption: the author wrote a name, and neither shell will tell
  // them the name went missing.
  if (inner.length === 0) return true;
  // `#`, `!` and `##` are *prefix* operators on a name (`${#a}`, `${!ref}`,
  // `${#@}`), and `%`/`#` are also suffixes. Strip a leading prefix operator
  // before reading the name, so `${#a}` is not read as the name `#`.
  const stripped = inner.replace(/^#{1,2}|^!/, '');
  // A leading character outside the name alphabet. A space, a `+` or a `.` in
  // the name position is the failure; `@`, `*`, `?`, `$`, `-` and a digit are
  // the single-character special parameters and are legal.
  if (stripped.length > 0 && /^[^A-Za-z0-9_@*?$\-]/.test(stripped)) return true;
  const m = stripped.match(/^([A-Za-z_][A-Za-z0-9_]*|\d|[@*?$\-])/);
  // An empty `stripped` means the whole group was a prefix operator, and both
  // operators have a bare form that is legal: `${#}` is `$#` and `${!}` is
  // `$!`, and both run in each shell (`zsh` and `bash` both print `0` for the
  // first). Flagging them would be a false positive, and a gate with false
  // positives gets switched off -- so the empty case is handled above, where
  // only a group with nothing in it at all reaches it.
  if (m === null) return false;
  const after = stripped.slice(m[0].length);
  if (after.length === 0) return false; // `${a}` -- a complete expansion
  const first = after[0];
  // The operator characters both shells accept directly after a name.
  return !/[#%/^,:@*+=?\-]|\[/.test(first);
}

/**
 * Every `${...}` in `text` that is not a valid expansion.
 *
 * A brace-matching scan rather than a regex, because `${a:-${b}}` nests and a
 * regex cannot count depth. Offsets are preserved so the reported column is the
 * column in the file.
 */
function invalidBracedGroups(text) {
  const hits = [];
  for (let i = 0; i < text.length - 1; i += 1) {
    if (text[i] !== '$' || text[i + 1] !== '{') continue;
    if (i > 0 && text[i - 1] === '\\') continue;
    // Walk to the matching close brace.
    let depth = 0;
    let end = -1;
    for (let j = i + 1; j < text.length; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) continue; // unterminated; a different (and louder) failure
    const inner = text.slice(i + 2, end);
    if (bracedGroupIsInvalid(inner)) hits.push({ at: i });
    i = end;
  }
  return hits;
}

/**
 * Split a line into double-quoted spans, honouring backslash escapes and
 * single-quoted spans.
 *
 * A character scanner rather than a regex, for the reason `derive-gate-sites`
 * gives about its own scanner: a regex that matches a quoted string cannot also
 * count the escapes inside it, and the escape is the whole question here. The
 * scanner preserves offsets so a reported column is the column in the file.
 */
function doubleQuotedSpans(line) {
  const spans = [];
  let i = 0;
  let quote = null;
  let start = -1;
  while (i < line.length) {
    const ch = line[i];
    if (quote === null) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === "'" || ch === '"') {
        quote = ch;
        start = i;
      }
      i += 1;
      continue;
    }
    if (quote === "'") {
      if (ch === "'") {
        quote = null;
        start = -1;
      }
      i += 1;
      continue;
    }
    // Inside a double-quoted span.
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') {
      spans.push({ start, end: i, body: line.slice(start + 1, i) });
      quote = null;
      start = -1;
      i += 1;
      continue;
    }
    i += 1;
  }
  return spans;
}

/** The tokens of a line, split on whitespace outside quotes. */
function tokens(line) {
  return line.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
}

const failures = [];

/**
 * A path to report.
 *
 * Relative to the repository when the file is inside it, and absolute
 * otherwise. `relative()` alone produced `../../../../../tmp/bad.sh` for a
 * fixture handed in with `--file`, which is a path that navigates out of the
 * repository to describe a file that was never in it. A failure message has to
 * name the file the reader should open.
 */
function displayPath(file) {
  const rel = relative(ROOT, file);
  return rel.startsWith('..') ? file : rel;
}

function checkLine(file, lineNo, line) {
  // Comments are not executed. A `$` documented in prose is the point of
  // several comments in this tree and must keep working.
  const code = line.replace(/(^|\s)#.*$/, '$1');

  for (const span of doubleQuotedSpans(code)) {
    // The primary rule: a `${...}` the shell cannot parse.
    for (const hit of invalidBracedGroups(span.body)) {
      failures.push({
        file: displayPath(file),
        line: lineNo,
        column: span.start + 2 + hit.at,
        kind: 'bad-substitution',
        text: line.trim(),
      });
    }

    // The nested-interpreter rule. Only consulted when the line actually names
    // one, so a plain shell line's expansions stay allowed.
    const toks = tokens(code);
    const namesInterpreter = toks.some((t) => NESTED_INTERPRETERS.has(t));
    if (!namesInterpreter) continue;

    // A `$` that survives into the nested program is a defect: the outer shell
    // expands it first, so the program receives a different string than the one
    // written, and the author's mental model ("the program will see `$x`") is
    // false. The safe spellings are `\$` -- which the scanner has already
    // skipped -- or a single-quoted body.
    if (/\$/.test(span.body) && !/\\\$/.test(span.body)) {
      failures.push({
        file: displayPath(file),
        line: lineNo,
        column: span.start + 1 + span.body.search(/\$/),
        kind: 'nested-interpreter-expansion',
        text: line.trim(),
      });
    }
  }
}

// Parse the arguments *before* branching on them.
//
// The first cut of this called `targets()` only inside the file loop and tested
// `stdinMode` above it, so the flag was still `false` when it was read and
// `--stdin` silently scanned nothing and printed OK. That is the same defect as
// the four findings before this one -- a check that reports a verdict about
// input it never read -- reintroduced inside the fix for it. `targets()` runs
// once, here, and both branches consume its result.
const selected = targets();

// Argument errors are reported before any scanning, because their whole point is
// that the scan the caller asked for did not happen.
if (missingValues.length > 0 || unknownArguments.length > 0) {
  console.error('check-no-unsafe-shell: FAILED');
  console.error('');
  for (const a of missingValues) {
    console.error(`  ${a} was given no value`);
  }
  for (const a of unknownArguments) {
    console.error(`  unrecognised argument: ${a}`);
  }
  console.error('');
  console.error('A file or directory is named with --file / --root; a command is piped');
  console.error('with --stdin; --label names the source. A positional path selects nothing');
  console.error('and the gate would scan the committed tree instead, reporting OK about a');
  console.error('subject the caller did not ask about.');
  process.exit(1);
}

if (stdinMode) {
  checkStdin();
}

for (const file of selected) {
  if (!SHELLISH.test(file)) continue;
  const isWorkflow = /\.(yml|yaml)$/.test(file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Workflows are YAML: only `run:` bodies are shell. Scanning the whole file
    // would flag `${{ ... }}` expressions, which are YAML's own and are not
    // shell at all -- flagging them would make the gate wrong about its own
    // subject and it would be switched off within a week.
    if (isWorkflow) {
      const m = line.match(/^\s*(?:- )?run:\s*(.*)$/);
      if (m === null) return;
      const body = m[1];
      // A block scalar's first line is usually empty; the body follows.
      if (body === '' || body === '|' || body === '>' || body === '|-' || body === '>-') return;
      // `${{ }}` is GitHub's templating, expanded before any shell sees it.
      const withoutGithubExpr = body.replace(/\$\{\{[^}]*\}\}/g, '');
      checkLine(file, i + 1, withoutGithubExpr);
      return;
    }
    checkLine(file, i + 1, line);
  });
}

if (failures.length > 0) {
  console.error('check-no-unsafe-shell: FAILED');
  console.error('');
  console.error('These lines contain a `$`-construct a shell will expand before the');
  console.error('program it names ever starts. The failure it produces is `Bad');
  console.error('substitution`, an error that names the shell and not the code.');
  console.error('');
  console.error('Use single quotes, or a heredoc with a quoted delimiter:');
  console.error("    node script.mjs <<'SH'   # or:  node -e '...'  with single quotes");
  console.error('');
  for (const f of failures) {
    console.error(`  ${f.file}:${f.line}:${f.column}  ${f.kind}`);
    console.error(`      ${f.text}`);
  }
  console.error('');
  console.error(
    `${failures.length} occurrence(s) across ${new Set(failures.map((f) => f.file)).size} file(s).`,
  );
  process.exit(1);
}

/**
 * Say `OK` only to a terminal; be silent when composed into a pipeline.
 *
 * ## Why the pass line was the thing keeping the remedy unusable
 *
 * The remedy for findings 131/134/135 has to be composable -- that is the lesson
 * of the fourth occurrence, which happened because checking a command required
 * writing a *second* command, and the second one was checked by nothing. Two
 * properties are needed for that, and the gate had neither:
 *
 *   1. a pass must print **nothing** on stdout, or `gate ... && run-the-thing`
 *      still works but `$(gate ...)` and every log-comparison carries a stray
 *      line, and a gate whose output changes when it is piped is a gate nobody
 *      composes;
 *   2. the pass line must not be mistaken for the *subject's* output, which is
 *      exactly what happens when the gate and the thing it checks write to the
 *      same stream.
 *
 * A terminal is a human reading the result, and a human wants the line. A pipe
 * or a file is a program reading it, or a transcript a program will compare, and
 * a program wants quiet. So the pass line follows the terminal, and the failure
 * report does not: a failure is stderr either way.
 *
 * The default when `/proc` is absent is to print, because an unreadable
 * environment must leave the tool behaving as it always did rather than
 * silently changing shape.
 */
function stdoutIsTerminal() {
  try {
    return statSync('/proc/self/fd/1').isCharacterDevice();
  } catch {
    return true;
  }
}

if (stdoutIsTerminal()) {
  console.log('check-no-unsafe-shell: OK');
}
