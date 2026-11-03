import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error: string | null };

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

export function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.at !== 'string' || Number.isNaN(Date.parse(v.at))) return null;
  if (typeof v.job !== 'string' || v.job === '') return null;
  if (typeof v.status !== 'string' || !STATUSES.includes(v.status)) return null;
  if (v.owner !== null && typeof v.owner !== 'string') return null;
  if (v.error !== undefined && v.error !== null && typeof v.error !== 'string') return null;
  return {
    at: v.at,
    job: v.job,
    status: v.status as RunStatus,
    owner: v.owner,
    error: typeof v.error === 'string' && v.error !== '' ? v.error : null,
  };
}

function readFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readFile(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  let badLines = 0;
  const byJob = new Map<string, RunLine[]>();
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    const lines = byJob.get(line.job) ?? [];
    lines.push(line);
    byJob.set(line.job, lines);
  }

  const rows: DigestRow[] = [...byJob.entries()].map(([job, lines]) => {
    // Stable sort on the instant; the strings keep the log's own offset for display.
    const ordered = [...lines].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const first = ordered[0]!;
    const last = ordered[ordered.length - 1]!;
    const lastError = ordered.findLast((l) => l.error !== null)?.error ?? null;
    return {
      job,
      owner: last.owner,
      runs: ordered.length,
      retries: ordered.filter((l) => l.status === 'retry').length,
      lastStatus: last.status,
      lastError,
      firstAt: first.at,
      lastAt: last.at,
    };
  });
  rows.sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { night, rows, badLines } satisfies Night;
};
