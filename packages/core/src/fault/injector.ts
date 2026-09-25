import { isRecord } from '../util/json.js';
import type { FaultSpec, InjectionMethod } from './collector.js';

/**
 * Active fault injection (M12, channel A).
 *
 * The other half of the fault collector. `importer.ts` handles faults that
 * already happened and must be reconstructed from prose; this handles faults the
 * factory turns on itself, under controlled conditions, so that the ground truth
 * is known by construction rather than inferred.
 *
 * The module is a **planner** and a **reader**, in that order and nothing else.
 * It never reaches a cluster. That is not a shortcut -- it is the only way the
 * deterministic core can own any part of this, because the alternative is a
 * module whose tests need a Kubernetes API server, and a test that needs a
 * cluster is a test that does not run in CI.
 *
 * ```
 *   planInjection()   ->  a document               (pure, no I/O)
 *   [cluster applies it -- not this module]
 *   readInjectionStatus()  <-  what the cluster reported   (pure, no I/O)
 * ```
 *
 * **Validation is read, never inferred.** `readInjectionStatus` given a missing
 * or unexpected status returns `unverifiable`, not `applied: false`. A controller
 * that failed to report is not evidence that the fault was not injected, and
 * collapsing the two would let a broken observability path silently disqualify
 * every case it touched. This is the same three-valued discipline
 * `gates/validity.ts` applies to telemetry, for the same reason.
 */

/** The five Chaos Mesh `StressChaos` / `NetworkChaos`/`IOChaos` fault kinds. */
export const CHAOS_MESH_FAULT_TYPES = [
  'cpu',
  'memory',
  'disk',
  'delay',
  'loss',
] as const;

export type ChaosMeshFaultType = (typeof CHAOS_MESH_FAULT_TYPES)[number];

/**
 * Chaos Mesh's kind, and the parameter block it expects.
 *
 * Both are facts about Chaos Mesh, not about this project, and both are the kind
 * of fact that is easy to get subtly wrong. They are written down once here so
 * that a reader can check them against the upstream API and so that the mapping
 * is asserted rather than assumed.
 */
interface ChaosMeshShape {
  kind: 'StressChaos' | 'NetworkChaos' | 'IOChaos';
  /** The CRD's `spec.action` value. Absent for `StressChaos`, which has no action. */
  action?: 'delay' | 'loss' | 'fault';
}

/**
 * The plan's fault kind to the Chaos Mesh object that expresses it.
 *
 * **`delay` and `loss` are `NetworkChaos`, and this is a real trap.** The
 * project's own taxonomy (`FAULT_CATEGORIES` in `ir/types.ts`) has a `network`
 * category, and its ordered keyword table in `collector.ts` lists `delay` and
 * `loss` under `network`, so a naive reading is that both belong there -- which
 * is right. The trap is the opposite one: Chaos Mesh *also* has a `TimeChaos`
 * whose action looks like a delay, and mapping the DELAY fault onto it would
 * produce a clock skew that no network telemetry would ever show. A verifier
 * reading packet latency would correctly find nothing and the case would be
 * discarded as "the injection did not manifest" when in fact it was never a
 * network delay. The mapping is therefore pinned to `NetworkChaos` for both, and
 * a test asserts `TimeChaos` is never named.
 *
 * `disk` is `IOChaos` rather than a `StressChaos` memory burn, because a disk
 * fault that only consumes RAM is not a disk fault. `fault` is the only IOChaos
 * action that makes I/O *fail* rather than merely slow, so it is what `disk`
 * uses.
 */
const CHAOS_MESH_SHAPES: Record<ChaosMeshFaultType, ChaosMeshShape> = {
  cpu: { kind: 'StressChaos' },
  memory: { kind: 'StressChaos' },
  disk: { kind: 'IOChaos', action: 'fault' },
  delay: { kind: 'NetworkChaos', action: 'delay' },
  loss: { kind: 'NetworkChaos', action: 'loss' },
};

/**
 * The project fault category each Chaos Mesh kind belongs to.
 *
 * This is the same classification `inferFaultCategory` produces from the fault
 * *type string*, reached from the fault *kind* instead. Both exist because the
 * two entry points see different inputs: `collector.ts` sees whatever a user or
 * an incident wrote, and this sees a kind the taxonomy already narrowed. A test
 * asserts the two agree for all five kinds, so the pair cannot drift.
 */
const CHAOS_MESH_CATEGORIES: Record<ChaosMeshFaultType, FaultSpec['category']> = {
  cpu: 'resource',
  memory: 'resource',
  disk: 'resource',
  delay: 'network',
  loss: 'network',
};

export interface InjectionPlanInput {
  /** The chaos kind. Anything outside the five is rejected, not coerced. */
  faultType: string;
  /** Must resolve against the EntityGraph. Interpreted as the chaos target. */
  targetEntityId: string;
  /** Chaos Mesh namespace. */
  namespace: string;
  /** Injected-intensity parameters, e.g. `{ workers: 2, load: 100 }`. */
  parameters?: Record<string, unknown>;
  /** How long the fault stays on. */
  durationSeconds: number;
  /** How long after the fault is on the telemetry window starts. */
  observationWindowSeconds?: number;
}

export type InjectionPlanResult =
  | { ok: true; plan: InjectionPlan; spec: FaultSpec }
  | { ok: false; error: string };

export interface InjectionPlan {
  /** The Chaos Mesh object: a `kind` plus the document to apply. */
  kind: ChaosMeshShape['kind'];
  /** `spec.action`, present only for kinds that have one. */
  action?: string;
  /**
   * The full Chaos Mesh custom resource, ready to `kubectl apply -f`.
   *
   * A namespace-scoped, namespaced-target document. `mode: one` and an explicit
   * selector are both deliberate: the default `mode: all` would inject into every
   * pod matching the selector, which turns a single-fault experiment into a
   * multi-fault one and makes the ground truth ambiguous.
   */
  manifest: Record<string, unknown>;
  /** Seconds the fault is held on. */
  durationSeconds: number;
  /** Seconds of telemetry to collect once the fault is on. */
  observationWindowSeconds: number;
}

/** The window default. 300s covers a 1-minute scrape interval with margin to spare. */
const DEFAULT_OBSERVATION_WINDOW_SECONDS = 300;

/**
 * The injection method this module plans for. Named once so `planInjection`'s
 * `FaultSpec` and the plan cannot disagree about which channel produced it.
 */
const INJECTION_METHOD: InjectionMethod = 'chaos-mesh';

function isChaosMeshFaultType(value: string): value is ChaosMeshFaultType {
  return (CHAOS_MESH_FAULT_TYPES as readonly string[]).includes(value);
}

/**
 * Build the Chaos Mesh document for one fault, or explain why it cannot be built.
 *
 * Every rejection is a *structured* refusal with the offending value in the
 * message. Coercing an unknown `faultType` to the nearest known one would make
 * the planner's opinion the ground truth, which is the defect recorded as finding
 * 51: `parseFaultSpec` infers a category from a fault type, and the inference is
 * a keyword match, so `io-hang` is classified `resource` only because `io` is in
 * the resource row -- a fault that jams a disk queue and a fault that burns CPU
 * are not the same experiment.
 */
export function planInjection(input: InjectionPlanInput): InjectionPlanResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'injection plan input is not an object' };
  }

  const rawType = input.faultType;
  if (typeof rawType !== 'string' || rawType.trim() === '') {
    return { ok: false, error: "injection plan is missing a non-blank 'faultType'" };
  }
  const faultType = rawType.trim().toLowerCase();
  if (!isChaosMeshFaultType(faultType)) {
    return {
      ok: false,
      error:
        `unknown Chaos Mesh fault type '${rawType}'. ` +
        `Known kinds: ${CHAOS_MESH_FAULT_TYPES.join(', ')}.`,
    };
  }

  const targetEntityId = input.targetEntityId;
  if (typeof targetEntityId !== 'string' || targetEntityId.trim() === '') {
    return { ok: false, error: "injection plan is missing a non-blank 'targetEntityId'" };
  }

  const namespace = input.namespace;
  if (typeof namespace !== 'string' || namespace.trim() === '') {
    return { ok: false, error: "injection plan is missing a non-blank 'namespace'" };
  }

  const durationSeconds = input.durationSeconds;
  if (!isPositiveFinite(durationSeconds)) {
    return {
      ok: false,
      error: `'durationSeconds' must be a positive finite number, got ${String(durationSeconds)}`,
    };
  }

  const rawWindow = input.observationWindowSeconds;
  let observationWindowSeconds = DEFAULT_OBSERVATION_WINDOW_SECONDS;
  if (rawWindow !== undefined) {
    if (!isPositiveFinite(rawWindow)) {
      return {
        ok: false,
        error: `'observationWindowSeconds' must be a positive finite number, got ${String(rawWindow)}`,
      };
    }
    observationWindowSeconds = rawWindow;
  }

  if (input.parameters !== undefined && !isRecord(input.parameters)) {
    return { ok: false, error: "'parameters' must be an object" };
  }

  const shape = CHAOS_MESH_SHAPES[faultType];
  // The category is stated explicitly rather than left to inference: this module
  // knows the kind, and `inferFaultCategory` would be re-deriving a fact it was
  // handed. A test asserts the two agree for all five kinds, so the pair cannot
  // drift apart without going red.
  const category = CHAOS_MESH_CATEGORIES[faultType];
  const parameters = { ...(input.parameters ?? {}), durationSeconds, observationWindowSeconds };

  const manifest = buildManifest({
    shape,
    faultType,
    targetEntityId: targetEntityId.trim(),
    namespace: namespace.trim(),
    durationSeconds,
    ...(input.parameters !== undefined ? { parameters: input.parameters } : {}),
  });

  return {
    ok: true,
    plan: {
      kind: shape.kind,
      ...(shape.action !== undefined ? { action: shape.action } : {}),
      manifest,
      durationSeconds,
      observationWindowSeconds,
    },
    spec: { type: faultType, category, injectionMethod: INJECTION_METHOD, parameters },
  };
}

function isPositiveFinite(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

interface ManifestInput {
  shape: ChaosMeshShape;
  faultType: ChaosMeshFaultType;
  targetEntityId: string;
  namespace: string;
  durationSeconds: number;
  parameters?: Record<string, unknown>;
}

/**
 * The Chaos Mesh custom resource.
 *
 * Two decisions worth naming. **The selector targets `targetEntityId` as the pod
 * label `app`**, which is a convention this project adopts rather than one Chaos
 * Mesh requires; the manifest is what a reviewer reads to see which experiment
 * was run, and a wildcard selector there would make the record useless. **The
 * `action` key is omitted rather than set to `undefined`** for `StressChaos`,
 * because `JSON.stringify` drops an `undefined` value but the object would still
 * carry the key to any reader inspecting it directly, and "has an action key" is
 * the thing a reader would test.
 */
function buildManifest(input: ManifestInput): Record<string, unknown> {
  const { shape, targetEntityId, namespace, durationSeconds } = input;
  const spec: Record<string, unknown> = {
    ...(shape.action !== undefined ? { action: shape.action } : {}),
    mode: 'one',
    selector: {
      namespaces: [namespace],
      labelSelectors: { app: targetEntityId },
    },
    duration: `${durationSeconds}s`,
    ...stressSpec(input),
    ...networkSpec(input),
    ...ioSpec(input),
  };

  return {
    apiVersion: 'chaos-mesh.org/v1alpha1',
    kind: shape.kind,
    metadata: {
      name: `${input.faultType}-${sanitizeName(targetEntityId)}`,
      namespace,
    },
    spec,
  };
}

/**
 * `StressChaos` carries its intensity under `stressors`, split into `cpu` and
 * `memory` blocks; the two are mutually exclusive in practice, so only the one
 * the kind names is emitted.
 */
function stressSpec(input: ManifestInput): Record<string, unknown> {
  if (input.shape.kind !== 'StressChaos') return {};
  const parameters = input.parameters ?? {};
  const workers = numberOr(parameters['workers'], 1);
  const load = numberOr(parameters['load'], 100);
  const size = typeof parameters['size'] === 'string' ? parameters['size'] : '256Mi';
  return input.faultType === 'cpu'
    ? { stressors: { cpu: { workers, load } } }
    : { stressors: { memory: { workers, size } } };
}

/** `NetworkChaos` delay and loss both live under `delay`/`loss` blocks of their own. */
function networkSpec(input: ManifestInput): Record<string, unknown> {
  if (input.shape.kind !== 'NetworkChaos') return {};
  const parameters = input.parameters ?? {};
  if (input.faultType === 'delay') {
    return {
      delay: {
        latency: typeof parameters['latency'] === 'string' ? parameters['latency'] : '200ms',
        correlation: typeof parameters['correlation'] === 'string' ? parameters['correlation'] : '0',
        jitter: typeof parameters['jitter'] === 'string' ? parameters['jitter'] : '0ms',
      },
      direction: 'to',
    };
  }
  return {
    loss: {
      loss: typeof parameters['loss'] === 'string' ? parameters['loss'] : '100',
      correlation: typeof parameters['correlation'] === 'string' ? parameters['correlation'] : '0',
    },
    direction: 'to',
  };
}

/** `IOChaos` names the mounted volume and the percentage of calls to affect. */
function ioSpec(input: ManifestInput): Record<string, unknown> {
  if (input.shape.kind !== 'IOChaos') return {};
  const parameters = input.parameters ?? {};
  return {
    volumePath: typeof parameters['volumePath'] === 'string' ? parameters['volumePath'] : '/data',
    path: typeof parameters['path'] === 'string' ? parameters['path'] : '*',
    percent: numberOr(parameters['percent'], 100),
    methods: ['read', 'write'],
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Chaos object names must be RFC 1123 subdomains: lower-case alphanumerics and hyphens. */
function sanitizeName(value: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned === '' ? 'target' : cleaned;
}

/**
 * What the cluster reported about an injection.
 *
 * `applied` is three-valued on purpose: `true`, `false`, or `unverifiable` when
 * the status is missing or not one this module recognises. See the module header.
 */
export interface InjectionStatusReading {
  applied: boolean | 'unverifiable';
  /** The controller phase as read, or `null` when none was readable. */
  phase: string | null;
  /** Why the reading is `unverifiable`, when it is. */
  reason?: string;
}

/**
 * The Chaos Mesh conditions that mean the fault is on.
 *
 * Chaos Mesh reports `AllInjected` when every selected pod has been injected, and
 * `Injected` when at least one has. Both are success for a single-target
 * experiment with `mode: one`. `AllRecovered`/`Recovered` mean the fault was
 * injected and is now off, which is *also* evidence that it was applied -- a
 * case whose telemetry window closed after recovery should not read as "never
 * injected".
 */
const APPLIED_PHASES = ['AllInjected', 'Injected', 'AllRecovered', 'Recovered'];

/**
 * Phases that mean the controller has not finished, or has refused.
 *
 * They map to `applied: false`, which is a claim that the fault is not on -- and
 * unlike `unverifiable` that claim *will* disqualify a case. Only values that
 * are named as failures go here.
 */
const NOT_APPLIED_PHASES = ['NotInjected', 'Failed', 'Paused'];

/**
 * Read a Chaos Mesh status document for evidence that the fault was injected.
 *
 * Accepts the Chaos Mesh custom resource's `status` object (as returned by
 * `kubectl get -o jsonpath={.status}`) or a bare string phase. Anything else is
 * `unverifiable` with a reason naming what was seen, so an integration that
 * changes shape shows up as a readable message rather than as a silent `false`.
 */
export function readInjectionStatus(status: unknown): InjectionStatusReading {
  if (status === undefined || status === null) {
    return { applied: 'unverifiable', phase: null, reason: 'no status was reported for the injection' };
  }

  let phase: string | null = null;
  if (typeof status === 'string') {
    phase = status;
  } else if (isRecord(status)) {
    // Chaos Mesh nests the phase under `experiment.phase` on modern versions and
    // puts `conditions[]` alongside it. Both are read; neither is required.
    const experiment = status['experiment'];
    const rawPhase = isRecord(experiment) ? experiment['phase'] : status['phase'];
    if (typeof rawPhase === 'string') phase = rawPhase;
  }

  if (phase === null) {
    return {
      applied: 'unverifiable',
      phase: null,
      reason: 'status carries no readable phase; expected a string or an { experiment: { phase } } object',
    };
  }

  if (APPLIED_PHASES.includes(phase)) return { applied: true, phase };
  if (NOT_APPLIED_PHASES.includes(phase)) return { applied: false, phase };

  return {
    applied: 'unverifiable',
    phase,
    reason: `unrecognised Chaos Mesh phase '${phase}'; the mapping has not been taught this value`,
  };
}
