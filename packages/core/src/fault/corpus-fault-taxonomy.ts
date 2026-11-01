/**
 * The corpus's own fault taxonomy, and the one thing the shipped vocabulary cannot say.
 *
 * ## Why this table exists
 *
 * `inferFaultCategory` reads a fault slug and returns one of eight categories. It is a
 * *classifier*, built for slugs a person wrote -- `cpu-hog`, `redis-latency`,
 * `feature-flag-misconfiguration` -- and checked against the 19 expected types in
 * `golden-master/fault-extraction/samples.json`, where it agrees 19 of 19.
 *
 * The published RCAEval corpus does not write slugs. It writes eleven tokens, and two of
 * those families are invisible to that classifier:
 *
 * ```
 * inferFaultCategory('socket')  ->  unknown     45 cases of 735
 * inferFaultCategory('f4')      ->  unknown     90 cases of 735
 * ```
 *
 * Both are the corpus's own words, and both are defined by the corpus's own paper. So the
 * gap is not in the data: it is 135 of 735 cases (18.4%) whose category this repository
 * could not name, and the count is exact rather than approximate because the tokens were
 * read off the nine published archives rather than off this documentation.
 *
 * ## Why the table does not overrule the classifier
 *
 * A second table over the same words is how two readings drift apart. The rule here is
 * therefore one-directional and it is tested (`corpus-fault-taxonomy.test.ts`, "never
 * contradicts the classifier where the classifier speaks"):
 *
 *   - where `inferFaultCategory` returns a category, **it** decides, and this table
 *     supplies only the fault's name;
 *   - where it returns `unknown`, this table may decide.
 *
 * The six injected faults the corpus shares with RE1 (`cpu`, `mem`, `disk`, `delay`,
 * `loss`) are therefore still read by the classifier, case by case, exactly as before.
 * Nothing about the 90 cases that round-tripped at `oracle=1.00` moves because of this
 * file. What moves is the 90 code-level cases and the 45 socket cases, which stop being
 * `unknown` -- and, in `scripts/check-official.mjs`, stop being stamped `code` by a
 * constant that applied to the whole suite (finding 343) and start being read as what
 * their label says.
 *
 * ## `socket` is a resource fault, and the corpus says so
 *
 * It is tempting to read `socket` as a network token. Upstream does not: it injects the
 * fault with `stress-ng` inside the container, lists it with CPU, MEM and DISK as the
 * "four resource faults", and scores it against a resource metric. The category below is
 * upstream's, quoted rather than reasoned.
 *
 * ## And the labels the corpus writes that its own paper does not name
 *
 * One case directory of the ninety is `RE3-TT/ts-route-service_f3_1/{1,2,3}`: a fault
 * label carrying an instance suffix, which is a spelling the paper's `F1`…`F5` list does
 * not contain. Reading it as F3 needs a rule, and the rule is stated in
 * `readCorpusFault`: a stem is accepted only when what follows it is an instance number.
 * Without that floor `cpu_delay` would read as a CPU hog and the network fault it names
 * would vanish from every count.
 */

import type { FaultCategory } from '../ir/types.js';
import { inferFaultCategory } from './collector.js';

/** One fault the corpus injects, as the corpus names it. */
export interface CorpusFault {
  /** The token in the case path: `RE3-OB/adservice_f3/1` carries `f3`. */
  readonly token: string;
  /** The fault's name in the corpus's own paper. */
  readonly name: string;
  readonly category: FaultCategory;
}

/**
 * Where every row below comes from.
 *
 * The paper is the citation for the *names*; the dataset README is the citation for the
 * *tokens*, because the paper writes them as acronyms (`CPU`, `SOCK`, `F1`) while the
 * archives write them as path components (`cpu`, `socket`, `f1`). Both are quoted, so a
 * reader does not have to trust a paraphrase of either.
 */
export const RCAEVAL_FAULT_TAXONOMY_SOURCE = {
  paper: 'RCAEval: A Benchmark for Root Cause Analysis of Microservice Systems with Telemetry Data',
  venue: 'WWW ’25 Companion',
  section: '3.2 Fault Types',
  url: 'https://arxiv.org/abs/2412.17015',
  faultNames: [
    'Incorrect parameter values',
    'Missing parameters',
    'Missing Function Call',
    'Incorrect Return Values',
    'Missing Exception Handlers',
  ],
  resourceQuote:
    'We introduce four resource faults into the running container (i.e., service instance) using ' +
    'stress-ng: CPU hog (CPU), Memory leak (MEM), Disk stress (DISK), and Socket stress (SOCK).',
  networkQuote:
    'We use traffic control (tc) to intercept the network packets of the running container, ' +
    'introducing delay variations (DELAY) or randomly dropping packets (DROP).',
  codeQuote:
    'We modify the source code of random services to introduce five bugs commonly found in ' +
    'open-source projects: Incorrect parameter values (F1), Missing parameters (F2), Missing ' +
    'Function Call (F3), Incorrect Return Values (F4), and Missing Exception Handlers (F5).',
  tokenSource: 'RCAEval README, "Dataset" table: RE1/RE2 fault types `cpu, mem, disk, delay, loss, socket`; RE3 `f1…f5`',
} as const;

/**
 * The eleven fault types the published corpus injects, in paper order.
 *
 * Read off the corpus, not off the paper: the six injected faults and the five code-level
 * ones are the twelve tokens the nine archives use, minus `f3_1`, which is a stem-plus-
 * instance spelling of `f3` rather than a twelfth fault.
 */
export const RCAEVAL_CORPUS_FAULTS: readonly CorpusFault[] = [
  { token: 'cpu', name: 'CPU hog', category: 'resource' },
  { token: 'mem', name: 'Memory leak', category: 'resource' },
  { token: 'disk', name: 'Disk stress', category: 'resource' },
  { token: 'socket', name: 'Socket stress', category: 'resource' },
  { token: 'delay', name: 'Network delay', category: 'network' },
  { token: 'loss', name: 'Packet loss', category: 'network' },
  { token: 'f1', name: 'Incorrect parameter values', category: 'code' },
  { token: 'f2', name: 'Missing parameters', category: 'code' },
  { token: 'f3', name: 'Missing Function Call', category: 'code' },
  { token: 'f4', name: 'Incorrect Return Values', category: 'code' },
  { token: 'f5', name: 'Missing Exception Handlers', category: 'code' },
];

/**
 * A label of the form `stem_<digits>`, and nothing looser.
 *
 * The digits are an instance index -- `f3_1` is the first repetition of an F3 campaign
 * recorded under a directory name that kept the suffix -- so a stem is only accepted when
 * the tail is a number. `cpu_delay` and `socket_close` are two-word labels and are refused.
 */
const INSTANCE_SUFFIX = /^([a-z0-9]+)_(\d+)$/;

/**
 * The corpus fault a label names, or `undefined`.
 *
 * `f3_1` is read as `f3` and reports `token: 'f3'`, because the suffix is an instance and
 * not a fault. Everything the table does not name is `undefined` -- including the labels
 * the *classifier* reads (`net_cpu_node`), which this function deliberately does not
 * answer for: it is the taxonomy's reader, not a second classifier.
 */
export function readCorpusFault(type: string): CorpusFault | undefined {
  const normalized = type.trim().toLowerCase();
  if (normalized === '') return undefined;
  const direct = RCAEVAL_CORPUS_FAULTS.find((one) => one.token === normalized);
  if (direct !== undefined) return direct;
  const suffixed = INSTANCE_SUFFIX.exec(normalized);
  if (suffixed === null) return undefined;
  return RCAEVAL_CORPUS_FAULTS.find((one) => one.token === suffixed[1]);
}

/** How a fault label got its category, so a caller can print which reading it used. */
export interface CorpusFaultDescription {
  /** The label as it arrived. */
  readonly type: string;
  readonly category: FaultCategory;
  /** The corpus's name for the fault, when the taxonomy knows the label. */
  readonly name: string | null;
  /**
   * `classifier` when `inferFaultCategory` decided, `taxonomy` when it could not and this
   * table did, `unknown` when neither could.
   */
  readonly readAs: 'classifier' | 'taxonomy' | 'unknown';
}

/**
 * Classify one fault label, preferring the general reading and reporting which one ran.
 *
 * The order is the whole argument of this module: a sentence in a doc that says "the
 * taxonomy never overrules the classifier" is a claim, while an enum on the result that
 * the caller prints is the claim being checked on every run.
 */
export function describeCorpusFault(type: string): CorpusFaultDescription {
  const named = readCorpusFault(type);
  const inferred = inferFaultCategory(type);
  if (inferred !== 'unknown') {
    return { type, category: inferred, name: named?.name ?? null, readAs: 'classifier' };
  }
  if (named !== undefined) {
    return { type, category: named.category, name: named.name, readAs: 'taxonomy' };
  }
  return { type, category: 'unknown', name: null, readAs: 'unknown' };
}
