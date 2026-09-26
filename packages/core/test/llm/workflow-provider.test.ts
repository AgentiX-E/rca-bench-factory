import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LLM_PROVIDER_ENV_VARS, LLM_PROVIDER_IDS } from '../../src/llm/registry.js';

/**
 * The workflow and the provider registry must not drift apart.
 *
 * This is the check that would have caught the defect that cost two runs. The
 * workflow named a secret this repository invented; the organisation stores its
 * keys under vendor names; so the run stopped on a missing secret that was not
 * missing, and the only way to discover that was to spend a dispatch reading a
 * one-line error.
 *
 * The rule these tests enforce: **the set of providers the workflow can supply a
 * key for equals the set the registry can build.** A provider added to one and
 * not the other is a run that fails at the last step, and the failure looks like
 * an infrastructure problem rather than a missing line of YAML.
 *
 * Read as text rather than parsed as YAML, deliberately. The assertion is about
 * what the file *says* -- which secret names it binds, which inputs it forwards
 * -- and a YAML parse would let a value be assembled from anchors or expressions
 * that this suite then has to re-implement an evaluator to see. `check-no-mock`
 * permits no mocking library, and a hand-rolled YAML evaluator would be a worse
 * dependency than a regex over a file this suite also pins the shape of.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(ROOT, '.github', 'workflows', 'fault-extraction-accuracy.yml'),
  'utf8',
);

/**
 * A `case` arm in the workflow's key-selection step, e.g. `deepseek) ... ;;`.
 *
 * The selector is what actually decides, so it is what must cover the registry.
 */
function selectedProviders(): string[] {
  const names: string[] = [];
  // `case "$PROVIDER" in` ... `esac`, then the `<name>)` arms inside it.
  for (const match of WORKFLOW.matchAll(/^\s{4,}([a-z][a-z0-9-]*)\)\s/gm)) {
    names.push(match[1]);
  }
  return names;
}

/** Each `KEY_<PROVIDER>: ${{ secrets.<NAME> }}` binding. */
function secretBindings(): Array<{ provider: string; secret: string }> {
  const bindings: Array<{ provider: string; secret: string }> = [];
  for (const match of WORKFLOW.matchAll(
    /^\s*KEY_([A-Z0-9_]+):\s*\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}\s*$/gm,
  )) {
    bindings.push({ provider: match[1].toLowerCase(), secret: match[2] });
  }
  return bindings;
}

/**
 * The text of one `- name: <step>` block, up to the next step at the same indent.
 *
 * Scoping an assertion to a step is the difference between "this file contains a
 * `set -eu`" and "this step contains one". The loose form passed while the step
 * it was written for had none, because five sibling steps did.
 */
function stepBlock(name: string): string {
  const lines = WORKFLOW.split('\n');
  const startIndex = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  if (startIndex === -1) return '';
  // A sibling step is a `- name:` continuation at the same indentation.
  const indent = /^\s*/.exec(lines[startIndex])?.[0] ?? '';
  const out: string[] = [lines[startIndex] as string];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.startsWith(`${indent}- name:`)) break;
    out.push(line);
  }
  return out.join('\n');
}

describe('the workflow covers every provider the registry can build', () => {
  it('selects a key for each registered provider', () => {
    const selected = selectedProviders();
    for (const id of LLM_PROVIDER_IDS) {
      expect(selected, `workflow must select a key for '${id}'`).toContain(id);
    }
  });

  it('binds a secret for each registered provider', () => {
    const bound = secretBindings().map((b) => b.provider);
    for (const id of LLM_PROVIDER_IDS) {
      expect(bound, `workflow must bind a secret for '${id}'`).toContain(id);
    }
  });

  it('does not select a provider the registry cannot build', () => {
    // The reverse direction: a case arm for a provider that was removed from the
    // registry is dead configuration that reads like support.
    for (const selected of selectedProviders()) {
      expect(
        LLM_PROVIDER_IDS as readonly string[],
        `workflow selects '${selected}', which the registry does not know`,
      ).toContain(selected);
    }
  });

  it('does not bind a secret for a provider the registry cannot build', () => {
    for (const binding of secretBindings()) {
      expect(
        LLM_PROVIDER_IDS as readonly string[],
        `workflow binds KEY_${binding.provider.toUpperCase()} for a provider the registry does not know`,
      ).toContain(binding.provider);
    }
  });
});

describe('the workflow names no vendor in its key binding', () => {
  it('does not reference a secret name this repository invented', () => {
    // The original defect, pinned. `RCA_BENCH_LLM_API_KEY` is the *environment*
    // variable the scripts read -- a neutral, repository-owned name. It must not
    // also be a secret name, because there is no organisation secret by that
    // name and demanding one asks the user to duplicate their key.
    const secretRefs = [...WORKFLOW.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g)].map(
      (m) => m[1],
    );
    expect(secretRefs).not.toContain(LLM_PROVIDER_ENV_VARS.apiKey);
  });

  it('reads the neutral variable into the environment rather than into a file', () => {
    expect(WORKFLOW).toMatch(/RCA_BENCH_LLM_API_KEY=\$\{selected\}.*>>\s*"\$GITHUB_ENV"/);
  });

  it('masks the selected key before using it', () => {
    // The key is pasted into a shell variable here, so it must not be printable
    // by an unrelated later step that happens to echo its environment.
    expect(WORKFLOW).toMatch(/::add-mask::\$\{selected\}/);
  });

  it('never writes a key to the artefact path', () => {
    // The predictions artefact is uploaded; a key in its directory would leak
    // through the upload.
    const uploadIndex = WORKFLOW.indexOf('upload-artifact');
    expect(uploadIndex).toBeGreaterThan(-1);
    const uploadBlock = WORKFLOW.slice(uploadIndex, uploadIndex + 400);
    expect(uploadBlock).not.toMatch(/RCA_BENCH_LLM_API_KEY/);
    expect(uploadBlock).not.toMatch(/secrets\./);
  });
});

describe('the workflow forwards the registry-owned variable names', () => {
  it('passes the provider through to the derivation step', () => {
    expect(WORKFLOW).toMatch(
      /RCA_BENCH_LLM_PROVIDER:\s*\$\{\{\s*steps\.provider\.outputs\.provider\s*\}\}/,
    );
  });

  it('keeps the endpoint and model optional and out of the file', () => {
    // Hard-coding an endpoint here would reintroduce the single-vendor lock at
    // the layer that is supposed to be provider-neutral.
    expect(WORKFLOW).toMatch(/RCA_BENCH_LLM_BASE_URL:\s*\$\{\{\s*vars\./);
    expect(WORKFLOW).toMatch(/RCA_BENCH_LLM_MODEL:\s*\$\{\{\s*vars\./);
    expect(WORKFLOW).not.toMatch(/https:\/\/api\.deepseek\.com/);
    expect(WORKFLOW).not.toMatch(/https:\/\/api\.openai\.com/);
    expect(WORKFLOW).not.toMatch(/https:\/\/api\.anthropic\.com/);
  });

  it('resolves the provider through the registry rather than re-implementing it', () => {
    // A workflow that hard-codes the list would drift from the registry the
    // moment a provider is added.
    expect(WORKFLOW).toMatch(/resolveLlmProviderConfig/);
  });
});

describe('the workflow still fails early and readably', () => {
  it('checks the dataset before it selects a key', () => {
    // Ordering is the assertion: a malformed dataset must be found in seconds,
    // before a secret is even read, let alone a request paid for.
    const datasetIndex = WORKFLOW.indexOf('Validate the golden dataset');
    const keyIndex = WORKFLOW.indexOf('Select the key');
    expect(datasetIndex).toBeGreaterThan(-1);
    expect(keyIndex).toBeGreaterThan(-1);
    expect(datasetIndex).toBeLessThan(keyIndex);
  });

  it('distinguishes "no mapping for this provider" from "its secret is empty"', () => {
    // Two different fixes. One is a line of YAML; the other is an organisation
    // setting. Collapsing them is what made the first version cost two runs.
    expect(WORKFLOW).toMatch(/No key mapping/);
    expect(WORKFLOW).toMatch(/Missing LLM key/);
  });

  it('uses a shell that fails on an unset variable, in the step that picks the key', () => {
    // Without `set -eu` an unset variable expands to empty rather than aborting,
    // so a missing provider mapping would fall through to an empty key and fail
    // three steps later inside an adapter -- a 401 that reads like a provider
    // problem instead of a missing line of YAML.
    //
    // Scoped to the one step on purpose. An earlier version of this test matched
    // `set -eu` anywhere in the file, and it passed while the key-selection step
    // had none, because five other steps have one. A file-wide match cannot say
    // *which* step is protected, and this assertion is about which step is
    // protected.
    const block = stepBlock('Select the key for the resolved provider');
    expect(block).not.toBe('');
    expect(block).toMatch(/set -eu/);
  });

  it('aborts the key-selection step rather than continuing with an empty key', () => {
    // `set -u` is the property that makes the missing-mapping case fatal. Pinned
    // separately from the combined `-eu` spelling so a rewrite to `set -e` alone
    // -- which would leave the step reading an unset variable as empty -- fails.
    const block = stepBlock('Select the key for the resolved provider');
    expect(block).toMatch(/set -[a-z]*u/);
  });
});
