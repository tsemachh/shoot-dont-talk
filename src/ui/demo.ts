import Phaser from 'phaser';

/**
 * Attract-mode demo rotation: each pass through the title loop shows the next
 * game-world playing itself, so the cabinet advertises every sector.
 */
const ORDER = ['invasion', 'swarm', 'lunar', 'warp', 'canyon'] as const;
let next = 0;

export const DEMO_FRAMES = 60 * 20; // each demo runs ~20 s
export const DEMO_LABEL = 'DEMO - PRESS FIRE TO PLAY';

export function nextDemoScene(): (typeof ORDER)[number] {
  const key = ORDER[next % ORDER.length];
  next++;
  return key;
}

/** During a demo, fire keys or a tap coin up a real game via the title screen. */
export function bindDemoExit(scene: Phaser.Scene): void {
  let gone = false;
  const go = (): void => {
    if (gone) return;
    gone = true;
    scene.scene.start('attract', { start: true });
  };
  scene.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'Enter') go();
  });
  scene.input.on('pointerdown', go);
}
