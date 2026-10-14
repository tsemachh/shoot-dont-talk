import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../core/config';
import { BAR_TOP } from './toggles';
import { ptext, PText } from './pixelFont';

/**
 * Fixed on-screen controller for touch devices: a joystick whose base never
 * moves (left thumb) and round action buttons (right thumb). Multi-touch, so
 * steering and jumping/firing work at the same time. Hidden on non-touch
 * devices and in demo mode. Sampled once per fixed tick via read().
 */
export interface PadButton {
  id: string;
  label: string;
  x: number;
  y: number;
  r: number;
  color: number;
}

export interface PadState {
  x: number; // -1..1
  y: number; // -1..1 (up is negative)
  buttons: Record<string, boolean>;
  active: boolean; // any pad touch this tick
}

export class TouchPad {
  readonly enabled: boolean;
  private g!: Phaser.GameObjects.Graphics;
  private labels: PText[] = [];
  private stickId = -1;
  private state: PadState = { x: 0, y: 0, buttons: {}, active: false };

  constructor(
    private scene: Phaser.Scene,
    private stick: { x: number; y: number; r: number },
    private buttons: PadButton[],
    opts: { demo?: boolean; alpha?: number } = {}
  ) {
    this.enabled = scene.sys.game.device.input.touch && !opts.demo;
    if (!this.enabled) return;
    const a = opts.alpha ?? 1;
    this.g = scene.add.graphics().setDepth(110).setScrollFactor(0).setAlpha(a);
    for (const b of buttons) {
      this.labels.push(ptext(scene, b.x, b.y - 3, b.label, 1, '#ffffff').setOrigin(0.5, 0).setDepth(111).setAlpha(0.8 * a));
      this.state.buttons[b.id] = false;
    }
    this.draw();
  }

  read(): PadState {
    const s = this.state;
    s.x = 0;
    s.y = 0;
    s.active = false;
    for (const b of this.buttons) s.buttons[b.id] = false;
    if (!this.enabled) return s;

    const ptrs = [this.scene.input.pointer1, this.scene.input.pointer2].filter(
      (p) => p && p.isDown && p.worldY < BAR_TOP
    );
    let stickPtr: Phaser.Input.Pointer | null = null;
    for (const p of ptrs) {
      if (p.id === this.stickId) stickPtr = p;
      else if (p.worldX < GAME_W * 0.45) {
        if (this.stickId < 0) {
          this.stickId = p.id;
          stickPtr = p;
        }
      } else {
        // right side: the nearest button wins, so the hit zones are generous
        let best: PadButton | null = null;
        let bd = Infinity;
        for (const b of this.buttons) {
          const d = Phaser.Math.Distance.Between(p.worldX, p.worldY, b.x, b.y);
          if (d < bd) {
            bd = d;
            best = b;
          }
        }
        if (best) s.buttons[best.id] = true;
      }
      s.active = true;
    }
    if (!stickPtr) this.stickId = -1;
    else {
      // fixed base: the input is the thumb's offset from the base centre
      const dx = (stickPtr.worldX - this.stick.x) / this.stick.r;
      const dy = (stickPtr.worldY - this.stick.y) / this.stick.r;
      const m = Math.hypot(dx, dy);
      const k = m > 1 ? 1 / m : 1;
      s.x = Math.abs(dx * k) < 0.25 ? 0 : dx * k;
      s.y = Math.abs(dy * k) < 0.25 ? 0 : dy * k;
    }
    this.draw();
    return s;
  }

  private draw(): void {
    const g = this.g;
    const { x, y, r } = this.stick;
    g.clear();
    // stick: base ring, direction ticks, knob
    g.fillStyle(0x0a0a19, 0.35).fillCircle(x, y, r + 4);
    g.lineStyle(1, 0x8c96dc, 0.55).strokeCircle(x, y, r + 4);
    g.fillStyle(0x8c96dc, 0.5);
    g.fillTriangle(x - r, y, x - r + 4, y - 3, x - r + 4, y + 3);
    g.fillTriangle(x + r, y, x + r - 4, y - 3, x + r - 4, y + 3);
    g.fillTriangle(x, y - r, x - 3, y - r + 4, x + 3, y - r + 4);
    const kx = x + this.state.x * r;
    const ky = y + this.state.y * r;
    g.fillStyle(0x5ae1ff, this.stickId >= 0 ? 0.7 : 0.4).fillCircle(kx, ky, 8);
    g.lineStyle(1, 0xffffff, 0.6).strokeCircle(kx, ky, 8);
    // buttons
    for (const b of this.buttons) {
      const on = this.state.buttons[b.id];
      g.fillStyle(b.color, on ? 0.75 : 0.3).fillCircle(b.x, b.y, b.r);
      g.lineStyle(1, b.color, on ? 1 : 0.8).strokeCircle(b.x, b.y, b.r);
    }
  }
}

/**
 * The one controller every world uses on touch: stick on the left (fixed base),
 * FIRE on the right; Lunar Run adds JUMP. Same place in every world.
 */
export function standardPad(
  scene: Phaser.Scene,
  opts: { demo?: boolean; jump?: boolean; low?: boolean } = {}
): TouchPad {
  // low: worlds whose ship flies along the bottom edge (Invasion, Swarm) - controls sit at the
  // ship's level, half transparent, so the play field above stays clear
  if (opts.low) {
    const y = GAME_H - 34;
    return new TouchPad(
      scene,
      { x: 30, y, r: 18 },
      [{ id: 'fire', label: 'FIRE', x: GAME_W - 30, y, r: 17, color: 0xff46c8 }],
      { demo: opts.demo, alpha: 0.5 }
    );
  }
  const buttons: PadButton[] = opts.jump
    ? [
        { id: 'jump', label: 'JUMP', x: GAME_W - 30, y: 142, r: 18, color: 0x7cff8a },
        { id: 'fire', label: 'FIRE', x: GAME_W - 72, y: 118, r: 14, color: 0xff46c8 }
      ]
    : [{ id: 'fire', label: 'FIRE', x: GAME_W - 32, y: 136, r: 18, color: 0xff46c8 }];
  return new TouchPad(scene, { x: 32, y: 128, r: 20 }, buttons, { demo: opts.demo });
}
