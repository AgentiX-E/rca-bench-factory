#!/usr/bin/env node
/**
 * Fails the build when a test uses a mocking framework.
 *
 * The project tests against real data and real IO. Mocks hide exactly the class
 * of defect this product exists to catch (silent data loss, mis-parsed fields),
 * so they are banned outright rather than discouraged.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES = new URL('../packages', import.meta.url).pathname;
const TEST_ROOTS = readdirSync(PACKAGES)
  .map((name) => join(PACKAGES, name, 'test'))
  .filter((dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory());
const BANNED = [
  /\bvi\.mock\s*\(/,
  /\bjest\.mock\s*\(/,
  /\bsinon\b/,
  /\bit\.skip\b/,
  /\bdescribe\.skip\b/,
  /\bit\.only\b/,
  /\bdescribe\.only\b/,
  /\btest\.skip\b/,
  /\btest\.only\b/,
];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const failures = [];
for (const root of TEST_ROOTS) {
  for (const file of walk(root)) {
    if (!file.endsWith('.ts')) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const re of BANNED) {
        if (re.test(line)) failures.push(`${file}:${i + 1}  ${line.trim()}`);
      }
    });
  }
}

if (failures.length > 0) {
  console.error('Mock / skip usage is not allowed:\n');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log('check-no-mock: OK');
