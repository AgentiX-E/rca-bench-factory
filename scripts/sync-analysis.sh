#!/usr/bin/env bash
#
# Sync the local analysis workspace into this repository's docs/analysis/.
#
# The evidence trail is produced in a working directory that is not a git
# repository, so it would otherwise drift from what is published. This script is
# the single definition of what gets published: the documents and the scripts
# that reproduce them, and nothing else.
#
# Deliberately EXCLUDED, and why:
#
#   ab_*/<run-id>/, artifacts/, v4pro_diag/   Raw run artifacts (~1 GB). They are
#       regenerable from run-ids/*.tsv via dispatch/download_*.sh, and committing
#       them would make the repository a multi-gigabyte clone for no added
#       auditability. The verdicts name the run ids they were derived from.
#
# Usage:
#   scripts/sync-analysis.sh <analysis-dir> [--check]
#
#   --check   Report drift and exit non-zero instead of writing. Used to keep a
#             stale record from being published unnoticed.
set -euo pipefail

SRC="${1:-}"
MODE="${2:-}"

if [ -z "$SRC" ]; then
  echo "usage: scripts/sync-analysis.sh <analysis-dir> [--check]" >&2
  exit 2
fi
if [ ! -d "$SRC" ]; then
  echo "sync-analysis: source directory not found: $SRC" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$REPO_ROOT/docs/analysis"

# Only these carry the record. Each entry is "<source> <destination>".
INCLUDE_DIRS=(verdicts plans dispatch run-ids logs scripts)
INCLUDE_ROOT_FILES=(README.md)

# Standalone audit scripts live at the source root and go under tools/.
INCLUDE_GLOBS=('*.mjs')

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/tools"
for d in "${INCLUDE_DIRS[@]}"; do
  if [ -d "$SRC/$d" ]; then
    mkdir -p "$STAGE/$d"
    # Exclude raw artifacts that may sit inside an included directory. Written
    # with find rather than rsync so the script runs on a stock image that has
    # no rsync (it is not part of the base Ubuntu package set here).
    ( cd "$SRC/$d" && find . \
        -name '*.json' -prune -o \
        -type d -name 'ab_*' -prune -o \
        -type d -name 'artifacts' -prune -o \
        -type f -print ) | while IFS= read -r rel; do
      mkdir -p "$STAGE/$d/$(dirname "$rel")"
      cp -p "$SRC/$d/$rel" "$STAGE/$d/$rel"
    done
  fi
done
for f in "${INCLUDE_ROOT_FILES[@]}"; do
  [ -f "$SRC/$f" ] && cp "$SRC/$f" "$STAGE/$f"
done
for g in "${INCLUDE_GLOBS[@]}"; do
  for f in "$SRC"/$g; do
    [ -f "$f" ] && cp "$f" "$STAGE/tools/"
  done
done

# Guard: the published record must be English, and must carry no credentials.
# Both are checked here rather than in CI because a failure here is cheap to fix
# and a failure in CI costs a full run.
if grep -rlP '[\x{4e00}-\x{9fff}]' "$STAGE" >/dev/null 2>&1; then
  echo "sync-analysis: refusing to publish. Non-English content found in:" >&2
  grep -rlP '[\x{4e00}-\x{9fff}]' "$STAGE" >&2
  exit 1
fi

if grep -rlE 'sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}' "$STAGE" >/dev/null 2>&1; then
  echo "sync-analysis: refusing to publish. Credential-looking literal found in:" >&2
  grep -rlE 'sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}' "$STAGE" >&2
  exit 1
fi

mkdir -p "$DEST"
if [ "$MODE" = "--check" ]; then
  if ! diff -r "$STAGE" "$DEST" >/dev/null 2>&1; then
    echo "sync-analysis: DRIFT detected between $SRC and $DEST" >&2
    diff -rq "$STAGE" "$DEST" >&2 | head -40
    echo "" >&2
    echo "Run 'scripts/sync-analysis.sh $SRC' to update, then commit." >&2
    exit 1
  fi
  echo "sync-analysis: no drift ($(find "$DEST" -type f | wc -l) files)"
  exit 0
fi

# Replace the destination outright: the published record is a snapshot, so a
# document that was removed locally must disappear here too.
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
cp -a "$STAGE" "$DEST"
echo "sync-analysis: published $(find "$DEST" -type f | wc -l) files to docs/analysis/"
