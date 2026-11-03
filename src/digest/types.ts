export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string;
  rows: DigestRow[];
  badLines: number;
};

/**
 * Rows are sorted by job. Returns null when runs/<night>.jsonl does not exist.
 * An empty file gives `rows: []`. Lines that do not parse are counted in `badLines`.
 */
export type ReadNight = (runsDir: string, night: string) => Night | null;
