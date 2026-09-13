import { z } from 'zod';

/**
 * Runtime schemas for the IR.
 *
 * These exist because the IR crosses process boundaries (CLI -> worker -> exporter)
 * and because LLM-generated rules can emit structurally valid but semantically
 * wrong objects. Static types alone cannot catch that.
 */

export const fieldProvenanceSchema = z.object({
  source: z.enum(['direct', 'derived', 'inferred', 'defaulted']),
  ruleId: z.string().optional(),
  modelId: z.string().optional(),
  promptVersion: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const resourceSchema = z
  .object({
    'service.name': z.string().min(1),
    'service.namespace': z.string().optional(),
    'service.version': z.string().optional(),
    'k8s.pod.name': z.string().optional(),
    'k8s.node.name': z.string().optional(),
    'host.name': z.string().optional(),
  })
  .catchall(z.string().optional());

export const metricPayloadSchema = z.object({
  kind: z.literal('metric'),
  name: z.string().min(1),
  value: z.number().finite(),
  unit: z.string().optional(),
  semanticType: z
    .enum(['latency', 'error_rate', 'throughput', 'saturation', 'availability', 'other'])
    .optional(),
  tags: z.record(z.string()).optional(),
});

export const logPayloadSchema = z.object({
  kind: z.literal('log'),
  body: z.string(),
  severityText: z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).optional(),
  templateId: z.string().optional(),
  params: z.record(z.string()).optional(),
});

export const tracePayloadSchema = z.object({
  kind: z.literal('trace'),
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  parentSpanId: z.string().min(1).optional(),
  spanName: z.string().min(1),
  durationMs: z.number().nonnegative().finite(),
  status: z.enum(['OK', 'ERROR', 'UNSET']).optional(),
  attributes: z.record(z.string()).optional(),
});

export const eventPayloadSchema = z.object({
  kind: z.literal('event'),
  reason: z.string().min(1),
  message: z.string().optional(),
  type: z.enum(['Normal', 'Warning']).optional(),
  count: z.number().int().nonnegative().optional(),
  changeType: z.enum(['deploy', 'config', 'scale', 'rollback']).optional(),
  involvedObject: z
    .object({ kind: z.string().min(1), name: z.string().min(1) })
    .optional(),
});

export const alertPayloadSchema = z.object({
  kind: z.literal('alert'),
  alertName: z.string().min(1),
  severity: z.enum(['critical', 'warning', 'info']).optional(),
  state: z.enum(['firing', 'resolved']).optional(),
  labels: z.record(z.string()).optional(),
  annotations: z.record(z.string()).optional(),
});

export const profilePayloadSchema = z.object({
  kind: z.literal('profile'),
  profileType: z.enum(['cpu', 'heap', 'goroutine', 'flamegraph']),
  payloadRef: z.string().min(1),
  samplePeriodMs: z.number().positive().optional(),
});

export const signalPayloadSchema = z.discriminatedUnion('kind', [
  metricPayloadSchema,
  logPayloadSchema,
  tracePayloadSchema,
  eventPayloadSchema,
  alertPayloadSchema,
  profilePayloadSchema,
]);

export const telemetrySignalSchema = z.object({
  irVersion: z.string().min(1),
  resource: resourceSchema,
  timestamp: z.string().min(1),
  // Minutes east of UTC on the wire (China Standard Time is 480). The field is
  // typed, not merely optional: it is the only surviving record of where the
  // sample sat in local time once `timestamp` has been normalised to UTC, and
  // nothing downstream recomputes it. An undeclared number here would be the
  // worst of both worlds -- serialised into the bundle and relied upon by
  // consumers while being unverifiable at the boundary. Bounding it to real
  // offsets means a producer that writes seconds or a raw zone id is rejected
  // where the mistake was made instead of months later in an exporter.
  rawOffsetMinutes: z.number().int().min(-720).max(840).optional(),
  signal: z.enum(['metric', 'log', 'trace', 'event', 'alert', 'profile']),
  payload: signalPayloadSchema,
  provenance: z.record(fieldProvenanceSchema).optional(),
}).superRefine((value, ctx) => {
  // `signal` and `payload.kind` are two views of the same fact and must agree;
  // a mismatch silently mis-routes the record in every downstream consumer.
  if (value.signal !== value.payload.kind) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `signal '${value.signal}' does not match payload kind '${value.payload.kind}'`,
      path: ['payload'],
    });
  }
});

/**
 * A string that must carry content.
 *
 * Plain `min(1)` counts whitespace as content, so `'   '` would satisfy a
 * required name or id and travel into the IR. A blank entity name is worse than
 * a missing one: it becomes a `byAlias` key, so two of them manufacture an
 * ambiguity that then gets blamed on a legitimate root cause. `.trim()` makes
 * "non-blank" the rule; the value is still stored trimmed for these fields.
 */
const nonBlank = z.string().trim().min(1);

export const entitySchema = z.object({
  entityId: nonBlank,
  kind: z.enum([
    'service',
    'pod',
    'node',
    'container',
    'db',
    'mq',
    'host',
    'cluster',
    'external',
  ]),
  name: nonBlank,
  namespace: z.string().optional(),
  aliases: z.array(nonBlank),
  attributes: z.record(z.string()).optional(),
});

export const entityEdgeSchema = z.object({
  from: nonBlank,
  to: nonBlank,
  relation: z.enum(['contains', 'hosts', 'calls', 'same_as']),
  attributes: z.record(z.string()).optional(),
});

export const entityGraphSchema = z.object({
  entities: z.array(entitySchema),
  edges: z.array(entityEdgeSchema),
});

export const evidenceCheckpointSchema = z.object({
  checkpointId: z.string().min(1),
  entityRef: z.string().min(1),
  signalRef: z.string().optional(),
  comparator: z.enum(['>', '>=', '<', '<=', '==', '!=', 'contains', 'matches']),
  value: z.union([z.number(), z.string()]),
  unit: z.string().optional(),
  description: z.string().min(1),
});

export const causalStepSchema = z.object({
  step: z.number().int().nonnegative(),
  fromEntityId: z.string().min(1),
  toEntityId: z.string().min(1),
  mechanism: z.string().min(1),
  evidenceRefs: z.array(z.string()),
});

export const groundTruthSchema = z.object({
  rootCauseEntityId: z.string().min(1),
  rootCauseComponent: z.string().min(1),
  rootCauseReason: z.string().min(1),
  rootCauseIndicators: z
    .array(
      z.object({
        type: z.enum(['metric', 'log', 'trace']),
        ref: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .optional(),
  causalChain: z.array(causalStepSchema).optional(),
  evidenceCheckpoints: z.array(evidenceCheckpointSchema).optional(),
  remediation: z
    .array(z.object({ step: z.number().int(), action: z.string(), target: z.string() }))
    .optional(),
});

export const faultCaseSchema = z.object({
  caseId: z.string().min(1),
  system: z.string().min(1),
  environment: z.object({
    system: z.string().min(1),
    version: z.string().optional(),
    deployRef: z.string().optional(),
    reproducerRef: z.string().optional(),
    checksums: z.record(z.string()).optional(),
  }),
  injectTime: z.string().min(1),
  window: z.object({ start: z.string().min(1), end: z.string().min(1) }),
  fault: z.object({
    type: z.string().min(1),
    category: z.enum([
      'resource',
      'network',
      'runtime',
      'middleware',
      'code',
      'config',
      'dependency',
      'unknown',
    ]),
    injectionMethod: z
      .enum(['chaos-mesh', 'litmus', 'chaosblade', 'historical', 'manual'])
      .optional(),
    parameters: z.record(z.unknown()).optional(),
  }),
  groundTruth: groundTruthSchema,
  query: z.string().optional(),
  difficulty: z.enum(['L1', 'L2', 'L3', 'L4']).optional(),
  quality: z.unknown().optional(),
  answerKeyIsolated: z.boolean().optional(),
});

export const irBundleSchema = z.object({
  irVersion: z.string().min(1),
  graph: entityGraphSchema,
  cases: z.array(faultCaseSchema),
  signals: z.record(z.array(telemetrySignalSchema)),
});

export type TelemetrySignalParsed = z.infer<typeof telemetrySignalSchema>;
export type FaultCaseParsed = z.infer<typeof faultCaseSchema>;
export type IrBundleParsed = z.infer<typeof irBundleSchema>;
