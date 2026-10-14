# Shoot, Don't Talk

Arcade shooter (Phaser 3.90 + TypeScript 5.9 + Vite 6). One ship jumps between classic-game worlds:
Invasion Grid (Space Invaders) → Swarm (Galaxian) → Lunar Run (Moon Patrol) → Warp Ring (Gyruss) → Canyon River (River Raid, final). Clearing Canyon River loops back to Invasion, harder (`loop` carried in SectorCarry).

## Layout
- `src/sectors/*Scene.ts` — one scene per game-world; `JumpScene` is the in-world transition (`DEST` table)
- `src/systems/` — fx (threshold bloom + CRT in CrtPipeline, flashBurst), textures (procedural pixel art), audio (WebAudio SFX + soft-clip master), music (per-sector chiptune sequencer), powerups
- `src/ui/` — attract/title, initials entry, HUD, pixelFont (5x7 bitmap font: always use `ptext`, never `this.add.text`), demo (attract rotation)
- `src/data/*.json` — all tuning numbers
- `src/core/config.ts` — `GAME_H` fixed 216; `GAME_W` adapts to device aspect (384..504), `PAD_X` centers 384-wide layouts

## Conventions
- Fixed 60 Hz `tick()` via accumulator; never use frame delta for gameplay
- Pool sprites (`getFromPool`), no per-frame allocation in hot loops
- Keep Node 20.9 compatible (owner's Mac): vite 6, typescript 5.9, wrangler@3

## Dev / test
- `npm run dev`, `npm run build` (tsc --noEmit + vite build)
- Dev hooks: `?scene=invasion|swarm|lunar|warp|canyon|jump[&to=swarm|lunar|warp|canyon|invasion][&demo][&auto]` (`demo` = attract demo mode, `auto` = lunar/canyon autopilot)
- Headless state: `window.__sdt` is the Phaser game; set `window.__sdtDebug = true` for Canyon crash logs
- Each sector has its own player craft (ship-inv, ship-swarm, rover, ship-warp, ship-jet); JumpScene morphs between them
- Title: `L` / LEVEL SELECT button (or keys 1-5) = practice run (`run.cheat`, not posted to world board); INSTALL APP button (PWA, `core/pwa.ts`, `public/sw.js`)
- Touch controls: every world uses `standardPad()` (src/ui/touchpad.ts) attached via `InputMap.attachPad` - fixed stick left, FIRE right (+JUMP in Lunar); hidden in demo / non-touch
- Bottom bar: B/C/M/N toggles + HOME (two-step tap / Esc twice -> title)
- Banners/labels go in empty screen space, never over enemy formations
- Look/sound reference: the Plan 2 preview video (same palette, font, bloom and music as the game)
- Headless checks: `python3 -m http.server 8123 -d dist` then `node verify-*.cjs`

## Deploy (Cloudflare Pages, run on the owner's Mac — the OAuth token lives there)
```
git pull && npm install --include=dev && npm run build
CLOUDFLARE_ACCOUNT_ID=39119b45dc8ef2a6943ac33a99def6a0 npx -y wrangler@3 pages deploy dist \
  --project-name=shoot-dont-talk --branch=main --commit-dirty=true
```
Live at https://shoot.tsemach.dev
