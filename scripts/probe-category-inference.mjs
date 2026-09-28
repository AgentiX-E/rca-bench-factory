/**
 * Category-inference probe.
 *
 * `inferFaultCategory` maps a fault *type* onto a fault *category*, and the
 * mapping is a keyword match. Finding 95 found that the match was over letter
 * sequences rather than over words, so `feature-flag-misconfiguration` -- a
 * configuration fault -- resolved to `middleware`, because `flag` contains `lag`
 * and the middleware row was tested first.
 *
 * Nothing observed it. `probe-type-misses.mjs` reads the `type` field of a
 * recorded annotation and never calls the classifier, so the classifier could
 * have shipped any answer at all and every battery in the repository would have
 * stayed green. This probe is the observation point the defect was missing: it
 * runs the classifier over a fixed table of inputs and prints the answers, and the
 * battery mutates the classifier and requires the answers to move.
 *
 * The table is deliberately hostile. Real fault slugs establish that the
 * classifier still works; the adversarial rows are the ones that say it works
 * *for the right reason*, and they are the rows a substring match fails.
 *
 * Run: node scripts/probe-category-inference.mjs [--json]
 * Exit: 0 always -- the exit code is not a verdict here, the answers are.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const { inferFaultCategory } = await import(
  resolve(REPO, 'packages/core/dist/index.js')
);

/**
 * The inputs, grouped by what they are for.
 *
 * `real` is the golden dataset's own types, read from `samples.json` rather than
 * retyped, so the probe cannot drift from the data. `adversarial` is the set the
 * substring matcher gets wrong, each paired with the keyword it wrongly matched
 * and the category that produced.
 */
const GOLDEN = JSON.parse(
  readFileSync(resolve(REPO, 'golden-master/fault-extraction/samples.json'), 'utf8'),
);
const real = GOLDEN.samples.map((s) => ({
  input: s.expected.type,
  expected: s.expected.category,
}));

const adversarial = [
  ['planetary-drift', 'net', 'network'],
  ['magnetometer-reset', 'net', 'network'],
  ['tenet-violation', 'net', 'network'],
  ['room-assignment', 'oom', 'resource'],
  ['zoom-level-change', 'oom', 'resource'],
  ['bloom-filter-miss', 'oom', 'resource'],
  ['skill-inventory', 'kill', 'runtime'],
  ['member-enrollment', 'mem', 'resource'],
  ['remember-me-token', 'mem', 'resource'],
  ['memento-restore', 'mem', 'resource'],
  ['debugger-attached', 'bug', 'code'],
  ['ladybug-release', 'bug', 'code'],
  ['terrorism-filter', 'error', 'code'],
  ['dropdown-rendering', 'drop', 'network'],
  ['backdrop-image', 'drop', 'network'],
  ['raindrop-detector', 'drop', 'network'],
  ['envelope-encoding', 'env', 'config'],
  ['flagship-rollout', 'lag', 'middleware'],
  ['lagoon-navigation', 'lag', 'middleware'],
  ['log-aggregation-failure', 'lag', 'middleware'],
  ['adbc-driver', 'db', 'middleware'],
  ['dbnull-guard', 'db', 'middleware'],
];

const answers = [];
let goldenAgreements = 0;
let goldenMisses = 0;
let adversarialFalsePositives = 0;

for (const { input, expected } of real) {
  const actual = inferFaultCategory(input);
  const agrees = actual === expected;
  if (agrees) goldenAgreements += 1;
  else goldenMisses += 1;
  answers.push({ input, actual, expected, agrees, kind: 'golden' });
}

for (const [input, keyword, wrong] of adversarial) {
  const actual = inferFaultCategory(input);
  // A false positive is the classifier naming the category the *contained letter
  // sequence* belonged to. The classifier is allowed to name another category --
  // `memoryless-pool` is genuinely a resource fault -- so the requirement is not
  // that these are `unknown`, it is that they are not the substring's answer.
  const isFalsePositive = actual === wrong;
  if (isFalsePositive) adversarialFalsePositives += 1;
  answers.push({
    input,
    actual,
    keyword,
    wrongCategory: wrong,
    falsePositive: isFalsePositive,
    kind: 'adversarial',
  });
}

const payload = {
  source: 'inferFaultCategory over golden types and adversarial words',
  totals: {
    golden: real.length,
    goldenAgreements,
    goldenMisses,
    adversarial: adversarial.length,
    adversarialFalsePositives,
    answers: answers.length,
  },
  answers,
};

console.log(JSON.stringify(payload, null, 2));
