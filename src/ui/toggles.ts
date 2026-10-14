import Phaser from 'phaser';
import { GAME_H } from '../core/config';
import { settings, saveSettings } from '../core/settings';
import { audio } from '../systems/audio';
import { music } from '../systems/music';
import { ptext, PText } from './pixelFont';

/** Height of the bottom HUD strip; touch steering ignores taps inside it. */
export const BAR_TOP = GAME_H - 13;

interface FxLike {
  toggleBloom(): boolean;
  toggleCrt(): boolean;
}

interface Btn {
  key: 'B' | 'C' | 'M' | 'N';
  label: string;
  box: Phaser.GameObjects.Rectangle;
  keyText: PText;
  text: PText;
  get: () => boolean;
  toggle: () => void;
}

/**
 * On-screen toggle buttons for every setting, shown in every scene's bottom
 * strip: the key letter is highlighted for keyboard players, and the whole
 * button is a tap target on phones. Keyboard B / C / M / N do the same thing.
 * State is saved, so it carries across sectors and reloads.
 */
/** The bar of each scene, so other helpers (demo mode) can hide it. */
export const barOf = new WeakMap<Phaser.Scene, ToggleBar>();

export class ToggleBar {
  private btns: Btn[] = [];
  private parts: { alpha: number; setAlpha(a: number): unknown; setVisible(v: boolean): unknown }[] = [];
  private dimAt = 0;

  constructor(scene: Phaser.Scene, fx: FxLike) {
    const defs: Omit<Btn, 'box' | 'keyText' | 'text'>[] = [
      { key: 'B', label: 'GLOW', get: () => settings.bloom, toggle: () => fx.toggleBloom() },
      { key: 'C', label: 'CRT', get: () => settings.crt, toggle: () => fx.toggleCrt() },
      {
        key: 'M',
        label: 'SND',
        get: () => settings.sound,
        toggle: () => {
          audio.unlock();
          settings.sound = !audio.toggleMute();
          saveSettings();
        }
      },
      {
        key: 'N',
        label: 'MUS',
        get: () => settings.music,
        toggle: () => {
          audio.unlock();
          settings.music = music.toggle();
          saveSettings();
        }
      }
    ];

    const gap = 3;
    const y = GAME_H - 6;
    let x = 38;
    defs.forEach((d) => {
      const w = 13 + d.label.length * 6; // fits "K LABEL" snugly
      const box = scene.add
        .rectangle(x + w / 2, y, w, 11, 0x0a0a19)
        .setDepth(100)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      const keyText = ptext(scene, x + 3, y - 3, d.key, 1, '#ffd25a').setDepth(101).setScrollFactor(0);
      const text = ptext(scene, x + 11, y - 3, d.label, 1, '#ffffff').setDepth(101).setScrollFactor(0);
      const btn: Btn = { ...d, box, keyText, text };
      this.parts.push(box, keyText, text);
      box.on(
        'pointerdown',
        (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation(); // don't also start the game / fire / steer
          btn.toggle();
          this.refresh();
        }
      );
      this.btns.push(btn);
      x += w + gap;
    });

    // HOME: back to the title. Two-step (tap, then tap again within 2.5 s) so a stray tap never ends a run.
    const key = scene.sys.settings.key;
    if (key !== 'attract' && key !== 'initials') {
      this.addHome(scene, x, y);
      // in play the bar steps back (as in the preview video) and lights up again when touched
      this.wake(scene, 4000);
      scene.events.on('update', () => {
        const a = scene.time.now < this.dimAt ? 1 : 0.35;
        if (this.parts[0].alpha !== a) for (const o of this.parts) o.setAlpha(a);
      });
      scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.worldY >= BAR_TOP - 4) this.wake(scene);
      });
    }
    barOf.set(scene, this);

    const kb = scene.input.keyboard;
    for (const b of this.btns) {
      kb?.on(`keydown-${b.key}`, () => {
        this.wake(scene);
        b.toggle();
        this.refresh();
      });
    }
    this.refresh();
  }

  private wake(scene: Phaser.Scene, ms = 3000): void {
    this.dimAt = scene.time.now + ms;
  }

  setVisible(v: boolean): void {
    for (const o of this.parts) o.setVisible(v);
  }

  private addHome(scene: Phaser.Scene, x: number, y: number): void {
    const w = 15;
    const box = scene.add
      .rectangle(x + w / 2, y, w, 11, 0x0a0a19)
      .setStrokeStyle(1, 0xff46c8, 0.9)
      .setDepth(100)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    // pixel house icon
    const g = scene.add.graphics().setDepth(101).setScrollFactor(0);
    this.parts.push(box, g);
    const cx = Math.round(x + w / 2);
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(cx - 5, y, cx + 5, y, cx, y - 5);
    g.fillRect(cx - 3, y, 7, 4);
    g.fillStyle(0x0a0a19, 1).fillRect(cx - 1, y + 1, 2, 3);
    const ask = ptext(scene, 38, GAME_H - 19, 'TAP HOME AGAIN TO QUIT', 1, '#ff46c8')
      .setDepth(101)
      .setScrollFactor(0)
      .setVisible(false);
    let armedUntil = 0;
    const press = (): void => {
      const now = scene.time.now;
      if (now < armedUntil) {
        scene.sound?.stopAll?.();
        scene.scene.start('attract');
        return;
      }
      armedUntil = now + 2500;
      ask.setText(scene.input.keyboard && !scene.sys.game.device.input.touch ? 'ESC AGAIN TO QUIT' : 'TAP HOME AGAIN TO QUIT').setVisible(true);
      box.setFillStyle(0x4a0e3c);
      scene.time.delayedCall(2500, () => {
        if (scene.time.now >= armedUntil) {
          ask.setVisible(false);
          box.setFillStyle(0x0a0a19);
        }
      });
    };
    box.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      press();
    });
    scene.input.keyboard?.on('keydown-ESC', press);
  }

  private refresh(): void {
    for (const b of this.btns) {
      const on = b.get();
      b.box.setFillStyle(on ? 0x142850 : 0x0a0a19).setStrokeStyle(1, on ? 0x5ae1ff : 0x3c3c5a);
      b.keyText.setColor(on ? '#ffd25a' : '#8a7a40');
      b.text.setColor(on ? '#ffffff' : '#6e6e8c');
      b.text.setAlpha(on ? 1 : 0.85);
    }
  }
}
