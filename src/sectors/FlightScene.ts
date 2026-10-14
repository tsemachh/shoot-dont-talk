import Phaser from 'phaser';
import { GAME_W, GAME_H, STEP_MS, POWER_SLOTS } from '../core/config';
import { InputMap } from '../core/input';
import { Fx } from '../systems/fx';
import { makeTextures } from '../systems/textures';
import { Hud } from '../ui/hud';
import tuning from '../data/tuning.json';

interface Star {
  img: Phaser.GameObjects.Image;
  speed: number;
}

/**
 * M0 flight scene: starfield + flyable ship + pooled bullets, under the
 * shared effects pipeline. Sector scenes (Invasion, Swarm, ...) will follow
 * the same skeleton: fixed-timestep tick(), pooled projectiles, Fx + Hud.
 */
export class FlightScene extends Phaser.Scene {
  private inputMap!: InputMap;
  private fx!: Fx;
  private hud!: Hud;

  private ship!: Phaser.GameObjects.Image;
  private flame!: Phaser.GameObjects.Image;
  private bullets!: Phaser.GameObjects.Group;
  private stars: Star[] = [];

  private accumulator = 0;
  private fireCooldown = 0;
  private powerTimer = 0;
  private fpsText!: Phaser.GameObjects.Text;

  constructor() {
    super('flight');
  }

  create(): void {
    makeTextures(this);
    this.cameras.main.setBackgroundColor('#04020e');

    // starfield: 3 parallax layers
    const r = new Phaser.Math.RandomDataGenerator(['m0']);
    const { count, layerSpeeds } = tuning.stars;
    for (let i = 0; i < count; i++) {
      const layer = i % 3;
      const img = this.add
        .image(r.between(0, GAME_W), r.between(0, GAME_H), 'star')
        .setAlpha(0.25 + layer * 0.3);
      this.stars.push({ img, speed: layerSpeeds[layer] });
    }

    this.ship = this.add.image(GAME_W / 2, GAME_H - 40, 'ship').setDepth(10);
    this.flame = this.add.image(this.ship.x, this.ship.y + 6, 'flame').setDepth(9);

    this.bullets = this.add.group({ defaultKey: 'bullet', maxSize: 64 });

    this.inputMap = new InputMap(this);
    this.fx = new Fx(this);
    this.hud = new Hud(this);
    this.hud.setLives(3);
    this.hud.setPowerCursor(-1);

    this.fpsText = this.add
      .text(GAME_W - 4, GAME_H - 22, '', { fontFamily: 'monospace', fontSize: '8px', color: '#55608c', resolution: 2 })
      .setOrigin(1, 0)
      .setDepth(100);

    const kb = this.input.keyboard!;
    kb.on('keydown-B', () => this.hud.showToast(this, `BLOOM ${this.fx.toggleBloom() ? 'ON' : 'OFF'}`));
    kb.on('keydown-C', () => this.hud.showToast(this, `CRT ${this.fx.toggleCrt() ? 'ON' : 'OFF'}`));
  }

  update(_time: number, delta: number): void {
    // fixed 60 Hz logic; rendering runs at display refresh
    this.accumulator += Math.min(delta, 100);
    while (this.accumulator >= STEP_MS) {
      this.tick(STEP_MS / 1000);
      this.accumulator -= STEP_MS;
    }
    this.hud.update(this);
    this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} FPS`);
  }

  private tick(dt: number): void {
    const input = this.inputMap.read(this.ship.x, this.ship.y);

    // ship
    this.ship.x = Phaser.Math.Clamp(this.ship.x + input.x * tuning.player.speedX * dt, 8, GAME_W - 8);
    this.ship.y = Phaser.Math.Clamp(this.ship.y + input.y * tuning.player.speedY * dt, 60, GAME_H - 18);
    this.flame.setPosition(this.ship.x, this.ship.y + 6);
    this.flame.setVisible(Math.random() > 0.2).setScale(1, Math.random() > 0.5 ? 1 : 1.6);

    // fire
    this.fireCooldown -= dt * 1000;
    if (input.fire && this.fireCooldown <= 0) {
      this.fireCooldown = tuning.player.fireCooldownMs;
      const b = this.bullets.get(this.ship.x, this.ship.y - 7) as Phaser.GameObjects.Image | null;
      if (b) {
        b.setActive(true).setVisible(true).setDepth(8);
        this.hud.addScore(10);
      }
    }

    // bullets
    for (const obj of this.bullets.getChildren()) {
      const b = obj as Phaser.GameObjects.Image;
      if (!b.active) continue;
      b.y -= tuning.player.bulletSpeed * dt;
      if (b.y < -6) this.bullets.killAndHide(b);
    }

    // stars scroll down; wrap
    for (const s of this.stars) {
      s.img.y += s.speed * dt;
      if (s.img.y > GAME_H) {
        s.img.y -= GAME_H;
        s.img.x = Math.random() * GAME_W;
      }
    }

    // demo: cycle the power bar so M0 shows it alive
    this.powerTimer += dt;
    if (this.powerTimer > 1.4) {
      this.powerTimer = 0;
      this.hud.setPowerCursor((this.hud.powerCursor + 1) % POWER_SLOTS.length);
    }
  }
}
