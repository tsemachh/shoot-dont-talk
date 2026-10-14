import Phaser from 'phaser';
import { COLORS, GAME_W, GAME_H, POWER_SLOTS } from '../core/config';

import { ptext, PText } from './pixelFont';

function label(scene: Phaser.Scene, x: number, y: number, text: string, color: number): PText {
  return ptext(scene, x, y, text, 1, color).setDepth(100).setScrollFactor(0);
}

/** Arcade HUD: score, hi-score, lives, Gradius-style power bar. */
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

    POWER_SLOTS.forEach((name, i) => {
      const x = GAME_W - 160 + i * 31;
      this.powerBoxes.push(
        scene.add
          .rectangle(x, GAME_H - 6, 28, 10, 0x0a0a19)
          .setStrokeStyle(1, 0x3c3c78)
          .setDepth(100)
          .setScrollFactor(0)
      );
      this.powerLabels.push(label(scene, x, GAME_H - 6, name, 0x6e8cff).setOrigin(0.5));
    });

    this.toast = label(scene, GAME_W / 2, 24, '', COLORS.powerOn).setOrigin(0.5, 0);
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

  setPowerCursor(i: number): void {
    this.powerCursor = i;
    this.powerBoxes.forEach((box, k) => {
      const on = k === i;
      box.setFillStyle(on ? COLORS.powerOn : 0x0a0a19);
      this.powerLabels[k].setColor(on ? 0x141420 : 0x6e8cff);
    });
  }

  /** Short center-screen message, e.g. the state of a toggled effect. */
  showToast(scene: Phaser.Scene, text: string): void {
    this.toast.setText(text);
    this.toastUntil = scene.time.now + 1200;
  }

  update(scene: Phaser.Scene): void {
    if (this.toast.text && scene.time.now > this.toastUntil) this.toast.setText('');
  }
}
