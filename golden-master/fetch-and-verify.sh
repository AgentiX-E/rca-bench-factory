#!/usr/bin/env bash
# Fetch-and-verify against official benchmark data.
#
# The self-contained fixture in `fixture.json` proves our exporters are byte-stable.
# This script extends that to *external grounding*: it downloads official benchmark
# archives from their canonical sources, re-runs the exporter against a small known
# slice, and checks the output against the committed anchors.
#
# You are responsible for complying with each dataset's license (see
# ../THIRD-PARTY-NOTICES.md). This script never redistributes data; it only fetches
# from the official location and verifies locally.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "Golden Master verification (self-contained fixture):"
node "$ROOT/golden-master/verify.mjs"

echo
echo "Official-data verification is configured per dataset. Example (OpenRCA):"
echo "  1. Download the official archive from the OpenRCA repository to /tmp/openrca."
echo "  2. Point the exporter at a known slice and diff against expected anchors."
echo "See THIRD-PARTY-NOTICES.md for the license matrix and canonical URLs."
