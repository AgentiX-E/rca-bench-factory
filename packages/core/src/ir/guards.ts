import type {
  AlertPayload,
  EventPayload,
  LogPayload,
  MetricPayload,
  ProfilePayload,
  TelemetrySignal,
  TracePayload,
} from './types.js';

/**
 * Narrowing helpers for the discriminated `payload` union.
 *
 * `Array.prototype.filter` does not narrow a union on its own, so exporters and
 * gates use these predicates to get a typed payload without a cast.
 */

export type MetricSignal = TelemetrySignal & { payload: MetricPayload };
export type LogSignal = TelemetrySignal & { payload: LogPayload };
export type TraceSignal = TelemetrySignal & { payload: TracePayload };
export type EventSignal = TelemetrySignal & { payload: EventPayload };
export type AlertSignal = TelemetrySignal & { payload: AlertPayload };
export type ProfileSignal = TelemetrySignal & { payload: ProfilePayload };

export function isMetricSignal(s: TelemetrySignal): s is MetricSignal {
  return s.payload.kind === 'metric';
}
export function isLogSignal(s: TelemetrySignal): s is LogSignal {
  return s.payload.kind === 'log';
}
export function isTraceSignal(s: TelemetrySignal): s is TraceSignal {
  return s.payload.kind === 'trace';
}
export function isEventSignal(s: TelemetrySignal): s is EventSignal {
  return s.payload.kind === 'event';
}
export function isAlertSignal(s: TelemetrySignal): s is AlertSignal {
  return s.payload.kind === 'alert';
}
export function isProfileSignal(s: TelemetrySignal): s is ProfileSignal {
  return s.payload.kind === 'profile';
}
