import type { ScoreEntry } from './save';
import { TABLE_SIZE } from './save';

/**
 * Global Hall of Fame: a tiny Cloudflare Worker + KV (see /leaderboard), shared
 * with the River Raid board code but keyed by ?game=. Everything here is
 * best-effort: if the network or the worker is down, the game silently keeps
 * using the local table, so the Hall of Fame always works.
 */
const URL_BASE = 'https://arcade-scores.tsemachh-391.workers.dev/scores?game=shoot-dont-talk';
const TIMEOUT_MS = 3500;

interface RemoteEntry {
  name: string;
  score: number;
  wave?: number;
}

let world: ScoreEntry[] | null = null;

function toEntries(list: RemoteEntry[]): ScoreEntry[] {
  return list.slice(0, TABLE_SIZE).map((e) => ({
    initials: String(e.name ?? '???').slice(0, 3).toUpperCase(),
    score: Math.floor(Number(e.score) || 0),
    wave: Math.floor(Number(e.wave) || 1)
  }));
}

async function request(init?: RequestInit): Promise<ScoreEntry[] | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(URL_BASE, { ...init, signal: ctl.signal });
    const data = (await res.json()) as { scores?: RemoteEntry[] };
    if (!Array.isArray(data.scores)) return null;
    world = toEntries(data.scores);
    return world;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Last known world board (null until the first successful fetch). */
export function worldScores(): ScoreEntry[] | null {
  return world;
}

export function fetchWorld(): Promise<ScoreEntry[] | null> {
  return request();
}

export function submitWorld(entry: ScoreEntry): Promise<ScoreEntry[] | null> {
  return request({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: entry.initials, score: entry.score, wave: entry.wave })
  });
}

/** Would this score make the world top table (using the last fetched board)? */
export function qualifiesWorld(score: number): boolean {
  if (!world || score <= 0) return false;
  return world.length < TABLE_SIZE || score > world[world.length - 1].score;
}
