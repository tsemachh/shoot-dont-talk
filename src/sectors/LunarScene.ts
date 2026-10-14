import Phaser from 'phaser';
import { GAME_W, GAME_H, STEP_MS } from '../core/config';
import { InputMap } from '../core/input';
import { standardPad, TouchPad } from '../ui/touchpad';
import { Fx, flashBurst } from '../systems/fx';
import { makeTextures, makeLunarTextures } from '../systems/textures';
import { audio } from '../systems/audio';
import { music } from '../systems/music';
import { bindDemoExit, DEMO_FRAMES, DEMO_LABEL } from '../ui/demo';
import { PowerState } from '../systems/powerups';
import { Hud } from '../ui/hud';
import { ptext, PText } from '../ui/pixelFont';
import { hiScore, qualifies } from '../core/save';
import waves from '../data/waves.json';
import type { SectorCarry } from './JumpScene';

const LN = waves.lunar;
const GROUND_Y = 184;
const CHAIN_WINDOW_MS = 2000;
const CHAIN_MAX = 8;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const WHEEL_X = [-8, 0, 8];

type ObstacleKind = 'crater' | 'rock' | 'bigrock' | 'mine';

interface Obstacle {
  kind: ObstacleKind;
  wx: number; // world x of the left edge
  w: number;
  h: number;
  hp: number;
  alive: boolean;
  passed: boolean;
  sprite?: Phaser.GameObjects.Image;
}

type FlyerKind = 'saucer' | 'skimmer';

interface Flyer {
  kind: FlyerKind;
  sprite: Phaser.GameObjects.Image;
  alive: boolean;
  t: number;
  baseY: number;
  phase: number;
  vx: number;
  bombTimer: number;
  leaving: boolean;
}

interface Capsule {
  img: Phaser.GameObjects.Image;
  wx: number;
  landed: boolean;
}

function letter(seg: number): string {
  return LETTERS[((seg % 26) + 26) % 26];
}

/**
 * Sector 3 "Lunar Run" - Moon Patrol homage. The fighter has landed as a
 * six-wheeled rover: the world scrolls right-to-left over a cratered surface.
 * UP jumps (craters, mines, rocks); FIRE shoots ahead and straight up at the
 * same time. Saucers bomb from above (bombs dig new craters), skimmers rush
 * in at wheel height. Course is split into lettered checkpoints; dying
 * restarts at the last letter reached.
 */
export class LunarScene extends Phaser.Scene {
  private inputMap!: InputMap;
  private pad!: TouchPad;
  private hud!: Hud;
  private power = new PowerState();

  private rover!: Phaser.GameObjects.Image;
  private wheels: Phaser.GameObjects.Image[] = [];
  private wheelDy = [0, 0, 0];
  private wheelVy = [0, 0, 0];
  private shieldArc!: Phaser.GameObjects.Arc;
  private ground!: Phaser.GameObjects.Graphics;
  private progress!: Phaser.GameObjects.Graphics;
  private farTile!: Phaser.GameObjects.TileSprite;
  private nearTile!: Phaser.GameObjects.TileSprite;
  private letterFrom!: PText;
  private letterTo!: PText;
  private banner!: PText;
  private bannerSub!: PText;

  private obstacles: Obstacle[] = [];
  private flyers: Flyer[] = [];
  private fwdBullets: Phaser.GameObjects.Image[] = [];
  private upBullets: Phaser.GameObjects.Image[] = [];
  private bombs: Phaser.GameObjects.Image[] = [];
  private sparks: Phaser.GameObjects.Image[] = [];
  private capsules: Capsule[] = [];
  private optionSprites: Phaser.GameObjects.Image[] = [];

  private rng = new Phaser.Math.RandomDataGenerator([String(Date.now())]);
  private worldX = 0;
  private speed = LN.speedBase;
  private roverX = 70;
  private ry = GROUND_Y;
  private vy = 0;
  private grounded = true;
  private course = 1;
  private lastSeg = 0;
  private nextSpawnX = 0;
  private saucerTimer = 0;
  private skimmerTimer = 0;
  private courseFrames = 0;

  private loop = 1;
  private waveBase = 4;
  private lives = 3;
  private invuln = 0;
  private fireCooldown = 0;
  private activateHeld = false;
  private nextExtraLife = waves.extraLifeEvery;
  private accumulator = 0;
  private frame = 0;
  private chainLevel = 1;
  private chainTimer = 0;
  private state: 'banner' | 'play' | 'dying' | 'cleared' | 'gameover' = 'banner';
  private stateTimer = 0;
  private sink = 0;
  private auto = false;
  private demo = false;
  private demoTimer = 0;

  constructor() {
    super('lunar');
  }

  create(data: Partial<SectorCarry>): void {
    this.resetRunState();
    this.waveBase = data.waveBase ?? 4;
    this.loop = data.loop ?? 1;
    this.lives = data.lives ?? 3;
    this.power = data.power instanceof PowerState ? data.power : new PowerState();
    this.demo = (data as { demo?: boolean }).demo === true;
    this.demoTimer = 0;
    this.auto = this.demo || (data as { auto?: boolean }).auto === true;
    makeTextures(this);
    makeLunarTextures(this);
    this.cameras.main.setBackgroundColor('#0e0428');

    // sky: synthwave gradient, stars, striped sun (as in the preview video)
    this.add.image(0, 0, 'ln-sky').setOrigin(0, 0).setDepth(-21);
    const r = new Phaser.Math.RandomDataGenerator(['lunar-sky']);
    for (let i = 0; i < 60; i++) {
      this.add
        .image(r.between(0, GAME_W), r.between(14, 96), 'star')
        .setTint(0xffdcff)
        .setAlpha(r.realInRange(0.2, 0.8))
        .setDepth(-20);
    }
    this.add.image(Math.round(GAME_W * 0.8), 104, 'ln-sun').setDepth(-18);
    this.farTile = this.add.tileSprite(0, GROUND_Y - 112, GAME_W, 112, 'ln-far').setOrigin(0, 0).setDepth(-15);
    this.nearTile = this.add.tileSprite(0, GROUND_Y - 56, GAME_W, 56, 'ln-near').setOrigin(0, 0).setDepth(-14);
    this.ground = this.add.graphics().setDepth(0);

    this.rover = this.add.image(this.roverX, this.ry - 7, 'rover').setDepth(10);
    this.wheels = WHEEL_X.map((dx) => this.add.image(this.roverX + dx, this.ry - 2.5, 'wheel-0').setDepth(11));
    this.shieldArc = this.add.arc(0, 0, 15).setStrokeStyle(1, 0x5ae1ff, 0.8).setDepth(12).setVisible(false);

    this.inputMap = new InputMap(this);
    // touch: the shared low controller - stick left/right = speed, stick up = jump; FIRE
    this.pad = standardPad(this, { demo: this.demo, low: true });
    this.inputMap.attachPad(this.pad);
    new Fx(this);
    music.play('lunar');
    this.hud = new Hud(this);
    this.hud.setLives(this.lives);
    this.hud.hiScore = hiScore();
    this.hud.addScore(data.score ?? 0);
    this.hud.setPowerCursor(this.power.cursor);
    this.syncOptions();
    this.hud.onActivate = () => this.tryActivate();

    // checkpoint progress bar (top center)
    this.progress = this.add.graphics().setDepth(100);
    const txt = (x: number, color: string) =>
      ptext(this, x, 3, '', 1, color)
        .setDepth(100);
    this.letterFrom = txt(GAME_W / 2 - 52, '#5ae1ff');
    this.letterTo = txt(GAME_W / 2 + 46, '#ffd25a');

    this.banner = ptext(this, GAME_W / 2, 74, '', 2, '#ffd25a')
      .setOrigin(0.5)
      .setDepth(120);
    this.bannerSub = ptext(this, GAME_W / 2, 86, '', 1, '#c8d0ff').setCenterAlign()
      .setOrigin(0.5, 0)
      .setDepth(120);

    const kb = this.input.keyboard!;
    kb.on('keydown', () => audio.unlock());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      if (p.worldY > GAME_H - 18 && p.worldX > GAME_W - 170) this.tryActivate();
    });

    this.nextSpawnX = LN.respawnRunway + 120;
    this.saucerTimer = 260;
    this.skimmerTimer = LN.skimmerBaseFrames;
    if (this.demo) bindDemoExit(this);
    this.state = 'banner';
    this.stateTimer = 170;
    this.banner.setText('LUNAR RUN').setVisible(true);
    this.bannerSub
      .setText(this.pad.enabled ? 'SECTOR 3\nSTICK: SPEED - PUSH UP TO JUMP\nFIRE: SHOOT AHEAD + UP' : 'SECTOR 3\nUP = JUMP\nFIRE = SHOOT AHEAD + UP')
      .setVisible(true);
  }

  private resetRunState(): void {
    this.obstacles = [];
    this.flyers = [];
    this.fwdBullets = [];
    this.upBullets = [];
    this.bombs = [];
    this.sparks = [];
    this.capsules = [];
    this.optionSprites = [];
    this.wheels = [];
    this.wheelDy = [0, 0, 0];
    this.wheelVy = [0, 0, 0];
    this.worldX = 0;
    this.speed = LN.speedBase;
    this.roverX = 70;
    this.ry = GROUND_Y;
    this.vy = 0;
    this.grounded = true;
    this.course = 1;
    this.lastSeg = 0;
    this.courseFrames = 0;
    this.invuln = 0;
    this.fireCooldown = 0;
    this.nextExtraLife = waves.extraLifeEvery;
    this.accumulator = 0;
    this.frame = 0;
    this.chainLevel = 1;
    this.chainTimer = 0;
    this.sink = 0;
  }

  /** 0 at the start of course 1, +1 per course, +0.25 per checkpoint inside it. */
  private level(): number {
    const seg = Math.floor(this.worldX / LN.segmentLen);
    return (this.course - 1) + (seg % LN.segmentsPerCourse) * 0.25;
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

    switch (this.state) {
      case 'gameover':
        this.updateSparks();
        this.updateFlyers(false);
        this.drawWorld();
        if (--this.stateTimer <= 0) this.exitRun();
        return;

      case 'dying':
        this.updateDying();
        this.updateFlyers(false);
        this.updateBombs(false);
        this.updateSparks();
        this.drawWorld();
        return;

      case 'banner':
      case 'cleared':
        // cruise: world rolls, nothing hostile happens, rover auto-drives
        this.scroll(LN.speedBase);
        this.spawnObstacles();
        this.updateObstacles(false);
        this.settleRover();
        this.updateSparks();
        this.drawWorld();
        if (--this.stateTimer <= 0) {
          if (this.state === 'cleared' && !this.demo && this.course >= LN.coursesPerSector) {
            // sector 3 done: lift off and warp out, run state carried over
            this.scene.start('jump', {
              to: 'warp',
              score: this.hud.score,
              lives: this.lives,
              power: this.power,
              waveBase: this.waveBase + this.course,
              loop: this.loop
            });
            return;
          }
          if (this.state === 'cleared') {
            this.course++;
            this.courseFrames = 0;
          }
          this.state = 'play';
          this.banner.setVisible(false);
          this.bannerSub.setText(this.demo ? DEMO_LABEL : '').setVisible(this.demo);
        }
        return;
    }

    // ---- play ----
    this.courseFrames++;
    const input = this.auto ? this.autoInput() : this.inputMap.read(this.roverX, this.ry - 8);
    this.moveRover(input);
    this.spawnObstacles();
    this.spawnFlyers();
    this.updateObstacles(true);
    this.updateFlyers(true);
    this.updateBombs(true);
    this.updateBullets();
    this.updateCapsules();
    this.updateOptions();
    this.updateSparks();
    this.checkCheckpoint();
    this.drawWorld();

    if (this.invuln > 0) {
      this.invuln--;
      const vis = this.invuln % 6 < 3;
      this.rover.setVisible(vis);
      this.wheels.forEach((w) => w.setVisible(vis));
    }
  }

  /** Autopilot (demo/test): full throttle, always firing, hops what it can't shoot. */
  private autoInput(): { x: number; y: number; fire: boolean } {
    let jump = false;
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      const dist = o.wx - this.worldX - (this.roverX + 10);
      if (dist < -6 || dist > 40) continue;
      const mustJump = o.kind === 'crater' || o.kind === 'mine' || (o.kind === 'bigrock' && o.hp > 1);
      if (mustJump && dist < 4 + this.speed * 3) jump = true;
      if ((o.kind === 'rock' || o.kind === 'bigrock') && dist < 6) jump = true;
    }
    // dodge bombs by throttle: brake for ones landing ahead, floor it for ones behind
    let x = 0.2;
    for (const b of this.bombs) {
      if (!b.active || b.y < GROUND_Y - 90) continue;
      const dx = b.x - this.roverX;
      if (dx > -16 && dx < 40) {
        x = dx > 6 ? -1 : 1;
        if (Math.abs(dx) < 14) jump = false;
      }
    }
    if (this.power.cursor >= 0 && this.frame % 90 === 0) this.tryActivate();
    return { x, y: jump ? -1 : 0, fire: true };
  }

  // ---------------------------------------------------------------- rover

  private maxSpeed(): number {
    return LN.speedMax + LN.speedPerSpdLevel * this.power.speedLevel;
  }

  private scroll(speed: number): void {
    this.speed += (speed - this.speed) * 0.05;
    this.worldX += this.speed;
    this.farTile.tilePositionX = this.worldX * 0.1;
    this.nearTile.tilePositionX = this.worldX * 0.3;
  }

  private moveRover(input: { x: number; y: number; fire: boolean }): void {
    const kb = this.input.keyboard!;
    const pad = this.input.gamepad?.getPad(0);
    const activate =
      kb.checkDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.X), 0) ||
      kb.checkDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT), 0) ||
      Boolean(pad?.B);
    if (activate && !this.activateHeld) this.tryActivate();
    this.activateHeld = activate;

    // throttle: right = faster, left = brake
    const target = input.x > 0.3 ? this.maxSpeed() : input.x < -0.3 ? LN.speedMin : LN.speedBase;
    this.scroll(target);
    if (this.auto) {
      // autopilot (demo): screen position follows speed, as tuned for the AI
      const span = LN.speedMax - LN.speedMin;
      const tx = 56 + Phaser.Math.Clamp((this.speed - LN.speedMin) / span, 0, 1.3) * 64;
      this.roverX += (tx - this.roverX) * 0.06;
    } else {
      // player: the stick is the throttle. Faster carries the rover up to the screen centre,
      // slower lets it fall back to the left - but it never rolls backwards over the ground.
      const span = LN.speedMax - LN.speedMin;
      const k = Phaser.Math.Clamp((this.speed - LN.speedMin) / span, 0, 1.2);
      const tx = 50 + k * (GAME_W / 2 - 50);
      const step = Phaser.Math.Clamp((tx - this.roverX) * 0.05, -this.speed * 0.6, 2);
      this.roverX += step;
    }

    const wantJump = input.y < -0.5 || Boolean(pad?.X) || Boolean(pad?.Y);
    if (wantJump && this.grounded) {
      this.vy = -LN.jumpV;
      this.grounded = false;
      audio.roverJump();
    }

    this.roverPhysics();
    if (this.state !== 'play') return;

    this.fireCooldown -= STEP_MS;
    if (input.fire && this.fireCooldown <= 0) this.fireWeapon();
  }

  /** Gravity, landing, crater checks; then position the sprites. */
  private roverPhysics(): void {
    if (!this.grounded) {
      this.vy += LN.gravity;
      this.ry += this.vy;
      if (this.ry >= GROUND_Y) {
        this.ry = GROUND_Y;
        this.vy = 0;
        this.grounded = true;
        this.wheelVy = this.wheelVy.map(() => -1.2); // landing squash
      }
    }
    if (this.grounded && this.state === 'play' && this.overCrater()) {
      this.killRover(true);
      return;
    }
    this.placeRover();
  }

  private overCrater(): boolean {
    for (const o of this.obstacles) {
      if (!o.alive || o.kind !== 'crater') continue;
      const sx = o.wx - this.worldX;
      if (this.roverX > sx + 4 && this.roverX < sx + o.w - 4) return true;
    }
    return false;
  }

  private placeRover(): void {
    for (let i = 0; i < 3; i++) {
      // little spring per wheel: bumpy lunar suspension
      const rest = this.grounded ? 0 : 1.6;
      if (this.grounded && this.state !== 'dying' && Math.random() < 0.05 * this.speed) {
        this.wheelVy[i] -= Math.random() * 0.8;
      }
      this.wheelVy[i] += (rest - this.wheelDy[i]) * 0.3;
      this.wheelVy[i] *= 0.72;
      this.wheelDy[i] = Phaser.Math.Clamp(this.wheelDy[i] + this.wheelVy[i], -2, 2);
      this.wheels[i]
        .setPosition(Math.round(this.roverX + WHEEL_X[i]), Math.round(this.ry - 2.5 + this.wheelDy[i]))
        .setTexture(Math.floor(this.worldX / 6) % 2 ? 'wheel-1' : 'wheel-0');
    }
    const bodyLift = (this.wheelDy[0] + this.wheelDy[1] + this.wheelDy[2]) / 3;
    this.rover.setPosition(Math.round(this.roverX), Math.round(this.ry - 7 + bodyLift * 0.5));
    this.shieldArc.setVisible(this.power.shieldHp > 0 && this.rover.visible);
    if (this.power.shieldHp > 0) {
      this.shieldArc
        .setPosition(this.roverX, this.ry - 7)
        .setStrokeStyle(1, 0x5ae1ff, 0.25 + 0.25 * this.power.shieldHp)
        .setRadius(15 + Math.sin(this.frame * 0.2));
    }
  }

  /** Banner/cleared cruise: land if mid-air, ease back to the start column. */
  private settleRover(): void {
    this.roverX += (70 - this.roverX) * 0.04;
    if (!this.grounded) {
      this.vy += LN.gravity;
      this.ry = Math.min(GROUND_Y, this.ry + this.vy);
      if (this.ry >= GROUND_Y) {
        this.grounded = true;
        this.vy = 0;
      }
    }
    this.placeRover();
    this.optionSprites.forEach((o) => o.setVisible(false));
  }

  // ---------------------------------------------------------------- weapons

  private fireWeapon(): void {
    const mode = this.power.fireMode;
    const fwdKey = mode === 'laser' ? 'hlaser' : 'hbullet';
    const upKey = mode === 'laser' ? 'laser' : 'bullet';
    const fwdMax = mode === 'laser' ? 2 : 1;
    const upMax = mode === 'spread' ? 6 + 3 * this.power.options : 2 + this.power.options;
    const fwdCount = this.fwdBullets.filter((b) => b.active).length;
    const upCount = this.upBullets.filter((b) => b.active).length;
    if (fwdCount >= fwdMax && upCount >= upMax) return;

    this.fireCooldown = mode === 'spread' ? 380 : mode === 'laser' ? 320 : LN.fireCooldownMs;

    if (fwdCount < fwdMax) {
      const b = this.getFromPool(this.fwdBullets, fwdKey);
      b.setPosition(this.roverX + 14, this.ry - 6)
        .setDepth(8)
        .setData('startX', this.roverX)
        .setData('pierce', mode === 'laser' ? 3 : 1);
    }
    if (upCount < upMax) {
      const origins: [number, number][] = [[this.roverX + 2, this.ry - 14]];
      this.optionSprites.forEach((o) => origins.push([o.x, o.y - 4]));
      const vxs = mode === 'spread' ? [-0.9, 0, 0.9] : [0];
      for (const [x, y] of origins) {
        for (const vx of vxs) {
          const b = this.getFromPool(this.upBullets, upKey);
          b.setPosition(x, y)
            .setDepth(8)
            .setData('vx', vx)
            .setData('pierce', mode === 'laser' ? 3 : 1);
        }
      }
    }
    if (mode === 'laser') audio.laser();
    else audio.shoot();
  }

  private getFromPool(pool: Phaser.GameObjects.Image[], key: string): Phaser.GameObjects.Image {
    let b = pool.find((p) => !p.active);
    if (!b) {
      b = this.add.image(0, 0, key);
      pool.push(b);
    }
    return b.setTexture(key).setActive(true).setVisible(true).setAlpha(1);
  }

  private deactivate(b: Phaser.GameObjects.Image): void {
    b.setActive(false).setVisible(false);
  }

  private updateBullets(): void {
    // forward shots: short range, break rocks, swat skimmers
    for (const b of this.fwdBullets) {
      if (!b.active) continue;
      const laser = b.texture.key === 'hlaser';
      b.x += laser ? 7 : 5.5;
      const range = laser ? LN.laserRange : LN.fwdRange;
      const travelled = b.x - (b.getData('startX') as number);
      if (b.x > GAME_W + 6 || travelled > range) {
        this.deactivate(b);
        continue;
      }
      if (travelled > range - 30) b.setAlpha((range - travelled) / 30);
      this.resolveForward(b);
    }

    // upward shots: saucers and bombs
    for (const b of this.upBullets) {
      if (!b.active) continue;
      const laser = b.texture.key === 'laser';
      b.y -= laser ? 7 : 5.2;
      b.x += b.getData('vx') as number;
      if (b.y < 12 || b.x < -4 || b.x > GAME_W + 4) {
        this.deactivate(b);
        continue;
      }
      this.resolveUp(b);
    }
  }

  private spendPierce(b: Phaser.GameObjects.Image): void {
    const left = (b.getData('pierce') as number) - 1;
    if (left <= 0) this.deactivate(b);
    else b.setData('pierce', left);
  }

  private resolveForward(b: Phaser.GameObjects.Image): void {
    for (const o of this.obstacles) {
      if (!o.alive || (o.kind !== 'rock' && o.kind !== 'bigrock')) continue;
      const sx = o.wx - this.worldX;
      if (b.x + 3 > sx && b.x - 3 < sx + o.w && b.y > GROUND_Y - o.h - 1 && b.y < GROUND_Y) {
        o.hp--;
        this.spawnSparks(b.x + 2, b.y, 0xd8b48c, 5);
        this.spendPierce(b);
        if (o.hp <= 0) this.breakRock(o);
        else audio.shieldHit();
        if (!b.active) return;
      }
    }
    for (const f of this.flyers) {
      if (!f.alive || f.kind !== 'skimmer') continue;
      if (Math.abs(b.x - f.sprite.x) < 9 && Math.abs(b.y - f.sprite.y) < 5) {
        this.killFlyer(f);
        this.spendPierce(b);
        if (!b.active) return;
      }
    }
  }

  private resolveUp(b: Phaser.GameObjects.Image): void {
    for (const f of this.flyers) {
      if (!f.alive || f.kind !== 'saucer') continue;
      if (Math.abs(b.x - f.sprite.x) < 8 && Math.abs(b.y - f.sprite.y) < 5) {
        this.killFlyer(f);
        this.spendPierce(b);
        if (!b.active) return;
      }
    }
    for (const bomb of this.bombs) {
      if (!bomb.active) continue;
      if (Math.abs(b.x - bomb.x) < 4 && Math.abs(b.y - bomb.y) < 5) {
        this.deactivate(bomb);
        this.spawnSparks(bomb.x, bomb.y, 0xffb43c, 6);
        this.scoreKill(LN.points.bomb, bomb.x, bomb.y);
        audio.shieldHit();
        this.spendPierce(b);
        if (!b.active) return;
      }
    }
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
      this.optionSprites.push(this.add.image(this.roverX, this.ry - 24, 'option').setDepth(9));
    }
    while (this.optionSprites.length > this.power.options) this.optionSprites.pop()!.destroy();
  }

  private updateOptions(): void {
    this.optionSprites.forEach((o, i) => {
      const tx = this.roverX + (i === 0 ? -14 : 16);
      const ty = this.ry - (i === 0 ? 24 : 30) + Math.sin(this.frame * 0.08 + i) * 2;
      o.x += (tx - o.x) * 0.15;
      o.y += (ty - o.y) * 0.15;
      o.setVisible(this.rover.visible || this.invuln > 0);
    });
  }

  // ---------------------------------------------------------------- course

  private spawnObstacles(): void {
    // never spawn into the next course: the clear banner wipes the road anyway
    while (this.nextSpawnX < this.worldX + GAME_W + 40) {
      const d = this.level();
      const x = this.nextSpawnX;
      const roll = this.rng.frac() * (4 + 3 + (d >= 0.5 ? 1.5 : 0) + (d >= 0.25 ? 2 : 0));
      let kind: ObstacleKind;
      if (roll < 4) kind = 'crater';
      else if (roll < 7) kind = 'rock';
      else if (d >= 0.5 && roll < 8.5) kind = 'bigrock';
      else kind = d >= 0.25 ? 'mine' : 'rock';

      let width = 0;
      if (kind === 'crater') {
        const max = Math.min(LN.craterCap, LN.craterMax + d * LN.craterGrowPerLevel);
        width = this.rng.between(LN.craterMin, Math.floor(max));
        this.addObstacle('crater', x, width);
        // later: a rock right after the crater - jump, then shoot
        if (d >= 1 && this.rng.frac() < 0.3) {
          this.addObstacle('rock', x + width + 46, 10);
          width += 56;
        }
      } else {
        width = kind === 'bigrock' ? 14 : kind === 'rock' ? 10 : 8;
        this.addObstacle(kind, x, width);
      }
      const gap = Math.max(LN.gapFloor, this.rng.between(LN.gapMin, LN.gapMax) - d * LN.gapShrinkPerLevel);
      this.nextSpawnX = x + width + gap;
    }
  }

  private addObstacle(kind: ObstacleKind, wx: number, w: number): void {
    const h = { crater: 0, rock: 7, bigrock: 11, mine: 4 }[kind];
    const hp = kind === 'bigrock' ? 2 : 1;
    let sprite: Phaser.GameObjects.Image | undefined;
    if (kind !== 'crater') {
      const key = kind === 'mine' ? 'ln-mine-0' : `ln-${kind}`;
      sprite = this.add.image(wx - this.worldX, GROUND_Y + 1, key).setOrigin(0, 1).setDepth(3);
    }
    this.obstacles.push({ kind, wx, w, h, hp, alive: true, passed: false, sprite });
  }

  private updateObstacles(hostile: boolean): void {
    const rTop = this.ry - 11;
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      const sx = o.wx - this.worldX;
      if (o.sprite) {
        o.sprite.x = Math.round(sx);
        if (o.kind === 'mine') o.sprite.setTexture(this.frame % 30 < 15 ? 'ln-mine-0' : 'ln-mine-1');
      }
      if (sx + o.w < -30) {
        o.alive = false;
        o.sprite?.destroy();
        continue;
      }
      if (!hostile) continue;

      // cleared it: jump bonus
      if (!o.passed && sx + o.w < this.roverX - 12) {
        o.passed = true;
        this.hud.addScore(LN.points.jump);
        this.checkExtraLife();
      }

      if (o.kind === 'crater') continue;
      const hit =
        this.roverX + 10 > sx + 1 && this.roverX - 10 < sx + o.w - 1 && this.ry > GROUND_Y - o.h + 1 && rTop < GROUND_Y;
      if (hit && this.invuln <= 0) {
        if (this.absorb()) {
          if (o.kind === 'mine') {
            o.alive = false;
            o.sprite?.destroy();
            this.spawnSparks(sx + 4, GROUND_Y - 3, 0xff3c50, 10);
          } else {
            this.breakRock(o, false);
          }
          continue;
        }
        this.killRover(false, o.kind);
        return;
      }
    }
    if (this.obstacles.length > 40) this.obstacles = this.obstacles.filter((o) => o.alive);
  }

  private breakRock(o: Obstacle, score = true): void {
    o.alive = false;
    const sx = o.wx - this.worldX;
    this.spawnSparks(sx + o.w / 2, GROUND_Y - o.h / 2, 0xd8b48c, o.kind === 'bigrock' ? 18 : 10);
    o.sprite?.destroy();
    audio.rockBreak();
    if (score) this.scoreKill(o.kind === 'bigrock' ? LN.points.bigrock : LN.points.rock, sx + o.w / 2, GROUND_Y - 14);
  }

  private checkCheckpoint(): void {
    const seg = Math.floor(this.worldX / LN.segmentLen);
    if (seg <= this.lastSeg) return;
    this.lastSeg = seg;
    if (this.auto && !this.demo) console.info(`[lunar] point ${letter(seg)} score=${this.hud.score}`);
    if (seg % LN.segmentsPerCourse === 0) {
      this.courseClear(seg);
      return;
    }
    this.hud.addScore(LN.points.checkpoint);
    this.hud.showToast(this, `POINT ${letter(seg)}`);
    audio.checkpoint();
    this.checkExtraLife();
  }

  private courseClear(seg: number): void {
    const secs = Math.round(this.courseFrames / 60);
    const bonus = LN.points.courseBase * this.course + Math.max(0, LN.parSeconds - secs) * 100;
    this.hud.addScore(bonus);
    this.checkExtraLife();
    this.clearHostiles();
    this.nextSpawnX = this.worldX + LN.respawnRunway + 140;
    this.state = 'cleared';
    this.stateTimer = 190;
    this.banner.setText(`POINT ${letter(seg)} - COURSE ${this.course} CLEAR`).setVisible(true);
    this.bannerSub.setText(`TIME ${secs}s   BONUS ${bonus}`).setVisible(true);
    audio.waveClear();
  }

  private clearHostiles(): void {
    for (const o of this.obstacles) o.sprite?.destroy();
    this.obstacles = [];
    for (const f of this.flyers) f.sprite.destroy();
    this.flyers = [];
    [...this.bombs, ...this.fwdBullets, ...this.upBullets].forEach((b) => this.deactivate(b));
    for (const c of this.capsules) c.img.setActive(false).setVisible(false);
  }

  // ---------------------------------------------------------------- flyers

  private spawnFlyers(): void {
    const d = this.level();
    if (--this.saucerTimer <= 0) {
      this.saucerTimer = Math.max(LN.saucerMinFrames, LN.saucerBaseFrames - d * LN.saucerHastePerLevel);
      const n = d >= 1 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const sprite = this.add.image(-12 - i * 24, 40 + i * 13, 'ln-saucer-0').setDepth(6);
        this.flyers.push({
          kind: 'saucer',
          sprite,
          alive: true,
          t: 0,
          baseY: 36 + i * 13 + this.rng.between(0, 10),
          phase: i * 1.3,
          vx: LN.saucerSpeed + d * 0.15,
          bombTimer: this.rng.between(LN.bombMinFrames, LN.bombMaxFrames),
          leaving: false
        });
      }
    }
    if (d >= LN.skimmerFromLevel && --this.skimmerTimer <= 0) {
      this.skimmerTimer = Math.max(LN.skimmerMinFrames, LN.skimmerBaseFrames - d * 90);
      const sprite = this.add.image(GAME_W + 16, GROUND_Y - 8, 'ln-skimmer').setDepth(7);
      this.flyers.push({
        kind: 'skimmer',
        sprite,
        alive: true,
        t: 0,
        baseY: GROUND_Y - 8,
        phase: 0,
        vx: -LN.skimmerSpeed - d * 0.2,
        bombTimer: 0,
        leaving: false
      });
      audio.skimmer();
      this.hud.showToast(this, 'WARNING - SKIMMER');
    }
  }

  private updateFlyers(hostile: boolean): void {
    const d = this.level();
    for (const f of this.flyers) {
      if (!f.alive) continue;
      f.t++;
      const s = f.sprite;
      if (f.kind === 'skimmer') {
        s.x += f.vx;
        s.y = f.baseY + (f.t % 20 < 10 ? 0 : -1);
        if (s.x < -20) this.removeFlyer(f);
        else if (hostile && this.invuln <= 0 && this.hitsRover(s.x, s.y, 7, 3)) {
          if (this.absorb()) this.killFlyer(f, false);
          else this.killRover(false, 'skimmer');
        }
        continue;
      }

      // saucer: sweep in, weave back and forth, then leave
      s.setTexture(f.t % 16 < 8 ? 'ln-saucer-0' : 'ln-saucer-1');
      if (f.t > LN.saucerLifeFrames) f.leaving = true;
      s.x += f.vx;
      if (!f.leaving) {
        if (s.x > GAME_W - 20 && f.vx > 0) f.vx = -Math.abs(f.vx);
        if (s.x < 20 && f.vx < 0 && f.t > 60) f.vx = Math.abs(f.vx);
      }
      s.y = f.baseY + Math.sin(f.t * 0.045 + f.phase) * 16;
      if (f.leaving && (s.x > GAME_W + 20 || s.x < -20)) {
        this.removeFlyer(f);
        continue;
      }
      if (!hostile) continue;
      // bombs come quicker when a saucer is over the rover
      f.bombTimer -= Math.abs(s.x - this.roverX) < 50 ? 1.5 : 1;
      if (f.bombTimer <= 0 && s.x > 10 && s.x < GAME_W - 10) {
        f.bombTimer = Math.max(30, this.rng.between(LN.bombMinFrames, LN.bombMaxFrames) - d * 10);
        const bomb = this.getFromPool(this.bombs, 'ln-bomb');
        bomb.setPosition(s.x, s.y + 4).setDepth(7).setData('vy', 0.5);
        audio.bombDrop();
      }
    }
    if (this.flyers.length > 24) this.flyers = this.flyers.filter((f) => f.alive);
  }

  private removeFlyer(f: Flyer): void {
    f.alive = false;
    f.sprite.destroy();
  }

  private killFlyer(f: Flyer, score = true): void {
    const { x, y } = f.sprite;
    this.removeFlyer(f);
    this.spawnSparks(x, y, f.kind === 'saucer' ? 0x50ff9b : 0xff5a5a, 14);
    this.cameras.main.shake(70, 0.004);
    audio.alienDie();
    if (!score) return;
    this.scoreKill(f.kind === 'saucer' ? LN.points.saucer : LN.points.skimmer, x, y);
    if (Math.random() < LN.capsuleDropChance) this.dropCapsule(x, y);
  }

  private updateBombs(hostile: boolean): void {
    for (const b of this.bombs) {
      if (!b.active) continue;
      const vy = Math.min(3, (b.getData('vy') as number) + 0.05);
      b.setData('vy', vy);
      b.y += vy;
      if (hostile && this.invuln <= 0 && this.hitsRover(b.x, b.y, 2, 3)) {
        this.deactivate(b);
        if (this.absorb()) continue;
        this.killRover(false, 'bomb');
        return;
      }
      if (b.y >= GROUND_Y - 1) {
        this.deactivate(b);
        this.bombImpact(b.x);
      }
    }
  }

  /** Bombs dig fresh craters - except right on top of the rover, which would be unfair. */
  private bombImpact(sx: number): void {
    this.spawnSparks(sx, GROUND_Y - 1, 0xffa028, 10);
    audio.groundHit();
    if (this.state !== 'play') return;
    if (sx > this.roverX - 24 && sx < this.roverX + 48) return;
    const wx = this.worldX + sx - 6;
    const clash = this.obstacles.some((o) => o.alive && wx < o.wx + o.w + 10 && wx + 12 > o.wx - 10);
    if (!clash && sx > 0 && sx < GAME_W) this.addObstacle('crater', wx, 12);
  }

  private hitsRover(x: number, y: number, rx: number, ry: number): boolean {
    if (!this.rover.visible && this.invuln <= 0) return false;
    return x + rx > this.roverX - 10 && x - rx < this.roverX + 10 && y + ry > this.ry - 12 && y - ry < this.ry;
  }

  // ---------------------------------------------------------------- capsules

  private dropCapsule(x: number, y: number): void {
    let c = this.capsules.find((p) => !p.img.active);
    if (!c) {
      c = { img: this.add.image(0, 0, 'capsule').setDepth(7), wx: 0, landed: false };
      this.capsules.push(c);
    }
    c.img.setActive(true).setVisible(true).setPosition(x, y).setAngle(0);
    c.landed = false;
  }

  private updateCapsules(): void {
    for (const c of this.capsules) {
      if (!c.img.active) continue;
      if (!c.landed) {
        c.img.y += 0.9;
        c.img.setAngle(c.img.angle + 3);
        if (c.img.y >= GROUND_Y - 4) {
          c.img.y = GROUND_Y - 4;
          c.landed = true;
          c.wx = this.worldX + c.img.x;
        }
      } else {
        c.img.x = c.wx - this.worldX;
        if (c.img.x < -10) {
          c.img.setActive(false).setVisible(false);
          continue;
        }
      }
      if (Math.abs(c.img.x - this.roverX) < 13 && Math.abs(c.img.y - (this.ry - 6)) < 10) {
        c.img.setActive(false).setVisible(false);
        this.power.collect();
        this.hud.setPowerCursor(this.power.cursor);
        audio.capsule();
      }
    }
  }

  // ---------------------------------------------------------------- drawing

  private drawWorld(): void {
    const g = this.ground;
    g.clear();
    g.fillStyle(0x685c78, 1).fillRect(0, GROUND_Y, GAME_W, GAME_H - GROUND_Y);
    g.fillStyle(0x7c6e8e, 1).fillRect(0, GROUND_Y, GAME_W, 4);
    g.fillStyle(0x4a4058, 1).fillRect(0, GROUND_Y + 18, GAME_W, GAME_H - GROUND_Y - 18);
    g.fillStyle(0xc8bed7, 1).fillRect(0, GROUND_Y, GAME_W, 1);
    // surface speckle scrolls with the world
    g.fillStyle(0x504660, 1);
    for (let i = 0; i < 30; i++) {
      const x = (((i * 53 - this.worldX) % 420) + 420) % 420 - 18;
      g.fillRect(x, GROUND_Y + 2 + (i % 3) * 5, 2 + (i % 2), 1);
    }
    g.fillStyle(0x3c3448, 1);
    for (let i = 0; i < 20; i++) {
      const x = (((i * 71 - this.worldX) % 440) + 440) % 440 - 30;
      g.fillRect(x, GROUND_Y + 20 + (i % 3) * 4, 6, 1);
    }

    for (const o of this.obstacles) {
      if (!o.alive || o.kind !== 'crater') continue;
      const sx = Math.round(o.wx - this.worldX);
      if (sx > GAME_W + 4 || sx + o.w < -4) continue;
      for (let r = 0; r < 13; r++) {
        const inset = Math.floor(r * 0.35) + (r > 8 ? (r - 8) * 2 : 0);
        g.fillStyle(r < 2 ? 0x2a1834 : 0x1e1028, 1).fillRect(sx + inset, GROUND_Y + r, o.w - inset * 2, 1);
      }
      g.fillStyle(0xc8bed7, 1);
      g.fillRect(sx - 2, GROUND_Y - 1, 3, 1);
      g.fillRect(sx + o.w - 1, GROUND_Y - 1, 3, 1);
    }

    // progress through the current course: letter to letter
    const p = this.progress;
    p.clear();
    const x0 = Math.round(GAME_W / 2 - 42);
    const x1 = Math.round(GAME_W / 2 + 42);
    const courseLen = LN.segmentLen * LN.segmentsPerCourse;
    const startSeg = (this.course - 1) * LN.segmentsPerCourse;
    const frac = Phaser.Math.Clamp((this.worldX - startSeg * LN.segmentLen) / courseLen, 0, 1);
    p.fillStyle(0x2c2c5a, 1).fillRect(x0, 7, x1 - x0, 1);
    p.fillStyle(0x5ae1ff, 1).fillRect(x0, 7, Math.round((x1 - x0) * frac), 1);
    for (let i = 1; i < LN.segmentsPerCourse; i++) {
      const tx = x0 + Math.round(((x1 - x0) * i) / LN.segmentsPerCourse);
      p.fillStyle(frac * LN.segmentsPerCourse >= i ? 0xffd25a : 0x55608c, 1).fillRect(tx, 5, 1, 5);
    }
    p.fillStyle(0xffffff, 1).fillRect(x0 + Math.round((x1 - x0) * frac) - 1, 5, 3, 5);
    this.letterFrom.setText(letter(startSeg));
    this.letterTo.setText(letter(startSeg + LN.segmentsPerCourse));
  }

  // ---------------------------------------------------------------- scoring + fx

  private scoreKill(base: number, x: number, y: number): void {
    const pts = base * this.chainLevel;
    this.hud.addScore(pts);
    if (this.chainTimer > 0 && this.chainLevel < CHAIN_MAX) {
      this.chainLevel++;
      audio.chain(this.chainLevel);
    }
    this.chainTimer = CHAIN_WINDOW_MS;
    this.hud.setChain(this.chainLevel);
    if (this.chainLevel > 1) this.floatScore(x, y, `${pts}`);
    this.checkExtraLife();
  }

  private floatScore(x: number, y: number, text: string): void {
    const t = ptext(this, x, y, text, 1, '#ffdc50')
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  private checkExtraLife(): void {
    if (this.hud.score >= this.nextExtraLife) {
      this.nextExtraLife += waves.extraLifeEvery;
      this.lives = Math.min(5, this.lives + 1);
      this.hud.setLives(this.lives);
      this.hud.showToast(this, 'EXTRA ROVER');
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
      const a = Math.random() * Math.PI * 2;
      const v = 0.4 + Math.random() * 1.6;
      s.setActive(true)
        .setVisible(true)
        .setPosition(x, y)
        .setTint(tint)
        .setAlpha(1)
        .setData('vx', Math.cos(a) * v)
        .setData('vy', Math.sin(a) * v - 0.6)
        .setData('life', 14 + Math.random() * 16);
    }
  }

  private updateSparks(): void {
    for (const s of this.sparks) {
      if (!s.active) continue;
      const life = (s.getData('life') as number) - 1;
      s.setData('life', life);
      if (life <= 0 || s.y > GROUND_Y + 2) {
        s.setActive(false).setVisible(false);
        continue;
      }
      s.x += s.getData('vx') as number;
      s.setData('vy', (s.getData('vy') as number) + 0.06); // low lunar gravity
      s.y += s.getData('vy') as number;
      s.setAlpha(Math.min(1, life / 14));
    }
  }

  // ---------------------------------------------------------------- death / flow

  /** Shield soaks one hit (not craters). Returns true if absorbed. */
  private absorb(): boolean {
    if (this.power.shieldHp <= 0) return false;
    this.power.shieldHp--;
    this.invuln = 30;
    this.spawnSparks(this.roverX, this.ry - 7, 0x5ae1ff, 8);
    audio.shieldHit();
    return true;
  }

  private killRover(fell: boolean, why = ''): void {
    if (this.state !== 'play') return;
    if (this.auto && !this.demo) console.info(`[lunar] died (${fell ? 'crater' : why}) at x=${Math.round(this.worldX)}`);
    this.lives--;
    this.hud.setLives(this.lives);
    this.state = 'dying';
    this.stateTimer = 110;
    this.sink = fell ? 22 : 0;
    this.speed = 0;
    this.power.reset();
    this.syncOptions();
    this.hud.setPowerCursor(-1);
    this.chainLevel = 1;
    this.chainTimer = 0;
    this.hud.setChain(1);
    this.shieldArc.setVisible(false);
    if (!fell) this.explodeRover();
  }

  private explodeRover(): void {
    const x = this.roverX;
    const y = this.ry - 6;
    this.spawnSparks(x, y, 0x5ae1ff, 22);
    this.spawnSparks(x, y, 0xffa028, 14);
    this.cameras.main.shake(240, 0.012);
    audio.playerDie();
    this.rover.setVisible(false);
    this.wheels.forEach((w) => w.setVisible(false));
  }

  private updateDying(): void {
    if (this.sink > 0) {
      // nose-dive into the crater, then blow up
      this.sink--;
      this.ry += 0.6;
      this.rover.setPosition(Math.round(this.roverX), Math.round(this.ry - 7)).setAngle(Math.min(20, (22 - this.sink) * 1.2));
      this.wheels.forEach((w, i) => w.setPosition(Math.round(this.roverX + WHEEL_X[i]), Math.round(this.ry - 2.5)));
      if (this.sink === 0) this.explodeRover();
    }
    if (--this.stateTimer > 0) return;
    if (this.lives <= 0) {
      this.gameOver();
      return;
    }
    this.respawn();
  }

  /** Back to the last lettered checkpoint with a clear runway. */
  private respawn(): void {
    this.clearHostiles();
    const cp = this.lastSeg * LN.segmentLen;
    this.worldX = cp;
    this.nextSpawnX = cp + LN.respawnRunway;
    this.speed = LN.speedBase;
    this.roverX = 70;
    this.ry = GROUND_Y;
    this.vy = 0;
    this.grounded = true;
    this.rover.setAngle(0).setVisible(true);
    this.wheels.forEach((w) => w.setVisible(true));
    this.saucerTimer = 240;
    this.skimmerTimer = Math.max(this.skimmerTimer, 300);
    this.invuln = waves.player.respawnInvulnFrames;
    this.state = 'banner';
    this.stateTimer = 100;
    this.banner.setText(`POINT ${letter(this.lastSeg)}`).setVisible(true);
    this.bannerSub.setText('GET READY').setVisible(true);
    this.placeRover();
  }

  private gameOver(): void {
    music.stop();
    this.state = 'gameover';
    this.stateTimer = this.demo ? 60 : 180;
    this.banner.setText('GAME OVER').setVisible(true);
    this.bannerSub.setText(`SCORE ${this.hud.score}`).setVisible(true);
  }

  private exitRun(): void {
    if (this.demo) {
      this.scene.start('attract', { page: 'title' });
      return;
    }
    const wave = this.waveBase + this.course;
    if (qualifies(this.hud.score)) this.scene.start('initials', { score: this.hud.score, wave });
    else this.scene.start('attract', { page: 'scores' });
  }
}
