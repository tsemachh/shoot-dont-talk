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
export class ToggleBar {
  private btns: Btn[] = [];

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

    const w = 38;
    const gap = 3;
    const y = GAME_H - 6;
    defs.forEach((d, i) => {
      const x = 38 + i * (w + gap);
      const box = scene.add
        .rectangle(x + w / 2, y, w, 11, 0x0a0a19)
        .setDepth(100)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      const keyText = ptext(scene, x + 3, y - 3, d.key, 1, '#ffd25a').setDepth(101).setScrollFactor(0);
      const text = ptext(scene, x + 11, y - 3, d.label, 1, '#ffffff').setDepth(101).setScrollFactor(0);
      const btn: Btn = { ...d, box, keyText, text };
      box.on(
        'pointerdown',
        (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation(); // don't also start the game / fire / steer
          btn.toggle();
          this.refresh();
        }
      );
      this.btns.push(btn);
    });

    const kb = scene.input.keyboard;
    for (const b of this.btns) {
      kb?.on(`keydown-${b.key}`, () => {
        b.toggle();
        this.refresh();
      });
    }
    this.refresh();
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
