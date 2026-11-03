import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  it('reads 2026-10-28 into one row per job and counts the bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('aggregates runs, retries, last status and last error per job', () => {
    const rows = readNight('runs', '2026-10-28')!.rows;
    expect(rows.find((r) => r.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(rows.find((r) => r.job === 'notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
    expect(rows.find((r) => r.job === 'lane/sync')).toMatchObject({ runs: 8, retries: 1, firstAt: '2026-10-28T23:00:06+01:00' });
  });

  it('keeps a row whose owner is null', () => {
    const row = readNight('runs', '2026-10-28')!.rows.find((r) => r.job === 'digest/render');
    expect(row).toMatchObject({ owner: null, lastStatus: 'ok', lastError: null });
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2026-10-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('gives no rows for an empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(join(dir, '2026-10-30.jsonl'), '');
    expect(readNight(dir, '2026-10-30')).toEqual({ night: '2026-10-30', rows: [], badLines: 0 });
  });

  it('counts lines with the wrong shape as bad', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    writeFileSync(
      join(dir, '2026-10-31.jsonl'),
      [
        '{"at":"2026-10-31T01:00:00+01:00","job":"a","status":"ok","owner":"rook"}',
        '{"at":"2026-10-31T01:00:00+01:00","job":"a","status":"skipped","owner":"rook"}',
        '[]',
        'not json',
      ].join('\n'),
    );
    expect(readNight(dir, '2026-10-31')).toMatchObject({ badLines: 3, rows: [{ job: 'a', runs: 1 }] });
  });
});
