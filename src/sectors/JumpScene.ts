import Phaser from 'phaser';
import { GAME_W, GAME_H, STEP_MS } from '../core/config';
import { makeTextures, makeLunarTextures } from '../systems/textures';
import { audio } from '../systems/audio';
import { music } from '../systems/music';
import { Fx } from '../systems/fx';
import { ptext, PText } from '../ui/pixelFont';
import type { PowerState } from '../systems/powerups';

export interface SectorCarry {
  score: number;
  lives: number;
  power?: PowerState;
  waveBase: number;
  /** 1 on the first pass through all sectors, 2+ after Canyon River loops back. */
  loop?: number;
}

interface Streak {
  img: Phaser.GameObjects.Image;
  speed: number;
}

const DURATION = 230; // frames

/** Where each jump lands: sector number, arrival title, hull re-tune line. */
/**
 * Where each jump lands, and which craft turns into which: every game-world
 * has its own ship, and the jump visibly rebuilds one into the next.
 */
const DEST: Record<
  string,
  { sector: number; name: string; tune: string; landing: boolean; fromKey: string; toKey: string }
> = {
  swarm: { sector: 2, name: 'THE SWARM', tune: 'CANNON RE-FORMING - STAR FIGHTER', landing: false, fromKey: 'ship-inv', toKey: 'ship-swarm' },
  lunar: { sector: 3, name: 'LUNAR RUN', tune: 'FIGHTER RE-FORMING - MOON ROVER', landing: true, fromKey: 'ship-swarm', toKey: 'rover' },
  warp: { sector: 4, name: 'WARP RING', tune: 'ROVER RE-FORMING - WARP FIGHTER', landing: false, fromKey: 'rover', toKey: 'ship-warp' },
  canyon: { sector: 5, name: 'CANYON RIVER', tune: 'FIGHTER RE-FORMING - RIVER JET', landing: false, fromKey: 'ship-warp', toKey: 'ship-jet' },
  invasion: { sector: 1, name: 'INVASION GRID - NEXT LOOP', tune: 'JET RE-FORMING - LASER CANNON', landing: false, fromKey: 'ship-jet', toKey: 'ship-inv' }
};

const MORPH_AT = 120; // frame the old craft breaks apart
const MORPH_FRAMES = 52; // pixels in flight

interface Px {
  x: number;
  y: number;
  color: number;
}

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
  private title!: PText;
  private sub!: PText;
  private frame = 0;
  private accumulator = 0;
  private surface?: Phaser.GameObjects.Rectangle;
  private morphing = false;

  constructor() {
    super('jump');
  }

  create(data: Partial<SectorCarry> & { to?: string }): void {
    this.to = data.to ?? 'swarm';
    this.carry = {
      score: data.score ?? 0,
      lives: data.lives ?? 3,
      power: data.power,
      waveBase: data.waveBase ?? 2,
      loop: data.loop ?? 1
    };
    this.frame = 0;
    this.accumulator = 0;
    this.streaks = [];
    makeTextures(this);
    makeLunarTextures(this);
    this.surface = undefined;
    this.morphing = false;
    new Fx(this);
    this.cameras.main.setBackgroundColor('#020108');

    for (let i = 0; i < 70; i++) {
      const img = this.add
        .image(Phaser.Math.Between(0, GAME_W), Phaser.Math.Between(-GAME_H, GAME_H), 'star')
        .setAlpha(Phaser.Math.FloatBetween(0.2, 0.9));
      this.streaks.push({ img, speed: Phaser.Math.FloatBetween(2, 7) });
    }

    const d0 = DEST[this.to] ?? DEST.swarm;
    this.ship = this.add.image(GAME_W / 2, GAME_H - 46, d0.fromKey).setDepth(10);
    this.flame = this.add.image(this.ship.x, this.ship.y + 7, 'flame').setDepth(9).setScale(1, 2);

    const mk = (y: number, text: string, scale: number, color: string) =>
      ptext(this, GAME_W / 2, y, text, scale, color).setOrigin(0.5).setDepth(20);

    this.title = mk(78, 'SECTOR CLEAR', 2, '#5aff82');
    this.sub = mk(100, '', 1, '#8c96dc');
    music.stop();
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
    const dest = DEST[this.to] ?? DEST.swarm;
    let boost = Phaser.Math.Clamp((f - 20) / 60, 0, 1); // 0 → 1 as we accelerate
    if (dest.landing && f > 180) boost = Phaser.Math.Clamp((DURATION - f) / 50, 0, 1); // brake for touchdown

    for (const s of this.streaks) {
      s.img.y += s.speed * (1 + boost * 5);
      s.img.setScale(1, 1 + boost * s.speed * 2.2);
      s.img.setAlpha(Math.min(1, 0.25 + boost * 0.75));
      if (s.img.y > GAME_H + 20) {
        s.img.y = -20;
        s.img.x = Phaser.Math.Between(0, GAME_W);
      }
    }

    // ship rises to center, shudders at full speed; a landing sets down on the surface
    if (!this.morphing) {
      const targetY = dest.landing && f > 180 ? GAME_H - 37 : GAME_H / 2 + 18;
      this.ship.y += (targetY - this.ship.y) * (dest.landing && f > 180 ? 0.12 : 0.03);
      this.ship.x = GAME_W / 2 + (boost >= 1 && f < MORPH_AT ? Math.sin(f * 0.9) * 1.2 : 0);
    }
    const craft = this.ship.texture.key;
    const hasExhaust = this.ship.visible && craft !== 'rover' && craft !== 'ship-inv';
    this.flame.setPosition(this.ship.x, this.ship.y + this.ship.height / 2 + 1).setVisible(hasExhaust);
    this.flame.setScale(1, 2 + boost * 2 + (Math.random() > 0.5 ? 0.6 : 0));

    if (f === 90) {
      this.title.setText('HYPERSPACE JUMP');
      this.sub.setText(dest.tune);
    }
    // the craft breaks into its pixels, which swirl and rebuild as the next world's ship
    if (f === MORPH_AT) this.morph(dest.fromKey, dest.toKey);
    if (f === 180) {
      this.ship.clearTint();
      this.title.setText(`ENTERING SECTOR ${dest.sector}`);
      this.sub.setText(dest.name);
      this.title.setColor('#ffd25a');
      if (dest.landing) {
        // the rover drops onto the surface
        this.cameras.main.flash(160, 255, 210, 140);
        this.surface = this.add.rectangle(0, GAME_H, GAME_W, 32, 0xa0603a).setOrigin(0, 0).setDepth(5);
      }
    }
    if (this.surface) this.surface.y += (GAME_H - 32 - this.surface.y) * 0.15;
    if (f >= DURATION) {
      this.scene.start(this.to, this.carry);
    }
  }

  /** Opaque pixels of a texture, centred on the sprite origin. */
  private pixelsOf(key: string): Px[] {
    const frame = this.textures.getFrame(key);
    const out: Px[] = [];
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const c = this.textures.getPixel(x, y, key);
        if (c && c.alpha > 0) out.push({ x: x - frame.width / 2 + 0.5, y: y - frame.height / 2 + 0.5, color: c.color });
      }
    }
    return out;
  }

  /**
   * Morph: hide the old craft, fly each pixel of the new craft out of a pixel
   * of the old one (spiralling apart first), then reveal the new sprite.
   */
  private morph(fromKey: string, toKey: string): void {
    this.morphing = true;
    const src = this.pixelsOf(fromKey);
    const dst = this.pixelsOf(toKey);
    const ox = this.ship.x;
    const oy = this.ship.y;
    this.ship.setVisible(false);
    this.flame.setVisible(false);
    audio.powerUp();
    const ms = (MORPH_FRAMES * 1000) / 60;
    dst.forEach((p, i) => {
      const s0 = src[Math.floor((i / dst.length) * src.length)] ?? { x: 0, y: 0, color: p.color };
      const dot = this.add.image(ox + s0.x, oy + s0.y, 'spark').setTint(s0.color).setDepth(12);
      const ang = Math.atan2(s0.y, s0.x) + Phaser.Math.FloatBetween(-0.6, 0.6);
      const burst = Phaser.Math.FloatBetween(10, 22);
      // out: scatter in a ring around the ship
      this.tweens.add({
        targets: dot,
        x: ox + Math.cos(ang) * burst,
        y: oy + Math.sin(ang) * burst * 0.8,
        duration: ms * 0.45,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          dot.setTint(p.color);
          // in: converge onto the new hull
          this.tweens.add({
            targets: dot,
            x: ox + p.x,
            y: oy + p.y,
            duration: ms * 0.55,
            delay: Phaser.Math.Between(0, 80),
            ease: 'Back.easeOut',
            onComplete: () => dot.destroy()
          });
        }
      });
    });
    this.time.delayedCall(ms + 120, () => {
      this.ship.setTexture(toKey).setVisible(true);
      this.cameras.main.flash(120, 140, 200, 255);
      this.morphing = false;
    });
  }
}
