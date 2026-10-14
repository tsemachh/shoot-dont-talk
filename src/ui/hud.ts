import Phaser from 'phaser';
import { COLORS, GAME_W, GAME_H, POWER_SLOTS } from '../core/config';

import { ptext, PText } from './pixelFont';
import { POWER_COLOR, POWER_LETTER, type PowerState } from '../systems/powerups';

function label(scene: Phaser.Scene, x: number, y: number, text: string, color: number): PText {
  return ptext(scene, x, y, text, 1, color).setDepth(100).setScrollFactor(0);
}

/** Arcade HUD: score, hi-score, lives, and a lamp row for active letter powers. */
export class Hud {
  score = 0;
  hiScore = 50000;
  lives = 3;
  powerCursor = -1;

  private scoreText: PText;
  private hiText: PText;
  private liveIcons: Phaser.GameObjects.Image[] = [];
  private powerBoxes: Phaser.GameObjects.Rectangle[] = [];
  private powerLabels: PText[] = [];
  private toast: PText;
  private chainText!: PText;
  private toastUntil = 0;

  /** Legacy hook (the X button is gone: capsules apply themselves). */
  onActivate?: () => void;

  constructor(scene: Phaser.Scene) {

    label(scene, 4, 3, 'SCORE', COLORS.hudAccent);
    this.scoreText = label(scene, 40, 3, '000000', COLORS.hudText);
    label(scene, GAME_W - 58, 3, 'HI', COLORS.hudAccent);
    this.hiText = label(scene, GAME_W - 42, 3, '050000', COLORS.hudText);

    for (let i = 0; i < 3; i++) {
      this.liveIcons.push(
        scene.add.image(8 + i * 10, GAME_H - 6, 'ship-mini').setDepth(100).setScrollFactor(0)
      );
    }

    // power row: one lamp per capsule letter, lit in that capsule's colour while active
    POWER_SLOTS.forEach((slot, i) => {
      const x = GAME_W - 74 + i * 15;
      this.powerBoxes.push(
        scene.add
          .rectangle(x, GAME_H - 6, 13, 11, 0x0a0a19)
          .setStrokeStyle(1, POWER_COLOR[slot], 0.45)
          .setDepth(100)
          .setScrollFactor(0)
      );
      this.powerLabels.push(label(scene, x, GAME_H - 6, POWER_LETTER[slot], 0x6e6e8c).setOrigin(0.5));
    });

    // just under the score line, above every enemy formation
    this.toast = label(scene, GAME_W / 2, 13, '', COLORS.powerOn).setOrigin(0.5, 0);
    this.chainText = label(scene, 112, 3, '', COLORS.powerOn);
  }

  setChain(n: number): void {
    this.chainText.setText(n > 1 ? `x${n}` : '');
  }

  addScore(points: number): void {
    this.score += points;
    this.scoreText.setText(this.score.toString().padStart(6, '0'));
    if (this.score > this.hiScore) {
      this.hiScore = this.score;
      this.hiText.setText(this.hiScore.toString().padStart(6, '0'));
    }
  }

  setLives(n: number): void {
    this.lives = n;
    this.liveIcons.forEach((icon, i) => icon.setVisible(i < n));
  }

  /** demo mode: no tips or hints (and the one-time capsule tip is saved for a real player) */
  quiet = false;

  /** Kept for the sectors' existing calls; capsules now apply on pickup, so there is no cursor. */
  setPowerCursor(i: number): void {
    this.powerCursor = i;
  }

  /** Short center-screen message, e.g. the state of a toggled effect. */
  showToast(scene: Phaser.Scene, text: string, ms = 1200): void {
    this.toast.setText(text);
    this.toastUntil = scene.time.now + ms;
  }

  update(scene: Phaser.Scene): void {
    if (this.toast.text && scene.time.now > this.toastUntil) this.toast.setText('');
    // light the lamps for whatever the sector's power state has active
    const p = (scene as unknown as { power?: PowerState }).power;
    if (!p) return;
    const on: Record<string, boolean> = {
      SPD: p.speedLevel > 0,
      SPR: p.fireMode === 'spread',
      LSR: p.fireMode === 'laser',
      SHD: p.shieldHp > 0,
      OPT: p.options > 0
    };
    POWER_SLOTS.forEach((slot, k) => {
      const lit = on[slot];
      if (this.lit[k] === lit) return;
      this.lit[k] = lit;
      this.powerBoxes[k].setFillStyle(lit ? POWER_COLOR[slot] : 0x0a0a19).setStrokeStyle(1, POWER_COLOR[slot], lit ? 1 : 0.45);
      this.powerLabels[k].setColor(lit ? 0x141420 : 0x6e6e8c);
    });
  }

  private lit: boolean[] = [];
}
