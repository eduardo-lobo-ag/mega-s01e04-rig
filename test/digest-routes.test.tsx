import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const GOOD_NIGHT = '2026-11-01';
const EMPTY_NIGHT = '2026-11-02';
const BAD_NIGHT = '2026-11-03';
const MISSING_NIGHT = '2026-11-04';

const goodLines = [
  '{"at":"2026-11-01T23:00:02+01:00","job":"rig/rotate-logs","status":"ok","owner":"lane-07"}',
  '{"at":"2026-11-01T23:00:06+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"timeout"}',
  '{"at":"2026-11-02T00:00:04+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
];

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(join(runsDir, `${GOOD_NIGHT}.jsonl`), `${goodLines.join('\n')}\n`);
  writeFileSync(join(runsDir, `${EMPTY_NIGHT}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD_NIGHT}.jsonl`), `${goodLines[0]}\n{"at":"2026-11-03T23:00:\n${goodLines[1]}\n`);
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

type Body = { night: string; rows: { job: string; runs: number }[]; badLines: number };

describe('GET /digest/:night', () => {
  it('renders the jobs of a night on disk', async () => {
    const res = await app.request(`/digest/${GOOD_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('rig/rotate-logs');
    expect(html).toContain('lane/sync');
    expect(html).not.toContain('could not be read');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for that night');
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('could not be read');
  });

  it('shows the readable rows and counts the bad line', async () => {
    const res = await app.request(`/digest/${BAD_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('rig/rotate-logs');
    expect(html).toContain('lane/sync');
    expect(html).toContain('1 line could not be read');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the rows of a night on disk', async () => {
    const res = await app.request(`/api/digest/${GOOD_NIGHT}`);
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.night).toBe(GOOD_NIGHT);
    expect(body.rows.map((r) => [r.job, r.runs])).toEqual([
      ['lane/sync', 2],
      ['rig/rotate-logs', 1],
    ]);
    expect(body.badLines).toBe(0);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: `no run log for ${MISSING_NIGHT}` });
  });

  it('returns no rows and no bad lines for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: EMPTY_NIGHT, rows: [], badLines: 0 });
  });

  it('returns the good rows and counts the bad line', async () => {
    const res = await app.request(`/api/digest/${BAD_NIGHT}`);
    const body = (await res.json()) as Body;
    expect(res.status).toBe(200);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'rig/rotate-logs']);
    expect(body.badLines).toBe(1);
  });
});
