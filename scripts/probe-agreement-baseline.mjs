#!/usr/bin/env node
/**
 * Run finding 99's agreement reading against components that are **known to be right**,
 * and report whether the reading separates them from the model's.
 *
 * ## Why this probe exists
 *
 * Finding 99 reported that all seven recorded `category` misses name a component carrying
 * no term of the category they answered. It reported that figure **without a baseline**,
 * and a false-positive rate that has not been measured against a known-good sample is not
 * a finding. This is the measurement that was missing.
 *
 * It reads two sides of the same reading:
 *
 *   expected   the dataset's own `expected.component` values, right by construction
 *   predicted  the components the model named for the seven misses, against the
 *              categories it answered
 *
 * ## The result
 *
 * ```
 * expected components supporting their category:  1 of 19
 * predicted components supporting their category: 0 of 7
 * ```
 *
 * The reading fails 18 of the 19 components that are correct. It cannot have
 * distinguished anything when it failed the seven. **Finding 99's `7 of 7` is an artifact
 * of the vocabulary, not a measurement of the model.**
 *
 * ## Why, and this is the durable part
 *
 * `CATEGORY_TERMS` is the **classifier's** table: it maps a fault *slug* to category terms,
 * built so `inferFaultCategory` can read slugs. A `component` is a service name
 * (`checkout-api`, `payment-gateway`) or an infrastructure noun (`kubelet`, `WAF rule`).
 * Neither is a slug. Exactly one expected component -- `session-cache` -- happens to
 * contain its category's vocabulary, and that coincidence is the whole of the 1.
 *
 * ## What is not claimed
 *
 * Not that the reading is broken. It answers "does this component carry this category's
 * vocabulary" and it answers correctly. What was wrong was the inference drawn from its
 * output, and that is why this is a control rather than a fix.
 *
 * Usage: node scripts/probe-agreement-baseline.mjs [--json]
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DATASET = resolve(REPO, 'golden-master', 'fault-extraction', 'samples.json');

const BUNDLE = resolve(REPO, 'packages', 'core', 'dist', 'fault', 'agreement-baseline.js');
if (!existsSync(BUNDLE)) {
  process.stderr.write(
    `error: ${BUNDLE} is missing.\n` +
      '  This probe reads the built module, not the source.\n' +
      '  Run: npx tsc -p packages/core/tsconfig.json\n',
  );
  process.exit(1);
}

const { buildAgreementContrast } = await import(pathToFileURL(BUNDLE).href);

const parsed = JSON.parse(readFileSync(DATASET, 'utf8'));

const expected = parsed.samples.map((s) => ({
  sampleId: s.id,
  category: s.expected.category,
  component: s.expected.component,
}));

/**
 * The model's components for the seven misses that carry one, with the categories it
 * answered. Transcribed from the CI annotation bodies for run `567118aea`; the parse that
 * produces them from the fixture lives in `probe-type-misses.mjs`.
 */
const predicted = [
  { sampleId: 'resource-memory-leak-recommendation', category: 'code', component: 'recommendation service session cache' },
  { sampleId: 'runtime-pod-kill-user-profile', category: 'resource', component: 'kubelet' },
  { sampleId: 'runtime-container-crash-loop-media', category: 'dependency', component: 'native ffmpeg binding' },
  { sampleId: 'middleware-redis-latency-cache', category: 'resource', component: 'session Redis' },
  { sampleId: 'middleware-database-connection-pool', category: 'resource', component: 'billing service connection pool' },
  { sampleId: 'code-slow-regex-api-gateway', category: 'config', component: 'WAF rule' },
  { sampleId: 'middleware-mysql-replica-lag-analytics', category: 'resource', component: 'replica applier thread' },
];

const contrast = buildAgreementContrast({ expected, predicted });
const json = process.argv.includes('--json');

if (json) {
  process.stdout.write(
    `${JSON.stringify(
      {
        source: 'golden-master/fault-extraction/samples.json',
        answersFrom: 'recorded run 567118aea, transcribed',
        expected: {
          graded: contrast.expected.graded,
          supporting: contrast.expected.supporting,
          supportingIds: contrast.expected.supportingIds,
          supportShare: contrast.expected.supportShare,
        },
        predicted: {
          graded: contrast.predicted.graded,
          supporting: contrast.predicted.supporting,
          supportingIds: contrast.predicted.supportingIds,
          supportShare: contrast.predicted.supportShare,
        },
        shareDelta: contrast.shareDelta,
        baselineFloor: contrast.baselineFloor,
        separates: contrast.separates,
        reason: contrast.reason,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const line = '='.repeat(72);
process.stdout.write(
  `agreement baseline -- the control finding 99 did not run\n` +
    `source: golden-master/fault-extraction/samples.json\n` +
    `answers: recorded run 567118aea, transcribed\n\n` +
    `the reading is: does this component carry a term of this category?\n` +
    `${line}\n` +
    `EXPECTED  the dataset's own components, right by construction\n` +
    `  supporting their category: ${contrast.expected.supporting} of ${contrast.expected.graded}\n` +
    `  share: ${contrast.expected.supportShare.toFixed(4)}\n` +
    `  the ones that support: ${JSON.stringify(contrast.expected.supportingIds)}\n\n` +
    `PREDICTED the components the model named for the seven misses\n` +
    `  supporting their answered category: ${contrast.predicted.supporting} of ${contrast.predicted.graded}\n` +
    `  share: ${contrast.predicted.supportShare.toFixed(4)}\n` +
    `  the ones that support: ${JSON.stringify(contrast.predicted.supportingIds)}\n\n` +
    `${line}\n` +
    `CONTRAST\n` +
    `  share delta (expected - predicted): ${contrast.shareDelta.toFixed(4)}\n` +
    `  baseline floor: ${contrast.baselineFloor}\n` +
    `  the contrast is load-bearing: ${contrast.separates}\n` +
    `  reason: ${contrast.reason}\n\n`,
);

if (contrast.separates) {
  process.stdout.write(
    `  -> the expected side agrees often enough that a lower rate on the model's\n` +
      `     side would be a finding. It is worth building a claim on.\n`,
  );
} else {
  process.stdout.write(
    `  -> the reading does NOT separate them. It fails 18 of the 19 components\n` +
      `     that are correct, so it cannot have distinguished anything when it\n` +
      `     failed the seven. Finding 99's 7 of 7 is an artifact of the vocabulary.\n` +
      `     CATEGORY_TERMS is the classifier's slug table; a component is a service\n` +
      `     name, and is not a slug.\n` +
      `\n` +
      `     Note the arithmetic trap this probe was built with and had to fix: the\n` +
      `     predicted side IS numerically lower than the expected side (0/7 < 1/19),\n` +
      `     and reporting that comparison as "the reading separates them" puts a\n` +
      `     contradiction next to the sentence above. 0/7 < 1/19 is the difference\n` +
      `     between two estimates of zero, not a separation.\n`,
  );
}

process.stdout.write(
  `\n  detail -- expected side, per component:\n`,
);
for (const row of contrast.expected.rows) {
  const mark = row.terms.length > 0 ? `SUPPORTS ${JSON.stringify(row.terms)}` : 'no term';
  process.stdout.write(`    ${row.component.padEnd(34)} ${row.category.padEnd(12)} ${mark}\n`);
}
