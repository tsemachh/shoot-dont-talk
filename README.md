# Shoot, Don't Talk

Arcade shooter — Plan 2 "Classic": one ship flies through five classic arcade games
(Space Invaders → Galaxian → Moon Patrol → River Raid → boss rush), changing form
between sectors. Original art and audio; mechanics inspired by the classics.

**Status: M0 skeleton** — Vite + Phaser 3 + TypeScript, 384×216 internal resolution
with integer scaling, fixed 60 Hz logic step, bloom + custom CRT post pipeline,
arcade HUD, flyable ship with pooled bullets.

## Run

```bash
npm install
npm run dev       # dev server
npm run build     # typecheck + production build into dist/
```

## Controls

| Input | Action |
| --- | --- |
| Arrows / WASD / left stick | Move |
| Space / Z / pad A | Fire |
| B | Toggle bloom |
| C | Toggle CRT (scanlines, curvature, chromatic aberration) |
| Touch | Drag to steer, hold to fire |

## Layout

```
src/
  core/      config, input map (keyboard / gamepad / touch)
  systems/   fx (bloom + CRT toggles), CrtPipeline (GLSL), procedural textures
  sectors/   one scene per sector; FlightScene is the M0 skeleton they all follow
  data/      tuning.json - all gameplay numbers live in data, not code
  ui/        arcade HUD (score, lives, Gradius-style power bar)
```

## Milestones

M0 skeleton (this) → M1 Invasion Grid → M2 shared systems → M3 Swarm →
M4 Lunar Run → M5 Canyon River → M6 Mothership + loop → M7 polish.
Plan doc: see the "Shoot, Don't Talk — Game Plans" doc (Plan 2 tab).
