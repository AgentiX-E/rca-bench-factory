#!/usr/bin/env bash
# Verify our exporters against the committed anchors, then show how to repeat the
# check against official data.
#
# The self-contained fixture in `fixture.json` proves our exporters are
# byte-stable: `verify.mjs` re-runs them and diffs the output against the anchors
# in `expected.json`. That check needs no network access and is what this script
# actually runs.
#
# Full *external grounding* is a manual step. This repository does not fetch
# official data for you: the operator downloads the archive under its own licence
# terms (see ../THIRD-PARTY-NOTICES.md for the matrix and canonical URLs) and
# points the exporter at a known slice. The instructions below are printed rather
# than executed, so nothing here implies a download happened.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Golden Master verification (self-contained fixture, no network access):"
node "$ROOT/golden-master/verify.mjs"

echo
echo "Official-data verification is configured per dataset. Example (OpenRCA):"
echo "  1. Download the official archive from the OpenRCA repository to /tmp/openrca."
echo "  2. Point the exporter at a known slice and diff against expected anchors."
echo "See THIRD-PARTY-NOTICES.md for the license matrix and canonical URLs."
echo
echo "Nothing was downloaded by this script; step 1 is yours to perform."
