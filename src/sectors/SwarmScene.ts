import Phaser from 'phaser';
import { GAME_W, GAME_H, STEP_MS } from '../core/config';
import { InputMap } from '../core/input';
import { Fx, flashBurst } from '../systems/fx';
import { makeTextures, makeSwarmTextures } from '../systems/textures';
import { audio } from '../systems/audio';
import { music } from '../systems/music';
import { bindDemoExit, DEMO_FRAMES, DEMO_LABEL } from '../ui/demo';
import { PowerState } from '../systems/powerups';
import { Hud } from '../ui/hud';
import { ptext, PText } from '../ui/pixelFont';
import { hiScore, qualifies } from '../core/save';
import waves from '../data/waves.json';
import type { SectorCarry } from './JumpScene';

type Species = 'bee' | 'butterfly' | 'boss';
type InsectState = 'enter' | 'form' | 'dive' | 'tractor' | 'return';

interface Insect {
  alive: boolean;
  species: Species;
  fx: number; // formation offset from center
  fy: number;
  state: InsectState;
  sprite: Phaser.GameObjects.Image;
  hp: number;
  hasCaptive: boolean;
  captive?: Phaser.GameObjects.Image;
  path: Phaser.Math.Vector2[];
  t: number;
  dur: number;
  delay: number;
  shotsFired: number;
  hover: number;
}

const SW = waves.swarm;
const CHAIN_WINDOW_MS = 2000;
const CHAIN_MAX = 8;
const RADII: Record<Species, [number, number]> = { bee: [6, 5], butterfly: [6, 6], boss: [8, 6] };

function bezier(p: Phaser.Math.Vector2[], t: number): { x: number; y: number } {
  const u = 1 - t;
  const x = u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x;
  const y = u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y;
  return { x, y };
}

/**
 * Sector 2 "The Swarm" - Galaxian/Galaga homage. A breathing formation of
 * bees, butterflies and boss insects; insects peel off on curved dive runs,
 * bosses deploy a tractor beam that captures your fighter, and shooting down
 * a captor frees it for a dual fighter.
 */
export class SwarmScene extends Phaser.Scene {
  private inputMap!: InputMap;
  private fx!: Fx;
  private hud!: Hud;
  private power = new PowerState();

  private insects: Insect[] = [];
  private playerBullets: Phaser.GameObjects.Image[] = [];
  private enemyBullets: Phaser.GameObjects.Image[] = [];
  private sparks: Phaser.GameObjects.Image[] = [];
  private capsules: Phaser.GameObjects.Image[] = [];
  private optionSprites: Phaser.GameObjects.Image[] = [];

  private ship!: Phaser.GameObjects.Image;
  private shipB!: Phaser.GameObjects.Image; // dual fighter
  private flame!: Phaser.GameObjects.Image;
  private flameB!: Phaser.GameObjects.Image;
  private shieldArc!: Phaser.GameObjects.Arc;
  private beamGfx!: Phaser.GameObjects.Graphics;

  private dual = false;
  private demo = false;
  private demoTimer = 0;
  private wave = 1;
  private waveBase = 2;
  private lives = 3;
  private invuln = 0;
  private fireCooldown = 0;
  private activateHeld = false;
  private diveCounter = 0;
  private tractorCounter = 0;
  private formFireCounter = 0;
  private nextExtraLife = waves.extraLifeEvery;
  private accumulator = 0;
  private frame = 0;
  private anim = 0;
  private chainLevel = 1;
  private chainTimer = 0;
  private state: 'banner' | 'play' | 'capture' | 'dying' | 'gameover' | 'cleared' = 'banner';
  private stateTimer = 0;
  private capBoss?: Insect;
  private capT = 0;
  private capDual = false;

  private banner!: PText;
  private bannerSub!: PText;

  constructor() {
    super('swarm');
  }

  create(data: Partial<SectorCarry> & { demo?: boolean }): void {
    this.resetRunState();
    this.demo = data.demo === true;
    this.demoTimer = 0;
    this.waveBase = data.waveBase ?? 2;
    this.lives = data.lives ?? 3;
    this.power = data.power instanceof PowerState ? data.power : new PowerState();
    makeTextures(this);
    makeSwarmTextures(this);
    this.cameras.main.setBackgroundColor('#0a0416');

    const r = new Phaser.Math.RandomDataGenerator(['swarm-stars']);
    for (let i = 0; i < 90; i++) {
      this.add.image(r.between(0, GAME_W), r.between(0, GAME_H), 'star').setAlpha(r.realInRange(0.15, 0.6));
    }

    this.ship = this.add.image(GAME_W / 2, 196, 'ship').setDepth(10);
    this.shipB = this.add.image(this.ship.x + 13, 196, 'ship').setDepth(10).setVisible(false);
    this.flame = this.add.image(this.ship.x, this.ship.y + 6, 'flame').setDepth(9);
    this.flameB = this.add.image(this.shipB.x, this.shipB.y + 6, 'flame').setDepth(9).setVisible(false);
    this.shieldArc = this.add.arc(this.ship.x, this.ship.y, 10).setStrokeStyle(1, 0x5ae1ff, 0.8).setDepth(11).setVisible(false);
    this.beamGfx = this.add.graphics().setDepth(6);

    this.inputMap = new InputMap(this);
    this.fx = new Fx(this);
    music.play('swarm');
    this.hud = new Hud(this);
    this.hud.setLives(this.lives);
    this.hud.hiScore = hiScore();
    this.hud.addScore(data.score ?? 0);
    this.hud.setPowerCursor(this.power.cursor);
    this.syncOptions();

    this.banner = ptext(this, GAME_W / 2, 130, '', 2, '#ffd25a')
      .setOrigin(0.5)
      .setDepth(120);
    this.bannerSub = ptext(this, GAME_W / 2, 148, '', 1, '#c8d0ff')
      .setOrigin(0.5)
      .setDepth(120);

    const kb = this.input.keyboard!;
    kb.on('keydown-B', () => this.hud.showToast(this, `BLOOM ${this.fx.toggleBloom() ? 'ON' : 'OFF'}`));
    kb.on('keydown-C', () => this.hud.showToast(this, `CRT ${this.fx.toggleCrt() ? 'ON' : 'OFF'}`));
    kb.on('keydown-M', () => this.hud.showToast(this, `SOUND ${audio.toggleMute() ? 'OFF' : 'ON'}`));
    kb.on('keydown-N', () => this.hud.showToast(this, `MUSIC ${music.toggle() ? 'ON' : 'OFF'}`));
    kb.on('keydown', () => audio.unlock());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      if (p.worldY > GAME_H - 18 && p.worldX > GAME_W - 170) this.tryActivate();
    });

    if (this.demo) bindDemoExit(this);
    this.startWave(1);
  }

  private resetRunState(): void {
    this.insects = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.sparks = [];
    this.capsules = [];
    this.optionSprites = [];
    this.dual = false;
    this.wave = 1;
    this.invuln = 0;
    this.fireCooldown = 0;
    this.nextExtraLife = waves.extraLifeEvery;
    this.accumulator = 0;
    this.frame = 0;
    this.chainLevel = 1;
    this.chainTimer = 0;
    this.capBoss = undefined;
  }

  // ---------------------------------------------------------------- setup

  private startWave(wave: number): void {
    this.wave = wave;
    this.insects.forEach((v) => {
      v.sprite.destroy();
      v.captive?.destroy();
    });
    this.insects = [];
    this.diveCounter = Math.floor(this.diveInterval() * 1.4);
    this.tractorCounter = Math.floor(SW.tractorIntervalFrames * 0.6);
    this.formFireCounter = SW.formationFireBaseFrames;

    const rows: { species: Species; count: number; cell: number; fy: number }[] = [
      { species: 'boss', count: 4, cell: 26, fy: 0 },
      { species: 'butterfly', count: 8, cell: 22, fy: 16 },
      { species: 'butterfly', count: 8, cell: 22, fy: 30 },
      { species: 'bee', count: 10, cell: 20, fy: 44 },
      { species: 'bee', count: 10, cell: 20, fy: 58 }
    ];
    let i = 0;
    for (const row of rows) {
      for (let col = 0; col < row.count; col++) {
        const fx = (col - (row.count - 1) / 2) * row.cell;
        const side = i % 2 === 0 ? -1 : 1;
        const sprite = this.add.image(0, 0, `sw-${row.species}-0`).setDepth(5).setVisible(false);
        const p0 = new Phaser.Math.Vector2(side < 0 ? -20 : GAME_W + 20, 50 + (i % 5) * 12);
        const p1 = new Phaser.Math.Vector2(GAME_W / 2 + side * 130, 150);
        const p2 = new Phaser.Math.Vector2(GAME_W / 2 - side * 60, 56);
        const p3 = new Phaser.Math.Vector2(GAME_W / 2 + fx, SW.startY + row.fy);
        this.insects.push({
          alive: true,
          species: row.species,
          fx,
          fy: row.fy,
          state: 'enter',
          sprite,
          hp: row.species === 'boss' ? 2 : 1,
          hasCaptive: false,
          path: [p0, p1, p2, p3],
          t: 0,
          dur: 110,
          delay: 14 + i * 3,
          shotsFired: 0,
          hover: 0
        });
        i++;
      }
    }

    this.state = 'banner';
    this.stateTimer = 110;
    this.banner.setText(wave === 1 ? 'THE SWARM' : `SWARM WAVE ${wave}`).setVisible(true);
    this.bannerSub.setText(wave === 1 ? 'SECTOR 2' : '').setVisible(true);
  }

  private diveInterval(): number {
    return Math.max(SW.diveMinIntervalFrames, SW.diveBaseIntervalFrames - (this.wave - 1) * SW.diveHastePerWave);
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
    if (this.frame % 18 === 0) this.anim ^= 1;

    if (this.chainTimer > 0) {
      this.chainTimer -= STEP_MS;
      if (this.chainTimer <= 0) {
        this.chainLevel = 1;
        this.hud.setChain(1);
      }
    }

    if (this.state === 'banner' || this.state === 'cleared') {
      if (--this.stateTimer <= 0) {
        if (this.state === 'cleared') {
          if (!this.demo && this.wave >= waves.sector2Waves) {
            // sector 2 done: jump down to the lunar surface, run state carried over
            this.scene.start('jump', {
              to: 'lunar',
              score: this.hud.score,
              lives: this.lives,
              power: this.power,
              waveBase: this.waveBase + this.wave
            });
            return;
          }
          this.startWave(this.wave + 1);
        } else {
          this.state = 'play';
          this.banner.setVisible(false);
          this.bannerSub.setText(this.demo ? DEMO_LABEL : '').setVisible(this.demo);
        }
      }
      this.updateInsects(false);
      this.animateFlames();
      return;
    }

    if (this.state === 'gameover') {
      if (--this.stateTimer <= 0) this.exitRun();
      return;
    }

    if (this.state === 'dying') {
      if (--this.stateTimer <= 0) {
        if (this.lives <= 0) {
          this.gameOver();
        } else {
          this.state = 'play';
          this.ship.setVisible(true);
          this.flame.setVisible(true);
          this.ship.setRotation(0).setScale(1);
          this.invuln = waves.player.respawnInvulnFrames;
        }
      }
      this.updateInsects(false);
      this.updateBullets();
      this.updateSparks();
      return;
    }

    if (this.state === 'capture') {
      this.updateCapture();
      this.updateInsects(false);
      this.updateBullets();
      this.updateSparks();
      return;
    }

    // ---- play ----
    const input = this.demo ? this.demoInput() : this.inputMap.read(this.ship.x, this.ship.y);
    this.movePlayer(input);
    this.updateInsects(true);
    this.formationFire();
    this.updateCapsules();
    this.updateBullets();
    this.updateSparks();
    this.updateOptions();

    if (this.invuln > 0) {
      this.invuln--;
      const vis = this.invuln % 6 < 3;
      this.ship.setVisible(vis);
      this.flame.setVisible(vis);
      if (this.dual) {
        this.shipB.setVisible(vis);
        this.flameB.setVisible(vis);
      }
    }

    if (this.insects.every((v) => !v.alive)) {
      this.state = 'cleared';
      this.stateTimer = 130;
      const bonus = 800 * this.wave;
      this.banner.setText('SWARM CLEARED').setVisible(true);
      this.bannerSub.setY(148).setText(`+${bonus} BONUS`).setVisible(true);
      this.hud.addScore(bonus);
      audio.waveClear();
    }
  }

  // ---------------------------------------------------------------- demo AI

  /** Attract-mode pilot: shadow the lowest diver, else a formation column; dodge shots. */
  private demoInput(): { x: number; y: number; fire: boolean } {
    let targetX = this.ship.x;
    const live = this.insects.filter((v) => v.alive && v.sprite.visible);
    const divers = live.filter((v) => v.state === 'dive' && v.sprite.y < this.ship.y - 30);
    const pick = divers.sort((a, b) => b.sprite.y - a.sprite.y)[0] ??
      live.sort((a, b) => Math.abs(a.sprite.x - this.ship.x) - Math.abs(b.sprite.x - this.ship.x))[0];
    if (pick) targetX = pick.sprite.x;
    const cap = this.capsules.find((c) => c.active && c.y > 140);
    if (cap) targetX = cap.x;
    for (const b of this.enemyBullets) {
      if (b.active && b.y > 140 && b.y < this.ship.y && Math.abs(b.x - this.ship.x) < 14) {
        targetX = this.ship.x + (b.x >= this.ship.x ? -34 : 34);
        break;
      }
    }
    for (const v of live) {
      if (v.state === 'dive' && v.sprite.y > this.ship.y - 40 && Math.abs(v.sprite.x - this.ship.x) < 18) {
        targetX = this.ship.x + (v.sprite.x >= this.ship.x ? -40 : 40);
      }
    }
    if (this.power.cursor >= 1 && this.frame % 90 === 0) this.tryActivate();
    const dx = targetX - this.ship.x;
    return { x: Math.abs(dx) < 3 ? 0 : Math.sign(dx), y: 0, fire: this.frame % 3 !== 0 };
  }

  // ---------------------------------------------------------------- player

  private movePlayer(input: { x: number; fire: boolean }): void {
    const kb = this.input.keyboard!;
    const activate =
      kb.checkDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.X), 0) ||
      kb.checkDown(kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT), 0) ||
      Boolean(this.input.gamepad?.getPad(0)?.B);
    if (activate && !this.activateHeld) this.tryActivate();
    this.activateHeld = activate;

    const speed = 2.3 * this.power.speedMultiplier();
    const maxX = this.dual ? GAME_W - 23 : GAME_W - 10;
    this.ship.x = Phaser.Math.Clamp(this.ship.x + input.x * speed, 10, maxX);
    this.shipB.setPosition(this.ship.x + 13, this.ship.y).setVisible(this.dual && this.ship.visible);
    this.animateFlames();
    this.shieldArc.setVisible(this.power.shieldHp > 0);
    if (this.power.shieldHp > 0) {
      this.shieldArc.setPosition(this.ship.x + (this.dual ? 6.5 : 0), this.ship.y);
      this.shieldArc.setStrokeStyle(1, 0x5ae1ff, 0.25 + 0.25 * this.power.shieldHp);
      this.shieldArc.setRadius((this.dual ? 13 : 9) + Math.sin(this.frame * 0.2));
    }

    this.fireCooldown -= STEP_MS;
    if (input.fire && this.fireCooldown <= 0) this.fireWeapon();
  }

  private fireOrigins(): [number, number][] {
    const origins: [number, number][] = [[this.ship.x, this.ship.y - 8]];
    if (this.dual) origins.push([this.shipB.x, this.shipB.y - 8]);
    for (let i = 0; i < this.power.options; i++) {
      const o = this.optionSprites[i];
      if (o) origins.push([o.x, o.y - 5]);
    }
    return origins;
  }

  private fireWeapon(): void {
    const mode = this.power.fireMode;
    const origins = this.fireOrigins();

    if (mode === 'laser') {
      if (this.countActive('laser') >= 2 + this.power.options + (this.dual ? 1 : 0)) return;
      this.fireCooldown = 380;
      for (const [x, y] of origins) {
        const b = this.getFromPool(this.playerBullets, 'laser');
        b.setPosition(x, y).setDepth(8).setData('vx', 0).setData('pierce', 3);
      }
      audio.laser();
      return;
    }

    if (mode === 'spread') {
      if (this.countActive('bullet') >= 6 * origins.length) return;
      this.fireCooldown = 480;
      for (const [x, y] of origins) {
        for (const vx of [-0.8, 0, 0.8]) {
          const b = this.getFromPool(this.playerBullets, 'bullet');
          b.setPosition(x, y).setDepth(8).setData('vx', vx).setData('pierce', 0);
        }
      }
      audio.shoot();
      return;
    }

    if (this.countActive('bullet') >= waves.player.maxBullets + this.power.options + (this.dual ? 2 : 0)) return;
    this.fireCooldown = waves.player.fireCooldownMs;
    for (const [x, y] of origins) {
      const b = this.getFromPool(this.playerBullets, 'bullet');
      b.setPosition(x, y).setDepth(8).setData('vx', 0).setData('pierce', 0);
    }
    audio.shoot();
  }

  private countActive(key: string): number {
    return this.playerBullets.filter((b) => b.active && b.texture.key === key).length;
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
      this.optionSprites.push(this.add.image(this.ship.x, this.ship.y + 10, 'option').setDepth(9));
    }
    while (this.optionSprites.length > this.power.options) {
      this.optionSprites.pop()!.destroy();
    }
  }

  private updateOptions(): void {
    this.optionSprites.forEach((o, i) => {
      const side = i === 0 ? -1 : 1;
      const tx = this.ship.x + (this.dual ? 6.5 : 0) + side * (this.dual ? 23 : 16);
      const ty = this.ship.y + 4;
      o.x += (tx - o.x) * 0.15;
      o.y += (ty - o.y) * 0.15;
      o.setVisible(this.state === 'play');
    });
  }

  private animateFlames(): void {
    this.flame.setPosition(this.ship.x, this.ship.y + 6);
    this.flameB.setPosition(this.shipB.x, this.shipB.y + 6);
    this.flameB.setVisible(this.shipB.visible);
    if (this.state === 'play' || this.state === 'banner') {
      const sy = Math.random() > 0.5 ? 1 : 1.5;
      this.flame.setScale(1, sy);
      this.flameB.setScale(1, sy);
    }
  }

  // ---------------------------------------------------------------- swarm brain

  private formationCenter(): { cx: number; breath: number } {
    return {
      cx: GAME_W / 2 + SW.swayAmp * Math.sin(this.frame * SW.swayRate),
      breath: 1 + SW.breathAmp * Math.sin(this.frame * SW.breathRate)
    };
  }

  private homeOf(v: Insect): { x: number; y: number } {
    const { cx, breath } = this.formationCenter();
    return { x: cx + v.fx * breath, y: SW.startY + v.fy + 2 * Math.sin(this.frame * SW.breathRate + v.fx * 0.04) };
  }

  private updateInsects(hostile: boolean): void {
    this.beamGfx.clear();
    let anyTractor = false;

    for (const v of this.insects) {
      if (!v.alive) continue;
      const prevX = v.sprite.x;
      const prevY = v.sprite.y;

      if (v.state === 'enter') {
        if (v.delay > 0) {
          v.delay--;
          continue;
        }
        v.sprite.setVisible(true);
        v.t += 1 / v.dur;
        if (v.t >= 1) {
          v.state = 'form';
          v.sprite.setRotation(0);
        } else {
          const p = bezier(v.path, v.t);
          v.sprite.setPosition(p.x, p.y);
          v.sprite.setRotation(Math.atan2(p.y - prevY, p.x - prevX) + Math.PI / 2);
        }
      }

      if (v.state === 'form') {
        const h = this.homeOf(v);
        v.sprite.setPosition(h.x, h.y).setVisible(true).setRotation(0);
      } else if (v.state === 'dive') {
        v.t += 1 / v.dur;
        const shotTs = SW.diveShotTs;
        if (hostile && v.shotsFired < shotTs.length && v.t >= shotTs[v.shotsFired]) {
          v.shotsFired++;
          this.aimedShot(v.sprite.x, v.sprite.y);
        }
        if (v.t >= 1) {
          const h = this.homeOf(v);
          v.sprite.setPosition(h.x, -16);
          v.state = 'return';
        } else {
          const p = bezier(v.path, v.t);
          v.sprite.setPosition(p.x, p.y);
          v.sprite.setRotation(Math.atan2(p.y - prevY, p.x - prevX) + Math.PI / 2);
        }
      } else if (v.state === 'tractor') {
        if (v.t < 1) {
          v.t += 1 / v.dur;
          const p = bezier(v.path, Math.min(1, v.t));
          v.sprite.setPosition(p.x, p.y).setRotation(0);
        } else {
          v.hover++;
          anyTractor = true;
          this.drawBeam(v);
          if (hostile && v.hover > 20 && v.hover < SW.tractorHoverFrames - 10) this.checkBeamCapture(v);
          if (v.hover >= SW.tractorHoverFrames) v.state = 'return';
        }
      } else if (v.state === 'return') {
        const h = this.homeOf(v);
        const dx = h.x - v.sprite.x;
        const dy = h.y - v.sprite.y;
        const d = Math.hypot(dx, dy);
        if (d < 2.2) {
          v.state = 'form';
          v.sprite.setRotation(0);
        } else {
          v.sprite.setPosition(v.sprite.x + (dx / d) * 1.5, v.sprite.y + (dy / d) * 1.5);
        }
      }

      // wing animation + captive marker follows its captor
      if (v.hp === 2 || v.species !== 'boss') v.sprite.setTexture(`sw-${v.species}-${this.anim}`);
      else v.sprite.setTexture(`sw-boss-${this.anim}`).setTint(0xc878ff);
      v.captive?.setPosition(v.sprite.x, v.sprite.y - 9);

      // ramming the player
      if (hostile && (v.state === 'dive' || v.state === 'tractor') && this.state === 'play' && this.invuln === 0) {
        const [rx, ry] = RADII[v.species];
        const px = this.ship.x + (this.dual ? 6.5 : 0);
        const pw = this.dual ? rx + 8 : rx + 2;
        if (Math.abs(v.sprite.x - px) < pw && Math.abs(v.sprite.y - this.ship.y) < ry + 3) {
          this.killInsect(v, true);
          this.hitPlayer();
        }
      }
    }

    if (anyTractor && this.frame % 20 === 0) audio.tractor();
    if (hostile && this.state === 'play') this.launchAttacks();
  }

  private launchAttacks(): void {
    const formed = this.insects.filter((v) => v.alive && v.state === 'form');
    if (formed.length === 0) return;

    if (--this.tractorCounter <= 0) {
      const boss = formed.find((v) => v.species === 'boss' && !v.hasCaptive);
      if (boss && !this.dual && !this.insects.some((v) => v.alive && v.state === 'tractor')) {
        this.tractorCounter = SW.tractorIntervalFrames;
        this.startTractor(boss);
        return;
      }
      this.tractorCounter = Math.floor(SW.tractorIntervalFrames / 2);
    }

    if (--this.diveCounter > 0) return;
    this.diveCounter = this.diveInterval() + Math.floor(Math.random() * 40);

    const bosses = formed.filter((v) => v.species === 'boss');
    const grunts = formed.filter((v) => v.species !== 'boss');
    const leadBoss = bosses.length && Math.random() < 0.3 ? bosses[Math.floor(Math.random() * bosses.length)] : undefined;

    if (leadBoss) {
      this.startDive(leadBoss, 0);
      grunts
        .filter((g) => g.species === 'butterfly')
        .sort((a, b) => Math.abs(a.fx - leadBoss.fx) - Math.abs(b.fx - leadBoss.fx))
        .slice(0, 2)
        .forEach((g, k) => this.startDive(g, (k === 0 ? -1 : 1) * 16));
    } else if (grunts.length) {
      this.startDive(grunts[Math.floor(Math.random() * grunts.length)], 0);
      if (this.wave > 1 && grunts.length > 1 && Math.random() < 0.5) {
        this.startDive(grunts[Math.floor(Math.random() * grunts.length)], 20);
      }
    }
  }

  private startDive(v: Insect, offset: number): void {
    if (v.state !== 'form') return;
    const sx = v.sprite.x;
    const sy = v.sprite.y;
    const side = sx < GAME_W / 2 ? -1 : 1;
    v.path = [
      new Phaser.Math.Vector2(sx, sy),
      new Phaser.Math.Vector2(sx + side * 46, sy - 26),
      new Phaser.Math.Vector2(this.ship.x + offset + side * 40, 130),
      new Phaser.Math.Vector2(Phaser.Math.Clamp(this.ship.x + offset, 14, GAME_W - 14), GAME_H + 26)
    ];
    v.t = 0;
    v.dur = SW.diveDurationFrames + Math.floor(Math.random() * 40);
    v.shotsFired = 0;
    v.state = 'dive';
    audio.dive();
  }

  private startTractor(v: Insect): void {
    const sx = v.sprite.x;
    const sy = v.sprite.y;
    const tx = Phaser.Math.Clamp(this.ship.x, 40, GAME_W - 40);
    v.path = [
      new Phaser.Math.Vector2(sx, sy),
      new Phaser.Math.Vector2(sx + (sx < GAME_W / 2 ? -40 : 40), sy + 30),
      new Phaser.Math.Vector2(tx, 70),
      new Phaser.Math.Vector2(tx, 112)
    ];
    v.t = 0;
    v.dur = 90;
    v.hover = 0;
    v.shotsFired = 0;
    v.state = 'tractor';
    audio.dive();
  }

  private drawBeam(v: Insect): void {
    const bx = v.sprite.x;
    const by = v.sprite.y + 5;
    const pulse = 0.5 + 0.5 * Math.sin(this.frame * 0.4);
    const w = 20 + 6 * pulse;
    this.beamGfx.fillStyle(0x5ae1ff, 0.14 + 0.1 * pulse);
    this.beamGfx.fillTriangle(bx, by, bx - w, 200, bx + w, 200);
    this.beamGfx.fillStyle(0xaef2ff, 0.2 + 0.18 * pulse);
    this.beamGfx.fillTriangle(bx, by, bx - w * 0.45, 200, bx + w * 0.45, 200);
    for (let i = 0; i < 3; i++) {
      const yy = by + ((this.frame * 2 + i * 32) % (196 - by));
      const ww = w * (yy - by) / (200 - by);
      this.beamGfx.lineStyle(1, 0xffffff, 0.35);
      this.beamGfx.lineBetween(bx - ww, yy, bx + ww, yy);
    }
  }

  private checkBeamCapture(v: Insect): void {
    if (this.invuln > 0 || this.state !== 'play') return;
    const px = this.ship.x + (this.dual ? 6.5 : 0);
    if (Math.abs(px - v.sprite.x) > 20) return;
    // caught in the beam
    this.state = 'capture';
    this.capBoss = v;
    this.capT = 0;
    this.capDual = this.dual;
    audio.capture();
    this.hud.showToast(this, 'FIGHTER CAPTURED');
  }

  private updateCapture(): void {
    const boss = this.capBoss;
    if (!boss || !boss.alive) {
      // captor shot down mid-capture: fighter drops back
      this.state = 'play';
      this.invuln = 60;
      this.ship.setRotation(0).setScale(1);
      this.ship.y = 196;
      return;
    }
    this.capT++;
    const target = this.capDual ? this.shipB : this.ship;
    target.x += (boss.sprite.x - target.x) * 0.045;
    target.y += (boss.sprite.y + 10 - target.y) * 0.045;
    target.setRotation(target.rotation + 0.18);
    target.setScale(Math.max(0.55, 1 - this.capT / 160));
    if (this.capDual) this.flameB.setVisible(false);
    else this.flame.setVisible(false);

    if (this.capT >= 90) {
      boss.hasCaptive = true;
      boss.captive = this.add.image(boss.sprite.x, boss.sprite.y - 9, 'ship-mini').setTint(0xff6464).setDepth(6);
      boss.state = 'return';
      target.setRotation(0).setScale(1);
      if (this.capDual) {
        this.dual = false;
        this.shipB.setVisible(false);
        this.state = 'play';
        this.invuln = 60;
      } else {
        this.lives--;
        this.hud.setLives(this.lives);
        this.power.reset();
        this.syncOptions();
        this.hud.setPowerCursor(-1);
        this.ship.setVisible(false);
        this.flame.setVisible(false);
        this.shieldArc.setVisible(false);
        this.ship.x = GAME_W / 2;
        this.ship.y = 196;
        if (this.lives <= 0) {
          this.gameOver();
        } else {
          this.state = 'dying';
          this.stateTimer = 80;
        }
      }
      this.capBoss = undefined;
    }
  }

  private rescue(boss: Insect): void {
    const cap = boss.captive;
    boss.hasCaptive = false;
    boss.captive = undefined;
    if (!cap) return;
    audio.rescue();
    this.hud.addScore(SW.points.rescue);
    this.floatScore(cap.x, cap.y, `${SW.points.rescue}`);
    this.hud.showToast(this, 'FIGHTER RESCUED');
    this.tweens.add({
      targets: cap,
      x: this.ship.x + 13,
      y: this.ship.y,
      duration: 900,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        cap.destroy();
        if (this.state === 'play' || this.state === 'banner') {
          this.dual = true;
          this.shipB.setVisible(this.ship.visible);
          this.flameB.setVisible(this.ship.visible);
        }
      }
    });
  }

  // ---------------------------------------------------------------- firing

  private aimedShot(x: number, y: number): void {
    const speed = (SW.bulletSpeedBase + (this.wave - 1) * SW.bulletSpeedPerWave) / 60;
    const px = this.ship.x + (this.dual ? 6.5 : 0);
    const dx = px - x;
    const dy = this.ship.y - y;
    const d = Math.hypot(dx, dy) || 1;
    const b = this.getFromPool(this.enemyBullets, 'ebullet-0');
    b.setPosition(x, y + 6).setDepth(8);
    b.setData('vx', (dx / d) * speed * 0.8);
    b.setData('vy', Math.max(0.6, (dy / d)) * speed);
  }

  private formationFire(): void {
    if (--this.formFireCounter > 0) return;
    this.formFireCounter =
      Math.max(SW.formationFireMinFrames, SW.formationFireBaseFrames - (this.wave - 1) * 8) +
      Math.floor(Math.random() * 25);
    const formed = this.insects.filter((v) => v.alive && v.state === 'form');
    if (!formed.length) return;
    const shooter = formed[Math.floor(Math.random() * formed.length)];
    this.aimedShot(shooter.sprite.x, shooter.sprite.y);
  }

  // ---------------------------------------------------------------- chain + scoring

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

  // ---------------------------------------------------------------- capsules

  private dropCapsule(x: number, y: number): void {
    let c = this.capsules.find((p) => !p.active);
    if (!c) {
      c = this.add.image(0, 0, 'capsule').setDepth(7);
      this.capsules.push(c);
    }
    c.setActive(true).setVisible(true).setPosition(x, y);
  }

  private updateCapsules(): void {
    for (const c of this.capsules) {
      if (!c.active) continue;
      c.y += 0.75;
      c.setAngle(c.angle + 3);
      if (c.y > GAME_H - 8) {
        c.setActive(false).setVisible(false);
        continue;
      }
      const px = this.ship.x + (this.dual ? 6.5 : 0);
      const reach = this.dual ? 15 : 9;
      if (Math.abs(c.x - px) < reach && Math.abs(c.y - this.ship.y) < 9 && this.state === 'play') {
        c.setActive(false).setVisible(false);
        this.power.collect();
        this.hud.setPowerCursor(this.power.cursor);
        audio.capsule();
      }
    }
  }

  // ---------------------------------------------------------------- bullets

  private getFromPool(pool: Phaser.GameObjects.Image[], key: string): Phaser.GameObjects.Image {
    let b = pool.find((p) => !p.active);
    if (!b) {
      b = this.add.image(0, 0, key);
      pool.push(b);
    }
    return b.setTexture(key).setActive(true).setVisible(true);
  }

  private updateBullets(): void {
    for (const b of this.playerBullets) {
      if (!b.active) continue;
      const laser = b.texture.key === 'laser';
      b.y -= laser ? 7.5 : 5.6;
      b.x += (b.getData('vx') as number) ?? 0;
      if (b.y < 10 || b.x < 2 || b.x > GAME_W - 2) {
        this.deactivate(b);
        continue;
      }
      this.resolvePlayerBullet(b, laser);
    }

    for (const b of this.enemyBullets) {
      if (!b.active) continue;
      b.x += (b.getData('vx') as number) ?? 0;
      b.y += (b.getData('vy') as number) ?? 1.6;
      b.setTexture(Math.floor(b.y / 4) % 2 ? 'ebullet-1' : 'ebullet-0');
      if (b.y > GAME_H - 10 || b.x < -4 || b.x > GAME_W + 4) {
        this.deactivate(b);
        continue;
      }
      if (this.state !== 'play' || this.invuln > 0) continue;
      const px = this.ship.x + (this.dual ? 6.5 : 0);
      const reach = this.dual ? 12 : 6;
      if (Math.abs(b.x - px) < reach && Math.abs(b.y - this.ship.y) < 5) {
        if (this.power.shieldHp > 0) {
          this.power.shieldHp--;
          this.deactivate(b);
          this.spawnSparks(b.x, b.y, 0x5ae1ff, 6);
          audio.shieldHit();
          continue;
        }
        this.deactivate(b);
        this.hitPlayer();
      }
    }
  }

  private resolvePlayerBullet(b: Phaser.GameObjects.Image, laser: boolean): void {
    for (const v of this.insects) {
      if (!v.alive || !v.sprite.visible) continue;
      const [rx, ry] = RADII[v.species];
      if (Math.abs(b.x - v.sprite.x) < rx + 1 && Math.abs(b.y - v.sprite.y) < ry + 1) {
        if (v.species === 'boss' && v.hp > 1) {
          v.hp--;
          this.spawnSparks(v.sprite.x, v.sprite.y, 0xc878ff, 6);
          audio.shieldHit();
          if (!laser) {
            this.deactivate(b);
            return;
          }
          continue;
        }
        this.killInsect(v, false);
        if (laser) {
          const pierce = (b.getData('pierce') as number) - 1;
          if (pierce <= 0) {
            this.deactivate(b);
            return;
          }
          b.setData('pierce', pierce);
          continue;
        }
        this.deactivate(b);
        return;
      }
    }
  }

  private killInsect(v: Insect, rammed: boolean): void {
    v.alive = false;
    v.sprite.setVisible(false);
    const diving = v.state === 'dive' || v.state === 'tractor';
    const tint = { bee: 0xffd25a, butterfly: 0xff5a78, boss: 0x50ff9b }[v.species];
    this.spawnSparks(v.sprite.x, v.sprite.y, tint, v.species === 'boss' ? 16 : 10);
    this.cameras.main.shake(v.species === 'boss' ? 110 : 60, v.species === 'boss' ? 0.006 : 0.003);
    audio.alienDie();
    if (!rammed) {
      const base = SW.points[v.species] * (diving ? SW.points.diveBonus : 1);
      this.scoreKill(base, v.sprite.x, v.sprite.y);
      const chance = v.species === 'boss' ? 0.6 : SW.capsuleDropChance;
      if (Math.random() < chance) this.dropCapsule(v.sprite.x, v.sprite.y);
    }
    if (v.hasCaptive) this.rescue(v);
  }

  private deactivate(b: Phaser.GameObjects.Image): void {
    b.setActive(false).setVisible(false);
  }

  // ---------------------------------------------------------------- fx bits

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
        .setData('vy', Math.sin(a) * v)
        .setData('life', 14 + Math.random() * 14);
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
      s.y += (s.getData('vy') as number) + 0.04;
      s.setAlpha(Math.min(1, life / 14));
    }
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
      this.hud.showToast(this, 'EXTRA SHIP');
      audio.extraLife();
    }
  }

  // ---------------------------------------------------------------- death / flow

  private hitPlayer(): void {
    if (this.dual) {
      this.dual = false;
      this.spawnSparks(this.shipB.x, this.shipB.y, 0x5ae1ff, 16);
      this.shipB.setVisible(false);
      this.flameB.setVisible(false);
      this.cameras.main.shake(140, 0.008);
      audio.playerDie();
      this.invuln = 60;
      return;
    }
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
    for (const b of this.enemyBullets) this.deactivate(b);
    if (this.lives <= 0) {
      this.gameOver();
      return;
    }
    this.state = 'dying';
    this.stateTimer = 70;
  }

  private gameOver(): void {
    music.stop();
    this.state = 'gameover';
    this.stateTimer = this.demo ? 60 : 180;
    this.banner.setText('GAME OVER').setVisible(true);
    this.bannerSub.setY(148).setText(`SCORE ${this.hud.score}`).setVisible(true);
  }

  private exitRun(): void {
    if (this.demo) {
      this.scene.start('attract', { page: 'title' });
      return;
    }
    if (qualifies(this.hud.score)) {
      this.scene.start('initials', { score: this.hud.score, wave: this.waveBase + this.wave });
    } else {
      this.scene.start('attract', { page: 'scores' });
    }
  }
}
