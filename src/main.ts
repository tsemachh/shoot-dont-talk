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
import { initPwa } from './core/pwa';
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
// Fullscreen in a browser tab is offered on the title screen only (see core/fullscreen.ts);
// installed apps are fullscreen from the manifest.

// test hook for headless checks (read-only use)
(window as unknown as { __sdt: Phaser.Game }).__sdt = game;

// keep the canvas fitted when bars/fullscreen/orientation change the viewport
const refit = (): void => {
  setTimeout(() => game.scale.refresh(), 60);
};
document.addEventListener('fullscreenchange', refit);
window.addEventListener('orientationchange', refit);
window.visualViewport?.addEventListener('resize', refit);
