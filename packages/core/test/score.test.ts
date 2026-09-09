import { describe, expect, it } from 'vitest';
import { exportOpenRca } from '../src/export/openrca.js';
import { exportRcaEval } from '../src/export/rcaeval.js';
import { exportRca100 } from '../src/export/rca100.js';
import { exportAioPs2025 } from '../src/export/aiops2025.js';
import { exportCloudOpsBench } from '../src/export/cloudopsbench.js';
import {
  checkAioPs2025Structure,
  checkCloudOpsBenchStructure,
  checkOpenRcaStructure,
  checkRca100Structure,
  checkRcaEvalStructure,
  scoreExport,
  sha256,
  verifyChecksums,
} from '../src/score/score.js';
import type { RcaEvalSuite } from '../src/export/rcaeval.js';
import { validBundle } from './fixtures.js';

/**
 * Score module tests.
 *
 * Structure checks run against real exporter output (no hand-written CSV), and
 * checksum verification runs against the module's own `sha256` so the anchors are
 * deterministic. The suite asserts that a fully valid export scores 100 and that
 * every individual defect lowers the score.
 */

const openrcaFiles = (): Record<string, string> => exportOpenRca(validBundle()).files;

describe('sha256', () => {
  it('returns the standard SHA-256 digest', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('checkOpenRcaStructure', () => {
  it('passes a well-formed OpenRCA export', () => {
    const report = checkOpenRcaStructure(openrcaFiles());
    expect(report.passed).toBe(true);
    expect(report.target).toBe('openrca-1.0');
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it('fails when query.csv is missing', () => {
    const files = openrcaFiles();
    delete files['order-prod/query.csv'];
    const report = checkOpenRcaStructure(files);
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'query-csv')?.passed).toBe(false);
  });

  it('fails when record.csv is missing', () => {
    const files = openrcaFiles();
    delete files['order-prod/record.csv'];
    const report = checkOpenRcaStructure(files);
    expect(report.checks.find((c) => c.id === 'record-csv')?.passed).toBe(false);
  });

  it('fails when the answer key leaks into query.csv', () => {
    const files = openrcaFiles();
    files['order-prod/query.csv'] = 'instruction_id,query,occurrence_datetime\ncase-001,"root cause component: order",2026-09-06 08:10:00\n';
    const report = checkOpenRcaStructure(files);
    expect(report.checks.find((c) => c.id === 'answer-key-isolated')?.passed).toBe(false);
  });

  it('fails on a wrong metric header', () => {
    const files = openrcaFiles();
    const path = Object.keys(files).find((p) => p.includes('/telemetry/metric/'))!;
    files[path] = 'wrong,header,here\n';
    const report = checkOpenRcaStructure(files);
    expect(report.checks.find((c) => c.id === 'metric-header')?.passed).toBe(false);
  });

  it('fails when no telemetry files exist', () => {
    const report = checkOpenRcaStructure({ 'order-prod/query.csv': 'a\n', 'order-prod/record.csv': 'b\n' });
    expect(report.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'telemetry-present')?.passed).toBe(false);
  });
});

describe('checkRcaEvalStructure', () => {
  it('passes a well-formed RE2 export', () => {
    const files = exportRcaEval(validBundle(), 'RE2').files;
    const report = checkRcaEvalStructure(files, 'RE2');
    expect(report.passed).toBe(true);
  });

  it('passes a well-formed RE1 export with no logs or traces', () => {
    const files = exportRcaEval(validBundle(), 'RE1').files;
    const report = checkRcaEvalStructure(files, 'RE1');
    expect(report.passed).toBe(true);
  });

  it('fails RE1 when logs are present', () => {
    const files = exportRcaEval(validBundle(), 'RE2').files;
    const report = checkRcaEvalStructure(files, 'RE1');
    expect(report.checks.find((c) => c.id === 'modality-set')?.passed).toBe(false);
  });

  it('fails RE2 when logs are missing', () => {
    const files = exportRcaEval(validBundle(), 'RE1').files;
    const report = checkRcaEvalStructure(files, 'RE2');
    expect(report.checks.find((c) => c.id === 'modality-set')?.passed).toBe(false);
  });

  it('fails on a non-integer inject time', () => {
    const files = exportRcaEval(validBundle(), 'RE1').files;
    const path = Object.keys(files).find((p) => p.endsWith('inject_time.txt'))!;
    files[path] = 'not-an-integer';
    const report = checkRcaEvalStructure(files, 'RE1');
    expect(report.checks.find((c) => c.id === 'inject-time-format')?.passed).toBe(false);
  });

  it('fails when inject_time.txt is missing', () => {
    const files = exportRcaEval(validBundle(), 'RE1').files;
    const path = Object.keys(files).find((p) => p.endsWith('inject_time.txt'))!;
    delete files[path];
    const report = checkRcaEvalStructure(files, 'RE1');
    expect(report.checks.find((c) => c.id === 'inject-time-format')?.passed).toBe(false);
  });

  it('fails on a wrong logs header', () => {
    const files = exportRcaEval(validBundle(), 'RE2').files;
    const path = Object.keys(files).find((p) => p.endsWith('logs.csv'))!;
    files[path] = 'wrong,header\n';
    const report = checkRcaEvalStructure(files, 'RE2');
    expect(report.checks.find((c) => c.id === 'logs-header')?.passed).toBe(false);
  });
});

describe('verifyChecksums', () => {
  it('passes when every anchor matches', () => {
    const files = openrcaFiles();
    const anchors = Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha256(c)]));
    const report = verifyChecksums(files, anchors);
    expect(report.passed).toBe(true);
    expect(report.matched).toBe(Object.keys(files).length);
    expect(report.mismatched).toEqual([]);
    expect(report.missing).toEqual([]);
  });

  it('reports mismatched, missing and extra files', () => {
    const files = openrcaFiles();
    const anchors: Record<string, string> = {
      'some/file.csv': sha256('x'),
      'order-prod/query.csv': 'deadbeef',
    };
    const report = verifyChecksums(files, anchors);
    expect(report.passed).toBe(false);
    expect(report.mismatched).toContain('order-prod/query.csv');
    expect(report.missing).toContain('some/file.csv');
    expect(report.extra.length).toBeGreaterThan(0);
  });
});

describe('checkRca100Structure', () => {
  const rca100Files = (): Record<string, string> => exportRca100(validBundle()).files;

  it('passes a well-formed RCA100 export', () => {
    const report = checkRca100Structure(rca100Files());
    expect(report.passed).toBe(true);
    expect(report.target).toBe('rca100');
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it('fails when there are no case directories', () => {
    const report = checkRca100Structure({});
    expect(report.checks.find((c) => c.id === 'case-present')?.passed).toBe(false);
  });

  it('fails when a case file is missing', () => {
    const files = rca100Files();
    delete files['cases/case-001/metrics.json'];
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'case-files-complete')?.passed).toBe(false);
  });

  it('fails when the answer key is missing', () => {
    const files = rca100Files();
    delete files['answer_key/case-001.gt.json'];
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'case-files-complete')?.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'gt-structure')?.passed).toBe(false);
  });

  it('fails on a malformed topology.json', () => {
    const files = rca100Files();
    files['cases/case-001/topology.json'] = 'not json';
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'topology-shape')?.passed).toBe(false);
  });

  it('fails when the topology has empty entities', () => {
    const files = rca100Files();
    files['cases/case-001/topology.json'] = JSON.stringify({ entities: [], edges: [], stats: { entities_total: 0, edges_total: 0 } });
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'topology-shape')?.passed).toBe(false);
  });

  it('fails when the topology lacks a stats object', () => {
    const files = rca100Files();
    const topo = JSON.parse(files['cases/case-001/topology.json']!);
    delete topo.stats;
    files['cases/case-001/topology.json'] = JSON.stringify(topo);
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'topology-shape')?.passed).toBe(false);
  });

  it('fails when the topology stats do not match the arrays', () => {
    const files = rca100Files();
    const topo = JSON.parse(files['cases/case-001/topology.json']!);
    topo.stats.entities_total = 999;
    files['cases/case-001/topology.json'] = JSON.stringify(topo);
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'topology-shape')?.passed).toBe(false);
  });

  it('fails on a dangling entity_id in a modality table', () => {
    const files = rca100Files();
    files['cases/case-001/metrics.json'] = JSON.stringify([{ entity_id: 'ghost' }]);
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'entity-refs-resolve')?.passed).toBe(false);
  });

  it('fails on a malformed modality table', () => {
    const files = rca100Files();
    files['cases/case-001/logs.json'] = 'not json';
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'entity-refs-resolve')?.passed).toBe(false);
  });

  it('ignores a modality row without an entity_id', () => {
    const files = rca100Files();
    files['cases/case-001/events.json'] = JSON.stringify([{ reason: 'x' }]);
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'entity-refs-resolve')?.passed).toBe(true);
  });

  it('fails on a dangling root-cause entity name', () => {
    const files = rca100Files();
    const gt = JSON.parse(files['answer_key/case-001.gt.json']!);
    gt.root_cause_entities = ['ghost'];
    files['answer_key/case-001.gt.json'] = JSON.stringify(gt);
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'root-cause-resolves')?.passed).toBe(false);
  });

  it('ignores a non-string root-cause entity entry', () => {
    const files = rca100Files();
    const gt = JSON.parse(files['answer_key/case-001.gt.json']!);
    gt.root_cause_entities = [42];
    files['answer_key/case-001.gt.json'] = JSON.stringify(gt);
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'root-cause-resolves')?.passed).toBe(true);
  });

  it('fails on a malformed answer key', () => {
    const files = rca100Files();
    files['answer_key/case-001.gt.json'] = 'not json';
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'gt-structure')?.passed).toBe(false);
  });

  it('fails on an answer key missing the four layers', () => {
    const files = rca100Files();
    files['answer_key/case-001.gt.json'] = JSON.stringify({ task_id: 'case-001' });
    const report = checkRca100Structure(files);
    expect(report.checks.find((c) => c.id === 'gt-structure')?.passed).toBe(false);
  });
});

describe('checkAioPs2025Structure', () => {
  const aiopsFiles = (): Record<string, string> => exportAioPs2025(validBundle()).files;

  it('passes a well-formed AIOps2025 export', () => {
    const report = checkAioPs2025Structure(aiopsFiles());
    expect(report.passed).toBe(true);
    expect(report.target).toBe('aiops2025');
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it('fails when input.json is missing', () => {
    const files = aiopsFiles();
    delete files['input.json'];
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'input-present')?.passed).toBe(false);
  });

  it('fails when groundtruth.jsonl is missing', () => {
    const files = aiopsFiles();
    delete files['groundtruth.jsonl'];
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'groundtruth-present')?.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'groundtruth-shape')?.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'key-observations-shape')?.passed).toBe(false);
  });

  it('fails when input.json is not an array', () => {
    const files = aiopsFiles();
    files['input.json'] = '{}';
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'entries-present')?.passed).toBe(false);
    expect(report.checks.find((c) => c.id === 'input-shape')?.passed).toBe(false);
  });

  it('fails when input.json is an empty array', () => {
    const files = aiopsFiles();
    files['input.json'] = '[]';
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'entries-present')?.passed).toBe(false);
  });

  it('fails when an input entry is not an object', () => {
    const files = aiopsFiles();
    files['input.json'] = JSON.stringify(['not-an-object']);
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'input-shape')?.passed).toBe(false);
  });

  it.each(['uuid', 'description', 'start_time', 'end_time'] as const)(
    'fails when an input entry is missing %s',
    (field) => {
      const files = aiopsFiles();
      const entry: Record<string, string> = {
        uuid: 'case-001',
        description: 'find the root cause',
        start_time: '2026-09-06T00:00:00.000Z',
        end_time: '2026-09-06T00:20:00.000Z',
      };
      delete entry[field];
      files['input.json'] = JSON.stringify([entry]) + '\n';
      const report = checkAioPs2025Structure(files);
      expect(report.checks.find((c) => c.id === 'input-shape')?.passed).toBe(false);
    },
  );

  it('fails when a groundtruth line is malformed JSON', () => {
    const files = aiopsFiles();
    files['groundtruth.jsonl'] = 'not-json\n';
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'groundtruth-shape')?.passed).toBe(false);
  });

  it.each([
    'uuid',
    'fault_category',
    'fault_type',
    'instance_type',
    'service',
    'instance',
    'start_time',
    'end_time',
    'fault_description',
  ] as const)('fails when a groundtruth entry is missing %s', (field) => {
    const files = aiopsFiles();
    const gt = JSON.parse(files['groundtruth.jsonl']!.trim()) as Record<string, unknown>;
    delete gt[field];
    files['groundtruth.jsonl'] = JSON.stringify(gt) + '\n';
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'groundtruth-shape')?.passed).toBe(false);
  });

  it('fails when instance_type is not in the vocabulary', () => {
    const files = aiopsFiles();
    const gt = JSON.parse(files['groundtruth.jsonl']!.trim()) as Record<string, unknown>;
    gt.instance_type = 'unknown';
    files['groundtruth.jsonl'] = JSON.stringify(gt) + '\n';
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'groundtruth-shape')?.passed).toBe(false);
  });

  it('fails when key_metrics is not an array', () => {
    const files = aiopsFiles();
    const gt = JSON.parse(files['groundtruth.jsonl']!.trim()) as Record<string, unknown>;
    gt.key_metrics = 'not-an-array';
    files['groundtruth.jsonl'] = JSON.stringify(gt) + '\n';
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'groundtruth-shape')?.passed).toBe(false);
  });

  it('fails when key_observations is not an object', () => {
    const files = aiopsFiles();
    const gt = JSON.parse(files['groundtruth.jsonl']!.trim()) as Record<string, unknown>;
    gt.key_observations = 'not-an-object';
    files['groundtruth.jsonl'] = JSON.stringify(gt) + '\n';
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'key-observations-shape')?.passed).toBe(false);
  });

  it.each(['log', 'metric', 'trace'] as const)('fails when key_observations.%s is not an array', (modality) => {
    const files = aiopsFiles();
    const gt = JSON.parse(files['groundtruth.jsonl']!.trim()) as Record<string, unknown>;
    gt.key_observations = { log: [], metric: [], trace: [], [modality]: 'not-an-array' };
    files['groundtruth.jsonl'] = JSON.stringify(gt) + '\n';
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'key-observations-shape')?.passed).toBe(false);
  });

  it('fails when the uuid sets diverge', () => {
    const files = aiopsFiles();
    const gt = JSON.parse(files['groundtruth.jsonl']!.trim()) as Record<string, unknown>;
    gt.uuid = 'case-other';
    files['groundtruth.jsonl'] = JSON.stringify(gt) + '\n';
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'uuid-alignment')?.passed).toBe(false);
  });

  it('fails when the uuid counts diverge', () => {
    const files = aiopsFiles();
    const input = JSON.parse(files['input.json']!) as Array<Record<string, unknown>>;
    input.push({ uuid: 'case-extra', description: 'x', start_time: '2026-09-06T00:00:00.000Z', end_time: '2026-09-06T00:20:00.000Z' });
    files['input.json'] = JSON.stringify(input, null, 2) + '\n';
    const report = checkAioPs2025Structure(files);
    expect(report.checks.find((c) => c.id === 'uuid-alignment')?.passed).toBe(false);
  });
});

describe('checkCloudOpsBenchStructure', () => {
  const cobFiles = (): Record<string, string> => exportCloudOpsBench(validBundle()).files;

  it('passes a well-formed Cloud-OpsBench export', () => {
    const report = checkCloudOpsBenchStructure(cobFiles());
    expect(report.passed).toBe(true);
    expect(report.target).toBe('cloud-opsbench');
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it('fails when there are no metadata.json files', () => {
    const report = checkCloudOpsBenchStructure({});
    expect(report.checks.find((c) => c.id === 'case-present')?.passed).toBe(false);
  });

  it('fails on a malformed metadata.json', () => {
    const files = cobFiles();
    files['cases/case-001/metadata.json'] = 'not json';
    const report = checkCloudOpsBenchStructure(files);
    expect(report.checks.find((c) => c.id === 'metadata-shape')?.passed).toBe(false);
  });

  it('fails when the result triple is missing', () => {
    const files = cobFiles();
    files['cases/case-001/metadata.json'] = JSON.stringify({ namespace: 'order-prod', query: 'q', difficulty: 'medium' });
    const report = checkCloudOpsBenchStructure(files);
    expect(report.checks.find((c) => c.id === 'metadata-shape')?.passed).toBe(false);
  });

  it.each(['namespace', 'query', 'difficulty'] as const)('fails when metadata.%s is not a string', (field) => {
    const files = cobFiles();
    const meta = JSON.parse(files['cases/case-001/metadata.json']!) as Record<string, unknown>;
    delete meta[field];
    files['cases/case-001/metadata.json'] = JSON.stringify(meta);
    const report = checkCloudOpsBenchStructure(files);
    expect(report.checks.find((c) => c.id === 'metadata-shape')?.passed).toBe(false);
  });

  it.each(['fault_taxonomy', 'fault_object', 'root_cause'] as const)('fails when result.%s is not a string', (field) => {
    const files = cobFiles();
    const meta = JSON.parse(files['cases/case-001/metadata.json']!) as Record<string, unknown>;
    const result = meta.result as Record<string, unknown>;
    delete result[field];
    files['cases/case-001/metadata.json'] = JSON.stringify(meta);
    const report = checkCloudOpsBenchStructure(files);
    expect(report.checks.find((c) => c.id === 'metadata-shape')?.passed).toBe(false);
  });
});

describe('scoreExport', () => {
  it('scores 100 for a fully valid export with matching anchors', () => {
    const files = openrcaFiles();
    const anchors = Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha256(c)]));
    const report = scoreExport('openrca-1.0', files, anchors);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('scores lower when the structure fails', () => {
    const files = openrcaFiles();
    delete files['order-prod/record.csv'];
    const report = scoreExport('openrca-1.0', files);
    expect(report.passed).toBe(false);
    expect(report.score).toBeLessThan(100);
  });

  it('scores lower when a checksum mismatches', () => {
    const files = openrcaFiles();
    const anchors = Object.fromEntries(Object.entries(files).map(([p, c]) => [p, sha256(c)]));
    anchors['order-prod/query.csv'] = 'deadbeef';
    const report = scoreExport('openrca-1.0', files, anchors);
    expect(report.passed).toBe(false);
    expect(report.score).toBeLessThan(100);
  });

  it('scores 100 for a valid RCAEval export without anchors', () => {
    const files = exportRcaEval(validBundle(), 'RE2').files;
    const report = scoreExport('rcaeval-re2', files);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('scores 100 for a valid RE1 export', () => {
    const files = exportRcaEval(validBundle(), 'RE1').files;
    const report = scoreExport('rcaeval-re1', files);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('scores 100 for a valid RE3 export of a code-level fault', () => {
    const bundle = validBundle({ cases: [validBundle().cases[0]!] });
    bundle.cases[0]!.fault.category = 'code';
    const files = exportRcaEval(bundle, 'RE3').files;
    const report = scoreExport('rcaeval-re3', files);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('scores 100 for a valid RCA100 export', () => {
    const files = exportRca100(validBundle()).files;
    const report = scoreExport('rca100', files);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('scores 100 for a valid AIOps2025 export', () => {
    const files = exportAioPs2025(validBundle()).files;
    const report = scoreExport('aiops2025', files);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('scores 100 for a valid Cloud-OpsBench export', () => {
    const files = exportCloudOpsBench(validBundle()).files;
    const report = scoreExport('cloud-opsbench', files);
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it('throws for an unknown target (programmer error)', () => {
    expect(() => scoreExport('unknown' as never, {})).toThrow(/target/i);
  });
});
