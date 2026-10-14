import Phaser from 'phaser';
import { GAME_W, GAME_H, STEP_MS } from '../core/config';
import { InputMap } from '../core/input';
import { Fx, flashBurst } from '../systems/fx';
import { makeTextures, makeWarpTextures } from '../systems/textures';
import { audio } from '../systems/audio';
import { music } from '../systems/music';
import { PowerState } from '../systems/powerups';
import { Hud } from '../ui/hud';
import { ptext, PText } from '../ui/pixelFont';
import { bindDemoExit, DEMO_FRAMES, DEMO_LABEL } from '../ui/demo';
import { hiScore, qualifies } from '../core/save';
import waves from '../data/waves.json';
import type { SectorCarry } from './JumpScene';

const WR = waves.warp;
const CHAIN_WINDOW_MS = 2000;
const CHAIN_MAX = 8;
const TAU = Math.PI * 2;
const SPECIES = ['raider', 'stinger', 'manta'] as const;
type Species = (typeof SPECIES)[number];
type EState = 'wait' | 'enter' | 'hold' | 'attack' | 'leave';

interface Enemy {
  alive: boolean;
  species: Species;
  sprite: Phaser.GameObjects.Image;
  state: EState;
  t: number;
  delay: number;
  a0: number;
  dir: number;
  loop: number;
  r: number;
  a: number;
  slot: number;
  shots: number;
}

interface Polar {
  img: Phaser.GameObjects.Image;
  r: number;
  a: number;
  vr: number;
}

interface Star {
  img: Phaser.GameObjects.Image;
  a: number;
  d: number;
  v: number;
}

interface Satellite {
  core: Phaser.GameObjects.Image;
  escorts: (Phaser.GameObjects.Image | null)[];
  r: number;
  a: number;
  life: number;
  alive: boolean;
}

/** Shortest signed angle from a to b. */
function angDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Sector 4 "Warp Ring" - Gyruss homage. The fighter orbits an elliptical ring
 * and fires inward; enemy squadrons spiral out of the planet at the centre,
 * settle into a spinning formation and peel off to dive at you. Satellite
 * trios carry a power bonus. Clear three waves ("3 WARPS TO EARTH"...), then a
 * no-fire chance stage, while Earth grows at the centre of the screen.
 */
export class WarpScene extends Phaser.Scene {
  private inputMap!: InputMap;
  private hud!: Hud;
  private power = new PowerState();

  private cx = GAME_W / 2;
  private cy = GAME_H / 2 + WR.centerYOffset;
  private kx = WR.ringRx / WR.ringRy; // horizontal stretch of the polar space
  private R = WR.ringRy; // ring radius in polar units

  private ship!: Phaser.GameObjects.Image;
  private flame!: Phaser.GameObjects.Image;
  private shieldArc!: Phaser.GameObjects.Arc;
  private earth!: Phaser.GameObjects.Image;
  private ringGfx!: Phaser.GameObjects.Graphics;
  private banner!: PText;
  private bannerSub!: PText;
  private warpText!: PText;

  private theta = Math.PI / 2; // ship angle on the ring (bottom)
  private enemies: Enemy[] = [];
  private shots: Polar[] = [];
  private eshots: Polar[] = [];
  private capsules: Polar[] = [];
  private sparks: Phaser.GameObjects.Image[] = [];
  private stars: Star[] = [];
  private optionSprites: Phaser.GameObjects.Image[] = [];
  private sat?: Satellite;

  private lap = 1;
  private waveIdx = 0; // 0..wavesPerLap-1 normal, == wavesPerLap is the chance stage
  private loop = 1;
  private waveBase = 6;
  private lives = 3;
  private invuln = 0;
  private fireCooldown = 0;
  private activateHeld = false;
  private nextExtraLife = waves.extraLifeEvery;
  private accumulator = 0;
  private frame = 0;
  private waveFrame = 0;
  private attackCounter = 0;
  private satCounter = 0;
  private formRot = 0;
  private boost = 0;
  private chainLevel = 1;
  private chainTimer = 0;
  private chanceHits = 0;
  private chanceTotal = 0;
  private state: 'banner' | 'play' | 'warp' | 'dying' | 'gameover' = 'banner';
  private stateTimer = 0;
  private demo = false;
  private demoTimer = 0;

  constructor() {
    super('warp');
  }

  create(data: Partial<SectorCarry> & { demo?: boolean }): void {
    this.resetRunState();
    this.demo = data.demo === true;
    this.waveBase = data.waveBase ?? 6;
    this.loop = data.loop ?? 1;
    this.lives = data.lives ?? 3;
    this.power = data.power instanceof PowerState ? data.power : new PowerState();
    makeTextures(this);
    makeWarpTextures(this);
    this.cameras.main.setBackgroundColor('#020108');
    this.cx = GAME_W / 2;

    // 3D starfield streaming out of the centre
    const r = new Phaser.Math.RandomDataGenerator(['warp-stars']);
    const tints = [0xffffff, 0xffffff, 0x9ad2ff, 0xff8ad8, 0xffd28a];
    for (let i = 0; i < 230; i++) {
      const img = this.add.image(0, 0, 'star').setDepth(-10).setTint(r.pick(tints));
      this.stars.push({ img, a: r.realInRange(0, TAU), d: r.realInRange(2, 220), v: r.realInRange(0.35, 0.95) });
    }
    this.earth = this.add.image(this.cx, this.cy, 'wr-earth').setDepth(-5).setScale(0.3);
    this.ringGfx = this.add.graphics().setDepth(-4);

    this.ship = this.add.image(0, 0, 'ship-warp').setDepth(10);
    this.flame = this.add.image(0, 0, 'flame').setDepth(9);
    this.shieldArc = this.add.arc(0, 0, 10).setStrokeStyle(1, 0x5ae1ff, 0.8).setDepth(11).setVisible(false);

    this.inputMap = new InputMap(this);
    new Fx(this);
    music.play('warp');
    this.hud = new Hud(this);
    this.hud.setLives(this.lives);
    this.hud.hiScore = hiScore();
    this.hud.addScore(data.score ?? 0);
    this.hud.setPowerCursor(this.power.cursor);
    this.syncOptions();
    this.hud.onActivate = () => this.tryActivate();

    this.warpText = ptext(this, GAME_W / 2, 3, '', 1, '#5ae1ff').setOrigin(0.5, 0).setDepth(100);
    this.banner = ptext(this, GAME_W / 2, 84, '', 2, '#ffd25a').setOrigin(0.5).setDepth(120);
    this.bannerSub = ptext(this, GAME_W / 2, 96, '', 1, '#c8d0ff').setOrigin(0.5, 0).setCenterAlign().setDepth(120);

    const kb = this.input.keyboard!;
    kb.on('keydown', () => audio.unlock());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      if (p.worldY > GAME_H - 18 && p.worldX > GAME_W - 170) this.tryActivate();
    });
    if (this.demo) bindDemoExit(this);

    this.placeShip();
    this.startWave(0, true);
  }

  private resetRunState(): void {
    this.enemies = [];
    this.shots = [];
    this.eshots = [];
    this.capsules = [];
    this.sparks = [];
    this.stars = [];
    this.optionSprites = [];
    this.sat = undefined;
    this.theta = Math.PI / 2;
    this.lap = 1;
    this.waveIdx = 0;
    this.invuln = 0;
    this.fireCooldown = 0;
    this.nextExtraLife = waves.extraLifeEvery;
    this.accumulator = 0;
    this.frame = 0;
    this.boost = 0;
    this.chainLevel = 1;
    this.chainTimer = 0;
    this.demoTimer = 0;
  }

  // ---------------------------------------------------------------- geometry

  /** Polar (r, a) in ring space -> screen. The ring is stretched into an ellipse to use the wide screen. */
  private px(r: number, a: number): number {
    return this.cx + r * this.kx * Math.cos(a);
  }

  private py(r: number, a: number): number {
    return this.cy + r * Math.sin(a);
  }

  /** Perspective: things near the centre are far away. */
  private depthScale(r: number): number {
    return 0.3 + 0.7 * Phaser.Math.Clamp(r / this.R, 0, 1.15);
  }

  private chance(): boolean {
    return this.waveIdx >= WR.wavesPerLap;
  }

  private warpsLeft(): number {
    return WR.wavesPerLap - this.waveIdx;
  }

  // ---------------------------------------------------------------- waves

  private startWave(idx: number, first = false): void {
    this.waveIdx = idx;
    this.enemies.forEach((e) => e.sprite.destroy());
    this.enemies = [];
    this.waveFrame = 0;
    this.attackCounter = this.attackInterval();
    this.satCounter = Math.floor(WR.satelliteEveryFrames * 0.5);
    this.chanceHits = 0;

    const groups = WR.groupsBase + (this.lap - 1);
    const size = WR.groupSize + (this.lap - 1) * WR.groupSizePerLap;
    const rng = new Phaser.Math.RandomDataGenerator([`wave-${this.lap}-${idx}`]);
    for (let g = 0; g < groups; g++) {
      const species = SPECIES[(g + idx) % SPECIES.length];
      const a0 = g * (TAU / groups) + rng.realInRange(-0.4, 0.4);
      const dir = g % 2 === 0 ? 1 : -1;
      const loop = rng.realInRange(26, 44);
      for (let i = 0; i < size; i++) {
        const sprite = this.add.image(this.cx, this.cy, `wr-${species}`).setDepth(6).setVisible(false);
        this.enemies.push({
          alive: true,
          species,
          sprite,
          state: 'wait',
          t: 0,
          delay: 40 + g * WR.groupGapFrames + i * WR.memberGapFrames,
          a0,
          dir,
          loop,
          r: 0,
          a: a0,
          slot: 0,
          shots: 0
        });
      }
    }
    this.chanceTotal = this.enemies.length;

    this.state = 'banner';
    this.stateTimer = first ? 150 : 110;
    this.bannerSub.setY(96);
    if (this.chance()) {
      this.banner.setText('CHANCE STAGE').setColor('#5aff82').setVisible(true);
      this.bannerSub.setText('NO RETURN FIRE - HIT THEM ALL').setVisible(true);
    } else {
      const n = this.warpsLeft();
      this.banner.setText(`${n} WARP${n > 1 ? 'S' : ''} TO EARTH`).setColor('#ffd25a').setVisible(true);
      this.bannerSub
        .setText(first ? 'SECTOR 4 - WARP RING\nARROWS AIM AROUND THE RING' : '')
        .setVisible(true);
    }
    this.warpText.setText(this.chance() ? 'CHANCE STAGE' : `${this.warpsLeft()} WARPS TO EARTH`);
    this.tweens.add({ targets: this.earth, scale: 0.3 + 0.22 * idx + 0.05 * (this.lap - 1), duration: 1200 });
  }

  private attackInterval(): number {
    return Math.max(
      WR.attackMinFrames,
      WR.attackBaseFrames - this.waveIdx * WR.attackHastePerWave - (this.lap - 1) * 20
    );
  }

  // ---------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    this.accumulator += Math.min(delta, 100);
    while (this.accumulator >= STEP_MS) {
      this.tick();
      this.accumulator -= STEP_MS;
    }
    this.hud.update(this);
  }

  private tick(): void {
    this.frame++;
    if (this.demo && ++this.demoTimer > DEMO_FRAMES) {
      this.scene.start('attract', { page: 'title' });
      return;
    }
    if (this.chainTimer > 0) {
      this.chainTimer -= STEP_MS;
      if (this.chainTimer <= 0) {
        this.chainLevel = 1;
        this.hud.setChain(1);
      }
    }

    this.updateStars();
    this.drawRing();

    switch (this.state) {
      case 'gameover':
        this.updateSparks();
        if (--this.stateTimer <= 0) this.exitRun();
        return;
      case 'warp':
        this.updateWarp();
        this.updatePlayer(false);
        this.updateSparks();
        return;
      case 'dying':
        this.updateEnemies(false);
        this.updateShots();
        this.updateSparks();
        if (--this.stateTimer <= 0) this.respawn();
        return;
      case 'banner':
        if (--this.stateTimer <= 0) {
          this.state = 'play';
          this.banner.setVisible(false);
          // demo label rides at the top, clear of the formation
          this.bannerSub.setY(11).setText(this.demo ? DEMO_LABEL : '').setVisible(this.demo);
        }
        break;
    }

    // squadrons only start pouring out once the wave banner has cleared
    if (this.state === 'play') this.waveFrame++;
    this.updatePlayer(true);
    this.updateEnemies(this.state === 'play');
    this.updateSatellite();
    this.updateShots();
    this.updateCapsules();
    this.updateOptions();
    this.updateSparks();

    if (this.invuln > 0) {
      this.invuln--;
      const vis = this.invuln % 6 < 3;
      this.ship.setVisible(vis);
      this.flame.setVisible(vis);
    }

    if (this.state === 'play' && this.enemies.every((e) => !e.alive)) this.waveDone();
  }

  // ---------------------------------------------------------------- player

  private readInput(): { target: number | null; fire: boolean } {
    if (this.demo) return this.demoInput();
    const p = this.input.activePointer;
    if (p.isDown && p.wasTouch && p.worldY < GAME_H - 13) {
      // touch: the ship runs to the angle of the finger around the centre
      return { target: Math.atan2(p.worldY - this.cy, (p.worldX - this.cx) / this.kx), fire: true };
    }
    const i = this.inputMap.read(this.ship.x, this.ship.y);
    const target = Math.abs(i.x) > 0.3 || Math.abs(i.y) > 0.3 ? Math.atan2(i.y, i.x) : null;
    return { target, fire: i.fire };
  }

  private updatePlayer(canFire: boolean): void {
    const kb = this.input.keyboard!;
    const activate =
      kb.checkDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.X), 0) ||
      kb.checkDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT), 0) ||
      Boolean(this.input.gamepad?.getPad(0)?.B);
    if (activate && !this.activateHeld) this.tryActivate();
    this.activateHeld = activate;

    const { target, fire } = this.readInput();
    if (target !== null) {
      const rate = WR.shipTurnRate + WR.shipSpeedPerSpdLevel * this.power.speedLevel;
      const d = angDiff(this.theta, target);
      this.theta += Phaser.Math.Clamp(d, -rate, rate);
    }
    this.placeShip();

    this.fireCooldown -= STEP_MS;
    if (canFire && fire && this.fireCooldown <= 0 && this.ship.visible !== false) this.fireWeapon();
  }

  private placeShip(): void {
    const x = this.px(this.R, this.theta);
    const y = this.py(this.R, this.theta);
    const rot = this.theta - Math.PI / 2;
    this.ship.setPosition(x, y).setRotation(rot);
    this.flame
      .setPosition(x + Math.cos(this.theta) * 7 * this.kx * 0.8, y + Math.sin(this.theta) * 7)
      .setRotation(rot)
      .setScale(1, Math.random() > 0.5 ? 1 : 1.5);
    this.shieldArc.setVisible(this.power.shieldHp > 0 && this.ship.visible);
    if (this.power.shieldHp > 0) {
      this.shieldArc
        .setPosition(x, y)
        .setStrokeStyle(1, 0x5ae1ff, 0.25 + 0.25 * this.power.shieldHp)
        .setRadius(10 + Math.sin(this.frame * 0.2));
    }
  }

  private fireWeapon(): void {
    const mode = this.power.fireMode;
    const laser = mode === 'laser';
    const active = this.shots.filter((s) => s.img.active).length;
    const origins = [this.theta, ...this.optionSprites.map((o) => o.getData('a') as number)];
    const spread = mode === 'spread' ? [-0.1, 0, 0.1] : [0];
    const limit = (WR.maxBullets + this.power.options) * spread.length * (laser ? 1 : 1);
    if (active >= limit) return;
    this.fireCooldown = laser ? 300 : mode === 'spread' ? 360 : WR.fireCooldownMs;
    for (const a of origins) {
      for (const da of spread) {
        const img = this.getFromPool(this.shots, laser ? 'laser' : 'bullet');
        const s = this.shots.find((p) => p.img === img)!;
        s.r = this.R - 7;
        s.a = a + da;
        s.vr = -(laser ? WR.laserSpeed : WR.bulletSpeed);
        img.setData('pierce', laser ? 3 : 1);
      }
    }
    if (laser) audio.laser();
    else audio.shoot();
  }

  private getFromPool(pool: Polar[], key: string): Phaser.GameObjects.Image {
    let p = pool.find((q) => !q.img.active);
    if (!p) {
      p = { img: this.add.image(0, 0, key).setDepth(8), r: 0, a: 0, vr: 0 };
      pool.push(p);
    }
    return p.img.setTexture(key).setActive(true).setVisible(true).setAlpha(1);
  }

  private tryActivate(): void {
    const slot = this.power.activate();
    if (!slot) return;
    this.hud.setPowerCursor(-1);
    this.hud.showToast(this, `${slot} ON`);
    this.syncOptions();
    audio.powerUp();
  }

  private syncOptions(): void {
    while (this.optionSprites.length < this.power.options) {
      this.optionSprites.push(this.add.image(0, 0, 'option').setDepth(9));
    }
    while (this.optionSprites.length > this.power.options) this.optionSprites.pop()!.destroy();
  }

  private updateOptions(): void {
    this.optionSprites.forEach((o, i) => {
      const a = this.theta + (i === 0 ? -0.34 : 0.34);
      o.setData('a', a);
      o.setPosition(this.px(this.R + 4, a), this.py(this.R + 4, a)).setVisible(this.ship.visible);
    });
  }

  /** Attract pilot: aim at the nearest threat, stay off incoming shots. */
  private demoInput(): { target: number | null; fire: boolean } {
    let target: number | null = null;
    let best = Infinity;
    for (const e of this.enemies) {
      if (!e.alive || e.state === 'wait') continue;
      const w = Math.abs(angDiff(this.theta, e.a)) * (e.state === 'attack' ? 0.5 : 1);
      if (w < best) {
        best = w;
        target = e.a;
      }
    }
    for (const b of this.eshots) {
      if (b.img.active && b.r > this.R - 30 && Math.abs(angDiff(this.theta, b.a)) < 0.12) {
        target = this.theta + (angDiff(this.theta, b.a) > 0 ? -0.6 : 0.6);
        break;
      }
    }
    if (this.power.cursor >= 1 && this.frame % 90 === 0) this.tryActivate();
    return { target, fire: this.frame % 3 !== 0 };
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemies(hostile: boolean): void {
    this.formRot += WR.formationSpin;
    this.attackCounter--;
    const chance = this.chance();

    if (hostile && !chance && this.attackCounter <= 0) {
      this.attackCounter = this.attackInterval();
      const holding = this.enemies.filter((e) => e.alive && e.state === 'hold');
      if (holding.length) {
        const e = holding[Math.floor(Math.random() * holding.length)];
        e.state = 'attack';
        e.t = 0;
        e.shots = 0;
        audio.dive();
      }
    }

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const ox = e.sprite.x;
      const oy = e.sprite.y;
      switch (e.state) {
        case 'wait':
          if (this.waveFrame >= e.delay) {
            e.state = 'enter';
            e.t = 0;
            e.sprite.setVisible(true);
          }
          continue;
        case 'enter': {
          e.t += 1 / WR.enterFrames;
          const t = Math.min(1, e.t);
          // spiral out of the planet, overshoot in a loop, settle on the formation ring
          e.r = WR.holdRadius * t + e.loop * Math.sin(Math.PI * t) * (chance ? 2.2 : 1);
          e.a = e.a0 + e.dir * 3.2 * t;
          if (e.t >= 1) {
            if (chance) {
              e.state = 'leave';
            } else {
              e.state = 'hold';
              e.slot = e.a - this.formRot;
            }
          }
          break;
        }
        case 'hold':
          e.a = e.slot + this.formRot;
          e.r = WR.holdRadius + 5 * Math.sin(this.frame * 0.05 + e.slot * 3);
          break;
        case 'attack': {
          e.t++;
          e.r += WR.attackSpeed + e.r * 0.012 + (this.lap - 1) * 0.15;
          e.a += Phaser.Math.Clamp(angDiff(e.a, this.theta), -WR.attackSteer, WR.attackSteer);
          if (hostile && ((e.shots === 0 && e.r > 44) || (e.shots === 1 && e.r > 66))) {
            e.shots++;
            this.enemyShot(e);
          }
          if (e.r > this.R + 26) {
            // flew past the ring: re-emerge from the planet and rejoin
            e.state = 'enter';
            e.t = 0;
            e.r = 0;
            e.a0 = e.a + Math.PI;
          }
          break;
        }
        case 'leave':
          e.r += 1.4 + e.r * 0.015;
          e.a += e.dir * 0.02;
          if (e.r > this.R + 40) {
            e.alive = false;
            e.sprite.setVisible(false);
          }
          break;
      }
      const x = this.px(e.r, e.a);
      const y = this.py(e.r, e.a);
      e.sprite.setPosition(x, y).setScale(this.depthScale(e.r));
      if (Math.abs(x - ox) + Math.abs(y - oy) > 0.05) e.sprite.setRotation(Math.atan2(y - oy, x - ox) + Math.PI / 2);

      // ram the fighter
      if (hostile && this.invuln <= 0 && this.ship.visible && Math.abs(e.r - this.R) < 8) {
        if (Phaser.Math.Distance.Between(x, y, this.ship.x, this.ship.y) < 8) {
          this.killEnemy(e, false);
          this.hitPlayer();
          return;
        }
      }
    }
  }

  private enemyShot(e: Enemy): void {
    const img = this.getFromPool(this.eshots, 'ebullet-0');
    const s = this.eshots.find((p) => p.img === img)!;
    s.r = e.r;
    s.a = e.a + Phaser.Math.Clamp(angDiff(e.a, this.theta), -0.25, 0.25);
    s.vr = WR.bulletSpeedBase + (this.lap - 1) * WR.bulletSpeedPerLap;
  }

  private killEnemy(e: Enemy, score: boolean): void {
    e.alive = false;
    e.sprite.setVisible(false);
    const tint = { raider: 0xff5a3c, stinger: 0x5a8cff, manta: 0x50ff9b }[e.species];
    this.spawnSparks(e.sprite.x, e.sprite.y, tint, 12);
    audio.alienDie();
    if (!score) return;
    if (this.chance()) {
      this.chanceHits++;
      this.scoreKill(WR.points.chanceHit, e.sprite.x, e.sprite.y);
      return;
    }
    const base = WR.points[e.species] * (e.state === 'attack' ? WR.points.attackBonus : 1);
    this.scoreKill(base, e.sprite.x, e.sprite.y);
    if (Math.random() < WR.capsuleDropChance) this.dropCapsule(e.r, e.a);
  }

  // ---------------------------------------------------------------- satellites

  private updateSatellite(): void {
    if (!this.sat && this.state === 'play' && !this.chance() && --this.satCounter <= 0) {
      this.satCounter = WR.satelliteEveryFrames;
      const a = Math.random() * TAU;
      this.sat = {
        core: this.add.image(this.cx, this.cy, 'wr-core').setDepth(7),
        escorts: [this.add.image(0, 0, 'wr-escort').setDepth(7), this.add.image(0, 0, 'wr-escort').setDepth(7)],
        r: 8,
        a,
        life: WR.satelliteLifeFrames,
        alive: true
      };
      audio.ufo();
      this.hud.showToast(this, 'SATELLITES - HIT THE CORE');
    }
    const s = this.sat;
    if (!s) return;
    s.life--;
    s.r = Math.min(52, s.r + 0.25);
    s.a += 0.006;
    const x = this.px(s.r, s.a);
    const y = this.py(s.r, s.a);
    const sc = this.depthScale(s.r);
    s.core.setPosition(x, y).setScale(sc).setAlpha(this.frame % 8 < 4 ? 1 : 0.7);
    s.escorts.forEach((esc, i) => {
      if (!esc) return;
      const oa = this.frame * 0.09 + i * Math.PI;
      esc.setPosition(x + Math.cos(oa) * 10 * sc, y + Math.sin(oa) * 7 * sc).setScale(sc);
    });
    if (s.life <= 0) this.clearSatellite();
  }

  private clearSatellite(): void {
    if (!this.sat) return;
    this.sat.core.destroy();
    this.sat.escorts.forEach((e) => e?.destroy());
    this.sat = undefined;
  }

  // ---------------------------------------------------------------- projectiles

  private updateShots(): void {
    for (const s of this.shots) {
      if (!s.img.active) continue;
      s.r += s.vr;
      if (s.r < 6) {
        s.img.setActive(false).setVisible(false);
        continue;
      }
      const x = this.px(s.r, s.a);
      const y = this.py(s.r, s.a);
      s.img.setPosition(x, y).setRotation(s.a - Math.PI / 2).setScale(this.depthScale(s.r));
      this.resolveShot(s, x, y);
    }

    for (const b of this.eshots) {
      if (!b.img.active) continue;
      b.r += b.vr;
      const x = this.px(b.r, b.a);
      const y = this.py(b.r, b.a);
      b.img
        .setPosition(x, y)
        .setScale(this.depthScale(b.r))
        .setTexture(Math.floor(b.r / 4) % 2 ? 'ebullet-1' : 'ebullet-0');
      if (b.r > this.R + 24) {
        b.img.setActive(false).setVisible(false);
        continue;
      }
      if (this.state !== 'play' && this.state !== 'banner') continue;
      if (this.invuln > 0 || !this.ship.visible) continue;
      if (Phaser.Math.Distance.Between(x, y, this.ship.x, this.ship.y) < 6) {
        b.img.setActive(false).setVisible(false);
        if (this.absorb()) continue;
        this.hitPlayer();
        return;
      }
    }
  }

  private resolveShot(s: Polar, x: number, y: number): void {
    const hit = (tx: number, ty: number, rad: number) => Phaser.Math.Distance.Between(x, y, tx, ty) < rad;
    const spend = () => {
      const left = (s.img.getData('pierce') as number) - 1;
      if (left <= 0) s.img.setActive(false).setVisible(false);
      else s.img.setData('pierce', left);
    };
    for (const e of this.enemies) {
      if (!e.alive || e.state === 'wait') continue;
      if (hit(e.sprite.x, e.sprite.y, 3 + 5 * this.depthScale(e.r))) {
        this.killEnemy(e, true);
        spend();
        if (!s.img.active) return;
      }
    }
    const sat = this.sat;
    if (sat) {
      sat.escorts.forEach((esc, i) => {
        if (esc && s.img.active && hit(esc.x, esc.y, 5)) {
          this.spawnSparks(esc.x, esc.y, 0xffa028, 8);
          this.scoreKill(WR.points.escort, esc.x, esc.y);
          esc.destroy();
          sat.escorts[i] = null;
          audio.shieldHit();
          spend();
        }
      });
      if (s.img.active && hit(sat.core.x, sat.core.y, 6)) {
        spend();
        this.spawnSparks(sat.core.x, sat.core.y, 0x5ae1ff, 20);
        this.scoreKill(WR.points.core, sat.core.x, sat.core.y);
        // the core's payload: two steps along the power bar
        this.power.collect();
        this.power.collect();
        this.hud.setPowerCursor(this.power.cursor);
        this.hud.showToast(this, 'POWER +2');
        audio.capsule();
        this.clearSatellite();
      }
    }
  }

  private dropCapsule(r: number, a: number): void {
    const img = this.getFromPool(this.capsules, 'capsule');
    const c = this.capsules.find((p) => p.img === img)!;
    c.r = r;
    c.a = a;
    c.vr = 0.9;
  }

  private updateCapsules(): void {
    for (const c of this.capsules) {
      if (!c.img.active) continue;
      c.r += c.vr;
      c.img.setPosition(this.px(c.r, c.a), this.py(c.r, c.a)).setAngle(c.img.angle + 3);
      if (c.r > this.R + 16) {
        c.img.setActive(false).setVisible(false);
        continue;
      }
      if (this.ship.visible && Phaser.Math.Distance.Between(c.img.x, c.img.y, this.ship.x, this.ship.y) < 10) {
        c.img.setActive(false).setVisible(false);
        this.power.collect();
        this.hud.setPowerCursor(this.power.cursor);
        audio.capsule();
      }
    }
  }

  // ---------------------------------------------------------------- scenery

  private updateStars(): void {
    const boost = 1 + this.boost * 7;
    for (const s of this.stars) {
      s.d += s.v * (0.35 + s.d * 0.018) * boost;
      const x = this.cx + s.d * this.kx * Math.cos(s.a);
      const y = this.cy + s.d * Math.sin(s.a);
      if (x < -10 || x > GAME_W + 10 || y < -10 || y > GAME_H + 10) {
        s.d = Phaser.Math.FloatBetween(1, 12);
        s.a = Phaser.Math.FloatBetween(0, TAU);
        continue;
      }
      s.img
        .setPosition(x, y)
        .setRotation(s.a)
        .setScale(1 + s.d * 0.03 + this.boost * (2 + s.d * 0.08), 1)
        .setAlpha(Math.min(1, 0.15 + s.d / 70));
    }
  }

  private drawRing(): void {
    // faint dotted guide where the fighter flies
    const g = this.ringGfx;
    g.clear();
    g.fillStyle(0x3c3c78, 0.5);
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU + this.frame * 0.002;
      g.fillRect(Math.round(this.px(this.R, a)), Math.round(this.py(this.R, a)), 1, 1);
    }
  }

  // ---------------------------------------------------------------- flow

  private waveDone(): void {
    this.clearSatellite();
    for (const b of [...this.eshots, ...this.shots]) b.img.setActive(false).setVisible(false);
    let bonus = WR.points.waveBonus * this.lap;
    if (this.chance()) {
      const perfect = this.chanceHits === this.chanceTotal;
      bonus = this.chanceHits * WR.points.chanceHit + (perfect ? WR.points.chancePerfect : 0);
      this.banner.setText(perfect ? 'PERFECT!' : `HITS ${this.chanceHits} / ${this.chanceTotal}`).setColor('#5aff82');
    } else {
      this.banner.setText('WARP!').setColor('#5ae1ff');
    }
    this.hud.addScore(bonus);
    this.checkExtraLife();
    this.bannerSub.setY(96).setText(`+${bonus} BONUS`).setVisible(true);
    this.banner.setVisible(true);
    audio.waveClear();
    audio.jump();
    this.state = 'warp';
    this.stateTimer = 170;
  }

  /** Hyperspace between waves: stars streak, Earth swells, then the next wave. */
  private updateWarp(): void {
    const k = this.stateTimer / 170;
    this.boost = Math.sin(Math.PI * (1 - k));
    if (--this.stateTimer > 0) return;
    this.boost = 0;
    const next = this.waveIdx + 1;
    if (next > WR.wavesPerLap) {
      if (!this.demo) {
        // Earth reached: dive through the atmosphere into Canyon River
        this.scene.start('jump', {
          to: 'canyon',
          score: this.hud.score,
          lives: this.lives,
          power: this.power,
          waveBase: this.waveBase + WR.wavesPerLap + 1,
          loop: this.loop
        });
        return;
      }
      // demo: just keep orbiting
      this.lap++;
      this.hud.showToast(this, 'EARTH ORBIT - LAP ' + this.lap);
      this.startWave(0);
    } else {
      this.startWave(next);
    }
  }

  private scoreKill(base: number, x: number, y: number): void {
    const pts = base * this.chainLevel;
    this.hud.addScore(pts);
    if (this.chainTimer > 0 && this.chainLevel < CHAIN_MAX) {
      this.chainLevel++;
      audio.chain(this.chainLevel);
    }
    this.chainTimer = CHAIN_WINDOW_MS;
    this.hud.setChain(this.chainLevel);
    if (this.chainLevel > 1 || base >= 300) this.floatScore(x, y, `${pts}`);
    this.checkExtraLife();
  }

  private floatScore(x: number, y: number, text: string): void {
    const t = ptext(this, x, y, text, 1, '#ffdc50').setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  private checkExtraLife(): void {
    if (this.hud.score >= this.nextExtraLife) {
      this.nextExtraLife += waves.extraLifeEvery;
      this.lives = Math.min(5, this.lives + 1);
      this.hud.setLives(this.lives);
      this.hud.showToast(this, 'EXTRA SHIP');
      audio.extraLife();
    }
  }

  private spawnSparks(x: number, y: number, tint: number, n: number): void {
    if (n >= 10) flashBurst(this, x, y, tint, n);
    n = Math.round(n * 1.4);
    for (let i = 0; i < n; i++) {
      let s = this.sparks.find((p) => !p.active);
      if (!s) {
        s = this.add.image(0, 0, 'spark').setDepth(20);
        this.sparks.push(s);
      }
      const a = Math.random() * TAU;
      const v = 0.4 + Math.random() * 1.8;
      s.setActive(true)
        .setVisible(true)
        .setPosition(x, y)
        .setTint(tint)
        .setAlpha(1)
        .setData('vx', Math.cos(a) * v)
        .setData('vy', Math.sin(a) * v)
        .setData('life', 14 + Math.random() * 16);
    }
  }

  private updateSparks(): void {
    for (const s of this.sparks) {
      if (!s.active) continue;
      const life = (s.getData('life') as number) - 1;
      s.setData('life', life);
      if (life <= 0) {
        s.setActive(false).setVisible(false);
        continue;
      }
      s.x += s.getData('vx') as number;
      s.y += s.getData('vy') as number;
      s.setAlpha(Math.min(1, life / 14));
    }
  }

  private absorb(): boolean {
    if (this.power.shieldHp <= 0) return false;
    this.power.shieldHp--;
    this.invuln = 30;
    this.spawnSparks(this.ship.x, this.ship.y, 0x5ae1ff, 6);
    audio.shieldHit();
    return true;
  }

  private hitPlayer(): void {
    if (this.state === 'dying' || this.state === 'gameover') return;
    this.lives--;
    this.hud.setLives(this.lives);
    this.spawnSparks(this.ship.x, this.ship.y, 0x5ae1ff, 24);
    this.cameras.main.shake(220, 0.012);
    audio.playerDie();
    this.ship.setVisible(false);
    this.flame.setVisible(false);
    this.shieldArc.setVisible(false);
    this.power.reset();
    this.syncOptions();
    this.hud.setPowerCursor(-1);
    this.chainLevel = 1;
    this.chainTimer = 0;
    this.hud.setChain(1);
    for (const b of this.eshots) b.img.setActive(false).setVisible(false);
    if (this.lives <= 0) {
      this.gameOver();
      return;
    }
    this.state = 'dying';
    this.stateTimer = 80;
  }

  private respawn(): void {
    this.state = 'play';
    this.ship.setVisible(true);
    this.flame.setVisible(true);
    this.invuln = waves.player.respawnInvulnFrames;
    // divers that were mid-attack regroup
    for (const e of this.enemies) {
      if (e.alive && e.state === 'attack') {
        e.state = 'enter';
        e.t = 0;
        e.r = 0;
      }
    }
  }

  private gameOver(): void {
    music.stop();
    this.state = 'gameover';
    this.stateTimer = this.demo ? 60 : 180;
    this.banner.setText('GAME OVER').setColor('#ffd25a').setVisible(true);
    this.bannerSub.setY(96).setText(this.demo ? '' : `SCORE ${this.hud.score}`).setVisible(true);
  }

  private exitRun(): void {
    if (this.demo) {
      this.scene.start('attract', { page: 'title' });
      return;
    }
    const wave = this.waveBase + this.waveIdx + (this.lap - 1) * (WR.wavesPerLap + 1);
    if (qualifies(this.hud.score)) this.scene.start('initials', { score: this.hud.score, wave });
    else this.scene.start('attract', { page: 'scores' });
  }
}
