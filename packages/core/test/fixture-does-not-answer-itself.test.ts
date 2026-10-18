import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The example incident must not answer its own question.
 *
 * Every format doc renders the same case as its worked example: one fixture,
 * exported nine ways. The task text is `FaultCase.query`, and until this file
 * existed it read
 *
 *     The order service became slow at 08:10 UTC+8. Find the root cause.
 *
 * against ground truth `component: order`, `reason: CPU saturation on the order
 * service`, injection at `08:10:00` UTC+8. **Two of the three scored criteria are
 * in the sentence**: the component is named, and the onset is given to the second
 * — while the same export prints `occurrence_window = 08:00–08:30` beside it, which
 * is the question `main/evaluate.py` actually asks (within 60 seconds, inside a
 * half-hour window).
 *
 * ## Why the exporter is not the thing being fixed
 *
 * v2.07 established that a task file must not answer a scored criterion, and put
 * `task-carries-no-scored-value` in the structural check. That check compares
 * **cells**, and it deliberately does not scan prose: whole-word matching in a
 * task sentence would flag "the order service became slow" when the component is
 * `order`, which is how every incident report a human writes reads. A caller's
 * prose is the caller's business.
 *
 * This file is the other half of that decision. The repository's **own** example is
 * not a caller's prose — it is the thing every doc shows a reader as the shape to
 * copy. So the rule is enforced where it can be enforced without a false positive:
 * on the fixtures this repository ships.
 *
 * ## What the sentence was replaced with
 *
 * Upstream's task text is template-shaped: `main/task_specification.json` asks for
 * `time range: {time_period}` and `number of failures: {num}`, and the answer is
 * three separate fields. The fixture now reads the same way — a window, and three
 * things to identify — and names none of them.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface CaseLike {
  caseId: string;
  injectTime: string;
  query?: string;
  groundTruth: { rootCauseComponent: string; rootCauseReason: string };
}

interface BundleLike {
  cases: CaseLike[];
}

interface DraftLike {
  case: CaseLike;
}

/** The three shipped files that carry a task text. */
const FIXTURES = [
  { path: 'golden-master/fixture.json', read: (raw: string) => (JSON.parse(raw) as BundleLike).cases },
  { path: 'examples/order-prod/bundle.json', read: (raw: string) => (JSON.parse(raw) as BundleLike).cases },
  {
    path: 'examples/order-prod/draft.json',
    read: (raw: string) => [(JSON.parse(raw) as DraftLike).case],
  },
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `2026-09-06T00:10:00.000Z` in the forms the exporters render, both offsets. */
function onsetForms(iso: string): string[] {
  const at = new Date(iso);
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  const wall = (offsetMinutes: number): { date: string; clock: string } => {
    const shifted = new Date(at.getTime() + offsetMinutes * 60_000);
    return {
      date: `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
      clock: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
    };
  };
  const forms: string[] = [iso];
  for (const offset of [0, 8 * 60]) {
    const local = wall(offset);
    forms.push(local.clock, `${local.date} ${local.clock}`, `${local.date} ${local.clock}:00`);
  }
  return forms;
}

/**
 * Every way a task text can give a scored value away.
 *
 * Returned as a list of named reasons rather than a boolean: a failure message
 * that says "this case leaks" makes a reader open the file to find out what, and
 * a message that says "the component is in the sentence" does not.
 */
function leaks(one: CaseLike): string[] {
  const query = one.query ?? '';
  const found: string[] = [];

  if (query.trim() === '') return found;

  // The component is matched as a token of its own, where a token may contain
  // hyphens. `\b` is not enough: it puts a boundary at every `-`, so `order-prod`
  // -- the system name, which a task legitimately carries -- would read as a leak
  // of the component `order`. The lookarounds below treat `order-prod` as one word
  // and `order.` or `the order service` as a word that is the answer.
  const component = one.groundTruth.rootCauseComponent.trim();
  if (component !== '') {
    const token = new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(component)}(?![A-Za-z0-9_-])`, 'i');
    if (token.test(query)) found.push(`component '${component}'`);
  }

  const reason = one.groundTruth.rootCauseReason.trim();
  if (reason !== '' && query.toLowerCase().includes(reason.toLowerCase())) {
    found.push('the reason, verbatim');
  }

  for (const form of onsetForms(one.injectTime)) {
    if (query.includes(form)) found.push(`the onset as '${form}'`);
  }

  // The structural check's own phrase rule, asserted here too: a fixture that
  // tripped it would make every export example fail `answer-key-isolated`, and the
  // failure would surface as an export test rather than as a sentence somebody wrote.
  if (/root cause component|root cause reason|root cause occurrence/i.test(query)) {
    found.push('an answer-key token');
  }

  return found;
}

describe('the shipped example does not answer its own question', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.path}: no task text carries a scored value`, () => {
      const cases = fixture.read(readFileSync(resolve(ROOT, fixture.path), 'utf8'));
      expect(cases.length).toBeGreaterThan(0);
      const offenders = cases
        .map((one) => ({ caseId: one.caseId, why: leaks(one) }))
        .filter((one) => one.why.length > 0);
      expect(offenders).toEqual([]);
    });
  }

  it('detects the sentence that used to be there', () => {
    // A rule with no failing example is a rule nobody has seen work. This is the
    // exact string every doc rendered before the pass, against the exact ground
    // truth it sat beside.
    const shipped: CaseLike = {
      caseId: 'case-001',
      injectTime: '2026-09-06T00:10:00.000Z',
      query: 'The order service became slow at 08:10 UTC+8. Find the root cause.',
      groundTruth: {
        rootCauseComponent: 'order',
        rootCauseReason: 'CPU saturation on the order service',
      },
    };
    expect(leaks(shipped)).toEqual(["component 'order'", "the onset as '08:10'"]);
  });

  it('does not fire on a word that merely contains the component', () => {
    // `order-prod` is the system, `checkout` is unrelated. Neither is the answer.
    const innocent: CaseLike = {
      caseId: 'case-002',
      injectTime: '2026-09-06T00:10:00.000Z',
      query: 'A checkout request on order-prod failed. Investigate.',
      groundTruth: { rootCauseComponent: 'order', rootCauseReason: 'CPU saturation' },
    };
    expect(leaks(innocent)).toEqual([]);
  });

  it('does not fire on a window whose bounds are not the onset', () => {
    const window: CaseLike = {
      caseId: 'case-003',
      injectTime: '2026-09-06T00:10:00.000Z',
      query: 'Between 08:00 and 08:30 UTC+8 the service degraded.',
      groundTruth: { rootCauseComponent: 'order', rootCauseReason: 'CPU saturation' },
    };
    expect(leaks(window)).toEqual([]);
  });
});
