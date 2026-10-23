import { describe, expect, it } from 'vitest';
import {
  FAILURE_EXCERPT_LIMIT,
  buildExtractionReport,
  describeExtractionFailure,
  formatExtractionReport,
  parseGoldenDataset,
} from '../src/fault/extraction-scoring.js';

/**
 * Why a run produced no answer, and whether the artefact says so.
 *
 * Run `39901474902` scored `unparseable 19/19` — every sample, in forty seconds,
 * which is far too fast for nineteen model calls to have returned anything
 * usable. The reason existed: `derive-fault-golden.mjs` prints it to stdout on
 * the `UNPARSEABLE` line. But stdout of a GitHub job is not readable from this
 * project's development environment (finding 55), so the artefact was the only
 * channel, and the artefact recorded `{ sampleId, parseOk: false }` — nineteen
 * times, with nothing else.
 *
 * The measurement was already paid for and could not say what happened. That is
 * the same shape as finding 205 (a citation that reads the same whether or not
 * it resolves), applied to a *failure*: `parseOk: false` is what a rate limit, an
 * expired key, a truncated response and a genuinely malformed answer all look
 * like from outside.
 *
 * These tests pin the three things that make the next such run diagnosable: the
 * reason is kept, the response is kept in a bounded form, and the report prints
 * both.
 */

const dataset = parseGoldenDataset({
  schema: 'rca-bench-fault-golden/2',
  types: ['cpu-saturation'],
  samples: [
    {
      id: 's1',
      incidentText: 'the pod sat pinned at its 500m limit',
      expected: { type: 'cpu-saturation', category: 'resource', component: 'checkout-api' },
    },
  ],
});

describe('describeExtractionFailure keeps the reason a run could not answer', () => {
  it('keeps the parser’s reason verbatim, because that is the diagnosis', () => {
    const record = describeExtractionFailure('not json at all', 'response contains no JSON object');
    expect(record.parseError).toBe('response contains no JSON object');
  });

  it('collapses the response onto one line, so a stack trace or a pretty-printed body is readable', () => {
    const record = describeExtractionFailure('{\n  "error": {\n    "message": "quota"\n  }\n}', 'no JSON object');
    expect(record.responseExcerpt).toBe('{ "error": { "message": "quota" } }');
    expect(record.responseExcerpt).not.toMatch(/\n/);
  });

  it('bounds the excerpt, because an error page can be megabytes', () => {
    // The boundary is checked on both sides: exactly at the limit is not
    // truncated, one character past it is. An assertion that only tested a very
    // long input would pass with an off-by-one that keeps 199 characters.
    const atLimit = 'x'.repeat(FAILURE_EXCERPT_LIMIT);
    const justOver = 'x'.repeat(FAILURE_EXCERPT_LIMIT + 1);
    expect(describeExtractionFailure(atLimit, 'r').responseExcerpt).toBe(atLimit);
    const truncated = describeExtractionFailure(justOver, 'r').responseExcerpt;
    expect(truncated).toHaveLength(FAILURE_EXCERPT_LIMIT + 1);
    expect(truncated.endsWith('…')).toBe(true);
  });

  it('reports an empty excerpt for an empty response rather than inventing one', () => {
    // An adapter that returns '' is a real case: a 204, or a stream that closed
    // early. The excerpt is empty and the reason still says what was expected.
    const record = describeExtractionFailure('   \n\t ', 'response contains no JSON object');
    expect(record.responseExcerpt).toBe('');
    expect(record.parseError).toBe('response contains no JSON object');
  });
});

describe('the report prints why a run produced no answer', () => {
  it('names the sample, the reason and the beginning of the response', () => {
    const report = buildExtractionReport(dataset.samples, [
      {
        sampleId: 's1',
        parseOk: false,
        parseError: 'response contains no JSON object',
        responseExcerpt: '{"error":"insufficient balance"}',
      },
    ]);
    const text = formatExtractionReport(report);
    expect(text).toContain('s1');
    expect(text).toContain('response contains no JSON object');
    expect(text).toContain('insufficient balance');
  });

  it('says the same thing for a transport failure, which is a different cause', () => {
    // A thrown request and a malformed answer are both "not parseable", and they
    // have different fixes. The report keeps the distinction the artefact drew.
    const report = buildExtractionReport(dataset.samples, [
      { sampleId: 's1', parseOk: false, transportError: 'getaddrinfo ENOTFOUND api.deepseek.com' },
    ]);
    expect(formatExtractionReport(report)).toContain('ENOTFOUND');
  });

  it('bounds the list and says how many it did not print', () => {
    // Nineteen identical lines would push the per-field table off a summary page,
    // and the first one is what identifies the cause. The count of the rest is
    // still published, so the list is not mistaken for the whole run.
    const many = Array.from({ length: 7 }, (_, i) => ({
      sampleId: `s${String(i).padStart(2, '0')}`,
      parseOk: false,
      parseError: 'response contains no JSON object',
    }));
    const ds = parseGoldenDataset({
      schema: 'rca-bench-fault-golden/2',
      types: ['cpu-saturation'],
      samples: many.map((p) => ({
        id: p.sampleId,
        incidentText: 'the pod sat pinned at its 500m limit',
        expected: { type: 'cpu-saturation', category: 'resource', component: 'checkout-api' },
      })),
    });
    const text = formatExtractionReport(buildExtractionReport(ds.samples, many));
    const listed = text.split('\n').filter((line) => /^ {4}s\d\d {2}/.test(line));
    expect(listed).toHaveLength(3);
    expect(text).toContain('7');
  });

  it('keeps the columns apart when a sample id is longer than the column', () => {
    // Found by reading the first real output of this report, on run 39902858134:
    // every golden id is between 26 and 40 characters, and `padEnd(20)` does
    // nothing for a string longer than 20 -- so the line printed
    // `resource-cpu-saturation-checkoutunparseable`. The test that pinned the
    // section used `s1`, `s00` and so on, which pad correctly, so it passed
    // while every real line was unreadable. That is the fixture choosing the one
    // shape the defect does not affect.
    const id = 'resource-cpu-saturation-checkout';
    const ds = parseGoldenDataset({
      schema: 'rca-bench-fault-golden/2',
      types: ['cpu-saturation'],
      samples: [
        {
          id,
          incidentText: 'the pod sat pinned at its 500m limit',
          expected: { type: 'cpu-saturation', category: 'resource', component: 'checkout-api' },
        },
      ],
    });
    const text = formatExtractionReport(
      buildExtractionReport(ds.samples, [
        { sampleId: id, parseOk: false, parseError: 'response contains no JSON object' },
      ]),
    );
    const line = text.split('\n').find((l) => l.includes(id));
    expect(line, 'the unusable section must name the sample').toBeDefined();
    expect(line).toMatch(new RegExp(`^ {4}${id} +unparseable`));
  });

  it('says nothing extra when every sample was scored, so a good run stays short', () => {
    const report = buildExtractionReport(dataset.samples, [
      {
        sampleId: 's1',
        parseOk: true,
        extracted: { type: 'cpu-saturation', category: 'resource', component: 'checkout-api' },
        validationValid: true,
      },
    ]);
    expect(formatExtractionReport(report)).not.toMatch(/not scored/i);
  });
});
