import type { EntityGraph, FaultCase } from '../ir/types.js';
import { indexGraph, resolveEntityRef } from '../entity/graph.js';

/**
 * Is a case's ground truth filled in all four layers, and are its references answerable?
 *
 * M1 has an exit condition that says "GT four-layer annotation (entity / fault / process /
 * evidence) can all be filled". The schema does not enforce it: `causalChain` and
 * `evidenceCheckpoints` are both optional, and `rootCauseEntityId` is a string that nothing
 * resolves. So a case can carry a type and a component and be a perfectly valid `FaultCase`
 * while three of the four layers are empty -- which is what every case in this repository did
 * until this module existed.
 *
 * "Can be filled" is not "is filled", and the difference matters. But a claim that a layer can
 * be filled is only checkable if something says what filling it means, and that is what this
 * module is: a definition, in code, of the four layers and of what makes each one answerable.
 * A case that passes is evidence for the first sample; the count over a corpus is evidence for
 * the corpus.
 *
 * ## Why the references, and not just the presence of a value
 *
 * `CausalStep.fromEntityId` and `EvidenceCheckpoint.entityRef` are documented as "must resolve
 * against the EntityGraph", and nothing checked that either -- `findDanglingEdgeRefs` covers
 * edges, not the ground truth. A layer filled with refs that name nothing is a layer that reads
 * as complete and cannot be evaluated: an evaluator scoring "did the model name the root cause"
 * has no node to compare against. So each layer's verdict is about resolution, and the reading
 * carries the unresolved refs rather than a bare boolean.
 *
 * ## The two cross-layer references
 *
 * A step's `evidenceRefs` point at checkpoints, and a checkpoint id that no checkpoint carries
 * is the same defect one level in. It is reported separately because it is a different repair:
 * an unresolved entity ref is a graph that is missing a node, a dangling evidence ref is a step
 * that cites evidence the case does not state.
 */

export type LayerName = 'entity' | 'fault' | 'process' | 'evidence';

export interface LayerReading {
  layer: LayerName;
  filled: boolean;
  /** How many items the layer carries. Zero is the normal value when it is not filled. */
  items: number;
  /** Why the layer is not filled. Absent when it is. */
  reason?: string;
}

export interface UnresolvedRef {
  layer: LayerName;
  ref: string;
  /** Where the reference sits, in the form a reader can grep for. */
  where: string;
}

export interface DanglingEvidenceRef {
  step: number;
  ref: string;
}

export interface FourLayerReading {
  layers: LayerReading[];
  /** Entity references the case's own graph cannot answer. */
  unresolved: UnresolvedRef[];
  /** `CausalStep.evidenceRefs` naming a checkpoint the case does not carry. */
  danglingEvidence: DanglingEvidenceRef[];
  /** Every layer filled, every entity ref resolved, every evidence ref real. */
  complete: boolean;
}

/**
 * Read a case against the graph that is supposed to answer it.
 *
 * The graph is a parameter rather than part of the case because the two live at different
 * layers: one `EntityGraph` backs many cases, and a case that resolved against a graph it
 * carried would be answering its own question.
 */
export function assessFourLayer(input: { case: FaultCase; graph: EntityGraph }): FourLayerReading {
  const { case: faultCase, graph } = input;
  const index = indexGraph(graph);
  const truth = faultCase.groundTruth;
  const unresolved: UnresolvedRef[] = [];

  const resolve = (ref: string, where: string, layer: LayerName): boolean => {
    if (resolveEntityRef(ref, index) !== null) return true;
    unresolved.push({ layer, ref, where });
    return false;
  };

  // Entity layer: the root cause names a node the graph has. `rootCauseComponent` is a string
  // for humans and is not resolvable by construction -- the id is the reference.
  const rootResolves = resolve(truth.rootCauseEntityId, 'groundTruth.rootCauseEntityId', 'entity');
  const entityLayer: LayerReading = {
    layer: 'entity',
    filled: rootResolves,
    items: rootResolves ? graph.entities.length : 0,
    ...(rootResolves ? {} : { reason: `'${truth.rootCauseEntityId}' resolves to no entity in the graph` }),
  };

  // Fault layer: the taxonomy answer. Both fields are required by the schema, so the only way
  // this one is empty is a caller that built the object by hand.
  const faultFilled = faultCase.fault.type !== '' && faultCase.fault.category !== 'unknown';
  const faultLayer: LayerReading = {
    layer: 'fault',
    filled: faultFilled,
    items: faultFilled ? 1 : 0,
    ...(faultFilled
      ? {}
      : {
          reason:
            faultCase.fault.type === ''
              ? 'fault.type is empty'
              : "fault.category is 'unknown', which is the taxonomy declining to answer rather than an answer",
        }),
  };

  // Process layer: at least one step, and both ends of every step resolve.
  const chain = truth.causalChain ?? [];
  let processResolved = true;
  for (const step of chain) {
    const from = resolve(step.fromEntityId, `groundTruth.causalChain[${String(step.step)}].fromEntityId`, 'process');
    const to = resolve(step.toEntityId, `groundTruth.causalChain[${String(step.step)}].toEntityId`, 'process');
    processResolved = processResolved && from && to;
  }
  const processLayer: LayerReading = {
    layer: 'process',
    filled: chain.length > 0 && processResolved,
    items: chain.length,
    ...(chain.length === 0
      ? { reason: 'groundTruth.causalChain is absent or empty' }
      : processResolved
        ? {}
        : { reason: 'a causal step names an entity the graph does not carry' }),
  };

  // Evidence layer: at least one checkpoint, and its entity resolves.
  const checkpoints = truth.evidenceCheckpoints ?? [];
  let evidenceResolved = true;
  for (const checkpoint of checkpoints) {
    const ok = resolve(checkpoint.entityRef, `groundTruth.evidenceCheckpoints[${checkpoint.checkpointId}].entityRef`, 'evidence');
    evidenceResolved = evidenceResolved && ok;
  }
  const evidenceLayer: LayerReading = {
    layer: 'evidence',
    filled: checkpoints.length > 0 && evidenceResolved,
    items: checkpoints.length,
    ...(checkpoints.length === 0
      ? { reason: 'groundTruth.evidenceCheckpoints is absent or empty' }
      : evidenceResolved
        ? {}
        : { reason: 'a checkpoint names an entity the graph does not carry' }),
  };

  // The cross-layer reference. A step citing evidence the case does not state reads as
  // supported and is not, which is worse than a step citing nothing.
  const known = new Set(checkpoints.map((checkpoint) => checkpoint.checkpointId));
  const danglingEvidence: DanglingEvidenceRef[] = [];
  for (const step of chain) {
    for (const ref of step.evidenceRefs) {
      if (!known.has(ref)) danglingEvidence.push({ step: step.step, ref });
    }
  }

  const layers = [entityLayer, faultLayer, processLayer, evidenceLayer];
  return {
    layers,
    unresolved,
    danglingEvidence,
    complete:
      layers.every((layer) => layer.filled) && unresolved.length === 0 && danglingEvidence.length === 0,
  };
}

/** One line per layer plus the two reference counts, for a report or a log. */
export function formatFourLayerReading(reading: FourLayerReading): string {
  const lines = reading.layers.map((layer) => {
    const head = `  ${layer.layer.padEnd(9)} ${layer.filled ? 'filled' : 'EMPTY '} ${String(layer.items).padStart(2)} item(s)`;
    return layer.reason === undefined ? head : `${head}  -- ${layer.reason}`;
  });
  lines.push(`  unresolved refs: ${String(reading.unresolved.length)}`);
  lines.push(`  dangling evidence refs: ${String(reading.danglingEvidence.length)}`);
  lines.push(`  four layers: ${reading.complete ? 'COMPLETE' : 'INCOMPLETE'}`);
  return lines.join('\n');
}
