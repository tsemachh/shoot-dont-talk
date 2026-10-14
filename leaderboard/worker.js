/* Arcade Hall of Fame leaderboard (Cloudflare Worker + KV)
 * Adapted from the River Raid leaderboard (tsemachh/river-raid/leaderboard) with
 * one addition: an optional ?game= key, so several games can share one worker.
 *
 * Endpoints
 *   GET  /scores[?game=id]                      -> { scores: [ {name, score, wave?, ts}, ... up to 25 ] }
 *   POST /scores[?game=id]  {name, score, wave?} -> validates, stores, returns the new top list
 *
 * Storage: one KV key per game holding a JSON array, kept sorted high->low.
 * No ?game= (or game=river-raid) uses the original "board" key, so the River
 * Raid client keeps working unchanged against this code.
 * Bind a KV namespace named  SCORES  to this worker (see leaderboard/README.md).
 *
 * Safety notes
 *   - Only a *public* worker URL is shipped in the game - no secrets in the client.
 *   - Server-side validation caps the name length + score range and applies a
 *     light per-IP cooldown to deter spam.
 *   - This is NOT tamper-proof: the browser reports the score, so a determined
 *     person could still POST a forged one. Good enough for a fun arcade board.
 */

const MAX_KEEP = 25; // how many entries the board holds
const MAX_NAME = 12; // name length cap
const MAX_SCORE = 5000000; // sane upper bound for one run
const COOLDOWN_S = 2; // min seconds between submits from one IP
const GAMES = ['river-raid', 'shoot-dont-talk']; // known boards

/** KV key for a game's board; unknown/missing ids fall back to the original board. */
function boardKey(game) {
  if (!game || game === 'river-raid' || !GAMES.includes(game)) return 'board';
  return 'board:' + game;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

const json = (obj, status) =>
  new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

// keep only safe characters; strips < > & " ' and any control/markup chars
function cleanName(raw) {
  let s = (typeof raw === 'string' ? raw : '')
    .replace(/[^A-Za-z0-9 ._-]/g, '')
    .replace(/ +/g, ' ')
    .trim();
  if (!s) s = 'YOU';
  return s.slice(0, MAX_NAME);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname !== '/scores' && url.pathname !== '/') {
      return json({ error: 'not found' }, 404);
    }
    if (!env.SCORES) return json({ error: 'KV namespace SCORES not bound' }, 500);
    const key = boardKey(url.searchParams.get('game'));

    // ---- read the board ----
    let board = [];
    try { board = JSON.parse((await env.SCORES.get(key)) || '[]'); } catch (e) { board = []; }
    if (!Array.isArray(board)) board = [];

    // ---- GET: return the top list ----
    if (request.method === 'GET') {
      return json({ scores: board.slice(0, MAX_KEEP) });
    }

    // ---- POST: add a score ----
    if (request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'anon';
      const ipKey = 'ip:' + ip;
      if (await env.SCORES.get(ipKey)) {
        return json({ error: 'slow down', scores: board.slice(0, MAX_KEEP) }, 429);
      }

      let body;
      try { body = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }

      const score = Math.floor(Number(body && body.score));
      if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
        return json({ error: 'bad score' }, 400);
      }
      const name = cleanName(body && body.name);
      const ts = Date.now();
      const entry = { name, score, ts };
      const wave = Math.floor(Number(body && body.wave));
      if (Number.isFinite(wave) && wave > 0 && wave < 10000) entry.wave = wave;

      board.push(entry);
      board.sort((a, b) => b.score - a.score);
      board = board.slice(0, MAX_KEEP);

      await env.SCORES.put(key, JSON.stringify(board));
      try { await env.SCORES.put(ipKey, '1', { expirationTtl: COOLDOWN_S }); } catch (e) {}

      const rank = board.findIndex((e) => e.ts === ts && e.score === score) + 1;
      return json({ ok: true, rank, scores: board });
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
