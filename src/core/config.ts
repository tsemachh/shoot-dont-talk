/** Internal pixel resolution. Rendered with integer scaling and pixelArt on. */
export const GAME_W = 384;
export const GAME_H = 216;

/** Fixed logic timestep (ms). Gameplay updates at exactly 60 Hz regardless of refresh rate. */
export const STEP_MS = 1000 / 60;

/** Power-up bar slots, Gradius style. */
export const POWER_SLOTS = ['SPD', 'SPR', 'LSR', 'SHD', 'OPT'] as const;

export const COLORS = {
  hudAccent: 0xff50c8,
  hudText: 0xffffff,
  hudDim: 0x8c96dc,
  powerOn: 0xffc828,
  bullet: 0xffffb4,
  flame: 0xffa028
} as const;
