/**
 * Internal pixel resolution. Height is fixed at 216; width adapts to the
 * device's landscape aspect ratio (16:9 = 384 up to ~21:9 = 504) so phones
 * fill the whole screen instead of letterboxing. Computed once at boot from
 * the long/short screen edges, so it is right even if the page loads in portrait.
 */
export const GAME_H = 216;
export const BASE_W = 384;
function landscapeWidth(): number {
  if (typeof window === 'undefined') return BASE_W;
  // Phones that can go fullscreen (Android) will end up showing the whole
  // screen; elsewhere (iOS Safari, desktop) size to the real game container,
  // which already excludes browser bars and notch safe-areas.
  let w0 = window.innerWidth;
  let h0 = window.innerHeight;
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  const box = document.getElementById('game')?.getBoundingClientRect();
  if (touch && document.fullscreenEnabled) {
    w0 = screen.width;
    h0 = screen.height;
  } else if (box && box.width > 0 && box.height > 0) {
    w0 = box.width;
    h0 = box.height;
  }
  const long = Math.max(w0, h0);
  const short = Math.max(1, Math.min(w0, h0));
  const w = Math.round((GAME_H * long) / short / 2) * 2;
  return Math.min(504, Math.max(BASE_W, w));
}
export const GAME_W = landscapeWidth();
/** Horizontal offset that centers layouts authored for the 384-wide base screen. */
export const PAD_X = (GAME_W - BASE_W) / 2;

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
