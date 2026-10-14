/** High-score table persistence. localStorage is best-effort: wrapped, with a seeded default table. */

export interface ScoreEntry {
  initials: string;
  score: number;
  wave: number;
}

const KEY = 'sdt-scores';
export const TABLE_SIZE = 8;

const DEFAULTS: ScoreEntry[] = [
  { initials: 'TSE', score: 50000, wave: 5 },
  { initials: 'MAC', score: 40000, wave: 4 },
  { initials: 'HAD', score: 30000, wave: 4 },
  { initials: 'SDT', score: 25000, wave: 3 },
  { initials: 'GUN', score: 20000, wave: 3 },
  { initials: 'ARC', score: 15000, wave: 2 },
  { initials: 'ADE', score: 12000, wave: 2 },
  { initials: 'AAA', score: 10000, wave: 1 }
];

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ScoreEntry[];
      if (Array.isArray(parsed) && parsed.length) return parsed.slice(0, TABLE_SIZE);
    }
  } catch {
    /* storage unavailable */
  }
  return [...DEFAULTS];
}

export function qualifies(score: number): boolean {
  const table = loadScores();
  return score > 0 && (table.length < TABLE_SIZE || score > table[table.length - 1].score);
}

/** Insert and persist; returns the entry's rank (0-based) or -1. */
export function submitScore(entry: ScoreEntry): number {
  const table = loadScores();
  table.push(entry);
  table.sort((a, b) => b.score - a.score);
  const trimmed = table.slice(0, TABLE_SIZE);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* fine */
  }
  return trimmed.indexOf(entry);
}

export function hiScore(): number {
  return loadScores()[0]?.score ?? 50000;
}
