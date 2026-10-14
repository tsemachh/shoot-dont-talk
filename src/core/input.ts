import Phaser from 'phaser';
import { GAME_H } from './config';
import type { TouchPad } from '../ui/touchpad';

/**
 * Unified input snapshot: keyboard (arrows + WASD), gamepad, and touch.
 * Touch: drag anywhere to steer toward the pointer; holding the screen fires.
 * Sampled once per fixed tick so gameplay stays deterministic for a given input stream.
 */
export interface InputState {
  x: number; // -1..1
  y: number; // -1..1
  fire: boolean;
}

export class InputMap {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private fireKeys: Phaser.Input.Keyboard.Key[];
  private scene: Phaser.Scene;
  /** false = the scene runs its own touch scheme (Canyon two-thumb pad) */
  followTouch = true;
  private pad: TouchPad | null = null;

  /** Use the fixed on-screen controller (touch devices): replaces follow-the-finger. */
  attachPad(pad: TouchPad): void {
    if (!pad.enabled) return;
    this.pad = pad;
    this.followTouch = false;
  }

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const kb = scene.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as InputMap['wasd'];
    this.fireKeys = [
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
    ];
  }

  /** targetX/targetY: current ship position, used to steer toward the touch point. */
  read(targetX: number, targetY: number): InputState {
    let x = 0;
    let y = 0;
    let fire = false;

    if (this.cursors.left.isDown || this.wasd.A.isDown) x -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) x += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) y -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) y += 1;
    if (this.fireKeys.some((k) => k.isDown)) fire = true;

    const pad = this.scene.input.gamepad?.getPad(0);
    if (pad) {
      const ax = pad.axes.length > 0 ? pad.axes[0].getValue() : 0;
      const ay = pad.axes.length > 1 ? pad.axes[1].getValue() : 0;
      if (Math.abs(ax) > 0.2) x = ax;
      if (Math.abs(ay) > 0.2) y = ay;
      if (pad.A || pad.R2) fire = true;
    }

    const pointer = this.scene.input.activePointer;
    // taps on the bottom HUD strip (toggle buttons, power bar) are not steering
    if (this.followTouch && pointer.isDown && pointer.wasTouch && pointer.worldY < GAME_H - 13) {
      const dx = pointer.worldX - targetX;
      const dy = pointer.worldY - targetY;
      x = Math.abs(dx) < 3 ? 0 : Phaser.Math.Clamp(dx / 24, -1, 1);
      y = Math.abs(dy) < 3 ? 0 : Phaser.Math.Clamp(dy / 24, -1, 1);
      fire = true;
    }

    if (this.pad) {
      const p = this.pad.read();
      if (p.active) {
        if (p.x) x = p.x;
        if (p.y) y = p.y;
        if (p.buttons.jump) y = -1;
        if (p.buttons.fire) fire = true;
      }
    }

    return { x, y, fire };
  }
}
