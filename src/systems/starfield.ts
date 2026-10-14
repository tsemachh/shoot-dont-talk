import Phaser from 'phaser';
import { GAME_W, GAME_H } from '../core/config';

/**
 * Falling starfield from the preview video: three depth layers, the near layer
 * drawn as short vertical streaks, every star twinkling. Purely visual, so it
 * runs on the render update (not the fixed gameplay tick).
 */
export class StreakField {
  private stars: { img: Phaser.GameObjects.Image; z: number; ph: number }[] = [];
  private f = 0;
  /** pixels per 60 Hz frame for the nearest layer */
  speed: number;

  constructor(scene: Phaser.Scene, opts: { count?: number; seed?: string; speed?: number; depth?: number; tint?: number } = {}) {
    const r = new Phaser.Math.RandomDataGenerator([opts.seed ?? 'stars']);
    this.speed = opts.speed ?? 1.6;
    const n = opts.count ?? 150;
    for (let i = 0; i < n; i++) {
      const z = r.pick([0.25, 0.6, 1.3]);
      const img = scene.add
        .image(r.between(0, GAME_W), r.between(0, GAME_H), 'star')
        .setOrigin(0.5, 1)
        .setDepth(opts.depth ?? -10)
        .setTint(opts.tint ?? 0xc8d2ff);
      this.stars.push({ img, z, ph: r.realInRange(0, 6.28) });
    }
    const onUpdate = (_t: number, dt: number): void => this.step(Math.min(dt, 50) / (1000 / 60));
    scene.events.on('update', onUpdate);
    scene.events.once('shutdown', () => scene.events.off('update', onUpdate));
  }

  private step(k: number): void {
    this.f += k;
    const streak = Math.max(1, Math.round(this.speed * 2));
    for (const s of this.stars) {
      s.img.y += this.speed * s.z * k;
      if (s.img.y > GAME_H + 6) {
        s.img.y -= GAME_H + 12;
        s.img.x = Math.random() * GAME_W;
      }
      const b = (s.z / 1.3) * (0.65 + 0.35 * Math.sin(this.f * 0.15 + s.ph));
      s.img.setAlpha(b).setScale(1, s.z > 1 ? streak : 1);
    }
  }
}
