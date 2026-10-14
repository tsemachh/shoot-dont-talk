# Shoot, Don't Talk

Arcade shooter (Phaser 3.90 + TypeScript 5.9 + Vite 6). One ship jumps between classic-game worlds:
Invasion Grid (Space Invaders) → Swarm (Galaxian) → Lunar Run (Moon Patrol) → Canyon River (River Raid, M5) → Mothership (M6).

## Layout
- `src/sectors/*Scene.ts` — one scene per game-world; `JumpScene` is the in-world transition (`DEST` table)
- `src/systems/` — fx (bloom + CRT), textures (procedural pixel art), audio (WebAudio synth), powerups
- `src/ui/` — attract/title, initials entry, HUD
- `src/data/*.json` — all tuning numbers
- `src/core/config.ts` — `GAME_H` fixed 216; `GAME_W` adapts to device aspect (384..504), `PAD_X` centers 384-wide layouts

## Conventions
- Fixed 60 Hz `tick()` via accumulator; never use frame delta for gameplay
- Pool sprites (`getFromPool`), no per-frame allocation in hot loops
- Keep Node 20.9 compatible (owner's Mac): vite 6, typescript 5.9, wrangler@3

## Dev / test
- `npm run dev`, `npm run build` (tsc --noEmit + vite build)
- Dev hooks: `?scene=invasion|swarm|lunar|jump[&to=lunar][&auto=1]` (`auto` = lunar autopilot)
- Headless checks: `python3 -m http.server 8123 -d dist` then `node verify-*.cjs`

## Deploy (Cloudflare Pages, run on the owner's Mac — the OAuth token lives there)
```
git pull && npm install --include=dev && npm run build
CLOUDFLARE_ACCOUNT_ID=39119b45dc8ef2a6943ac33a99def6a0 npx -y wrangler@3 pages deploy dist \
  --project-name=shoot-dont-talk --branch=main --commit-dirty=true
```
Live at https://shoot.tsemach.dev
