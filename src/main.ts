import Phaser from 'phaser';
import { GAME_W, GAME_H } from './core/config';
import { CrtPipeline } from './systems/CrtPipeline';
import { AttractScene } from './ui/AttractScene';
import { InitialsScene } from './ui/InitialsScene';
import { InvasionScene } from './sectors/InvasionScene';
import { JumpScene } from './sectors/JumpScene';
import { SwarmScene } from './sectors/SwarmScene';

new Phaser.Game({
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
  scene: [AttractScene, InvasionScene, JumpScene, SwarmScene, InitialsScene]
});

// Mobile: the game is landscape-only. Where the platform allows it (Android
// Chrome and friends), lock the orientation on the first touch; iOS Safari
// can't lock, so the CSS rotate overlay in index.html does the asking.
if (matchMedia('(pointer: coarse)').matches) {
  const lock = (): void => {
    document.removeEventListener('pointerdown', lock);
    const o = screen.orientation as unknown as { lock?: (mode: string) => Promise<void> } | undefined;
    if (!o?.lock) return;
    const fs = document.documentElement.requestFullscreen?.();
    void (fs ?? Promise.resolve())
      .then(() => o.lock!('landscape'))
      .catch(() => {
        /* not supported (iOS) or declined - the rotate overlay covers it */
      });
  };
  document.addEventListener('pointerdown', lock);
}
