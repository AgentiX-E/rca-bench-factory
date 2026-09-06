#!/usr/bin/env node
/**
 * Fails the build when a credential-looking literal is committed.
 *
 * API keys are injected through the environment only. This check is a backstop
 * for review, not a substitute for it.
 */
import { execSync } from 'node:child_process';

const PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{40,}/,
  /AKIA[0-9A-Z]{16}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
];

function trackedFiles() {
  try {
    return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const SKIP = /\.(png|jpg|jpeg|gif|ico|woff2?|ttf|pdf)$|package-lock\.json$|^LICENSE$/;
const failures = [];

for (const file of trackedFiles()) {
  if (SKIP.test(file)) continue;
  let content;
  try {
    content = (await import('node:fs')).readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  content.split('\n').forEach((line, i) => {
    for (const re of PATTERNS) {
      if (re.test(line)) failures.push(`${file}:${i + 1}`);
    }
  });
}

if (failures.length > 0) {
  console.error('Potential credential detected (never commit API keys):');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log('check-no-secrets: OK');
