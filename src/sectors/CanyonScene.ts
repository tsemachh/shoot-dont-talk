import Phaser from 'phaser';
import { GAME_W, GAME_H, STEP_MS } from '../core/config';
import { InputMap } from '../core/input';
import { standardPad } from '../ui/touchpad';
import { Fx, flashBurst } from '../systems/fx';
import { makeTextures } from '../systems/textures';
import { audio } from '../systems/audio';
import { music } from '../systems/music';
import { PowerState, powerName, type Slot } from '../systems/powerups';
import { Hud } from '../ui/hud';
import { ptext, PText } from '../ui/pixelFont';
import { bindDemoExit, DEMO_FRAMES, DEMO_LABEL } from '../ui/demo';
import { hiScore, qualifies } from '../core/save';
import waves from '../data/waves.json';
import type { SectorCarry } from './JumpScene';

const CY = waves.canyon;
const CHAIN_WINDOW_MS = 2000;
const CHAIN_MAX = 8;
const JET_Y = GAME_H - CY.jetY;

type Kind = 'boat' | 'heli' | 'jet' | 'fuel' | 'bridge' | 'deco';

interface Obj {
  kind: Kind;
  x: number;
  wy: number; // world y (grows upriver)
  vx: number;
  w: number;
  h: number;
  alive: boolean;
  sprite?: Phaser.GameObjects.Image;
  bridge?: number; // bridge index (1..bridges)
  fireCd: number;
}

interface Bullet {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  pierce: number;
}

interface Edges {
  l: number;
  r: number;
  il: number; // island left/right (0 = no island)
  ir: number;
}

/** Deterministic 0..1 hash for block-seeded spawning (replays exactly after a respawn). */
function hash(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/**
 * Sector 5 "Canyon River" - River Raid homage, the final sector. A jet flies up
 * a winding river (terrain generator adapted from the owner's River Raid
 * remake, itself after the MIT pygame-River-Raid one): banks and islands are
 * deadly, fuel drains and refills over depots, every section ends at a bridge
 * that must be shot down and becomes the respawn checkpoint. Boats and
 * helicopters patrol, jets streak across. Clear the last bridge and the whole
 * run loops back to sector 1, harder.
 */
export class CanyonScene extends Phaser.Scene {
  private inputMap!: InputMap;
  private hud!: Hud;
  private power = new PowerState();

  // terrain, one entry per world pixel line
  private tl!: Int16Array;
  private tr!: Int16Array;
  private til!: Int16Array;
  private tir!: Int16Array;
  private total = 0;

  private ground!: Phaser.GameObjects.Graphics;
  private water!: Phaser.GameObjects.TileSprite;
  private gauge!: Phaser.GameObjects.Graphics;
  private jet!: Phaser.GameObjects.Image;
  private flame!: Phaser.GameObjects.Image;
  private shieldArc!: Phaser.GameObjects.Arc;
  private banner!: PText;
  private bannerSub!: PText;
  private bridgeText!: PText;

  private objs: Obj[] = [];
  private shots: Bullet[] = [];
  private eshots: Bullet[] = [];
  private sparks: Phaser.GameObjects.Image[] = [];
  private capsules: Obj[] = [];
  private optionSprites: Phaser.GameObjects.Image[] = [];

  private dist = 0; // world y at the jet's row
  private speed = CY.speedBase;
  private jx = GAME_W / 2;
  private fuel = 1;
  private nextBlockWy = 0;
  private nextBridge = 1;
  private bridgesDown = 0;
  private checkpointWy = 0;
  private lowBeep = 0;
  private refueling = false;

  private waveBase = 10;
  private loop = 1;
  private lives = 3;
  private invuln = 0;
  private fireCooldown = 0;
  private nextExtraLife = waves.extraLifeEvery;
  private accumulator = 0;
  private frame = 0;
  private chainLevel = 1;
  private chainTimer = 0;
  private state: 'banner' | 'play' | 'dying' | 'cleared' | 'gameover' = 'banner';
  private stateTimer = 0;
  private demo = false;
  private auto = false;
  private demoTimer = 0;

  constructor() {
    super('canyon');
  }

  create(data: Partial<SectorCarry> & { demo?: boolean; auto?: boolean }): void {
    this.resetRunState();
    this.demo = data.demo === true;
    this.auto = this.demo || data.auto === true;
    this.waveBase = data.waveBase ?? 10;
    this.loop = data.loop ?? 1;
    this.lives = data.lives ?? 3;
    this.power = data.power instanceof PowerState ? data.power : new PowerState();
    makeTextures(this);
    this.cameras.main.setBackgroundColor('#2c7034');
    this.buildTerrain();

    this.water = this.add.tileSprite(0, 0, GAME_W, GAME_H, 'cy-water').setOrigin(0, 0).setDepth(-1);
    this.ground = this.add.graphics().setDepth(0);
    this.jet = this.add.image(this.jx, JET_Y, 'ship-jet').setDepth(10);
    this.flame = this.add.image(this.jx, JET_Y + 7, 'flame').setDepth(9);
    this.shieldArc = this.add.arc(0, 0, 10).setStrokeStyle(1, 0x5ae1ff, 0.8).setDepth(11).setVisible(false);

    this.inputMap = new InputMap(this);
    this.inputMap.attachPad(standardPad(this, { demo: this.demo }));
    new Fx(this);
    music.play('canyon');
    this.hud = new Hud(this);
    this.hud.onActivate = () => this.tryActivate();
    this.hud.setLives(this.lives);
    this.hud.hiScore = hiScore();
    this.hud.addScore(data.score ?? 0);
    this.hud.setPowerCursor(this.power.cursor);
    this.syncOptions();

    this.gauge = this.add.graphics().setDepth(100);
    this.bridgeText = ptext(this, GAME_W / 2 + 60, 3, '', 1, '#c8d0ff').setDepth(100);
    this.banner = ptext(this, GAME_W / 2, 70, '', 2, '#ffd25a').setOrigin(0.5).setDepth(120);
    this.bannerSub = ptext(this, GAME_W / 2, 82, '', 1, '#ffffff').setOrigin(0.5, 0).setCenterAlign().setDepth(120);

    const kb = this.input.keyboard!;
    kb.on('keydown', () => audio.unlock());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      if (p.worldY > GAME_H - 18 && p.worldX > GAME_W - 170) this.tryActivate();
    });
    if (this.demo) bindDemoExit(this);

    this.restartAt(0, true);
  }

  private resetRunState(): void {
    this.objs = [];
    this.shots = [];
    this.eshots = [];
    this.sparks = [];
    this.capsules = [];
    this.optionSprites = [];
    this.bridgesDown = 0;
    this.checkpointWy = 0;
    this.invuln = 0;
    this.fireCooldown = 0;
    this.nextExtraLife = waves.extraLifeEvery;
    this.accumulator = 0;
    this.frame = 0;
    this.chainLevel = 1;
    this.chainTimer = 0;
    this.demoTimer = 0;
  }

  // ---------------------------------------------------------------- terrain

  /**
   * Pre-generate the whole river (one row per world px): meandering width,
   * slow sideways drift, islands in wide water, and a narrow neck at every
   * bridge. Seeded, so a respawn replays the same canyon.
   */
  private buildTerrain(): void {
    const sec = CY.sectionLen;
    this.total = sec * (CY.bridges + 1) + 400;
    const T = this.total;
    const tl = new Int16Array(T);
    const tr = new Int16Array(T);
    const til = new Int16Array(T);
    const tir = new Int16Array(T);
    let seed = (0x6a3f17c5 + this.loop * 7919) >>> 0;
    const RB = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return (seed >>> 15) & 0xff;
    };
    const RI = (a: number, b: number) => a + Math.floor((RB() / 256) * (b - a + 1));
    const mid = GAME_W >> 1;
    const neck = CY.bridgeNeck;
    const settle = CY.settle;
    let width = 190;
    let target = 190;
    let xoff = 0;
    let dir = 0;
    let nx = 0;
    let nw = 0;
    let nisl = 0;
    let islH = 0;
    let islMax = 0;
    let islBot = 0;
    let islTop = 0;
    let gap = 0;
    for (let L = 0; L < T; L++) {
      const inSec = L % sec;
      const k = Math.floor(L / sec); // section index (0 = first)
      const lo = Math.max(90, CY.widthMin - k * CY.widthShrinkPerSection);
      const hi = Math.max(lo + 30, CY.widthMax - k * CY.widthShrinkPerSection);
      if (gap > 0) gap--;
      if (
        k > 0 &&
        inSec > settle &&
        sec - inSec > 260 &&
        nw === 0 &&
        nisl === 0 &&
        width >= CY.islandMinWidth &&
        gap === 0 &&
        RB() % 7 === 1
      ) {
        islH = RI(70, 150);
        nisl = islH;
        islMax = RI(40, 80);
        islBot = RI(16, islMax);
        islTop = RI(16, islMax);
      }
      if (nx <= 0) {
        dir = (RB() % 3) - 1;
        nx = (RB() % 8) + 6;
      }
      xoff += dir * ((RB() % 2) + 1) * 0.6;
      nx--;
      if (xoff > CY.driftMax) {
        xoff = CY.driftMax;
        dir = -1;
      } else if (xoff < -CY.driftMax) {
        xoff = -CY.driftMax;
        dir = 1;
      }
      if (nisl === 0) {
        if (k > 0 && inSec < 4) {
          width = neck; // bridge neck, then open up
          target = RI(lo, hi);
          nw = settle;
        } else if (RB() % 120 === 1 && nw === 0) {
          target = RI(lo, hi);
          nw = settle;
        }
        if (sec - inSec <= settle) {
          target = neck;
          nw = Math.max(1, sec - inSec);
        }
      } else {
        const iw = nisl === islH ? islBot : nisl === 1 ? islTop : RI((islTop + islBot) >> 1, islMax);
        til[L] = mid - (iw >> 1) + xoff;
        tir[L] = mid + (iw >> 1) + xoff;
        nisl--;
        if (nisl === 0) gap = 300;
      }
      if (nw > 0) {
        width += (target - width) / nw;
        nw--;
      }
      const l = Math.round(Math.max(8, mid - width / 2 + xoff));
      const r = Math.round(Math.min(GAME_W - 8, mid + width / 2 + xoff));
      tl[L] = l;
      tr[L] = Math.max(l + 24, r);
    }
    // smooth banks into curves; taper islands to points
    const smooth = (a: Int16Array, rad: number, skipZero: boolean) => {
      const out = new Int16Array(T);
      for (let L = 0; L < T; L++) {
        if (skipZero && a[L] <= 0) continue;
        let s = 0;
        let n = 0;
        for (let k = -rad; k <= rad; k++) {
          const i = L + k;
          if (i >= 0 && i < T && (!skipZero || a[i] > 0)) {
            s += a[i];
            n++;
          }
        }
        out[L] = Math.round(s / n);
      }
      a.set(out);
    };
    smooth(tl, 6, false);
    smooth(tr, 6, false);
    smooth(til, 4, true);
    smooth(tir, 4, true);
    for (let i = 0; i < T; ) {
      if (til[i] > 0) {
        let j = i;
        while (j < T && til[j] > 0) j++;
        const tap = Math.min(18, Math.max(1, (j - i) >> 1));
        for (let k = 0; k < tap; k++) {
          const f = (k + 1) / (tap + 1);
          for (const a of [i + k, j - 1 - k]) {
            const c = (til[a] + tir[a]) / 2;
            const h = ((tir[a] - til[a]) / 2) * f;
            til[a] = Math.round(c - h);
            tir[a] = Math.round(c + h);
          }
        }
        i = j;
      } else i++;
    }
    this.tl = tl;
    this.tr = tr;
    this.til = til;
    this.tir = tir;
  }

  private edges(wy: number): Edges {
    const i = Phaser.Math.Clamp(Math.floor(wy), 0, this.total - 1);
    const il = this.til[i];
    const ir = this.tir[i];
    return { l: this.tl[i], r: this.tr[i], il: ir - il > 2 ? il : 0, ir: ir - il > 2 ? ir : 0 };
  }

  /** Centre of the widest open channel at wy. */
  private channelX(wy: number): number {
    const e = this.edges(wy);
    if (e.il > 0) return e.il - e.l >= e.r - e.ir ? (e.l + e.il) / 2 : (e.ir + e.r) / 2;
    return (e.l + e.r) / 2;
  }

  private w2s(wy: number): number {
    return JET_Y - (wy - this.dist);
  }

  private bridgeWy(k: number): number {
    return k * CY.sectionLen + 2;
  }

  /** Put the run at a world position with a clear runway (start or a destroyed bridge). */
  private restartAt(wy: number, first: boolean): void {
    for (const o of this.objs) o.sprite?.destroy();
    this.objs = [];
    for (const c of this.capsules) c.sprite?.destroy();
    this.capsules = [];
    [...this.shots, ...this.eshots].forEach((b) => b.img.setActive(false).setVisible(false));
    this.dist = wy;
    this.jx = this.channelX(wy);
    this.speed = CY.speedBase;
    this.fuel = 1;
    this.nextBlockWy = Math.ceil((wy + CY.runway) / CY.block) * CY.block;
    this.nextBridge = this.bridgesDown + 1;
    // scenery for the visible stretch
    for (let b = Math.floor((wy - 40) / CY.block); b * CY.block < wy + GAME_H; b++) this.spawnDeco(b);
    this.state = 'banner';
    this.stateTimer = first ? 170 : 100;
    if (first) {
      this.banner.setText('CANYON RIVER').setVisible(true);
      this.bannerSub
        .setText(`SECTOR 5 - FINAL STAGE\nFLY OVER FUEL - SHOOT THE BRIDGES\n${this.sys.game.device.input.touch ? 'STICK: STEER - UP FAST DOWN SLOW\nHOLD FIRE TO SHOOT' : 'UP SPEED  DOWN BRAKE'}`)
        .setVisible(true);
    } else {
      this.banner.setText(this.bridgesDown > 0 ? `BRIDGE ${this.bridgesDown}` : 'CANYON RIVER').setVisible(true);
      this.bannerSub.setText('GET READY').setVisible(true);
    }
    this.invuln = first ? 0 : waves.player.respawnInvulnFrames;
    this.jet.setVisible(true).setPosition(this.jx, JET_Y);
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
        this.draw();
        if (--this.stateTimer <= 0) this.exitRun();
        return;
      case 'dying':
        this.updateSparks();
        this.draw();
        if (--this.stateTimer <= 0) this.restartAt(this.checkpointWy, false);
        return;
      case 'cleared':
        this.dist += CY.speedBase;
        this.updateObjects(false);
        this.updateSparks();
        this.draw();
        if (--this.stateTimer <= 0) this.loopBack();
        return;
      case 'banner':
        if (--this.stateTimer <= 0) {
          this.state = 'play';
          this.banner.setVisible(false);
          this.bannerSub.setText(this.demo ? DEMO_LABEL : '').setVisible(this.demo);
        }
        break;
    }

    const hostile = this.state === 'play';
    this.updateJet(hostile);
    this.spawnAhead();
    this.updateObjects(hostile);
    this.updateShots();
    this.updateCapsules();
    this.updateOptions();
    this.updateSparks();
    if (hostile) this.updateFuel();
    this.draw();

    if (this.invuln > 0) {
      this.invuln--;
      const vis = this.invuln % 6 < 3;
      this.jet.setVisible(vis);
      this.flame.setVisible(vis);
    }
  }

  // ---------------------------------------------------------------- jet

  private updateJet(hostile: boolean): void {
    const pad = this.input.gamepad?.getPad(0);
    if (pad?.B) this.tryActivate();
    const input = this.auto ? this.demoInput() : this.inputMap.read(this.jx, JET_Y);
    const target = input.y < -0.4 ? CY.speedMax : input.y > 0.4 ? CY.speedMin : CY.speedBase;
    this.speed += (target - this.speed) * 0.06;
    this.dist += this.speed;

    const steer = CY.steer + CY.steerPerSpdLevel * this.power.speedLevel;
    this.jx = Phaser.Math.Clamp(this.jx + input.x * steer, 6, GAME_W - 6);
    this.jet.setPosition(Math.round(this.jx), JET_Y).setScale(input.x === 0 ? 1 : 0.85, 1);
    this.flame
      .setPosition(this.jet.x, JET_Y + 7)
      .setScale(1, 0.8 + this.speed * 0.6 + (Math.random() > 0.5 ? 0.4 : 0))
      .setVisible(this.jet.visible);
    this.shieldArc.setVisible(this.power.shieldHp > 0 && this.jet.visible);
    if (this.power.shieldHp > 0) {
      this.shieldArc
        .setPosition(this.jet.x, JET_Y)
        .setStrokeStyle(1, 0x5ae1ff, 0.25 + 0.25 * this.power.shieldHp)
        .setRadius(10 + Math.sin(this.frame * 0.2));
    }

    // banks and islands are solid ground
    if (hostile) {
      for (const dy of [-4, 0, 4]) {
        const e = this.edges(this.dist + dy);
        const lft = this.jx - 4;
        const rgt = this.jx + 4;
        if (lft < e.l || rgt > e.r || (e.il > 0 && rgt > e.il && lft < e.ir)) {
          this.crash('BANK');
          return;
        }
      }
    }

    this.fireCooldown -= STEP_MS;
    if (hostile && input.fire && this.fireCooldown <= 0) this.fireWeapon();
  }

  private fireWeapon(): void {
    const mode = this.power.fireMode;
    const laser = mode === 'laser';
    const active = this.shots.filter((b) => b.img.active).length;
    const origins = [this.jx, ...this.optionSprites.map((o) => o.x)];
    const vxs = mode === 'spread' ? [-0.9, 0, 0.9] : [0];
    if (active >= (CY.maxBullets + this.power.options) * vxs.length) return;
    this.fireCooldown = laser ? 260 : mode === 'spread' ? 300 : CY.fireCooldownMs;
    for (const x of origins) {
      for (const vx of vxs) {
        const b = this.pool(this.shots, laser ? 'laser' : 'bullet');
        b.img.setPosition(x, JET_Y - 8);
        b.vx = vx;
        b.vy = -(laser ? CY.bulletSpeed * 1.3 : CY.bulletSpeed);
        b.pierce = laser ? 3 : 1;
      }
    }
    if (laser) audio.laser();
    else audio.shoot();
  }

  private pool(list: Bullet[], key: string): Bullet {
    let b = list.find((p) => !p.img.active);
    if (!b) {
      b = { img: this.add.image(0, 0, key).setDepth(8), vx: 0, vy: 0, pierce: 1 };
      list.push(b);
    }
    b.img.setTexture(key).setActive(true).setVisible(true);
    return b;
  }

  private tryActivate(): void {
    const slot = this.power.activate();
    if (!slot) return;
    this.hud.setPowerCursor(-1);
    this.hud.showToast(this, powerName(slot));
    this.syncOptions();
    audio.powerUp();
  }

  private syncOptions(): void {
    while (this.optionSprites.length < this.power.options) {
      this.optionSprites.push(this.add.image(this.jx, JET_Y, 'option').setDepth(9));
    }
    while (this.optionSprites.length > this.power.options) this.optionSprites.pop()!.destroy();
  }

  private updateOptions(): void {
    this.optionSprites.forEach((o, i) => {
      const tx = this.jx + (i === 0 ? -15 : 15);
      o.x += (tx - o.x) * 0.2;
      o.y += (JET_Y + 4 - o.y) * 0.2;
      o.setVisible(this.jet.visible);
    });
  }

  /** Attract pilot: follow the open channel, take fuel when low, sidestep traffic. */
  private demoInput(): { x: number; y: number; fire: boolean } {
    let tx = this.channelX(this.dist + 50);
    let wantFuel = false;
    if (this.fuel < 0.6) {
      const depot = this.objs.find(
        (o) => o.alive && o.kind === 'fuel' && o.wy > this.dist - 4 && o.wy < this.dist + 160
      );
      if (depot) {
        tx = depot.x;
        wantFuel = true;
      }
    }
    // predict where traffic will be when it reaches the jet's row
    let threat: Obj | undefined;
    let threatAt = 0;
    let prey: Obj | undefined;
    let preyAt = 0;
    for (const o of this.objs) {
      if (!o.alive || o.kind === 'fuel' || o.kind === 'deco' || o.kind === 'bridge') continue;
      const ahead = o.wy - this.dist;
      if (ahead < -8 || ahead > 200) continue;
      const px = o.x + o.vx * (Math.max(0, ahead) / Math.max(0.5, this.speed));
      if (ahead < 75 && Math.abs(px - this.jx) < o.w / 2 + 10 && !threat) {
        threat = o;
        threatAt = px;
      } else if (ahead >= 75 && !wantFuel && (!prey || ahead < preyAt)) {
        prey = o;
        preyAt = ahead;
        tx = px; // line up and shoot it while it is far away
      }
    }
    if (threat) {
      const e = this.edges(this.dist + 20);
      tx = Phaser.Math.Clamp(this.jx + (threatAt > this.jx ? -30 : 30), e.l + 10, e.r - 10);
    }
    // sidestep incoming helicopter fire
    for (const b of this.eshots) {
      if (!b.img.active || b.img.y > JET_Y || b.img.y < JET_Y - 70) continue;
      const t = (JET_Y - b.img.y) / Math.max(0.5, b.vy);
      const bx = b.img.x + b.vx * t;
      if (Math.abs(bx - this.jx) < 10) {
        tx = this.jx + (bx > this.jx ? -26 : 26);
        break;
      }
    }
    // keep inside the narrowest part of the channel over the next stretch
    let lo = 0;
    let hi = GAME_W;
    for (let d = -6; d <= 48; d += 6) {
      const e = this.edges(this.dist + d);
      lo = Math.max(lo, e.l + 9);
      hi = Math.min(hi, e.r - 9);
      if (e.il > 0) {
        // stay on the side of the island we are already on
        if (this.jx < (e.il + e.ir) / 2) hi = Math.min(hi, e.il - 9);
        else lo = Math.max(lo, e.ir + 9);
      }
    }
    tx = lo < hi ? Phaser.Math.Clamp(tx, lo, hi) : (lo + hi) / 2;
    const dx = tx - this.jx;
    // hold fire while a depot sits in the firing lane (unless the tank is full)
    const fuelAhead =
      this.fuel < 0.9 &&
      this.objs.some(
        (o) => o.alive && o.kind === 'fuel' && Math.abs(o.x - this.jx) < 10 && o.wy > this.dist && o.wy < this.dist + 200
      );
    if (this.power.cursor >= 1 && this.frame % 90 === 0) this.tryActivate();
    return { x: Math.abs(dx) < 1.5 ? 0 : Phaser.Math.Clamp(dx / 5, -1, 1), y: 0, fire: !fuelAhead && this.frame % 3 !== 0 };
  }

  // ---------------------------------------------------------------- spawning

  private spawnAhead(): void {
    const horizon = this.dist + JET_Y + 30;
    // bridges at each section boundary
    while (this.nextBridge <= CY.bridges && this.bridgeWy(this.nextBridge) < horizon) {
      const k = this.nextBridge;
      this.objs.push({ kind: 'bridge', x: GAME_W / 2, wy: this.bridgeWy(k), vx: 0, w: GAME_W, h: 10, alive: true, bridge: k, fireCd: 0 });
      this.nextBridge++;
    }
    while (this.nextBlockWy < horizon) {
      const b = Math.round(this.nextBlockWy / CY.block);
      this.spawnBlock(b);
      this.spawnDeco(b);
      this.nextBlockWy += CY.block;
    }
  }

  private sectionOf(wy: number): number {
    return Math.floor(wy / CY.sectionLen) + 1;
  }

  private spawnBlock(b: number): void {
    const wy = b * CY.block + CY.block / 2;
    // keep clear of the bridge necks
    const inSec = wy % CY.sectionLen;
    if (inSec < 70 || CY.sectionLen - inSec < 110 || wy > this.bridgeWy(CY.bridges) - 60) return;
    const sec = this.sectionOf(wy);
    const r = hash(b * 3 + this.loop * 1013);
    let kind: Kind | null = null;
    if (r < 0.2) kind = 'fuel';
    else if (r < 0.47) kind = 'heli';
    else if (r < 0.7) kind = 'boat';
    else if (r < 0.78 && sec >= CY.jetFromSection) kind = 'jet';
    if (!kind) return;

    const e = this.edges(wy);
    let lo = e.l + 10;
    let hi = e.r - 10;
    if (e.il > 0) {
      if (e.il - e.l >= e.r - e.ir) hi = e.il - 10;
      else lo = e.ir + 10;
    }
    if (hi <= lo) return;
    const f = hash(b * 7 + 3);
    const dir = hash(b * 11 + 5) < 0.5 ? -1 : 1;
    const key = { boat: 'cy-boat', heli: 'cy-heli-0', jet: 'cy-jet', fuel: 'cy-fuel' }[kind as 'boat'];
    const sprite = this.add.image(0, 0, key).setDepth(kind === 'heli' || kind === 'jet' ? 7 : 5);
    const o: Obj = {
      kind,
      x: kind === 'jet' ? (dir > 0 ? -10 : GAME_W + 10) : lo + f * (hi - lo),
      wy,
      vx: { boat: 0.35, heli: 0.6, jet: 2.4, fuel: 0 }[kind as 'boat'] * dir * (1 + (sec - 1) * 0.08),
      w: sprite.width,
      h: sprite.height,
      alive: true,
      sprite,
      fireCd: 60 + Math.floor(f * 90)
    };
    sprite.setFlipX(o.vx < 0 && kind !== 'jet' ? true : kind === 'jet' && o.vx < 0);
    this.objs.push(o);
  }

  /** Trees and houses on the banks: pure scenery, seeded per block. */
  private spawnDeco(b: number): void {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const h = hash(b * 13 + k * 5 + (side > 0 ? 1 : 0));
        if (h < 0.15) continue;
        const wy = b * CY.block + h * CY.block;
        const e = this.edges(wy);
        const x = side < 0 ? e.l - 10 - hash(b * 17 + k) * 70 : e.r + 10 + hash(b * 19 + k) * 70;
        if (x < 6 || x > GAME_W - 6) continue;
        const key = hash(b * 23 + k * 3 + side) < 0.22 ? 'cy-house' : 'cy-tree';
        const sprite = this.add.image(Math.round(x), 0, key).setDepth(2);
        this.objs.push({ kind: 'deco', x, wy, vx: 0, w: 0, h: 0, alive: true, sprite, fireCd: 0 });
      }
    }
  }

  // ---------------------------------------------------------------- objects

  private updateObjects(hostile: boolean): void {
    const sec = this.sectionOf(this.dist);
    for (const o of this.objs) {
      if (!o.alive) continue;
      const sy = this.w2s(o.wy);
      if (sy > GAME_H + 24) {
        o.alive = false;
        o.sprite?.destroy();
        continue;
      }
      if (o.kind === 'bridge') {
        // an intact bridge is a wall: shoot it down or crash into it
        if (hostile && this.jet.visible && Math.abs(sy - JET_Y) < 6) {
          this.crash('BRIDGE');
          return;
        }
        continue;
      }
      if (o.kind === 'deco' || o.kind === 'fuel') {
        o.sprite?.setPosition(Math.round(o.x), Math.round(sy));
        continue;
      }
      // traffic starts moving once it is on screen
      if (sy > -10) {
        o.x += o.vx;
        if (o.kind !== 'jet') {
          const e = this.edges(o.wy);
          let lo = e.l + o.w / 2 + 1;
          let hi = e.r - o.w / 2 - 1;
          if (e.il > 0) {
            if (o.x < e.il) hi = e.il - o.w / 2 - 1;
            else lo = e.ir + o.w / 2 + 1;
          }
          if (o.x < lo || o.x > hi) {
            o.x = Phaser.Math.Clamp(o.x, lo, hi);
            o.vx = -o.vx;
            o.sprite?.setFlipX(o.vx < 0);
          }
        } else if (o.x < -20 || o.x > GAME_W + 20) {
          o.alive = false;
          o.sprite?.destroy();
          continue;
        }
      }
      if (o.kind === 'heli') o.sprite?.setTexture(this.frame % 8 < 4 ? 'cy-heli-0' : 'cy-heli-1');
      o.sprite?.setPosition(Math.round(o.x), Math.round(sy));

      // helicopters shoot from section 2 on
      if (hostile && o.kind === 'heli' && sec >= CY.heliFireFromSection && sy > 24 && sy < JET_Y - 60) {
        if (--o.fireCd <= 0) {
          o.fireCd = Math.max(90, 170 - sec * 14);
          const b = this.pool(this.eshots, 'ebullet-0');
          b.img.setPosition(o.x, sy + 4);
          const ang = Math.atan2(JET_Y - sy, this.jx - o.x);
          b.vx = Math.cos(ang) * 1.6;
          b.vy = Math.sin(ang) * 1.6 + this.speed;
        }
      }

      // collision with the jet
      if (hostile && this.invuln <= 0 && this.jet.visible) {
        if (Math.abs(o.x - this.jx) < o.w / 2 + 3 && Math.abs(sy - JET_Y) < o.h / 2 + 4) {
          if (this.absorb()) {
            this.kill(o, false);
            continue;
          }
          this.kill(o, false);
          this.crash(o.kind.toUpperCase());
          return;
        }
      }
    }
    if (this.objs.length > 220) this.objs = this.objs.filter((o) => o.alive);
  }

  private updateFuel(): void {
    this.fuel -= CY.fuelDrainPerFrame * (0.6 + 0.4 * this.speed);
    this.refueling = false;
    for (const o of this.objs) {
      if (!o.alive || o.kind !== 'fuel') continue;
      const sy = this.w2s(o.wy);
      if (Math.abs(o.x - this.jx) < o.w / 2 + 3 && Math.abs(sy - JET_Y) < o.h / 2 + 2) {
        this.refueling = true;
        if (this.fuel < 1) {
          this.fuel = Math.min(1, this.fuel + CY.refuelPerFrame);
          if (this.frame % 6 === 0) audio.chain(Math.round(this.fuel * 6) + 1);
        }
      }
    }
    if (this.fuel < CY.lowFuel && --this.lowBeep <= 0) {
      this.lowBeep = 30;
      audio.shieldHit();
      this.hud.showToast(this, 'LOW FUEL', 500);
    }
    if (this.fuel <= 0) this.crash('OUT OF FUEL');
  }

  // ---------------------------------------------------------------- shots

  private updateShots(): void {
    for (const b of this.shots) {
      if (!b.img.active) continue;
      b.img.x += b.vx;
      b.img.y += b.vy;
      if (b.img.y < -6) {
        b.img.setActive(false).setVisible(false);
        continue;
      }
      for (const o of this.objs) {
        if (!o.alive || o.kind === 'deco') continue;
        const sy = this.w2s(o.wy);
        const hit =
          o.kind === 'bridge'
            ? Math.abs(b.img.y - sy) < 6
            : Math.abs(b.img.x - o.x) < o.w / 2 + 1 && Math.abs(b.img.y - sy) < o.h / 2 + 2;
        if (!hit) continue;
        this.kill(o, true);
        b.pierce--;
        if (b.pierce <= 0) {
          b.img.setActive(false).setVisible(false);
          break;
        }
      }
    }
    for (const b of this.eshots) {
      if (!b.img.active) continue;
      b.img.x += b.vx;
      b.img.y += b.vy;
      b.img.setTexture(Math.floor(b.img.y / 4) % 2 ? 'ebullet-1' : 'ebullet-0');
      if (b.img.y > GAME_H + 6 || b.img.x < -6 || b.img.x > GAME_W + 6) {
        b.img.setActive(false).setVisible(false);
        continue;
      }
      if (this.state !== 'play' || this.invuln > 0 || !this.jet.visible) continue;
      if (Math.abs(b.img.x - this.jx) < 5 && Math.abs(b.img.y - JET_Y) < 6) {
        b.img.setActive(false).setVisible(false);
        if (this.absorb()) continue;
        this.crash('HIT');
        return;
      }
    }
  }

  private kill(o: Obj, score: boolean): void {
    o.alive = false;
    o.sprite?.destroy();
    const sy = this.w2s(o.wy);
    if (o.kind === 'bridge') {
      // blow the whole span; it becomes the new checkpoint
      for (let x = 20; x < GAME_W; x += 40) this.spawnSparks(x, sy, x % 80 ? 0xffa028 : 0xffffff, 8);
      flashBurst(this, GAME_W / 2, sy, 0xffa028, 30);
      this.cameras.main.shake(260, 0.012);
      audio.bigBoom();
      this.bridgesDown = Math.max(this.bridgesDown, o.bridge ?? 0);
      this.checkpointWy = o.wy + 6;
      if (score) this.scoreKill(CY.points.bridge, GAME_W / 2, sy - 8);
      this.hud.showToast(this, `BRIDGE ${this.bridgesDown} DOWN`);
      if (this.bridgesDown >= CY.bridges && !this.demo) this.sectorClear();
      return;
    }
    const tint = { boat: 0xe83c50, heli: 0xffd23c, jet: 0x8ad24a, fuel: 0xffffff, deco: 0 }[o.kind];
    this.spawnSparks(o.x, sy, tint, o.kind === 'fuel' ? 16 : 12);
    audio.alienDie();
    if (!score) return;
    this.scoreKill(CY.points[o.kind as 'boat'], o.x, sy);
    if (o.kind !== 'fuel' && Math.random() < CY.capsuleDropChance) this.dropCapsule(o.x, o.wy);
  }

  private dropCapsule(x: number, wy: number): void {
    const slot = this.power.roll();
    const sprite = this.add.image(x, this.w2s(wy), `cap-${slot}`).setDepth(6).setData('slot', slot);
    this.capsules.push({ kind: 'deco', x, wy, vx: 0, w: 8, h: 8, alive: true, sprite, fireCd: 0 });
  }

  private updateCapsules(): void {
    for (const c of this.capsules) {
      if (!c.alive) continue;
      const sy = this.w2s(c.wy);
      c.sprite!.setPosition(c.x, sy);
      if (sy > GAME_H + 10) {
        c.alive = false;
        c.sprite!.destroy();
        continue;
      }
      if (this.jet.visible && Math.abs(c.x - this.jx) < 10 && Math.abs(sy - JET_Y) < 10) {
        c.alive = false;
        const slot = c.sprite!.getData('slot') as Slot;
        c.sprite!.destroy();
        this.power.collect(slot);
        this.tryActivate();
        audio.capsule();
      }
    }
  }

  // ---------------------------------------------------------------- drawing

  private draw(): void {
    const g = this.ground;
    g.clear();
    const STRIP = 2;
    for (let y = 0; y < GAME_H; y += STRIP) {
      const wy = this.dist + (JET_Y - y);
      const e = this.edges(wy);
      const band = Math.floor(wy / 10) & 1;
      // land only - the water tile shows through between the banks
      const land = band ? 0x347e3a : 0x2c7034;
      g.fillStyle(land, 1).fillRect(0, y, Math.max(0, e.l), STRIP).fillRect(e.r, y, GAME_W - e.r, STRIP);
      g.fillStyle(0xc8b46e, 1).fillRect(e.l - 1, y, 1, STRIP).fillRect(e.r, y, 1, STRIP);
      g.fillStyle(0x1e5028, 1).fillRect(e.l - 2, y, 1, STRIP).fillRect(e.r + 1, y, 1, STRIP);
      if (e.il > 0) {
        g.fillStyle(land, 1).fillRect(e.il, y, e.ir - e.il, STRIP);
        g.fillStyle(0xc8b46e, 1).fillRect(e.il, y, 1, STRIP).fillRect(e.ir - 1, y, 1, STRIP);
      }
    }
    // shimmer scrolls with the river and drifts slowly sideways
    this.water.tilePositionY = -Math.round(this.dist + JET_Y);
    this.water.tilePositionX = Math.round(this.frame * 0.4);
    // bridges: grey deck with yellow kerbs across the full width
    for (const o of this.objs) {
      if (!o.alive || o.kind !== 'bridge') continue;
      const sy = Math.round(this.w2s(o.wy));
      if (sy < -12 || sy > GAME_H + 12) continue;
      const e = this.edges(o.wy);
      g.fillStyle(0x505058, 1).fillRect(0, sy - 5, GAME_W, 10);
      g.fillStyle(0xd8d040, 1).fillRect(0, sy - 5, GAME_W, 1).fillRect(0, sy + 4, GAME_W, 1);
      g.fillStyle(0x9a9aa4, 1);
      for (let x = (this.frame >> 1) % 16; x < GAME_W; x += 16) g.fillRect(x, sy, 6, 1);
      // the span over the water is the target
      g.fillStyle(0x7a5a2a, 1).fillRect(e.l, sy - 3, e.r - e.l, 6);
      g.fillStyle(0xb48a40, 1).fillRect(e.l, sy - 3, e.r - e.l, 1);
    }
    this.drawGauge();
  }

  private drawGauge(): void {
    const g = this.gauge;
    g.clear();
    const w = 90;
    const x0 = Math.round(GAME_W / 2 - w / 2);
    g.fillStyle(0x0a0a19, 0.9).fillRect(x0 - 10, 2, w + 20, 10);
    g.lineStyle(1, 0x8c96b4, 1).strokeRect(x0 - 10, 2, w + 20, 10);
    const col = this.fuel < CY.lowFuel ? 0xff3030 : this.fuel < 0.5 ? 0xe8c020 : 0x3ad13a;
    const blink = this.fuel < CY.lowFuel && this.frame % 20 < 10;
    g.fillStyle(blink ? 0x501010 : col, 1).fillRect(x0, 5, Math.round(w * Phaser.Math.Clamp(this.fuel, 0, 1)), 4);
    g.fillStyle(0x6e6e8c, 1);
    for (let i = 1; i < 4; i++) g.fillRect(x0 + (w * i) / 4, 4, 1, 6);
    if (this.refueling) g.fillStyle(0xffffff, 1).fillRect(x0 + Math.round(w * this.fuel) - 1, 4, 2, 6);
    if (!this.gaugeLabels) {
      this.gaugeLabels = [
        ptext(this, x0 - 8, 4, 'E', 1, '#ff5050').setDepth(101),
        ptext(this, x0 + w + 3, 4, 'F', 1, '#5aff82').setDepth(101)
      ];
    }
    this.bridgeText.setX(x0 + w + 17).setText(`BRIDGE ${this.bridgesDown}/${CY.bridges}`);
  }

  private gaugeLabels?: PText[];

  // ---------------------------------------------------------------- scoring / fx

  private scoreKill(base: number, x: number, y: number): void {
    const pts = base * this.chainLevel;
    this.hud.addScore(pts);
    if (this.chainTimer > 0 && this.chainLevel < CHAIN_MAX) {
      this.chainLevel++;
      audio.chain(this.chainLevel);
    }
    this.chainTimer = CHAIN_WINDOW_MS;
    this.hud.setChain(this.chainLevel);
    const t = ptext(this, x, y, `${pts}`, 1, '#ffdc50').setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    if (this.hud.score >= this.nextExtraLife) {
      this.nextExtraLife += waves.extraLifeEvery;
      this.lives = Math.min(5, this.lives + 1);
      this.hud.setLives(this.lives);
      this.hud.showToast(this, 'EXTRA JET');
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
      s.y += (s.getData('vy') as number) + this.speed * 0.5;
      s.setAlpha(Math.min(1, life / 14));
    }
  }

  // ---------------------------------------------------------------- flow

  private absorb(): boolean {
    if (this.power.shieldHp <= 0) return false;
    this.power.shieldHp--;
    this.invuln = 30;
    this.spawnSparks(this.jx, JET_Y, 0x5ae1ff, 6);
    audio.shieldHit();
    return true;
  }

  private crash(why: string): void {
    if (this.state !== 'play') return;
    if ((window as unknown as { __sdtDebug?: boolean }).__sdtDebug) {
      const e = this.edges(this.dist);
      console.info(`[canyon] crash ${why} dist=${Math.round(this.dist)} jx=${Math.round(this.jx)} l=${e.l} r=${e.r} il=${e.il} ir=${e.ir}`);
    }
    this.lives--;
    this.hud.setLives(this.lives);
    this.spawnSparks(this.jx, JET_Y, 0xffe14a, 24);
    this.spawnSparks(this.jx, JET_Y, 0xffa028, 14);
    this.cameras.main.shake(260, 0.014);
    audio.playerDie();
    this.jet.setVisible(false);
    this.flame.setVisible(false);
    this.shieldArc.setVisible(false);
    this.power.reset();
    this.syncOptions();
    this.hud.setPowerCursor(-1);
    this.chainLevel = 1;
    this.chainTimer = 0;
    this.hud.setChain(1);
    if (this.lives <= 0) {
      this.gameOver();
      return;
    }
    this.hud.showToast(this, why === 'OUT OF FUEL' ? 'OUT OF FUEL!' : 'CRASHED!', 1400);
    this.state = 'dying';
    this.stateTimer = 100;
  }

  private sectorClear(): void {
    const bonus = CY.points.sectorBonus * this.loop;
    this.hud.addScore(bonus);
    this.state = 'cleared';
    this.stateTimer = 260;
    this.banner.setText('ALL SECTORS CLEAR!').setColor('#5aff82').setVisible(true);
    this.bannerSub.setText(`+${bonus} BONUS\nTHE RUN LOOPS - FASTER`).setVisible(true);
    music.stop();
    audio.extraLife();
  }

  /** Final sector done: back to sector 1, one loop harder, everything carried. */
  private loopBack(): void {
    this.scene.start('jump', {
      to: 'invasion',
      score: this.hud.score,
      lives: this.lives,
      power: this.power,
      waveBase: this.waveBase + CY.bridges,
      loop: this.loop + 1
    });
  }

  private gameOver(): void {
    music.stop();
    this.state = 'gameover';
    this.stateTimer = this.demo ? 60 : 180;
    this.banner.setText('GAME OVER').setColor('#ffd25a').setVisible(true);
    this.bannerSub.setText(this.demo ? '' : `SCORE ${this.hud.score}`).setVisible(true);
  }

  private exitRun(): void {
    if (this.demo) {
      this.scene.start('attract', { page: 'title' });
      return;
    }
    const wave = this.waveBase + this.bridgesDown;
    if (qualifies(this.hud.score)) this.scene.start('initials', { score: this.hud.score, wave });
    else this.scene.start('attract', { page: 'scores' });
  }
}
