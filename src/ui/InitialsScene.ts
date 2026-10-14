import Phaser from 'phaser';
import { GAME_W } from '../core/config';
import { submitScore } from '../core/save';
import { audio } from '../systems/audio';
import { Fx } from '../systems/fx';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
const FONT = 'monospace';

/**
 * Three-letter arcade initials entry after a qualifying run.
 * Keyboard: up/down cycle letter, left/right move, fire confirms.
 * Touch: tap a letter box to cycle it, tap OK to confirm. Auto-confirms after 25 s.
 */
export class InitialsScene extends Phaser.Scene {
  private score = 0;
  private wave = 1;
  private slots = [0, 0, 0];
  private cursor = 0;
  private letterTexts: Phaser.GameObjects.Text[] = [];
  private idleMs = 0;
  private done = false;

  constructor() {
    super('initials');
  }

  create(data: { score: number; wave: number }): void {
    new Fx(this);
    this.cameras.main.setBackgroundColor('#04020e');
    this.score = data.score;
    this.wave = data.wave;
    this.slots = [0, 0, 0];
    this.cursor = 0;
    this.idleMs = 0;
    this.done = false;
    this.letterTexts = [];

    const mk = (x: number, y: number, text: string, size: number, color: string) =>
      this.add
        .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, resolution: 2 })
        .setOrigin(0.5);

    mk(GAME_W / 2, 36, 'NEW HIGH SCORE', 18, '#ffd25a');
    mk(GAME_W / 2, 62, this.score.toString().padStart(6, '0'), 16, '#ffffff');
    mk(GAME_W / 2, 84, 'ENTER YOUR INITIALS', 10, '#8c96dc');

    for (let i = 0; i < 3; i++) {
      const x = GAME_W / 2 - 34 + i * 34;
      const box = this.add.rectangle(x, 122, 28, 34, 0x0a0a19).setStrokeStyle(1, 0x5ae1ff).setInteractive();
      box.on('pointerdown', () => {
        audio.unlock();
        this.cursor = i;
        this.cycle(1);
      });
      this.letterTexts.push(mk(x, 122, 'A', 22, '#ffffff'));
    }

    const ok = this.add.rectangle(GAME_W / 2, 172, 72, 20, 0x142850).setStrokeStyle(1, 0xffd25a).setInteractive();
    mk(GAME_W / 2, 172, 'OK', 12, '#ffd25a');
    ok.on('pointerdown', () => this.confirm());

    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => {
      audio.unlock();
      this.idleMs = 0;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.cycle(1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.cycle(-1);
      else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.cursor = (this.cursor + 2) % 3;
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.cursor = (this.cursor + 1) % 3;
      else if (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'Enter') this.confirm();
      else if (e.key.length === 1 && CHARS.includes(e.key.toUpperCase())) {
        this.slots[this.cursor] = CHARS.indexOf(e.key.toUpperCase());
        this.cursor = Math.min(2, this.cursor + 1);
      }
    });
  }

  private cycle(dir: number): void {
    this.slots[this.cursor] = (this.slots[this.cursor] + dir + CHARS.length) % CHARS.length;
    audio.chain(2);
  }

  private initials(): string {
    return this.slots.map((s) => CHARS[s]).join('').trimEnd().padEnd(3, 'A');
  }

  private confirm(): void {
    if (this.done) return;
    this.done = true;
    submitScore({ initials: this.initials(), score: this.score, wave: this.wave });
    audio.waveClear();
    this.cameras.main.flash(200, 255, 220, 90);
    this.time.delayedCall(600, () => this.scene.start('attract', { page: 'scores' }));
  }

  update(_t: number, delta: number): void {
    this.idleMs += delta;
    if (this.idleMs > 25000) this.confirm();
    const blink = Math.floor(this.time.now / 250) % 2 === 0;
    this.letterTexts.forEach((t, i) => {
      t.setText(CHARS[this.slots[i]] === ' ' ? '_' : CHARS[this.slots[i]]);
      t.setColor(i === this.cursor ? (blink ? '#ffd25a' : '#ffffff') : '#ffffff');
    });
  }
}
