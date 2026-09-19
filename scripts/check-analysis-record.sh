#!/usr/bin/env bash
#
# Assert that the published analysis record under docs/analysis/ is intact.
#
# Why this exists, and why it is not a duplicate of sync-analysis.sh:
#
#   sync-analysis.sh runs where the evidence is produced, and needs the source
#   directory to be present. CI has neither the source directory nor the raw
#   run artifacts, so it cannot ask "does the local tree match the published
#   one". It can, however, ask the weaker question that actually catches decay:
#   "is what is published still well-formed enough to be useful?" A record that
#   has lost its verdicts, or gained a document nobody can read or a credential
#   nobody meant to share, is broken regardless of what the local copy holds.
#
# Contract checked here:
#
#   1. The record is non-empty and keeps its top-level shape.
#   2. Every text file in it is English.
#   3. No text file carries a credential-looking literal.
#   4. Raw run artifacts are absent (they are regenerable and excluded by
#      contract; their reappearance means the exclusion stopped working).
#   5. The sync contract itself is present, so the record stays reproducible.
#   6. Every document that mentions a run id mentions one that is indexed.
#
# Usage: scripts/check-analysis-record.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$REPO_ROOT/docs/analysis"

fail() { echo "check-analysis-record: FAIL: $*" >&2; exit 1; }

# 1. Shape ---------------------------------------------------------------
[ -d "$DEST" ] || fail "docs/analysis/ is missing"

for d in verdicts plans dispatch run-ids logs scripts tools; do
  [ -d "$DEST/$d" ] || fail "docs/analysis/$d/ is missing"
done
[ -f "$DEST/README.md" ] || fail "docs/analysis/README.md is missing"

total="$(find "$DEST" -type f | wc -l)"
[ "$total" -gt 0 ] || fail "docs/analysis/ holds no files"

for d in verdicts plans; do
  n="$(find "$DEST/$d" -maxdepth 1 -type f -name '*.md' | wc -l)"
  [ "$n" -gt 0 ] || fail "docs/analysis/$d/ holds no markdown documents"
done

# 2/3. Language and credentials -----------------------------------------
# Only text is scanned: the record is expected to be text, and a binary file
# appearing here would itself be the defect.
mapfile -t files < <(find "$DEST" -type f)

cjk_re='[\x{4e00}-\x{9fff}]'
secret_re='sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}'

if grep -rlP "$cjk_re" "${files[@]}" >/dev/null 2>&1; then
  echo "check-analysis-record: non-English content in:" >&2
  grep -rlP "$cjk_re" "${files[@]}" >&2
  fail "the published record must be English"
fi

if grep -rlE "$secret_re" "${files[@]}" >/dev/null 2>&1; then
  echo "check-analysis-record: credential-looking literal in:" >&2
  grep -rlE "$secret_re" "${files[@]}" >&2
  fail "the published record must carry no credentials"
fi

# 4. Raw artifacts are excluded by contract ------------------------------
# A *.json file or an ab_*/ tree here means the sync exclusion regressed.
stray_json="$(find "$DEST" -name '*.json' | wc -l)"
[ "$stray_json" -eq 0 ] || {
  echo "check-analysis-record: unexpected .json files:" >&2
  find "$DEST" -name '*.json' >&2 | head -20
  fail "raw run artifacts must not be published"
}

stray_dir="$(find "$DEST" -type d \( -name 'ab_*' -o -name artifacts \) | wc -l)"
[ "$stray_dir" -eq 0 ] || fail "raw artifact directories must not be published"

# 5. The sync contract is present ---------------------------------------
[ -f "$REPO_ROOT/scripts/sync-analysis.sh" ] || fail "scripts/sync-analysis.sh is missing"
[ -x "$REPO_ROOT/scripts/sync-analysis.sh" ] || fail "scripts/sync-analysis.sh is not executable"

# 6. Every run id a verdict names is indexed --------------------------------
# This is the check that gives the record its audit value: a verdict that names
# a run id nobody can look up is not traceable, so the claim cannot be
# re-derived. run-ids/ is the index.
#
# The match is anchored on the run-id shape actually in use. GitHub run ids in
# this record are 11 digits, prefixed by the workflow that produced them:
# 34x/35x for the benchmark workflow, 10x for other workflows. Anchoring this
# way keeps timestamps, byte counts and question ids out of the comparison —
# an earlier unanchored version of this check misread a 12-digit epoch
# millisecond value as a run id.
index="$DEST/run-ids"
if [ -d "$index" ] && find "$index" -type f | grep -q .; then
  indexed="$(
    find "$index" -type f -exec cat {} + \
      | grep -oE '\b(34|35|10)[0-9]{9}\b' | sort -u
  )"
  referenced="$(
    find "$DEST/verdicts" "$DEST/plans" -type f -name '*.md' -print0 \
      | xargs -0 grep -hoE '\b(34|35|10)[0-9]{9}\b' | sort -u
  )"
  missing="$(comm -23 <(echo "$referenced") <(echo "$indexed") || true)"
  if [ -n "$missing" ]; then
    n="$(echo "$missing" | wc -l)"
    echo "check-analysis-record: $n run id(s) referenced but not indexed:" >&2
    echo "$missing" >&2 | head -20
    fail "referenced run ids must be traceable through run-ids/"
  fi
fi

echo "check-analysis-record: OK ($total files; ${#files[@]} scanned)"
