import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The battery's report has to reach a channel that carries content, not just metadata.
 *
 * ## The three channels, measured
 *
 * Finding 86 found the gate-test battery's CI failure unreadable because the job
 * log is unreachable from this project's environment: `GET /actions/jobs/{id}/logs`
 * 302s to `productionresultssa*.blob.core.windows.net` and the proxy refuses the
 * connection (`http=000`). Writing the report to a file and uploading it with
 * `actions/upload-artifact` moved the problem rather than solving it -- the next
 * run showed the artifact **listed** (1152 bytes, `id=10934848175`) and the
 * `zip` endpoint 302ing to the same blocked host. Metadata reachable, content not:
 *
 * | channel | metadata | content |
 * | --- | --- | --- |
 * | job log | n/a | blocked (finding 55) |
 * | artifact | listed | blocked (`blob.core.windows.net`) |
 * | check-run output | empty without `checks:write` | n/a |
 * | **git object** | reachable | **reachable** |
 *
 * Git objects are the one channel that is both, because `api.github.com` serves
 * them itself: `GET /repos/{o}/{r}/contents/{path}?ref={branch}` returns the bytes
 * base64-encoded in the response. Verified before writing this file -- the script
 * published a report to a scratch `ci-reports` branch and both `HEAD` and the
 * report came back byte-exact through the API from inside this environment.
 *
 * ## What this file asserts
 *
 * Not that a branch exists -- existence is satisfied by a branch nobody updates.
 * The properties that make the channel usable are: the report is published from
 * the file the battery wrote, the branch is not `master`, a missing report is a
 * clean skip rather than a crash, and **a publish failure cannot change the
 * battery's verdict**.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = resolve(ROOT, 'scripts', 'publish-battery-report.py');
const SOURCE = readFileSync(SCRIPT, 'utf8');

const scratch = mkdtempSync(join(tmpdir(), 'rca-bench-publish-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function run(args: { cwd: string; env?: Record<string, string> }) {
  const proc = spawnSync('python3', [SCRIPT], {
    cwd: args.cwd,
    encoding: 'utf8',
    env: { ...process.env, ...(args.env ?? {}) },
    timeout: 60_000,
  });
  return { status: proc.status, output: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
}

describe('scripts · the battery report is published to a channel that carries content', () => {
  it('publishes to git objects rather than to an artifact', () => {
    // The distinction is the whole point: an artifact is *listed* through the API
    // and *downloaded* from a blocked host, so a fix that stops at `upload-artifact`
    // reproduces finding 86 one channel over. Asserted on the endpoints actually
    // called, not on a comment saying so.
    expect(SOURCE).toContain('/git/blobs');
    expect(SOURCE).toContain('/git/trees');
    expect(SOURCE).toContain('/git/commits');
    expect(SOURCE).toContain('api.github.com');
  });

  it('never writes to master', () => {
    // CI output must not be able to land on the branch under review. The report
    // is diagnostic, it is overwritten on every run, and a commit to `master`
    // would put an unreviewed file in the tree every gate reads.
    expect(SOURCE).toMatch(/BRANCH = "ci-reports"/);
    expect(SOURCE).not.toMatch(/refs\/heads\/master/);
    expect(SOURCE).not.toMatch(/"master"/);
  });

  it('skips cleanly when the battery produced no report, and without a token', () => {
    // Both are ordinary states, not failures. Without a token the script must not
    // try to authenticate; without a report it must not publish an empty file,
    // which would make the branch's tip disagree with the run that produced it.
    const noReport = run({ cwd: scratch, env: { GITHUB_TOKEN: '' } });
    expect(noReport.status).toBe(0);
    expect(noReport.output).toMatch(/no GITHUB_TOKEN|nothing to publish/);

    const withToken = run({ cwd: scratch, env: { GITHUB_TOKEN: 'not-a-real-token' } });
    expect(withToken.status).toBe(0);
    expect(withToken.output).toContain('nothing to publish');
  });

  it('a failed publish cannot change the verdict the battery reported', () => {
    // **The property finding 86 is about, applied one level up.** A diagnostic
    // channel that can itself fail the build replaces the verdict it was meant to
    // carry -- the battery was just repaired for exactly that mistake. So a real
    // report plus a token that cannot authenticate must still exit 0, and must say
    // that the battery's own exit code is what carries the verdict.
    const dir = mkdtempSync(join(scratch, 'report-'));
    writeFileSync(
      join(dir, 'gate-tests-battery-report.json'),
      JSON.stringify({ injections: [], caught: 0, survived: 1, restore_status: 0 }),
    );
    const result = run({ cwd: dir, env: { GITHUB_TOKEN: 'not-a-real-token' } });
    expect(result.status).toBe(0);
    expect(result.output).toMatch(/could not publish/);
    expect(result.output).toMatch(/exit code still carries the verdict/);
  });

  it('the summary line is built from the report it is publishing', () => {
    // A summary that is written but not read from the report would print zeroes
    // forever while the JSON said otherwise -- the "computed and never printed"
    // shape from finding 85, inverted. So the builder is asserted to read the
    // report's own fields and both call sites are required.
    const code = SOURCE.replace(/"""[\s\S]*?"""/g, '');
    expect(code).toMatch(/def head_summary\(report/);
    expect(code).toMatch(/report\.get\('caught'/);
    expect(code).toMatch(/summary = head_summary\(report\)/);
    expect(code).toMatch(/json\.loads\(path\.read_text\(\)\)/);
  });
});
