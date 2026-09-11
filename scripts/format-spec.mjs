/**
 * Authoritative field-contract specification for every export target.
 *
 * This module is the single source of truth shared by:
 *   - `scripts/gen-examples.mjs`  -> site/assets/data.js (interactive site)
 *   - `scripts/gen-docs-fields.mjs` -> the field tables inside docs/targets/*.md
 *
 * Every field listed here is emitted by a real exporter function in
 * `packages/core/src/export`; the `emitter` key names that function so a reader
 * can jump straight from the contract to the code that produces it.
 */

/** @typedef {{name: string, type: string, required: boolean, source: string, notes: string}} FieldSpec */

const T = {
  str: 'string',
  num: 'number',
  bool: 'boolean',
  null: 'null',
  obj: 'object',
  arr: 'array',
};

/** OpenRCA 1.0 (Microsoft, ICLR 2025). */
const openrca1 = {
  id: 'openrca-1.0',
  name: 'OpenRCA 1.0',
  vendor: 'Microsoft',
  venue: "ICLR'25",
  contractVersion: 'ICLR2025',
  emitter: 'src/export/openrca.ts',
  modalities: ['M', 'L', 'T'],
  tagline: 'Metric / log / trace telemetry plus an outcome-only answer key.',
  summary:
    'The canonical outcome-labelled benchmark: one telemetry directory tree per system-day and a ' +
    'single `prediction` JSON carrying the root-cause datetime, component and reason. All timestamps ' +
    'are recorded in UTC+8 (`OPENRCA_OFFSET_MINUTES = 480`).',
  timezone: 'UTC+8 (480 minutes); every emitted timestamp is shifted from canonical UTC.',
  scoringNote:
    'The official scorer matches the predicted ⟨component, reason, datetime⟩ triple against ' +
    '`record.csv`; the factory verifies the layout, the CSV headers and answer-key isolation.',
  boundaries: [
    'Telecom subsystem ships metrics and traces but no logs: an empty `log/` file is legitimate and still created.',
    'Metrics use the long form (timestamp, cmdb_id, kpi_name, value) - not a wide per-metric matrix.',
    'No topology file: `cmdb_id` is the only entity identifier available to the agent.',
  ],
  files: [
    {
      path: '{system}/query.csv',
      format: 'csv',
      purpose: 'Task input. One row per case; deliberately carries no answer key.',
      emitter: 'exportOpenRca (queryRows)',
      fields: [
        {
          name: 'instruction_id',
          type: T.str,
          required: true,
          source: 'FaultCase.caseId',
          notes: 'Join key with `record.csv` and with the telemetry file basename.',
        },
        {
          name: 'query',
          type: T.str,
          required: true,
          source: 'FaultCase.query ?? ""',
          notes: 'Natural-language task description. Must not contain the root-cause answer (G5 / `answer-key-isolated`).',
        },
        {
          name: 'occurrence_datetime',
          type: T.str,
          required: true,
          source: 'isoUtcToOffsetIso(FaultCase.injectTime, 480)',
          notes: '`YYYY-MM-DD HH:MM:SS` in UTC+8. Not the window start - it is the fault onset.',
        },
      ],
    },
    {
      path: '{system}/record.csv',
      format: 'csv',
      purpose: 'Answer key, kept physically separate so it can be withheld from the agent.',
      emitter: 'exportOpenRca (recordRows) + buildPredictionJson',
      fields: [
        {
          name: 'instruction_id',
          type: T.str,
          required: true,
          source: 'FaultCase.caseId',
          notes: 'Same join key as `query.csv`.',
        },
        {
          name: 'prediction',
          type: 'string (JSON)',
          required: true,
          source: 'buildPredictionJson(FaultCase)',
          notes: 'Escaped JSON object keyed by `"1"`.',
        },
        {
          name: 'prediction["1"]["root cause occurrence datetime"]',
          type: T.str,
          required: true,
          source: 'localTime(FaultCase.injectTime)',
          notes: 'UTC+8 `YYYY-MM-DD HH:MM:SS`; must equal `occurrence_datetime` in query.csv.',
        },
        {
          name: 'prediction["1"]["root cause component"]',
          type: T.str,
          required: true,
          source: 'GroundTruth.rootCauseComponent',
          notes: 'The scored component token, e.g. `order`.',
        },
        {
          name: 'prediction["1"]["root cause reason"]',
          type: T.str,
          required: true,
          source: 'GroundTruth.rootCauseReason',
          notes: 'Free-text reason; the official scorer is lenient about wording.',
        },
      ],
    },
    {
      path: '{system}/groundtruth.csv',
      format: 'csv',
      purpose:
        'The official `-q` artefact: the answer key in the exact shape `main/evaluate.py` consumes, so the published scorer can be pointed straight at this export.',
      emitter: 'buildGroundTruthCsv (rows from openRcaTaskIndex + buildScoringPoints)',
      fields: [
        {
          name: 'task_index',
          type: T.str,
          required: true,
          source: 'openRcaTaskIndex({datetime, component, reason})',
          notes:
            'One of `task_1`…`task_7` from `main/task_specification.json`. Derived, not chosen: a case carrying all three elements is `task_7`, one carrying only the component is `task_3`.',
        },
        {
          name: 'instruction',
          type: T.str,
          required: true,
          source: 'FaultCase.query ?? ""',
          notes: 'The same natural-language task text as `query.csv`; the evaluator only needs it to pair rows.',
        },
        {
          name: 'scoring_points',
          type: T.str,
          required: true,
          source: 'buildScoringPoints(taskIndex, elements)',
          notes:
            'Multi-line natural-language block rendered from the official templates. Three regular expressions recover the component, reason and datetime from it, so the wording is part of the contract.',
        },
      ],
    },
    {
      path: '{system}/{YYYY_MM_DD}/telemetry/metric/{caseId}.csv',
      format: 'csv',
      purpose: 'Long-form metric series for one case, sorted by local timestamp.',
      emitter: 'buildMetricCsv',
      fields: [
        {
          name: 'timestamp',
          type: T.str,
          required: true,
          source: 'localTime(TelemetrySignal.timestamp)',
          notes: 'UTC+8 `YYYY-MM-DD HH:MM:SS`.',
        },
        {
          name: 'cmdb_id',
          type: T.str,
          required: true,
          source: "resource['k8s.pod.name'] ?? resource['host.name'] ?? resource['service.name']",
          notes: 'Most-specific-first CMDB identifier; this is the only entity handle the agent gets.',
        },
        { name: 'kpi_name', type: T.str, required: true, source: 'MetricPayload.name', notes: 'Metric name, e.g. `cpu_usage`.' },
        { name: 'value', type: T.num, required: true, source: 'MetricPayload.value', notes: 'Raw numeric value; units are not carried in this format.' },
      ],
    },
    {
      path: '{system}/{YYYY_MM_DD}/telemetry/log/{caseId}.csv',
      format: 'csv',
      purpose: 'Raw log lines for one case. Empty file is legitimate (Telecom).',
      emitter: 'buildLogCsv',
      fields: [
        { name: 'timestamp', type: T.str, required: true, source: 'localTime(TelemetrySignal.timestamp)', notes: 'UTC+8.' },
        { name: 'cmdb_id', type: T.str, required: true, source: 'cmdbId(signal)', notes: 'Same resolution rule as metrics.' },
        { name: 'severity', type: T.str, required: false, source: 'LogPayload.severityText ?? ""', notes: 'TRACE|DEBUG|INFO|WARN|ERROR|FATAL; empty when unknown.' },
        { name: 'message', type: T.str, required: true, source: 'LogPayload.body', notes: 'Raw message body; comma/newline/quote escaped per RFC 4180.' },
      ],
    },
    {
      path: '{system}/{YYYY_MM_DD}/telemetry/trace/{caseId}.csv',
      format: 'csv',
      purpose: 'Flat span list; the tree is reconstructed from parent_span_id.',
      emitter: 'buildTraceCsv',
      fields: [
        { name: 'timestamp', type: T.str, required: true, source: 'localTime(TelemetrySignal.timestamp)', notes: 'UTC+8.' },
        { name: 'trace_id', type: T.str, required: true, source: 'TracePayload.traceId', notes: '' },
        { name: 'span_id', type: T.str, required: true, source: 'TracePayload.spanId', notes: '' },
        { name: 'parent_span_id', type: T.str, required: false, source: 'TracePayload.parentSpanId ?? ""', notes: 'Empty for root spans.' },
        { name: 'cmdb_id', type: T.str, required: true, source: 'cmdbId(signal)', notes: '' },
        { name: 'span_name', type: T.str, required: true, source: 'TracePayload.spanName', notes: '' },
        { name: 'duration_ms', type: T.num, required: true, source: 'TracePayload.durationMs', notes: 'Milliseconds.' },
        { name: 'status', type: T.str, required: false, source: 'TracePayload.status ?? ""', notes: 'OK|ERROR|UNSET; empty when unknown.' },
      ],
    },
  ],
};

/** OpenRCA 2.0 PAVE (process supervision). */
const openrca2 = {
  id: 'openrca-2.0',
  name: 'OpenRCA 2.0 (PAVE)',
  vendor: 'Microsoft',
  venue: 'arXiv 2606.27154',
  contractVersion: 'pave-v1',
  emitter: 'src/export/openrca2.ts',
  modalities: ['M', 'L', 'T'],
  tagline: 'Step-wise causal-path annotation with three conjunctive verification gates.',
  summary:
    'OpenRCA 2.0 replaces outcome-only labels with process supervision: the PAVE protocol annotates the ' +
    'verified propagation path from intervention to symptom, and every causal edge must satisfy three ' +
    'conjunctive gates - structural, statistical and temporal.',
  timezone: 'inherits the UTC+8 telemetry layout of 1.0; causal_path.json itself uses canonical UTC ISO-8601.',
  scoringNote:
    '`checkOpenRca2Structure` re-verifies the root-cause shape and the three-gate verdict of every step.',
  boundaries: [
    'The official OpenRCA 2.0 evaluation framework and scorer are not open-sourced - this is a PAVE-semantic annotation contract, not a byte-compatible official file.',
    'A case whose root-cause entity does not resolve into the topology is skipped, never silently repaired.',
  ],
  files: [
    {
      path: 'cases/{caseId}/causal_path.json',
      format: 'json',
      purpose: 'The verifiable causal-path contract for one case.',
      emitter: 'buildCausalPathJson',
      fields: [
        { name: 'case_id', type: T.str, required: true, source: 'FaultCase.caseId', notes: '' },
        { name: 'system', type: T.str, required: true, source: 'FaultCase.system', notes: 'System / namespace the case belongs to.' },
        { name: 'root_cause.entity_id', type: T.str, required: true, source: 'GroundTruth.rootCauseEntityId', notes: 'Must resolve into the topology.' },
        { name: 'root_cause.component', type: T.str, required: true, source: 'GroundTruth.rootCauseComponent', notes: '' },
        { name: 'root_cause.fault_type', type: T.str, required: true, source: 'FaultCase.fault.type', notes: 'Raw (non-normalised) fault type.' },
        { name: 'causal_path[]', type: T.arr, required: true, source: 'GroundTruth.causalChain', notes: 'Ordered propagation edges; empty array when the case has no chain.' },
        { name: 'causal_path[].step', type: T.num, required: true, source: 'CausalStep.step', notes: 'Strictly increasing; drives the temporal gate.' },
        { name: 'causal_path[].from_entity.entity_id', type: T.str, required: true, source: 'CausalStep.fromEntityId', notes: '' },
        { name: 'causal_path[].from_entity.name', type: 'string | null', required: true, source: 'index.byId(fromEntityId).name', notes: 'null when the endpoint is dangling (which fails the structural gate).' },
        { name: 'causal_path[].to_entity.entity_id', type: T.str, required: true, source: 'CausalStep.toEntityId', notes: '' },
        { name: 'causal_path[].to_entity.name', type: 'string | null', required: true, source: 'index.byId(toEntityId).name', notes: '' },
        { name: 'causal_path[].mechanism', type: T.str, required: true, source: 'CausalStep.mechanism', notes: 'Human-readable propagation mechanism.' },
        { name: 'causal_path[].verification.structural', type: T.bool, required: true, source: 'both endpoints resolve into topology', notes: 'Gate 1: the edge conforms to the dependency topology.' },
        { name: 'causal_path[].verification.statistical', type: T.bool, required: true, source: 'evidence.length > 0', notes: 'Gate 2: at least one evidence checkpoint supports the edge.' },
        { name: 'causal_path[].verification.temporal', type: T.bool, required: true, source: 'step > previous.step', notes: 'Gate 3: the effect onsets after its cause.' },
        { name: 'causal_path[].evidence[]', type: T.arr, required: true, source: 'CausalStep.evidenceRefs -> EvidenceCheckpoint', notes: 'Unresolvable refs are dropped from the array (and then fail gate 2).' },
        { name: 'causal_path[].evidence[].signal_ref', type: 'string | null', required: true, source: 'EvidenceCheckpoint.signalRef ?? null', notes: '' },
        { name: 'causal_path[].evidence[].comparator', type: T.str, required: true, source: 'EvidenceCheckpoint.comparator', notes: 'One of > >= < <= == != contains matches.' },
        { name: 'causal_path[].evidence[].value', type: 'number | string', required: true, source: 'EvidenceCheckpoint.value', notes: '' },
        { name: 'causal_path[].evidence[].unit', type: 'string | null', required: true, source: 'EvidenceCheckpoint.unit ?? null', notes: 'UCUM-style unit.' },
        { name: 'causal_path[].evidence[].description', type: T.str, required: true, source: 'EvidenceCheckpoint.description', notes: '' },
      ],
    },
  ],
};

/** RCAEval (RMIT). */
const rcaeval = {
  id: 'rcaeval',
  name: 'RCAEval (RE1 / RE2 / RE3)',
  vendor: 'RMIT',
  venue: "ASE'24 / WWW'25",
  contractVersion: 'www25',
  emitter: 'src/export/rcaeval.ts',
  modalities: ['M', 'L', 'T'],
  tagline: 'Per-case directory with metric vectors, injection timestamp and optional log/trace tables.',
  summary:
    'Three suites with an identical layout and different modality sets: RE1 is metrics-only (375 cases ' +
    'upstream), RE2 adds logs and traces (270), RE3 targets code-level faults (90).',
  timezone: 'Canonical UTC ISO-8601 in the CSVs; `inject_time.txt` is Unix seconds.',
  scoringNote: '`checkRcaEvalStructure` validates metrics.json shape, inject_time.txt presence and the suite modality set.',
  boundaries: [
    'Directory naming follows `{suite}-{service}-{fault}_{instance}` with non-alphanumerics stripped from service and fault tokens.',
    'RE3 skips non-code faults - a case whose `fault.category` is not `code` is reported as skipped.',
    'metrics.json is a mapping name -> ordered value array; timestamps are not carried, only ordering.',
  ],
  files: [
    {
      path: '{suite}-{service}-{fault}_{n}/metrics.json',
      format: 'json',
      purpose: 'One key per metric name, values ordered by time.',
      emitter: 'buildMetricsJson',
      fields: [
        { name: '<metric_name>', type: 'number[]', required: true, source: 'MetricPayload.name -> [MetricPayload.value]', notes: 'Points sorted ascending by parsed timestamp; the array is the time series.' },
      ],
    },
    {
      path: '{suite}-{service}-{fault}_{n}/inject_time.txt',
      format: 'text',
      purpose: 'Fault injection timestamp used by the baselines to split normal / anomalous windows.',
      emitter: 'exportRcaEval',
      fields: [
        { name: '(body)', type: T.num, required: true, source: 'floor(Date.parse(FaultCase.injectTime) / 1000)', notes: 'Unix seconds, no trailing newline.' },
      ],
    },
    {
      path: '{suite}-{service}-{fault}_{n}/logs.csv',
      format: 'csv',
      purpose: 'Log table (RE2 / RE3 only).',
      emitter: 'buildLogsCsv',
      fields: [
        { name: 'timestamp', type: T.str, required: true, source: 'TelemetrySignal.timestamp', notes: 'Canonical UTC ISO-8601 (not offset-shifted).' },
        { name: 'service', type: T.str, required: true, source: "resource['service.name']", notes: '' },
        { name: 'severity', type: T.str, required: false, source: 'LogPayload.severityText ?? ""', notes: '' },
        { name: 'message', type: T.str, required: true, source: 'LogPayload.body', notes: '' },
      ],
    },
    {
      path: '{suite}-{service}-{fault}_{n}/traces.csv',
      format: 'csv',
      purpose: 'Span table (RE2 / RE3 only).',
      emitter: 'buildTracesCsv',
      fields: [
        { name: 'timestamp', type: T.str, required: true, source: 'TelemetrySignal.timestamp', notes: 'Canonical UTC ISO-8601.' },
        { name: 'trace_id', type: T.str, required: true, source: 'TracePayload.traceId', notes: '' },
        { name: 'span_id', type: T.str, required: true, source: 'TracePayload.spanId', notes: '' },
        { name: 'parent_span_id', type: T.str, required: false, source: 'TracePayload.parentSpanId ?? ""', notes: '' },
        { name: 'service', type: T.str, required: true, source: "resource['service.name']", notes: '' },
        { name: 'span_name', type: T.str, required: true, source: 'TracePayload.spanName', notes: '' },
        { name: 'duration_ms', type: T.num, required: true, source: 'TracePayload.durationMs', notes: '' },
        { name: 'status', type: T.str, required: false, source: 'TracePayload.status ?? ""', notes: '' },
      ],
    },
  ],
};

/** RCA100 / AgenticOpsEval. */
const rca100 = {
  id: 'rca100',
  name: 'RCA100 / AgenticOpsEval',
  vendor: 'Alibaba Cloud Tianchi',
  venue: '2025',
  contractVersion: 'v1.1',
  emitter: 'src/export/rca100.ts',
  modalities: ['M', 'L', 'T', 'E', 'A', 'Topo'],
  tagline: 'Six modalities plus a UModel topology and a four-layer answer key.',
  summary:
    'The richest contract the factory targets: five modality tables (metrics, logs, traces, events, ' +
    'alerts) plus an explicit UModel entity-relation topology, with every reference required to resolve. ' +
    '19.4% of upstream root causes are observable only in the Event modality.',
  timezone: 'Canonical UTC ISO-8601 everywhere.',
  scoringNote:
    '`checkRca100Structure` verifies every case directory, the topology shape, entity-reference ' +
    'resolution, root-cause resolution and the four-layer answer key.',
  boundaries: [
    'Reference integrity is enforced, never repaired: a case with a dangling signal reference is skipped with a reason.',
    'The official distribution serialises the modality tables as Parquet; the factory emits the identical field contract as JSON so it stays diffable and byte-stable.',
    '`first_observed` / `last_observed` in topology.json are emitted as null: the IR does not track entity observation windows.',
  ],
  files: [
    {
      path: 'cases/{caseId}/metrics.json',
      format: 'json',
      purpose: 'Entity-aligned long-format metric rows.',
      emitter: 'buildRca100Metrics',
      fields: [
        { name: 'entity_id', type: T.str, required: true, source: 'resolveSignalEntity(...)', notes: 'Resolved through k8s.pod.name, k8s.node.name, host.name, service.name.' },
        { name: 'entity_set', type: T.str, required: true, source: 'UMODEL_TYPE[Entity.kind]', notes: 'apm.service | k8s.pod | k8s.node | apm.external.database | ...' },
        { name: 'timestamp', type: T.str, required: true, source: 'TelemetrySignal.timestamp', notes: 'Canonical UTC ISO-8601.' },
        { name: 'metric', type: T.str, required: true, source: 'MetricPayload.name', notes: '' },
        { name: 'value', type: T.num, required: true, source: 'MetricPayload.value', notes: '' },
        { name: 'unit', type: T.str, required: true, source: 'MetricPayload.unit ?? ""', notes: 'Empty string when the source carries no unit.' },
      ],
    },
    {
      path: 'cases/{caseId}/logs.json',
      format: 'json',
      purpose: 'SLS application-log schema.',
      emitter: 'buildRca100Logs',
      fields: [
        { name: 'entity_id', type: T.str, required: true, source: 'resolveSignalEntity(...)', notes: '' },
        { name: 'timestamp', type: T.str, required: true, source: 'TelemetrySignal.timestamp', notes: '' },
        { name: 'level', type: T.str, required: true, source: 'LogPayload.severityText ?? ""', notes: '' },
        { name: 'message', type: T.str, required: true, source: 'LogPayload.body', notes: '' },
        { name: 'pod_name', type: T.str, required: false, source: "resource['k8s.pod.name']", notes: 'Present only when the source signal carries it.' },
      ],
    },
    {
      path: 'cases/{caseId}/traces.json',
      format: 'json',
      purpose: 'OpenTelemetry span schema.',
      emitter: 'buildRca100Traces',
      fields: [
        { name: 'entity_id', type: T.str, required: true, source: 'resolveSignalEntity(...)', notes: '' },
        { name: 'service_name', type: T.str, required: true, source: "resource['service.name']", notes: '' },
        { name: 'trace_id', type: T.str, required: true, source: 'TracePayload.traceId', notes: '' },
        { name: 'span_id', type: T.str, required: true, source: 'TracePayload.spanId', notes: '' },
        { name: 'parent_span_id', type: T.str, required: true, source: 'TracePayload.parentSpanId ?? ""', notes: 'Empty string for root spans (not null).' },
        { name: 'operation', type: T.str, required: true, source: 'TracePayload.spanName', notes: '' },
        { name: 'duration_ms', type: T.num, required: true, source: 'TracePayload.durationMs', notes: '' },
        { name: 'status', type: T.str, required: true, source: 'TracePayload.status ?? "UNSET"', notes: 'Defaults to UNSET rather than empty.' },
      ],
    },
    {
      path: 'cases/{caseId}/events.json',
      format: 'json',
      purpose: 'Kubernetes lifecycle signals - the modality that makes 19.4% of root causes observable.',
      emitter: 'buildRca100Events',
      fields: [
        { name: 'entity_id', type: T.str, required: true, source: 'resolveSignalEntity(...)', notes: '' },
        { name: 'timestamp', type: T.str, required: true, source: 'TelemetrySignal.timestamp', notes: '' },
        { name: 'reason', type: T.str, required: true, source: 'EventPayload.reason', notes: 'e.g. OOMKilled, BackOff.' },
        { name: 'message', type: T.str, required: true, source: 'EventPayload.message ?? ""', notes: '' },
        { name: 'type', type: T.str, required: true, source: 'EventPayload.type ?? ""', notes: 'Normal | Warning.' },
        { name: 'pod_name', type: T.str, required: false, source: "resource['k8s.pod.name']", notes: 'Present only when carried by the source.' },
      ],
    },
    {
      path: 'cases/{caseId}/alerts.json',
      format: 'json',
      purpose: 'Entry-alert lifecycle (the trigger that starts the investigation).',
      emitter: 'buildRca100Alerts',
      fields: [
        { name: 'entity_id', type: T.str, required: true, source: 'resolveSignalEntity(...)', notes: '' },
        { name: 'alert_name', type: T.str, required: true, source: 'AlertPayload.alertName', notes: '' },
        { name: 'timestamp', type: T.str, required: true, source: 'TelemetrySignal.timestamp', notes: '' },
        { name: 'severity', type: T.str, required: true, source: 'AlertPayload.severity ?? ""', notes: 'critical | warning | info.' },
        { name: 'state', type: T.str, required: true, source: 'AlertPayload.state ?? ""', notes: 'firing | resolved.' },
      ],
    },
    {
      path: 'cases/{caseId}/task.json',
      format: 'json',
      purpose: 'The agent-facing task contract.',
      emitter: 'buildTaskJson',
      fields: [
        { name: 'task_id', type: T.str, required: true, source: 'FaultCase.caseId', notes: '' },
        { name: 'alert_title', type: T.str, required: true, source: 'FaultCase.query ?? `fault: ${fault.type}`', notes: 'Falls back to a generated title when no query is authored.' },
        { name: 'alert_window.start', type: T.str, required: true, source: 'FaultCase.window.start', notes: 'Canonical UTC ISO-8601.' },
        { name: 'alert_window.end', type: T.str, required: true, source: 'FaultCase.window.end', notes: '' },
        { name: 'alert_entity.entity_id', type: T.str, required: true, source: 'GroundTruth.rootCauseEntityId', notes: '' },
        { name: 'alert_entity.entity_name', type: T.str, required: true, source: 'Entity.name', notes: '' },
        { name: 'alert_entity', type: 'object | null', required: true, source: 'index.byId(rootCauseEntityId)', notes: 'null only when unresolvable - which skips the case.' },
      ],
    },
    {
      path: 'cases/{caseId}/topology.json',
      format: 'json',
      purpose: 'UModel entity-relation snapshot; the closure every other reference must resolve against.',
      emitter: 'buildTopologyJson',
      fields: [
        { name: 'entities[].id', type: T.str, required: true, source: 'Entity.entityId', notes: '`${kind}:${namespace}/${name}`.' },
        { name: 'entities[].type', type: T.str, required: true, source: 'UMODEL_TYPE[Entity.kind]', notes: 'service->apm.service, pod/container->k8s.pod, node/host->k8s.node, db->apm.external.database, mq->apm.external.message, cluster->k8s.cluster, external->apm.external.' },
        { name: 'entities[].name', type: T.str, required: true, source: 'Entity.name', notes: '' },
        { name: 'entities[].first_observed', type: T.null, required: true, source: '(constant null)', notes: 'Not tracked by the IR; the official corpus derives it from signal timestamps.' },
        { name: 'entities[].last_observed', type: T.null, required: true, source: '(constant null)', notes: '' },
        { name: 'entities[].props.namespace', type: 'string | null', required: true, source: 'Entity.namespace', notes: '' },
        { name: 'entities[].props.aliases', type: 'string[]', required: true, source: 'Entity.aliases', notes: 'APM / Kubernetes / CMDB names for the same entity.' },
        { name: 'entities[].props.original_kind', type: T.str, required: true, source: 'Entity.kind', notes: 'Preserved because several IR kinds collapse onto one UModel type.' },
        { name: 'entities[].props.<attr>', type: T.str, required: false, source: 'Entity.attributes', notes: 'Spread verbatim.' },
        { name: 'edges[].src', type: T.str, required: true, source: 'EntityEdge.from', notes: '' },
        { name: 'edges[].src_type', type: T.str, required: true, source: 'UMODEL_TYPE[from.kind]', notes: '' },
        { name: 'edges[].dst', type: T.str, required: true, source: 'EntityEdge.to', notes: '' },
        { name: 'edges[].dst_type', type: T.str, required: true, source: 'UMODEL_TYPE[to.kind]', notes: '' },
        { name: 'edges[].relation', type: T.str, required: true, source: 'EntityEdge.relation', notes: 'contains | hosts | calls | same_as.' },
        { name: 'stats.entities_total', type: T.num, required: true, source: 'entities.length', notes: '' },
        { name: 'stats.edges_total', type: T.num, required: true, source: 'edges.length', notes: '' },
      ],
    },
    {
      path: 'answer_key/{caseId}.gt.json',
      format: 'json',
      purpose: 'Four-layer ground truth, stored outside the task directory.',
      emitter: 'buildGroundTruthJson',
      fields: [
        { name: 'task_id', type: T.str, required: true, source: 'FaultCase.caseId', notes: '' },
        { name: 'case_id', type: T.str, required: true, source: 'FaultCase.caseId', notes: 'Duplicated for downstream convenience.' },
        { name: 'root_cause_entities[]', type: 'string[]', required: true, source: 'Entity.name of rootCauseEntityId', notes: 'Empty when the root cause does not resolve (case skipped).' },
        { name: 'root_cause_types[]', type: 'string[]', required: true, source: '[FaultCase.fault.type]', notes: '' },
        { name: 'raw_ground_truth', type: 'string (JSON)', required: true, source: 'JSON.stringify({outcome, reasoning})', notes: 'Nested JSON string, deliberately not parsed by the exporter.' },
        { name: 'raw_ground_truth.outcome.target_entities[]', type: 'string[]', required: true, source: 'root_cause_entities', notes: 'Layer 1: outcome.' },
        { name: 'raw_ground_truth.reasoning.steps[]', type: T.arr, required: true, source: 'GroundTruth.causalChain', notes: 'Layer 2: reasoning chain.' },
        { name: '...steps[].role', type: T.str, required: true, source: 'deriveRole(i, total)', notes: 'cause (first) | propagation (middle) | impact (last).' },
        { name: '...steps[].from_entity', type: 'string | null', required: true, source: 'index.byId(fromEntityId).name', notes: '' },
        { name: '...steps[].to_entity', type: 'string | null', required: true, source: 'index.byId(toEntityId).name', notes: '' },
        { name: '...steps[].mechanism', type: T.str, required: true, source: 'CausalStep.mechanism', notes: '' },
        { name: '...steps[].checkpoints[]', type: T.arr, required: true, source: 'CausalStep.evidenceRefs', notes: 'Layer 3: observability checkpoints.' },
        { name: '...checkpoints[].signal_ref', type: 'string | null', required: true, source: 'EvidenceCheckpoint.signalRef', notes: '' },
        { name: '...checkpoints[].comparator', type: T.str, required: true, source: 'EvidenceCheckpoint.comparator', notes: 'Layer 4: the ⟨comparator, value, unit⟩ verdict.' },
        { name: '...checkpoints[].value', type: 'number | string', required: true, source: 'EvidenceCheckpoint.value', notes: '' },
        { name: '...checkpoints[].unit', type: 'string | null', required: true, source: 'EvidenceCheckpoint.unit', notes: '' },
        { name: '...checkpoints[].description', type: T.str, required: true, source: 'EvidenceCheckpoint.description', notes: '' },
      ],
    },
  ],
};

/** AIOps2025 (CCF AIOps Challenge). */
const aiops2025 = {
  id: 'aiops2025',
  name: 'AIOps2025',
  vendor: 'CCF AIOps Challenge',
  venue: '2025',
  contractVersion: 'ccf2025',
  emitter: 'src/export/aiops2025.ts',
  modalities: ['M', 'L', 'T', 'E', 'A'],
  tagline: 'Two metadata artefacts: task inputs plus a per-modality key-evidence ground truth.',
  summary:
    'The benchmark ships 18 daily Parquet telemetry archives shared across cases; the per-case contract ' +
    'is `input.json` (task) and `groundtruth.jsonl` (fault label + key observations split by modality).',
  timezone: 'Canonical UTC ISO-8601 in `start_time` / `end_time`.',
  scoringNote:
    '`checkAioPs2025Structure` verifies both artefacts exist, the entry shapes, the key-observations ' +
    'modality split and uuid alignment between input and ground truth.',
  boundaries: [
    'The bulk telemetry is day-based Parquet shared across cases and is not produced from a per-case IR.',
    '`source` / `destination` are emitted only when the fault carries those parameters (network faults).',
    'The fault-category map is a best-effort projection; an unmapped type falls back to `FaultCase.fault.category`.',
  ],
  files: [
    {
      path: 'input.json',
      format: 'json',
      purpose: 'One entry per case: the agent-facing task description and window.',
      emitter: 'buildAioPs2025Input',
      fields: [
        { name: 'uuid', type: T.str, required: true, source: 'FaultCase.caseId', notes: 'Join key with groundtruth.jsonl.' },
        { name: 'description', type: T.str, required: true, source: 'FaultCase.query ?? GroundTruth.rootCauseReason', notes: 'Falls back to the reason when no query is authored.' },
        { name: 'start_time', type: T.str, required: true, source: 'FaultCase.window.start', notes: '' },
        { name: 'end_time', type: T.str, required: true, source: 'FaultCase.window.end', notes: '' },
      ],
    },
    {
      path: 'groundtruth.jsonl',
      format: 'jsonl',
      purpose: 'One compact JSON object per line; the scored label plus the reasoning label.',
      emitter: 'buildAioPs2025GroundTruth',
      fields: [
        { name: 'uuid', type: T.str, required: true, source: 'FaultCase.caseId', notes: '' },
        { name: 'fault_category', type: T.str, required: true, source: 'AIOPS2025_CATEGORY[normalizeFaultType(type)] ?? fault.category', notes: 'network | stress | node | pod | jvm | dns | misconfiguration | erroneous-change | io.' },
        { name: 'fault_type', type: T.str, required: true, source: 'FaultCase.fault.type', notes: 'Raw fault type.' },
        { name: 'instance_type', type: T.str, required: true, source: 'instanceTypeOf(Entity.kind)', notes: 'service | pod | node; defaults to service when the entity is unknown.' },
        { name: 'service', type: T.str, required: true, source: 'GroundTruth.rootCauseComponent', notes: '' },
        { name: 'instance', type: T.str, required: true, source: 'Entity.name ?? rootCauseComponent', notes: '' },
        { name: 'source', type: T.str, required: false, source: "fault.parameters['source']", notes: 'Emitted only when present and a string.' },
        { name: 'destination', type: T.str, required: false, source: "fault.parameters['destination']", notes: '' },
        { name: 'start_time', type: T.str, required: true, source: 'FaultCase.window.start', notes: '' },
        { name: 'end_time', type: T.str, required: true, source: 'FaultCase.window.end', notes: '' },
        { name: 'key_observations.log[]', type: T.arr, required: true, source: "rootCauseIndicators where type='log'", notes: 'Each element is { ref, description }.' },
        { name: 'key_observations.metric[]', type: T.arr, required: true, source: "rootCauseIndicators where type='metric'", notes: '' },
        { name: 'key_observations.trace[]', type: T.arr, required: true, source: "rootCauseIndicators where type='trace'", notes: '' },
        { name: 'key_metrics[]', type: 'string[]', required: true, source: "metric indicators -> ref", notes: 'Flat list of metric refs; duplicates key_observations.metric.' },
        { name: 'fault_description', type: T.str, required: true, source: 'GroundTruth.rootCauseReason', notes: '' },
      ],
    },
  ],
};

/** Cloud-OpsBench. */
const cloudOpsBench = {
  id: 'cloud-opsbench',
  name: 'Cloud-OpsBench',
  vendor: 'arXiv 2603.00468',
  venue: '2026',
  contractVersion: 'v1',
  emitter: 'src/export/cloudopsbench.ts',
  modalities: ['M', 'L', 'T', 'Conf'],
  tagline: 'Agentic State-Snapshot benchmark with an outcome ground-truth triple.',
  summary:
    'Each case is an agent-facing State Snapshot (tool cache, k8s states, logs, metrics, trimmed source). ' +
    'The scored artefact is `metadata.json`, whose `result` triple is ' +
    '⟨Stage, Component, Root Cause⟩ = ⟨fault_taxonomy, fault_object, root_cause⟩.',
  timezone: 'Not applicable - metadata.json carries no timestamps.',
  scoringNote: '`checkCloudOpsBenchStructure` verifies at least one case exists and the metadata shape (namespace, query, difficulty, result triple).',
  boundaries: [
    '`tool_cache.json`, `k8s_states.json` and `code/` require a live Kubernetes snapshot and are not produced from a static IR.',
    '`process-label/` and `golden-trajectory/` require expert annotation and are out of scope.',
    'The lifecycle-stage taxonomy is a documented best-effort projection of the IR mechanism categories.',
  ],
  files: [
    {
      path: 'cases/{caseId}/metadata.json',
      format: 'json',
      purpose: 'Fault label, namespace, query and the outcome ground truth.',
      emitter: 'buildCloudOpsBenchMetadata',
      fields: [
        { name: 'namespace', type: T.str, required: true, source: 'FaultCase.system', notes: 'The k8s namespace / system under test.' },
        { name: 'query', type: T.str, required: true, source: 'FaultCase.query ?? GroundTruth.rootCauseReason', notes: '' },
        { name: 'difficulty', type: T.str, required: true, source: 'difficultyFor(FaultCase.difficulty)', notes: 'L1->easy, L2->medium, L3/L4->hard, unset->medium.' },
        { name: 'result.fault_taxonomy', type: T.str, required: true, source: 'TAXONOMY_BY_CATEGORY[fault.category]', notes: 'Performance_Fault | Infrastructure_Fault | Runtime_Fault | Service_Fault | Code_Fault | Startup_Fault.' },
        { name: 'result.fault_object', type: T.str, required: true, source: 'GroundTruth.rootCauseComponent', notes: 'The scored component.' },
        { name: 'result.root_cause', type: T.str, required: true, source: 'normalizeFaultType(fault.type).replace(/-/g, "_")', notes: 'snake_case root-cause token, e.g. `cpu_stress`.' },
      ],
    },
  ],
};

/** ITBench (IBM Research). */
const itbench = {
  id: 'itbench',
  name: 'ITBench (SRE Diagnosis)',
  vendor: 'IBM Research',
  venue: 'arXiv 2502.05352',
  contractVersion: 'v1',
  emitter: 'src/export/itbench.ts',
  modalities: ['M', 'L', 'T', 'E', 'CD'],
  tagline: 'Scenario specification with a diagnosis ground truth: entities, propagation chain, fault conditions.',
  summary:
    'ITBench evaluates agents on live IT automation tasks. For the SRE Diagnosis task the ground truth ' +
    'records the entities in the propagation chain, the chain itself and the fault conditions - a ' +
    'one-to-one match with the IR GroundTruth triple.',
  timezone: 'Not applicable - scenario.json carries no timestamps.',
  scoringNote: '`checkItBenchStructure` verifies at least one scenario exists and the scenario shape (name, description, domain, class, complexity, groundtruth).',
  boundaries: [
    'Only the SRE persona is targeted (`scenario_domain = "SRE"`); CISO and FinOps are out of scope.',
    'The ITBench-Lite snapshot body (alerts/, metrics/, k8s_events_raw.tsv, otel_logs_raw.tsv, ...) is a frozen cluster snapshot and is not produced from a static IR.',
    'Scenario classes are a best-effort projection of IR fault categories; the precise fault type is preserved inside the ground truth.',
  ],
  files: [
    {
      path: 'scenarios/{caseId}/scenario.json',
      format: 'json',
      purpose: 'Scenario specification plus the diagnosis ground truth.',
      emitter: 'buildItBenchScenarioSpec',
      fields: [
        { name: 'scenario_name', type: T.str, required: true, source: 'FaultCase.caseId', notes: '' },
        { name: 'scenario_description', type: T.str, required: true, source: 'FaultCase.query ?? GroundTruth.rootCauseReason', notes: '' },
        { name: 'scenario_domain', type: T.str, required: true, source: 'constant "SRE"', notes: 'Only the SRE persona is targeted.' },
        { name: 'scenario_class', type: T.str, required: true, source: 'CLASS_BY_CATEGORY[fault.category]', notes: 'HighCPU | NetworkPartition | CrashLoopBackOff | ServiceDegradation | CorruptImage | Misconfiguration | DependencyFailure | Unknown.' },
        { name: 'scenario_complexity', type: T.str, required: true, source: 'complexityFor(FaultCase.difficulty)', notes: 'easy | medium | hard.' },
        { name: 'scenario_groundtruth.diagnosis.entities[]', type: 'string[]', required: true, source: 'rootCauseEntityId + chain endpoints', notes: 'Deduplicated, root cause first.' },
        { name: 'scenario_groundtruth.diagnosis.fault_propagation_chain[]', type: T.arr, required: true, source: 'GroundTruth.causalChain', notes: '' },
        { name: '...chain[].step', type: T.num, required: true, source: 'CausalStep.step', notes: '' },
        { name: '...chain[].from_entity', type: T.str, required: true, source: 'CausalStep.fromEntityId', notes: '' },
        { name: '...chain[].to_entity', type: T.str, required: true, source: 'CausalStep.toEntityId', notes: '' },
        { name: '...chain[].mechanism', type: T.str, required: true, source: 'CausalStep.mechanism', notes: '' },
        { name: 'scenario_groundtruth.diagnosis.fault_conditions[]', type: T.arr, required: true, source: 'GroundTruth.evidenceCheckpoints', notes: '' },
        { name: '...fault_conditions[].checkpoint_id', type: T.str, required: true, source: 'EvidenceCheckpoint.checkpointId', notes: '' },
        { name: '...fault_conditions[].entity', type: T.str, required: true, source: 'EvidenceCheckpoint.entityRef', notes: '' },
        { name: '...fault_conditions[].signal_ref', type: T.str, required: false, source: 'EvidenceCheckpoint.signalRef', notes: 'Omitted when absent.' },
        { name: '...fault_conditions[].comparator', type: T.str, required: true, source: 'EvidenceCheckpoint.comparator', notes: '' },
        { name: '...fault_conditions[].value', type: 'number | string', required: true, source: 'EvidenceCheckpoint.value', notes: '' },
        { name: '...fault_conditions[].unit', type: T.str, required: false, source: 'EvidenceCheckpoint.unit', notes: 'Omitted when absent.' },
        { name: '...fault_conditions[].description', type: T.str, required: true, source: 'EvidenceCheckpoint.description', notes: '' },
      ],
    },
  ],
};

export const FORMAT_SPECS = [openrca1, openrca2, rcaeval, rca100, aiops2025, cloudOpsBench, itbench];

export function specById(id) {
  const spec = FORMAT_SPECS.find((s) => s.id === id);
  if (spec === undefined) throw new Error(`unknown format id '${id}'`);
  return spec;
}
