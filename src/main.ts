import Phaser from 'phaser';
import { GAME_W, GAME_H } from './core/config';
import { CrtPipeline } from './systems/CrtPipeline';
import { AttractScene } from './ui/AttractScene';
import { InitialsScene } from './ui/InitialsScene';
import { InvasionScene } from './sectors/InvasionScene';
import { JumpScene } from './sectors/JumpScene';
import { SwarmScene } from './sectors/SwarmScene';
import { LunarScene } from './sectors/LunarScene';
import { WarpScene } from './sectors/WarpScene';
import { CanyonScene } from './sectors/CanyonScene';
import { initPwa, isInstalled } from './core/pwa';
import { QuitScene } from './ui/QuitScene';

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#04020e',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  input: {
    gamepad: true,
    activePointers: 2
  },
  pipeline: { [CrtPipeline.KEY]: CrtPipeline } as never,
  scene: [AttractScene, InvasionScene, JumpScene, SwarmScene, LunarScene, WarpScene, CanyonScene, InitialsScene, QuitScene]
});

// Mobile: landscape-only and fullscreen. The first touch requests real
// fullscreen (hides browser bars) and, where the platform allows it (Android
// Chrome and friends), locks landscape. iPhone Safari supports neither for
// pages - there the rotate overlay asks, and "Add to Home Screen" launches
// fullscreen via the web manifest / apple-mobile-web-app-capable.
initPwa();
// Installed app (home-screen icon): the OS already runs it fullscreen + landscape from the
// manifest, so skip the browser Fullscreen API and its "swipe to exit" banner.
if (matchMedia('(pointer: coarse)').matches && !isInstalled()) {
  const goFull = (): void => {
    if (document.fullscreenElement) return;
    const el = document.documentElement;
    const req = el.requestFullscreen?.({ navigationUI: 'hide' } as FullscreenOptions);
    void (req ?? Promise.resolve())
      .then(() => {
        const o = screen.orientation as unknown as { lock?: (mode: string) => Promise<void> } | undefined;
        return o?.lock?.('landscape');
      })
      .catch(() => {
        /* unsupported or declined - the rotate overlay covers it */
      });
  };
  // re-request after the user leaves fullscreen (back gesture) and taps again
  document.addEventListener('pointerdown', goFull);
}

// test hook for headless checks (read-only use)
(window as unknown as { __sdt: Phaser.Game }).__sdt = game;

// keep the canvas fitted when bars/fullscreen/orientation change the viewport
const refit = (): void => {
  setTimeout(() => game.scale.refresh(), 60);
};
document.addEventListener('fullscreenchange', refit);
window.addEventListener('orientationchange', refit);
window.visualViewport?.addEventListener('resize', refit);
