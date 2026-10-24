import type { HitlGate } from '../evolution/hitl.js';
import { FAULT_CATEGORIES, isVocabularyMember, type FaultCategory } from '../ir/types.js';
import { parseFaultSpec, type FaultSpec } from './collector.js';

/**
 * Historical fault importer (M13 channel B).
 *
 * The factory must also ingest faults that were never injected on purpose: a
 * support ticket or post-mortem describes a fault that already happened, and the
 * LLM proposes a structured fault spec from that text. The deterministic side of
 * the pipeline is pure: prompt building, response parsing and spec validation.
 *
 * The red line is the HITL checkpoint: a historical fault's ground truth was not
 * produced under controlled injection, so it MUST be human-confirmed at H3 before
 * it can enter the gates. The importer therefore always returns `hitlGate = H3`,
 * never auto-admits.
 */

/** A fault extracted from an incident text by the LLM. */
export interface ExtractedFault {
  type: string;
  /** Optional; when absent the category is inferred from the type. */
  category?: string;
  /** Optional faulty component. */
  component?: string;
  /** Optional root-cause reason. */
  description?: string;
  confidence: number;
}

export type FaultExtractionParseResult = { ok: true; extracted: ExtractedFault } | { ok: false; error: string };

export interface FaultExtractionValidation {
  valid: boolean;
  /** Always H3: historical fault ground truth must be human-confirmed. */
  hitlGate: HitlGate;
  reasons: string[];
  /** Present only when `valid`. */
  spec?: FaultSpec;
}

/**
 * The categories a model may answer with: the published vocabulary minus the
 * inference fallback.
 *
 * `FAULT_CATEGORIES` includes `unknown` because `category-derivation.ts` returns
 * it when a type cannot be placed -- a value the *inference* may produce. A model
 * that answers `unknown` has classified nothing, so the prompt does not offer it.
 *
 * Derived rather than restated. Until finding 211 this was the literal
 * `'resource | network | runtime | middleware | code | config | dependency'`,
 * which is a second copy of a vocabulary declared in `ir/types.ts`: adding a
 * category there would have left the prompt advertising seven values while the
 * parser accepted eight, and the disagreement would have surfaced as a rejected
 * model answer rather than as a failing build.
 */
type AnswerableCategory = Exclude<FaultCategory, 'unknown'>;

const ANSWERABLE_CATEGORIES: readonly AnswerableCategory[] = FAULT_CATEGORIES.filter(
  (category): category is AnswerableCategory => category !== 'unknown',
);

const FAULT_CATEGORY_VOCABULARY = ANSWERABLE_CATEGORIES.join(' | ');

/**
 * What each category owns, stated because the prompt listed the values without
 * saying what any of them covers.
 *
 * Finding 210 measured the cost. With the type vocabulary in place, `type`
 * scored 17/19 and `category` 13/19 in the same run, on the same texts, with the
 * same model -- and all six `category` misses were *boundary* disagreements, not
 * naming ones. The model knew the fault and put it in a neighbouring bucket:
 * `middleware` answered for a saturated cache and for a held connection pool,
 * `resource` for a pod evicted on account of another workload, `dependency` for
 * a segfault inside a library, `runtime` for a null dereference. Every one of
 * those is defensible from the symptom and wrong from the taxonomy, and the
 * prompt said nothing that could separate them.
 *
 * This is finding 62's asymmetry one level down. There, `type` had no *answer
 * space* and scored 26.3%; here `category` has a space but no *boundaries*, and
 * the prediction finding 62 made -- that `category` becomes binding once `type`
 * is fixed -- is what the measurement confirmed.
 *
 * The definitions are descriptions of the taxonomy's own distinctions, not of
 * the nineteen samples: no sample id, expected component or incident phrase
 * appears in them, and a test asserts that. Listing the answers would fit the
 * prompt to the test set and make the resulting number uninterpretable, which is
 * the reason given for not listing the type labels either.
 *
 * `Record<AnswerableCategory, string>` is load-bearing: a category added to
 * `FAULT_CATEGORIES` without a definition here does not compile, so the
 * completeness of this table is a type error rather than a review question.
 */
const FAULT_CATEGORY_DEFINITIONS: Readonly<Record<AnswerableCategory, string>> = {
  resource:
    "the workload's own finite quota ran out -- CPU throttled at its limit, the container " +
    'killed for its own memory, its volume full',
  network:
    'the path between two workloads misbehaves -- delay, loss, a partition -- while both ends ' +
    'are up and their own resources are normal',
  runtime:
    'the process stops, restarts or fails to start while nothing of its own was exhausted: an ' +
    'eviction decided for another workload, a crash in the start-up path',
  middleware:
    'a shared data or messaging layer the workload talks to -- cache, broker, database, ' +
    'including the connection pool it holds against one -- is slow, saturated or exhausted',
  code:
    "the workload's own source produces the wrong answer or raises the exception, and the " +
    'process keeps running and serving',
  config: 'a deployed value -- a URL, a flag, a key -- holds the wrong thing and is read as written',
  dependency:
    'something outside the workload changed under it: a service it calls degraded, or an ' +
    "upgraded library's contract moved so the workload's own call now fails",
};

/** A boundary between two categories that the measurement found ambiguous. */
interface CategoryBoundary {
  readonly between: readonly [AnswerableCategory, AnswerableCategory];
  readonly rule: string;
}

/**
 * The ties, broken. One entry per pair the measured run disputed, in the order
 * the pairs are stated to the model.
 *
 * A boundary is not a restatement of the two definitions: it names the evidence
 * that decides between them. `runtime` and `resource` both describe a process
 * that died, so the entry says which fact about the death owns it; `code` and
 * `runtime` both describe an exception, so the entry says where it was raised.
 *
 * The rules are stated as *pairs about the same event*, which is why they cannot
 * be folded into the definitions: a definition per category can be read as
 * compatible with a neighbour, and only the comparison says which one wins. The
 * pairs listed are the ones the runs produced; a seventh would need its own
 * measurement, and `fault-prompt-grammar.test.ts` requires the list it states to
 * be the list recorded there.
 */
const FAULT_CATEGORY_BOUNDARIES: readonly CategoryBoundary[] = [
  {
    between: ['resource', 'runtime'],
    rule:
      'a process that died while its own quota was the thing that ran out is `resource`; one ' +
      'that died with its own quota intact -- evicted because of another workload on the node -- ' +
      'is `runtime`',
  },
  {
    between: ['resource', 'middleware'],
    rule:
      'a limit reached inside a shared layer -- a cache server saturating its command thread, a ' +
      "database's connection pool with every slot held -- is `middleware`; `resource` is only " +
      "the workload's own quota",
  },
  {
    between: ['middleware', 'code'],
    rule:
      '`middleware` when the symptom lands on a shared layer -- a queue falling behind, a cache ' +
      'or a pool saturating -- even if a code change is what loaded it; `code` when the symptom ' +
      "is in the workload's own answers: a 500, a wrong value, an exception it raised",
  },
  {
    between: ['code', 'runtime'],
    rule:
      "an exception raised by the workload's own logic is `code`; a process that dies without " +
      'its own logic raising -- a segfault inside the library it linked, a kill from the ' +
      'platform -- is `runtime`',
  },
  {
    between: ['runtime', 'dependency'],
    rule:
      'a library that *crashes* the process is `runtime`; a library whose *contract* moved so ' +
      "the workload's own call now throws is `dependency`",
  },
  {
    between: ['code', 'config'],
    rule:
      'a value the workload *reads* -- a URL, a flag, a key -- is `config`; an expression it ' +
      '*executes* -- a pattern, a rule, a matcher -- is `code`, even when the expression was ' +
      'shipped as configuration',
  },
];

/**
 * The shape rule for `type`, stated because the field was previously undescribed.
 *
 * `category` is a closed vocabulary and the prompt says so; `type` is an open
 * vocabulary whose values are nevertheless a canonical *shape*. Until this was
 * stated, the prompt asked for a value from a space whose form it never
 * described, and the measured cost was visible: in the same run, on the same
 * texts and with the same model, `category` scored 57.9% and `type` scored 26.3%.
 * The only difference between the two fields in the prompt was that one of them
 * was specified.
 *
 * The rule is a *description of the existing data*, not a new requirement. Every
 * expected `type` in the golden dataset is already a lower-case hyphenated slug,
 * and `normalizeFaultType` leaves each one unchanged -- both properties are
 * asserted in `fault-prompt-grammar.test.ts` so that a dataset edit which breaks
 * them fails a test rather than silently invalidating this text.
 *
 * Deliberately a grammar and not the 19 expected labels. Listing the labels would
 * fit the prompt to the test set and would teach the model this dataset's
 * taxonomy rather than the naming convention, which is the part that transfers to
 * a fault the repository has never seen. The closed list remains a live option
 * for a project that wants a bounded fault-type ontology, but it is a different
 * decision from describing the format, and conflating them would make the
 * resulting number uninterpretable.
 */
const FAULT_TYPE_SHAPE_RULE =
  '`type` is a short lower-case hyphenated slug naming the failure mechanism, ' +
  'e.g. `cpu-saturation`, `network-delay`, `database-connection-pool-exhaustion`. ' +
  'Use hyphens, never spaces or capitals. Prefer the mechanism over the symptom.';

/**
 * The rule for `component`, stated because the field was previously a bare noun.
 *
 * The prompt asked for the "faulty component" and described neither the *level*
 * of entity it wanted nor the *shape* of the answer. Finding 75 measured the
 * cost: of the fifteen wrong answers in the run preceding `3a04d26`, every one
 * named something real and present in the incident text, one level off from what
 * the key asks for -- `session Redis` for a fault in the `session-cache`
 * service, `CSV writer` for one in the `export-worker`, `tax-calculation
 * provider` for one the `pricing` service depends on. The model was answering a
 * nearby question correctly, which is indistinguishable from the grader being
 * wrong while the level goes unstated.
 *
 * The rule has two halves on purpose, and the level is the load-bearing one.
 * A shape rule alone would not have changed a single one of those answers, since
 * `session Redis` and `csv-writer` are both well-formed. What the answers got
 * wrong was *which entity they named*, so that is what the prompt states.
 *
 * Like `FAULT_TYPE_SHAPE_RULE` this is a *description of the existing data*, not
 * a new requirement. Every one of the 19 expected components in the golden
 * dataset is a lower-case hyphenated slug naming a deployed workload, and every
 * one is recoverable from its own incident text under the token rule -- both
 * properties are asserted in `fault-prompt-grammar.test.ts`. The second of them
 * is this round's change: `config-feature-flag-checkout` was annotated
 * `checkout-ui`, a name its text never carries, and the text's own workload
 * (`storefront`) is what it is now annotated with. So the rule has no exception
 * in the data, and a wrong answer is a model failure rather than a question the
 * benchmark cannot answer.
 *
 * Deliberately not a list of the 19 answers, for the reason finding 62 gives
 * about `type`: listing them fits the prompt to the test set and teaches this
 * dataset's taxonomy rather than the convention, so the accuracy number stops
 * being interpretable. The examples below are chosen to be *unlike* any dataset
 * component for exactly that reason, and a test asserts none of the 19 appears.
 */
/**
 * `component`, asked as a question rather than answered with a list of exclusions.
 *
 * Three readings have now moved this rule, and each one taught the same thing from a
 * different side:
 *
 *   v2.44 named two exclusions -- the product a workload runs on, and the actor that
 *   triggered a change. On thirty samples one landed and one did not, and two new
 *   samples produced two *more* misses of the same family: `message-broker` for a
 *   ledger writer, `settlement-service` for a currency feed.
 *
 * A list of things not to answer is only as complete as the runs that produced it.
 * The question underneath all five is one question -- *whose own behaviour failed* --
 * so it is stated as that, with the three relationships named because they are the
 * shapes a reader confuses it with: the product it runs on, the entity it depends on,
 * the entity that depends on it.
 *
 * Two details are load-bearing rather than stylistic. The suffix clause is a rule
 * about spelling and is stated as one, because `tax-calculation-service` and
 * `tax-calculation` are the same entity and no answer about ownership can separate
 * them -- folding the suffix out of the comparator was refused in finding 213.
 *
 * And the examples: `session-store` used to be one of them, and the model answered
 * exactly that string for a *different* workload in three of four readings. An example
 * is the most literal instruction in a prompt -- it shows the shape and supplies a
 * plausible value -- so an example that is also a plausible answer is a wrong answer
 * with a rule's clothes on. The three below appear nowhere in the corpus, and a test
 * asserts the prompt carries none of the recorded wrong answers.
 */
const FAULT_COMPONENT_RULE =
  '`component` is the deployed workload whose own behaviour failed. Name that ' +
  'workload, not the product it runs on, not the entity it depends on, not the entity ' +
  'that depends on it, and not the actor that triggered the change: the job, operator ' +
  'or script that ran it is the cause, and the workload that broke is the answer. ' +
  'Give it as a lower-case hyphenated slug using the words the incident uses, and add ' +
  'no role suffix (`-service`, `-api`, `-worker`) unless the incident\'s own name ' +
  'carries one -- e.g. `payments-api`, `search-indexer`, `queue-worker`.';


/** Confidence below this threshold is flagged for extra reviewer scrutiny. */
const HITL_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Build the prompt asking an LLM to extract a fault spec from a support ticket or
 * post-mortem. Only the incident text is carried - never the whole dataset.
 *
 * The prompt is deliberately a single string rather than a chat message list.
 * `LlmProvider` is `generate(prompt) -> text`, so a message-list shape would have
 * to be flattened by every adapter, and the flattening would differ between them
 * in ways that show up as accuracy differences rather than as adapter bugs.
 */
export function buildFaultExtractionPrompt(incidentText: string, types: readonly string[]): string {
  // The vocabulary is an argument, not a default. A prompt that could be built without one is a
  // prompt that will be, and a field whose answer space is unstated measures the model's taste in
  // names -- finding 62 measured exactly that at 26.3%, and the experiments since then changed the
  // *shape* of the answer (finding 63) rather than its space.
  if (types.length === 0) {
    throw new Error('a prompt without a type vocabulary asks the model to guess a naming scheme');
  }
  return [
    'You are extracting a structured fault record from a support ticket or post-mortem.',
    '',
    'Incident text:',
    incidentText,
    '',
    'Respond with JSON only, in this shape:',
    `{ "type": "one of: ${types.join(' | ')}", "category": "one of: ${FAULT_CATEGORY_VOCABULARY}", "component": "faulty component", "description": "root-cause reason", "confidence": 0.0..1.0 }`,
    '',
    FAULT_TYPE_SHAPE_RULE,
    '',
    '`type` and `category` are each matched case-insensitively against their lists; any other value is rejected.',
    '',
    '`category` is decided by what owns the fault, not by what the symptom looks like:',
    ...ANSWERABLE_CATEGORIES.map((category) => `- \`${category}\`: ${FAULT_CATEGORY_DEFINITIONS[category]}`),
    '',
    'Where two of them both seem to fit, the comparison decides it:',
    ...FAULT_CATEGORY_BOUNDARIES.map(
      (boundary) => `- \`${boundary.between[0]}\` vs \`${boundary.between[1]}\`: ${boundary.rule}`,
    ),
    '',
    FAULT_COMPONENT_RULE,
    '',
    '`category`, `component` and `description` may be omitted when uncertain.',
  ].join('\n');
}

/**
 * Normalise the category the model answered with, or `null` when it is not in
 * the vocabulary.
 *
 * The prompt advertises the vocabulary as `"resource | network | ..."` with no
 * casing statement, and `parseFaultSpec` matches the category by exact value.
 * Before this, a model answering `"NETWORK"` or `" network "` produced
 * `ok: true` from the parser and `valid: false` from the validator, so a
 * correctly-extracted fault was rejected and the reviewer was told the
 * *category* was wrong when it was the *casing* that was wrong.
 *
 * The fix is in two halves on purpose. The prompt now states the rule, so a
 * model is not left to infer it; and the parser normalises the obvious
 * deviations, so a model that infers it anyway does not lose a correct answer.
 * Whitespace is trimmed and the case folded -- nothing else. A synonym like
 * `net` is still rejected, because deciding that `net` means `network` is a
 * judgement, not a normalisation, and the H3 reviewer is who should make it.
 *
 * Returning `null` rather than the raw string is what makes the deviation
 * visible: the caller reports which value was rejected instead of quietly
 * storing something the validator will refuse later.
 */
function normalizeCategory(raw: string): FaultCategory | null {
  const folded = raw.trim().toLowerCase();
  return isVocabularyMember(FAULT_CATEGORIES, folded) ? folded : null;
}

/**
 * Parse an LLM text response into a validated `ExtractedFault`.
 *
 * The response may be bare JSON, JSON inside a markdown code fence, or JSON
 * embedded in surrounding prose - the first `{` and last `}` bound the object.
 */
export function parseFaultExtractionResponse(text: string): FaultExtractionParseResult {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: 'response contains no JSON object' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, error: 'response JSON is malformed' };
  }

  // The extracted slice starts at `{`, so a successful parse is always a JSON
  // object; the cast is safe and avoids an unreachable type-check branch.
  const obj = parsed as Record<string, unknown>;

  const type = obj['type'];
  if (typeof type !== 'string' || type.trim() === '') {
    return { ok: false, error: "response is missing a non-blank 'type'" };
  }

  const rawCategory = obj['category'];
  if (rawCategory !== undefined && typeof rawCategory !== 'string') {
    return { ok: false, error: "'category' must be a string" };
  }
  let category: FaultCategory | undefined;
  if (rawCategory !== undefined) {
    const normalized = normalizeCategory(rawCategory);
    if (normalized === null) {
      // Rejected here rather than deferred to `parseFaultSpec`, so the error
      // names the offending value at the point it was read.
      return { ok: false, error: `invalid fault category '${rawCategory}'` };
    }
    category = normalized;
  }

  const component = obj['component'];
  if (component !== undefined && typeof component !== 'string') {
    return { ok: false, error: "'component' must be a string" };
  }

  const description = obj['description'];
  if (description !== undefined && typeof description !== 'string') {
    return { ok: false, error: "'description' must be a string" };
  }

  const confidence = obj['confidence'];
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, error: "'confidence' must be a number between 0 and 1" };
  }

  return {
    ok: true,
    extracted: {
      type,
      ...(category !== undefined ? { category } : {}),
      ...(component !== undefined ? { component } : {}),
      ...(description !== undefined ? { description } : {}),
      confidence,
    },
  };
}

/**
 * Validate an extracted fault into a `FaultSpec`, reusing `parseFaultSpec` for the
 * structural rules (non-blank type, valid category, optional object parameters).
 *
 * A low confidence never invalidates the spec - it only adds a reason so the H3
 * reviewer knows to scrutinise it. `hitlGate` is always H3: historical ground
 * truth was not produced under controlled injection and must be human-confirmed.
 */
export function validateExtractedFault(extracted: ExtractedFault): FaultExtractionValidation {
  const reasons: string[] = [];

  const parsed = parseFaultSpec(
    { type: extracted.type, ...(extracted.category !== undefined ? { category: extracted.category } : {}) },
    'historical',
  );
  if (!parsed.ok) {
    reasons.push(parsed.error);
  }

  if (extracted.confidence < HITL_CONFIDENCE_THRESHOLD) {
    reasons.push(
      `confidence ${extracted.confidence} is below the ${HITL_CONFIDENCE_THRESHOLD} auto-approve threshold`,
    );
  }

  return {
    valid: parsed.ok,
    hitlGate: 'H3',
    reasons,
    ...(parsed.ok ? { spec: parsed.spec } : {}),
  };
}
