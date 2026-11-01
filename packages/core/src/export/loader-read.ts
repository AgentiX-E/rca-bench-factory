import type { Entity } from '../ir/types.js';
import { SLI_SUFFIX } from './sli.js';

/**
 * The four decisions `main.py` makes before it compares a single number, asked of the files we
 * ship rather than of the annotations they were built from.
 *
 * ## Why this module exists
 *
 * `export/sli.ts` answers one of those decisions -- which column the case is ranked by -- and its
 * own header quotes the rest of the block:
 *
 *     service, metric = basename(dirname(dirname(data_path))).split("_")
 *     normal_df = data[data["time"] < inject_time].tail(...)
 *     "service": len({c.split("_")[0].replace("-db", "") for c in _pre_cols if c != "time"})
 *     sli = "frontend_latency"
 *     if f"{service}_latency" in data: sli = f"{service}_latency"
 *
 * Five rounds of work went into the corpus, the annotations and the exporter without any of these
 * lines being *run* against an artefact we produced. The path token -- the one thing the loader
 * decides from a name it does not read out of the data -- was already recorded as a product
 * decision: a synthetic storefront's export cannot claim to be Online Boutique, so the loader's
 * `raise ValueError("SLI not implemented")` stands, and the corpus answers the half that is its own
 * instead (finding 326).
 *
 * What was left is the other three lines, and they are not decisions at all. They are arithmetic
 * over our files, and each of them can be wrong while everything above it is right:
 *
 *   1. the leaf directory has to unpack into **exactly two** names, or the loader raises before it
 *      opens `data.csv`;
 *   2. the pre-injection window -- `data["time"] < inject_time` -- has to contain rows, or the
 *      "before" the whole ranking is a deviation *from* is empty;
 *   3. every column head is read as a **candidate service name**, after `split("_")[0]` and a
 *      `-db` removal that is upstream's convention for its own corpora, not ours.
 *
 * ## What each of the three can silently get wrong
 *
 * The first is a shape question and the corpus answers it by construction (`faultToken` keeps
 * underscores, and one of the real corpora ships a fault label with two -- which upstream cannot
 * read either, finding 268). The second is the one nothing had ever measured: a case whose window
 * starts after the injection instant ships a well-formed table whose baseline is empty, and the
 * loader's `normal_df` is then zero rows -- not an error, a ranking computed from nothing. The
 * third is the one that had never been compared: our topology is made of services, pods,
 * containers, nodes, brokers, databases and external dependencies, and the loader's candidate set
 * is made of whatever the column heads spell. Two of those heads end in `-db`, so the loader
 * renames two of our entities into names no graph contains.
 *
 * ## What this module refuses to do
 *
 * It does not decide whether the loader will accept the corpus -- that is the path token, and it is
 * upstream's table (recorded as a product decision, and answered in the documentation rather than
 * in code, because a list of corpus tokens here would be the allow-list v3.24 rejected). It does not
 * rename anything either: a candidate the loader rewrites is *reported*, and the one consequence
 * worth refusing -- a case whose own answer would be renamed -- is a fault the caller can turn into
 * a problem.
 */

/**
 * What upstream strips from a candidate name, and the reason it is quoted rather than generalised.
 *
 * `.replace("-db", "")` is upstream's way of mapping its corpora's database components onto the
 * service names its ground truth uses. It is a *consumer* convention applied to a name we wrote, so
 * the only faithful implementation is the one character string it removes, in the one place it
 * removes it: anywhere in the head, first occurrence.
 */
export const LOADER_DB_SUFFIX = '-db';

/** The service and fault the loader reads out of a leaf directory name. */
export interface LoaderLabel {
  readonly service: string;
  readonly fault: string;
}

/** Every way the first line can fail to produce two names. */
export type LoaderLabelFault =
  /** The path is not three components, so there is no second component to split. */
  | { readonly kind: 'shape'; readonly directory: string; readonly components: number }
  /** The second component does not split into exactly two names, and the loader unpacks two. */
  | { readonly kind: 'unpack'; readonly directory: string; readonly segment: string; readonly names: number };

/**
 * Read a case directory the way the loader does: three components, the second split on `_`.
 *
 * The rule is *exactly one* underscore, not "at least one": `service, metric = ....split("_")`
 * unpacks two values and raises `ValueError` on any other count. `parseRcaEvalPath` in
 * `score/official.ts` splits at the **first** underscore instead, deliberately, because one real
 * corpus ships `ts-route-service_f3_1` and a reader that cannot see it scores zero cases for a
 * defect in the loader. The two readings are kept apart on purpose: this one reproduces the
 * consumer, and the difference between them is a fact about one case in ninety.
 */
export function loaderLabel(directory: string): LoaderLabel | LoaderLabelFault {
  const components = directory.split('/').filter((part) => part !== '');
  if (components.length !== 3) return { kind: 'shape', directory, components: components.length };
  const segment = components[1]!;
  const names = segment.split('_').length;
  if (names !== 2) return { kind: 'unpack', directory, segment, names };
  const [service, fault] = segment.split('_') as [string, string];
  return { service, fault };
}

/**
 * The column the loader looks for once it has the service, built the way it builds it.
 *
 * `${service}${SLI_SUFFIX}` and nothing else -- no tokeniser, because the segment it comes from is
 * already a token. `sliColumn` applies `caseToken` for the same suffix on a *component name*; the
 * two agree because `casePath` tokenises the segment, and the agreement is measured rather than
 * assumed (see `loader-read.test.ts`, which derives one from the other's output).
 */
export function loaderColumn(service: string): string {
  return `${service}${SLI_SUFFIX}`;
}

/**
 * One column head, the name its first segment spells, and the candidate the loader ends up with.
 *
 * All three, because the rewrites this module reports are exactly the cases where `name` and
 * `candidate` differ: a head that is read faithfully has `name === candidate`, and one the loader
 * maps onto another spelling does not. Keeping only the two ends would make "rewritten" detectable
 * only by comparing a column against a name, which is true of every column.
 */
export interface LoaderCandidate {
  readonly head: string;
  /** The part before the first underscore -- the entity name the exporter intended. */
  readonly name: string;
  /** What the loader keeps after its own `-db` removal. */
  readonly candidate: string;
}

/**
 * The candidate names in a metric table, in the loader's own spelling.
 *
 * `time` is the one column that is not a series, and it is skipped by name because that is what the
 * loader does (`if c != "time"`). Everything else contributes its head's first underscore-separated
 * part, with upstream's `-db` removal applied. Heads are returned as pairs rather than as a set,
 * because the interesting question is not *which* names came out but *which head produced which
 * name* -- a candidate that no entity in the graph carries is a rewrite, and it can only be named by
 * keeping both halves.
 */
export function loaderCandidates(header: readonly string[]): LoaderCandidate[] {
  return header
    .filter((head) => head !== 'time')
    .map((head) => {
      const name = head.split('_')[0]!;
      return { head, name, candidate: name.replace(LOADER_DB_SUFFIX, '') };
    });
}

/** The pre-injection window, and the table it was cut from. */
export interface BaselineWindow {
  /** Rows at or before the injection instant -- `data["time"] < inject_time`. */
  readonly rows: number;
  /** The first and last instant in the table, so an empty window can say *why* it is empty. */
  readonly earliest: number;
  readonly latest: number;
  readonly injectSeconds: number;
}

/**
 * Cut the baseline the loader cuts, and keep the edges so an empty one is explainable.
 *
 * `main.py` filters with a strict `<`, so a sample exactly at the injection instant belongs to the
 * *after* side. That is the loader's boundary and it is reproduced rather than improved: a case
 * whose only pre-injection sample sits on the instant has an empty baseline for the loader and a
 * non-empty one for anyone who writes `<=`.
 */
export function baselineWindow(times: readonly number[], injectSeconds: number): BaselineWindow {
  const sorted = [...times].filter((at) => Number.isFinite(at)).sort((left, right) => left - right);
  return {
    rows: sorted.filter((at) => at < injectSeconds).length,
    earliest: sorted.length === 0 ? 0 : sorted[0]!,
    latest: sorted.length === 0 ? 0 : sorted[sorted.length - 1]!,
    injectSeconds,
  };
}

/** Everything the loader would know about one case, read from the two files it reads. */
export interface LoaderView {
  readonly directory: string;
  readonly label: LoaderLabel;
  readonly column: string;
  /** Whether the table carries the column the loader will look for. */
  readonly carries: boolean;
  readonly baseline: BaselineWindow;
}

/** What `readAsLoader` returns: a view, or the one line that stops it before the data. */
export type LoaderRead =
  | { readonly kind: 'read'; readonly view: LoaderView }
  | { readonly kind: 'refused'; readonly fault: LoaderLabelFault };

/**
 * The loader's first and second lines, run over one case's own files.
 *
 * The fourth line (which column ranks) is separable and already has its own judge in `export/sli.ts`
 * -- it is asked of a declaration, not of a table -- so this function answers the two that are pure
 * arithmetic over what was written, plus the lookup that connects them: the column the path implies
 * and whether the header carries it.
 */
export function readAsLoader(input: {
  readonly directory: string;
  readonly header: readonly string[];
  readonly times: readonly number[];
  readonly injectSeconds: number;
}): LoaderRead {
  const label = loaderLabel(input.directory);
  if ('kind' in label) return { kind: 'refused', fault: label };
  const column = loaderColumn(label.service);
  return {
    kind: 'read',
    view: {
      directory: input.directory,
      label,
      column,
      carries: input.header.includes(column),
      baseline: baselineWindow(input.times, input.injectSeconds),
    },
  };
}

/** The sentence a reader gets when the loader would raise before opening the table. */
export function describeLabelFault(fault: LoaderLabelFault, caseId: string): string {
  if (fault.kind === 'shape') {
    return (
      `'${caseId}' exports to '${fault.directory}', which has ${String(fault.components)} path ` +
      'component(s), and the loader addresses a case as three -- `{suite}-{system}/' +
      '{service}_{fault}/{run}` -- so it has no second component to take a service from'
    );
  }
  return (
    `'${caseId}' exports to '${fault.directory}', whose second component '${fault.segment}' splits ` +
    `into ${String(fault.names)} name(s) on '_', and the loader unpacks exactly two ` +
    '(service, fault) -- it raises before it reads a number'
  );
}

/** The sentence for a table whose pre-injection window is empty. */
export function describeEmptyBaseline(view: LoaderView, caseId: string): string {
  return (
    `'${caseId}' writes ${String(view.baseline.earliest)}..${String(view.baseline.latest)} and is ` +
    `injected at ${String(view.baseline.injectSeconds)}, so \`data["time"] < inject_time\` selects ` +
    'no row: the loader would rank the case against a baseline it does not have'
  );
}

/**
 * The sentence for an answer the loader would rename.
 *
 * The candidate set is built from the columns, so a rewrite that touches the *answer* removes the
 * answer from the set entirely -- and nothing downstream can notice, because the ranking is then a
 * well-formed list of names that simply does not contain the right one. The corpus has no case in
 * this position, which is why the rule is written here rather than discovered later: the rewrite is
 * upstream's convention for its own corpora, and a component name is free-form.
 */
export function describeRenamedAnswer(input: {
  readonly caseId: string;
  readonly entity: string;
  readonly candidate: string;
}): string {
  return (
    `'${input.caseId}' names '${input.entity}' as its root cause, and the loader reads every column ` +
    `head through a '${LOADER_DB_SUFFIX}' removal that spells that name '${input.candidate}' -- a ` +
    'name no entity in this corpus carries, so the answer cannot appear in the ranking it builds'
  );
}

/** How the exported candidate pool is made up, once every table is read. */
export interface CandidatePool {
  /** Distinct candidate names, sorted. */
  readonly names: readonly string[];
  /** The names that are a `kind: 'service'` entity in the graph. */
  readonly services: readonly string[];
  /**
   * The names that are an entity of another kind -- a pod, a container, a node, a broker, a
   * database, an external dependency.
   *
   * One bucket rather than several, because the consequence is the same for all of them: the loader
   * reads the name as a service and cannot tell what it is. Splitting them by kind would describe a
   * distinction the reader does not make.
   */
  readonly nonServices: readonly string[];
  /** The names no entity in the graph carries, with the head that produced each. */
  readonly unknown: readonly LoaderCandidate[];
  /** The heads the loader rewrites, with both spellings. */
  readonly rewritten: readonly LoaderCandidate[];
}

/**
 * Classify the pool the loader would build from the tables we wrote.
 *
 * Four answers, and each has a different consequence. A **service** is what the corpus answers with
 * in 28 of its 30 cases. A **non-service** is an entity of any other kind -- a pod, a container, a
 * node, a broker, a database, an external dependency -- and the loader cannot tell it from a
 * service, so a case whose loudest series sits on one is scored against a name the answer key never
 * uses; that is the same distinction `rca100` states with entity kinds and containment, arriving
 * here as a bare string. An **unknown** name is one nobody wrote down: it exists only because two
 * spellings were mapped onto each other. A **rewrite** is the loader changing a head we did write.
 */
export function assessCandidatePool(input: {
  readonly candidates: readonly LoaderCandidate[];
  readonly entities: readonly Pick<Entity, 'name' | 'kind'>[];
}): CandidatePool {
  const kind = new Map(input.entities.map((entity) => [entity.name, entity.kind]));
  const names = new Set<string>();
  const rewritten = new Map<string, LoaderCandidate>();
  for (const one of input.candidates) {
    names.add(one.candidate);
    if (one.name !== one.candidate) rewritten.set(`${one.name}->${one.candidate}`, one);
  }
  const sorted = [...names].sort();
  return {
    names: sorted,
    services: sorted.filter((name) => kind.get(name) === 'service'),
    nonServices: sorted.filter((name) => kind.has(name) && kind.get(name) !== 'service'),
    unknown: input.candidates.filter((one) => !kind.has(one.candidate)),
    rewritten: [...rewritten.values()].sort((left, right) => left.head.localeCompare(right.head)),
  };
}
