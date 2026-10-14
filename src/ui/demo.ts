import Phaser from 'phaser';
import { GAME_H } from '../core/config';
import { barOf } from './toggles';
import { ptext } from './pixelFont';

/**
 * Attract-mode demo rotation: each pass through the title loop shows the next
 * game-world playing itself, so the cabinet advertises every sector.
 */
const ORDER = ['invasion', 'swarm', 'lunar', 'warp', 'canyon'] as const;
let next = 0;

export const DEMO_FRAMES = 60 * 20; // each demo runs ~20 s
export const DEMO_LABEL = '';

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
  // clean screen like the preview video: the settings bar is hidden and a small
  // blinking tag sits in its place instead of a label across the action
  const tag = ptext(scene, 116, GAME_H - 9, 'DEMO - PRESS FIRE', 1, '#ffd25a').setOrigin(0.5, 0).setDepth(130);
  const quiet = (): void => {
    barOf.get(scene)?.setVisible(false);
    const hud = (scene as unknown as { hud?: { quiet: boolean } }).hud;
    if (hud) hud.quiet = true;
  };
  quiet();
  scene.time.delayedCall(0, quiet);
  scene.time.addEvent({ delay: 500, loop: true, callback: () => tag.setVisible(!tag.visible) });
}
