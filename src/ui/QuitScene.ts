import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../core/config';
import { ptext } from './pixelFont';

/**
 * "Quit to title?" overlay. The game scene underneath is paused while it is open.
 * Big centred YES / NO buttons, so leaving a run never depends on hitting a tiny
 * target near the screen edge twice. Keys: Esc / Enter / Y = yes, N = no.
 */
export class QuitScene extends Phaser.Scene {
  private from = '';
  private done = false;

  constructor() {
    super('quit');
  }

  create(data: { from: string }): void {
    this.from = data.from;
    this.done = false;
    const cx = GAME_W / 2;
    const cy = GAME_H / 2 - 6;
    // dim everything and swallow taps outside the buttons
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x04020e, 0.72).setOrigin(0, 0).setInteractive();
    this.add.rectangle(cx, cy, 190, 86, 0x0a0a19, 0.96).setStrokeStyle(1, 0xff46c8, 0.9);
    ptext(this, cx, cy - 34, 'QUIT TO TITLE?', 2, '#ff46c8').setOrigin(0.5, 0);
    ptext(this, cx, cy - 14, 'THIS RUN WILL END', 1, '#8c96dc').setOrigin(0.5, 0);
    this.button(cx - 44, cy + 20, 'YES', 0xff46c8, () => this.yes());
    this.button(cx + 44, cy + 20, 'NO', 0x5ae1ff, () => this.no());

    const kb = this.input.keyboard!;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'KeyY') this.yes();
      else if (e.code === 'KeyN' || e.code === 'Backspace') this.no();
    });
  }

  private button(x: number, y: number, label: string, color: number, fn: () => void): void {
    const box = this.add.rectangle(x, y, 70, 26, color, 0.25).setStrokeStyle(1, color, 1).setInteractive({ useHandCursor: true });
    ptext(this, x, y - 5, label, 2, '#ffffff').setOrigin(0.5, 0);
    box.on('pointerover', () => box.setFillStyle(color, 0.5));
    box.on('pointerout', () => box.setFillStyle(color, 0.25));
    box.on('pointerdown', fn);
  }

  private yes(): void {
    if (this.done) return;
    this.done = true;
    this.scene.stop(this.from);
    this.scene.start('attract');
  }

  private no(): void {
    if (this.done) return;
    this.done = true;
    this.scene.resume(this.from);
    this.scene.stop();
  }
}
