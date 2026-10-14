import Phaser from 'phaser';
import { COLORS, GAME_W, GAME_H, POWER_SLOTS } from '../core/config';

import { ptext, PText } from './pixelFont';

function label(scene: Phaser.Scene, x: number, y: number, text: string, color: number): PText {
  return ptext(scene, x, y, text, 1, color).setDepth(100).setScrollFactor(0);
}

const POWER_NAMES: Record<string, string> = {
  SPD: 'SPEED UP',
  SPR: 'SPREAD SHOT',
  LSR: 'LASER',
  SHD: 'SHIELD',
  OPT: 'OPTION DRONE'
};

/** Shown once per session, the first time a capsule lights up the power bar. */
let capsuleTaught = false;

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
  private scene: Phaser.Scene;
  private powerHint: PText;
  private xKey: PText;
  /** Set by the sector: what the X button does (activate the highlighted power slot). */
  onActivate?: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
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

    // X button: activates the highlighted power slot (also tappable)
    const xBox = scene.add
      .rectangle(GAME_W - 180, GAME_H - 6, 9, 11, 0x0a0a19)
      .setStrokeStyle(1, 0xffd25a)
      .setDepth(100)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.xKey = label(scene, GAME_W - 180, GAME_H - 6, 'X', 0xffd25a).setOrigin(0.5);
    xBox.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.onActivate?.();
    });
    // keyboard: event-driven so even a very quick tap is never missed
    // (an already-used slot makes a second trigger a harmless no-op)
    scene.input.keyboard?.on('keydown-X', () => this.onActivate?.());
    scene.input.keyboard?.on('keydown-SHIFT', () => this.onActivate?.());
    // hint above the power bar, e.g. "PRESS X: SPREAD SHOT"
    this.powerHint = label(scene, GAME_W - 4, GAME_H - 19, '', COLORS.powerOn).setOrigin(1, 0);

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

  setPowerCursor(i: number): void {
    if (i >= 0 && !capsuleTaught) {
      capsuleTaught = true;
      this.showToast(this.scene, 'POWER CAPSULE! PRESS X OR TAP THE BAR TO USE IT', 3200);
    }
    this.powerCursor = i;
    this.powerHint.setText(i >= 0 ? `PRESS X: ${POWER_NAMES[POWER_SLOTS[i]]}` : '');
    this.powerBoxes.forEach((box, k) => {
      const on = k === i;
      box.setFillStyle(on ? COLORS.powerOn : 0x0a0a19);
      this.powerLabels[k].setColor(on ? 0x141420 : 0x6e8cff);
    });
  }

  /** Short center-screen message, e.g. the state of a toggled effect. */
  showToast(scene: Phaser.Scene, text: string, ms = 1200): void {
    this.toast.setText(text);
    this.toastUntil = scene.time.now + ms;
  }

  update(scene: Phaser.Scene): void {
    if (this.toast.text && scene.time.now > this.toastUntil) this.toast.setText('');
    // a ready power-up blinks its hint and the X key
    const blink = this.powerCursor >= 0 && Math.floor(scene.time.now / 300) % 2 === 0;
    this.powerHint.setVisible(this.powerCursor >= 0 && blink);
    this.xKey.setColor(this.powerCursor >= 0 && blink ? 0xffffff : 0xffd25a);
  }
}
