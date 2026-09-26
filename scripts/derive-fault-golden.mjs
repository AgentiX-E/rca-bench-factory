#!/usr/bin/env node
/**
 * Derive extraction predictions for the golden fault dataset.
 *
 * This script is the *only* place in the repository that reads an LLM key from
 * the environment, and that is deliberate. The core package takes `apiKey` as an
 * option and never touches `process.env`; keeping the read in `scripts/` means a
 * misconfigured key can leak a run's output but can never reach a library a
 * downstream consumer links against.
 *
 * The run is written to a JSON file rather than scored in place, so the
 * derivation and the scoring are separable. That matters for reproducibility:
 * a scoring change re-scores the *same* predictions, and a model change is
 * visible as a diff in this file rather than as a shifted accuracy number with
 * no artefact behind it.
 *
 * Usage:
 *   node scripts/derive-fault-golden.mjs --out /tmp/extraction-predictions.json
 *
 * Environment:
 *   RCA_BENCH_LLM_PROVIDER   optional; `deepseek` (default), `openai`, `anthropic`
 *   RCA_BENCH_LLM_API_KEY    required; the key itself
 *   RCA_BENCH_LLM_BASE_URL   optional; per-provider default when unset
 *   RCA_BENCH_LLM_MODEL      optional; per-provider default when unset
 *
 * Which provider to use is *configuration*, not a code path. This script used to
 * call `createDeepSeekProvider` by name, which made the provider abstraction
 * cosmetic: every adapter was interchangeable except the one a user configures.
 * It now resolves the provider through the core registry, so an organisation that
 * has already stored a key can point the run at it instead of being told to
 * rename its secret to whatever this repository picked.
 *
 * Exit codes:
 *   0  every sample produced a parseable, validated extraction
 *   1  the run could not start (missing key, unknown provider, unreadable dataset)
 *   2  at least one sample did not produce a usable extraction
 *
 * A non-zero exit does *not* mean the run is worthless -- the predictions are
 * still written. Where the score lands is reported by the scorer; this script's
 * exit code only says whether the *derivation* completed cleanly, so a workflow
 * can tell "the model answered badly" (report it) apart from "we never asked"
 * (fix the wiring).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_DATASET = resolve(REPO, 'golden-master/fault-extraction/samples.json');

/**
 * Requests are serialised: a burst against one key is how a quota gets burned.
 *
 * There is deliberately no per-request payload cap here. `LlmProvider` is
 * `generate(prompt) -> text`, and the concrete adapters own their own token
 * limits; adding a cap at this layer would be a second, weaker copy of a limit
 * the adapter already enforces. What this script does own is the pacing, because
 * pacing is a property of the *run* and not of any single request.
 */
const INTER_REQUEST_DELAY_MS = 250;

function parseArgs(argv) {
  const out = { dataset: DEFAULT_DATASET, out: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out') {
      out.out = argv[i + 1] ?? '';
      i += 1;
    } else if (a === '--dataset') {
      out.dataset = resolve(argv[i + 1] ?? '');
      i += 1;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`unknown argument '${a}'`);
    }
  }
  return out;
}

/**
 * Load the core package's built entry point.
 *
 * The path is resolved from the repository root rather than through a bare
 * `@rca-bench-factory/core` specifier. The workspace links that package into
 * each package's own node_modules directory, not into the root's, so a bare
 * specifier works from a package script and fails from `scripts/`. Resolving the
 * file directly makes the script behave the same however it is invoked -- and it
 * still goes through the *built* output, so what runs is what the package ships.
 */
async function loadCore() {
  return await import(resolve(REPO, 'packages/core/dist/index.js'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'usage: node scripts/derive-fault-golden.mjs [--dataset <path>] --out <path>\n' +
        'reads RCA_BENCH_LLM_PROVIDER (optional), RCA_BENCH_LLM_API_KEY,\n' +
        '      RCA_BENCH_LLM_BASE_URL, RCA_BENCH_LLM_MODEL',
    );
    return 0;
  }
  if (args.out === '') {
    console.error('error: --out is required; the predictions are the artefact of this run');
    return 1;
  }

  const core = await loadCore();

  // The provider is resolved before the key is checked, and both before the
  // dataset is read. An operator should read the thing that is actually wrong
  // first: naming an unknown provider when a valid key is present is a different
  // fix from setting a key, and reporting one as the other wastes a round trip.
  const providerConfig = core.resolveLlmProviderConfig(process.env);
  if (!providerConfig.ok) {
    console.error(
      `error: ${providerConfig.error}\n` +
        `  Set ${core.LLM_PROVIDER_ENV_VARS.provider} to one of the registered providers, ` +
        'or leave it unset for the default.',
    );
    return 1;
  }

  const apiKey = process.env[core.LLM_PROVIDER_ENV_VARS.apiKey] ?? '';
  if (apiKey.trim() === '') {
    console.error(
      `error: ${core.LLM_PROVIDER_ENV_VARS.apiKey} is not set.\n` +
        '  The key is read here and nowhere else. Each provider has its own secret in the ' +
        'workflow; never write one to a file in this repository.',
    );
    return 1;
  }

  const dataset = core.parseGoldenDataset(JSON.parse(readFileSync(args.dataset, 'utf8')));

  const options = {
    apiKey,
    ...(process.env[core.LLM_PROVIDER_ENV_VARS.baseUrl]
      ? { baseUrl: process.env[core.LLM_PROVIDER_ENV_VARS.baseUrl] }
      : {}),
    ...(process.env[core.LLM_PROVIDER_ENV_VARS.model]
      ? { model: process.env[core.LLM_PROVIDER_ENV_VARS.model] }
      : {}),
  };
  const built = core.createLlmProvider(providerConfig.provider, options);
  if (!built.ok) {
    console.error(`error: ${built.error}`);
    return 1;
  }
  const provider = built.provider;

  console.log(`Deriving extractions for ${dataset.samples.length} golden sample(s).`);
  console.log(`Provider: ${providerConfig.provider}`);
  console.log(`Model: ${options.model ?? '(provider default)'}`);

  const predictions = [];
  let unusable = 0;

  for (const sample of dataset.samples) {
    const prompt = core.buildFaultExtractionPrompt(sample.incidentText);
    const prediction = { sampleId: sample.id, parseOk: false };

    try {
      const text = await provider.generate(prompt);
      const parsed = core.parseFaultExtractionResponse(text);
      if (!parsed.ok) {
        console.log(`  UNPARSEABLE ${sample.id}: ${parsed.error}`);
        unusable += 1;
      } else {
        const validation = core.validateExtractedFault(parsed.extracted);
        Object.assign(prediction, {
          parseOk: true,
          // The *raw* extraction is recorded, not the validated spec. The
          // scorer grades the model's answer, and `validateExtractedFault`
          // fills a category in from the type -- recording the filled-in value
          // would let the scorer read an inference back as a model hit.
          extracted: {
            type: parsed.extracted.type,
            ...(parsed.extracted.category !== undefined ? { category: parsed.extracted.category } : {}),
            ...(parsed.extracted.component !== undefined ? { component: parsed.extracted.component } : {}),
            ...(parsed.extracted.description !== undefined
              ? { description: parsed.extracted.description }
              : {}),
          },
          validationValid: validation.valid,
        });
        if (!validation.valid) {
          console.log(`  UNVALIDATED  ${sample.id}: ${validation.reasons.join('; ')}`);
          unusable += 1;
        } else {
          console.log(`  OK           ${sample.id}`);
        }
      }
    } catch (error) {
      // A transport failure is not an unparseable answer and is not scored as
      // one. It is recorded as a failed parse so the state is visible, and the
      // run continues -- one flaky request must not cost the whole measurement.
      console.log(`  FAILED       ${sample.id}: ${error instanceof Error ? error.message : String(error)}`);
      unusable += 1;
    }

    predictions.push(prediction);
    await sleep(INTER_REQUEST_DELAY_MS);
  }

  const report = {
    schema: 'rca-bench-fault-extraction-predictions/1',
    dataset: args.dataset,
    // Recorded from the run, not restated. It was the literal `'deepseek'`, so a
    // run against any other provider would have written an artefact claiming to
    // be a DeepSeek run -- and the artefact is the evidence a later reader has.
    provider: providerConfig.provider,
    model: process.env[core.LLM_PROVIDER_ENV_VARS.model] ?? null,
    predictions,
  };

  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  writeFileSync(resolve(args.out), JSON.stringify(report, null, 2) + '\n');
  console.log(`\nWrote ${predictions.length} prediction(s) to ${args.out}`);

  if (unusable > 0) {
    console.error(
      `\n${unusable} of ${predictions.length} sample(s) did not produce a usable extraction. ` +
        'The predictions were still written so the scorer can report where they landed.',
    );
    return 2;
  }
  return 0;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`fatal: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
