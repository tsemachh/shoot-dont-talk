import Phaser from 'phaser';
import { GAME_W, GAME_H, STEP_MS } from '../core/config';
import { makeTextures } from '../systems/textures';
import { audio } from '../systems/audio';
import { Fx } from '../systems/fx';
import type { PowerState } from '../systems/powerups';

export interface SectorCarry {
  score: number;
  lives: number;
  power?: PowerState;
  waveBase: number;
}

interface Streak {
  img: Phaser.GameObjects.Image;
  speed: number;
}

const DURATION = 230; // frames

/**
 * In-world sector jump: the ship punches through the starfield from one
 * game-world to the next (Plan 2's signature transition). Stars stretch into
 * hyperspace streaks, the hull re-tunes for the next sector, then we arrive.
 */
export class JumpScene extends Phaser.Scene {
  private carry!: SectorCarry;
  private to = 'swarm';
  private streaks: Streak[] = [];
  private ship!: Phaser.GameObjects.Image;
  private flame!: Phaser.GameObjects.Image;
  private title!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private frame = 0;
  private accumulator = 0;

  constructor() {
    super('jump');
  }

  create(data: Partial<SectorCarry> & { to?: string }): void {
    this.to = data.to ?? 'swarm';
    this.carry = {
      score: data.score ?? 0,
      lives: data.lives ?? 3,
      power: data.power,
      waveBase: data.waveBase ?? 2
    };
    this.frame = 0;
    this.accumulator = 0;
    this.streaks = [];
    makeTextures(this);
    new Fx(this);
    this.cameras.main.setBackgroundColor('#020108');

    for (let i = 0; i < 70; i++) {
      const img = this.add
        .image(Phaser.Math.Between(0, GAME_W), Phaser.Math.Between(-GAME_H, GAME_H), 'star')
        .setAlpha(Phaser.Math.FloatBetween(0.2, 0.9));
      this.streaks.push({ img, speed: Phaser.Math.FloatBetween(2, 7) });
    }

    this.ship = this.add.image(GAME_W / 2, GAME_H - 46, 'ship').setDepth(10);
    this.flame = this.add.image(this.ship.x, this.ship.y + 7, 'flame').setDepth(9).setScale(1, 2);

    const mk = (y: number, text: string, size: number, color: string) =>
      this.add
        .text(GAME_W / 2, y, text, {
          fontFamily: 'monospace',
          fontSize: `${size}px`,
          fontStyle: 'bold',
          color,
          resolution: 2
        })
        .setOrigin(0.5)
        .setDepth(20);

    this.title = mk(78, 'SECTOR CLEAR', 16, '#5aff82');
    this.sub = mk(100, '', 9, '#8c96dc');
    audio.jump();
  }

  update(_t: number, delta: number): void {
    this.accumulator += Math.min(delta, 100);
    while (this.accumulator >= STEP_MS) {
      this.tick();
      this.accumulator -= STEP_MS;
    }
  }

  private tick(): void {
    this.frame++;
    const f = this.frame;
    const boost = Phaser.Math.Clamp((f - 20) / 60, 0, 1); // 0 → 1 as we accelerate

    for (const s of this.streaks) {
      s.img.y += s.speed * (1 + boost * 5);
      s.img.setScale(1, 1 + boost * s.speed * 2.2);
      s.img.setAlpha(Math.min(1, 0.25 + boost * 0.75));
      if (s.img.y > GAME_H + 20) {
        s.img.y = -20;
        s.img.x = Phaser.Math.Between(0, GAME_W);
      }
    }

    // ship rises to center, shudders at full speed
    this.ship.y += (GAME_H / 2 + 18 - this.ship.y) * 0.03;
    this.ship.x = GAME_W / 2 + (boost >= 1 ? Math.sin(f * 0.9) * 1.2 : 0);
    this.flame.setPosition(this.ship.x, this.ship.y + 7);
    this.flame.setScale(1, 2 + boost * 2 + (Math.random() > 0.5 ? 0.6 : 0));

    if (f === 90) {
      this.title.setText('HYPERSPACE JUMP');
      this.sub.setText('HULL RE-TUNING FOR SWARM SPACE');
    }
    // hull morph flashes as the ship re-forms for the next game-world
    if (f > 120 && f < 180) {
      this.ship.setTint(f % 10 < 5 ? 0xffd25a : 0xffffff);
      if (f % 14 === 0) this.cameras.main.flash(90, 90, 60, 160);
    }
    if (f === 180) {
      this.ship.clearTint();
      this.title.setText('ENTERING SECTOR 2');
      this.sub.setText('THE SWARM');
      this.title.setColor('#ffd25a');
    }
    if (f >= DURATION) {
      this.scene.start(this.to, this.carry);
    }
  }
}
