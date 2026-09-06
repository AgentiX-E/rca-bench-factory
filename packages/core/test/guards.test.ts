import { describe, expect, it } from 'vitest';
import {
  isAlertSignal,
  isEventSignal,
  isLogSignal,
  isMetricSignal,
  isProfileSignal,
  isTraceSignal,
} from '../src/ir/guards.js';
import type { TelemetrySignal } from '../src/ir/types.js';
import { alertAt, eventAt, logAt, metricAt, traceAt } from './fixtures.js';

function profileSignal(): TelemetrySignal {
  return {
    irVersion: '2.0',
    resource: { 'service.name': 'order' },
    timestamp: '2026-09-06T00:00:00.000Z',
    signal: 'profile',
    payload: { kind: 'profile', profileType: 'cpu', payloadRef: 'file:///tmp/p.pb' },
  };
}

const all: TelemetrySignal[] = [
  metricAt(0, 'cpu', 1),
  logAt(0, 'boom'),
  traceAt(0, 't', 's'),
  eventAt(0, 'OOMKilled'),
  alertAt(0, 'HighCpu'),
  profileSignal(),
];

describe('signal guards', () => {
  it('classifies exactly one signal per kind', () => {
    expect(all.filter(isMetricSignal)).toHaveLength(1);
    expect(all.filter(isLogSignal)).toHaveLength(1);
    expect(all.filter(isTraceSignal)).toHaveLength(1);
    expect(all.filter(isEventSignal)).toHaveLength(1);
    expect(all.filter(isAlertSignal)).toHaveLength(1);
    expect(all.filter(isProfileSignal)).toHaveLength(1);
  });

  it('returns true only for the matching kind', () => {
    const metric = all[0] as TelemetrySignal;
    expect(isMetricSignal(metric)).toBe(true);
    expect(isLogSignal(metric)).toBe(false);
    expect(isTraceSignal(metric)).toBe(false);
    expect(isEventSignal(metric)).toBe(false);
    expect(isAlertSignal(metric)).toBe(false);
    expect(isProfileSignal(metric)).toBe(false);
  });

  it('narrows the payload type so fields are reachable without a cast', () => {
    const metrics = all.filter(isMetricSignal);
    expect(metrics[0]?.payload.name).toBe('cpu');
    const traces = all.filter(isTraceSignal);
    expect(traces[0]?.payload.spanId).toBe('s');
  });
});
