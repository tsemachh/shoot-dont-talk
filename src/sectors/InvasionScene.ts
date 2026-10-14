import Phaser from 'phaser';
import { GAME_W, GAME_H, STEP_MS } from '../core/config';
import { InputMap } from '../core/input';
import { Fx } from '../systems/fx';
import { makeTextures } from '../systems/textures';
import { audio } from '../systems/audio';
import { PowerState } from '../systems/powerups';
import { Hud } from '../ui/hud';
import { hiScore, qualifies } from '../core/save';
import waves from '../data/waves.json';

type Species = 'small' | 'medium' | 'large';

interface Invader {
  alive: boolean;
  row: number;
  col: number;
  species: Species;
  sprite: Phaser.GameObjects.Image;
}

interface Shield {
  x: number;
  y: number;
  mask: Uint8Array;
  canvas: Phaser.Textures.CanvasTexture;
  img: Phaser.GameObjects.Image;
}

const SHIELD_W = 26;
const SHIELD_H = 16;
const F = waves.formation;
const CHAIN_WINDOW_MS = 2000;
const CHAIN_MAX = 8;

/**
 * Sector 1 "Invasion Grid" + the M2 shared systems: Gradius power bar
 * (capsules, X to activate), chain multiplier, demo mode for the attract
 * screen, and the game-over flow into initials entry / attract.
 */
export class InvasionScene extends Phaser.Scene {
  private demo = false;
  private inputMap!: InputMap;
  private fx!: Fx;
  private hud!: Hud;
  private power = new PowerState();

  private invaders: Invader[] = [];
  private shields: Shield[] = [];
  private playerBullets: Phaser.GameObjects.Image[] = [];
  private enemyBullets: Phaser.GameObjects.Image[] = [];
  private sparks: Phaser.GameObjects.Image[] = [];
  private capsules: Phaser.GameObjects.Image[] = [];
  private optionSprites: Phaser.GameObjects.Image[] = [];

  private ship!: Phaser.GameObjects.Image;
  private flame!: Phaser.GameObjects.Image;
  private shieldArc!: Phaser.GameObjects.Arc;
  private ufo?: Phaser.GameObjects.Image;

  private gx = 0;
  private gy = 0;
  private dir = 1;
  private marchCounter = 0;
  private marchStep = 0;
  private anim = 0;

  private wave = 1;
  private lives = 3;
  private invuln = 0;
  private fireCooldown = 0;
  private activateHeld = false;
  private enemyFireCounter = 0;
  private ufoCounter = 0;
  private nextExtraLife = waves.extraLifeEvery;
  private accumulator = 0;
  private frame = 0;
  private demoTimer = 0;
  private chainLevel = 1;
  private chainTimer = 0;
  private state: 'banner' | 'play' | 'dying' | 'gameover' | 'cleared' = 'banner';
  private stateTimer = 0;

  private banner!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;

  constructor() {
    super('invasion');
  }

  create(data: { demo?: boolean }): void {
    this.demo = data.demo ?? false;
    this.resetRunState();
    makeTextures(this);
    this.cameras.main.setBackgroundColor('#06081e');

    const r = new Phaser.Math.RandomDataGenerator(['stars']);
    for (let i = 0; i < 90; i++) {
      this.add.image(r.between(0, GAME_W), r.between(0, GAME_H), 'star').setAlpha(r.realInRange(0.15, 0.6));
    }

    this.ship = this.add.image(GAME_W / 2, 196, 'ship').setDepth(10);
    this.flame = this.add.image(this.ship.x, this.ship.y + 6, 'flame').setDepth(9);
    this.shieldArc = this.add.arc(this.ship.x, this.ship.y, 10).setStrokeStyle(1, 0x5ae1ff, 0.8).setDepth(11).setVisible(false);

    this.inputMap = new InputMap(this);
    this.fx = new Fx(this);
    this.hud = new Hud(this);
    this.hud.setLives(this.lives);
    this.hud.hiScore = hiScore();
    this.hud.addScore(0);

    this.banner = this.add
      .text(GAME_W / 2, 92, '', { fontFamily: 'monospace', fontSize: '16px', color: '#5aff82', resolution: 2 })
      .setOrigin(0.5)
      .setDepth(120);
    this.bannerSub = this.add
      .text(GAME_W / 2, 112, '', { fontFamily: 'monospace', fontSize: '8px', color: '#c8d0ff', resolution: 2 })
      .setOrigin(0.5)
      .setDepth(120);

    const kb = this.input.keyboard!;
    kb.on('keydown-B', () => this.hud.showToast(this, `BLOOM ${this.fx.toggleBloom() ? 'ON' : 'OFF'}`));
    kb.on('keydown-C', () => this.hud.showToast(this, `CRT ${this.fx.toggleCrt() ? 'ON' : 'OFF'}`));
    kb.on('keydown-M', () => this.hud.showToast(this, `SOUND ${audio.toggleMute() ? 'OFF' : 'ON'}`));
    kb.on('keydown', () => audio.unlock());
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      audio.unlock();
      // tapping the power bar activates the highlighted slot
      if (p.worldY > GAME_H - 18 && p.worldX > GAME_W - 170) this.tryActivate();
      if (this.demo) this.scene.start('invasion', { demo: false });
    });

    this.buildShields();
    this.startWave(1);
  }

  private resetRunState(): void {
    this.power = new PowerState();
    this.invaders = [];
    this.shields = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.sparks = [];
    this.capsules = [];
    this.optionSprites = [];
    this.ufo = undefined;
    this.wave = 1;
    this.lives = 3;
    this.invuln = 0;
    this.fireCooldown = 0;
    this.nextExtraLife = waves.extraLifeEvery;
    this.accumulator = 0;
    this.frame = 0;
    this.demoTimer = 0;
    this.chainLevel = 1;
    this.chainTimer = 0;
  }

  // ---------------------------------------------------------------- setup

  private startWave(wave: number): void {
    this.wave = wave;
    this.invaders.forEach((v) => v.sprite.destroy());
    this.invaders = [];
    const drop = Math.min(waves.waves.maxStartDrop, (wave - 1) * waves.waves.dropPerWave);
    this.gx = 24;
    this.gy = F.startY + drop;
    this.dir = 1;
    this.marchCounter = 0;
    this.enemyFireCounter = waves.enemyFire.baseIntervalFrames;
    this.ufoCounter = Math.floor(waves.ufo.intervalFrames * 0.6);

    (F.rows as Species[]).forEach((species, row) => {
      for (let col = 0; col < F.cols; col++) {
        const sprite = this.add.image(0, 0, `inv-${species}-0`).setDepth(5);
        this.invaders.push({ alive: true, row, col, species, sprite });
      }
    });
    this.layoutInvaders();

    this.state = 'banner';
    this.stateTimer = 110;
    this.banner.setText(wave === 1 ? 'INVASION GRID' : `WAVE ${wave}`).setVisible(true);
    this.bannerSub.setText(this.demo ? 'DEMO' : wave === 1 ? 'SECTOR 1' : '').setVisible(true);
  }

  private buildShields(): void {
    this.shields.forEach((s) => {
      s.img.destroy();
      s.canvas.destroy();
    });
    this.shields = [];
    for (let i = 0; i < 4; i++) {
      const x = 46 + i * 76;
      const y = 168;
      const mask = new Uint8Array(SHIELD_W * SHIELD_H);
      for (let py = 0; py < SHIELD_H; py++) {
        for (let px = 0; px < SHIELD_W; px++) {
          let solid = true;
          const corner = Math.max(0, 4 - py);
          if (px < corner || px >= SHIELD_W - corner) solid = false;
          if (py >= SHIELD_H - 5 && px >= 9 && px < SHIELD_W - 9) solid = false;
          mask[py * SHIELD_W + px] = solid ? 1 : 0;
        }
      }
      const canvas = this.textures.createCanvas(`shield-${i}-${Math.random().toString(36).slice(2)}`, SHIELD_W, SHIELD_H)!;
      const img = this.add.image(x, y, canvas.key).setOrigin(0, 0).setDepth(4);
      const shield: Shield = { x, y, mask, canvas, img };
      this.redrawShield(shield);
      this.shields.push(shield);
    }
  }

  private redrawShield(s: Shield): void {
    const ctx = s.canvas.getContext();
    ctx.clearRect(0, 0, SHIELD_W, SHIELD_H);
    ctx.fillStyle = '#5aff82';
    for (let py = 0; py < SHIELD_H; py++) {
      for (let px = 0; px < SHIELD_W; px++) {
        if (s.mask[py * SHIELD_W + px]) ctx.fillRect(px, py, 1, 1);
      }
    }
    s.canvas.refresh();
  }

  private erodeShield(s: Shield, lx: number, ly: number, radius = 2.6): void {
    for (let py = 0; py < SHIELD_H; py++) {
      for (let px = 0; px < SHIELD_W; px++) {
        const d2 = (px - lx) ** 2 + (py - ly) ** 2;
        if (d2 <= radius * radius && Math.random() < 0.85) s.mask[py * SHIELD_W + px] = 0;
      }
    }
    this.redrawShield(s);
    this.spawnSparks(s.x + lx, s.y + ly, 0x5aff82, 4);
    audio.shieldHit();
  }

  private shieldAt(x: number, y: number): { s: Shield; lx: number; ly: number } | null {
    for (const s of this.shields) {
      const lx = Math.floor(x - s.x);
      const ly = Math.floor(y - s.y);
      if (lx >= 0 && lx < SHIELD_W && ly >= 0 && ly < SHIELD_H && s.mask[ly * SHIELD_W + lx]) {
        return { s, lx, ly };
      }
    }
    return null;
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
    if (this.demo) {
      this.demoTimer++;
      if (this.demoTimer > 60 * 22) {
        this.scene.start('attract', { page: 'title' });
        return;
      }
    }
    const input = this.demo ? this.demoInput() : this.inputMap.read(this.ship.x, this.ship.y);

    // chain decay
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
          if (!this.demo && this.wave >= waves.sector1Waves) {
            // sector 1 done: hyperspace jump into the Swarm, run state carried over
            this.scene.start('jump', {
              to: 'swarm',
              score: this.hud.score,
              lives: this.lives,
              power: this.power,
              waveBase: this.wave
            });
            return;
          }
          this.startWave(this.wave + 1);
        } else {
          this.state = 'play';
          this.banner.setVisible(false);
          this.bannerSub.setVisible(this.demo);
          this.bannerSub.setText(this.demo ? 'DEMO - PRESS FIRE TO PLAY' : '');
          this.bannerSub.setY(160);
        }
      }
      this.animateFlame();
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
          this.invuln = waves.player.respawnInvulnFrames;
        }
      }
      this.updateBullets();
      this.updateSparks();
      return;
    }

    // ---- play ----
    this.movePlayer(input);
    this.marchFormation();
    this.enemyFire();
    this.updateUfo();
    this.updateCapsules();
    this.updateBullets();
    this.updateSparks();
    this.updateOptions();

    if (this.invuln > 0) {
      this.invuln--;
      this.ship.setVisible(this.invuln % 6 < 3);
      this.flame.setVisible(this.ship.visible);
    }

    if (this.invaders.every((v) => !v.alive)) {
      this.state = 'cleared';
      this.stateTimer = 130;
      const sectorDone = !this.demo && this.wave >= waves.sector1Waves;
      this.banner.setText(sectorDone ? 'SECTOR CLEAR' : 'WAVE CLEAR').setVisible(true);
      this.bannerSub.setY(112).setText(`+${500 * this.wave} BONUS`).setVisible(true);
      this.hud.addScore(500 * this.wave);
      audio.waveClear();
    }
  }

  // ---------------------------------------------------------------- demo AI

  private demoInput(): { x: number; y: number; fire: boolean } {
    let targetX = this.ship.x;
    // chase a low capsule, else track the column nearest the player
    const cap = this.capsules.filter((c) => c.active && c.y > 100).sort((a, b) => b.y - a.y)[0];
    if (cap) {
      targetX = cap.x;
    } else {
      const alive = this.invaders.filter((v) => v.alive);
      if (alive.length) {
        const nearest = alive.reduce((best, v) =>
          Math.abs(this.invaderX(v.col) - this.ship.x) < Math.abs(this.invaderX(best.col) - this.ship.x) ? v : best
        );
        targetX = this.invaderX(nearest.col);
      }
    }
    // dodge incoming fire
    for (const b of this.enemyBullets) {
      if (b.active && b.y > 130 && Math.abs(b.x - this.ship.x) < 16) {
        targetX = this.ship.x + (b.x >= this.ship.x ? -30 : 30);
        break;
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
    this.ship.x = Phaser.Math.Clamp(this.ship.x + input.x * speed, 10, GAME_W - 10);
    this.animateFlame();
    this.shieldArc.setVisible(this.power.shieldHp > 0);
    if (this.power.shieldHp > 0) {
      this.shieldArc.setPosition(this.ship.x, this.ship.y);
      this.shieldArc.setStrokeStyle(1, 0x5ae1ff, 0.25 + 0.25 * this.power.shieldHp);
      this.shieldArc.setRadius(9 + Math.sin(this.frame * 0.2));
    }

    this.fireCooldown -= STEP_MS;
    if (input.fire && this.fireCooldown <= 0) this.fireWeapon();
  }

  private fireWeapon(): void {
    const mode = this.power.fireMode;
    const origins: [number, number][] = [[this.ship.x, this.ship.y - 8]];
    for (let i = 0; i < this.power.options; i++) {
      const o = this.optionSprites[i];
      if (o) origins.push([o.x, o.y - 5]);
    }

    if (mode === 'laser') {
      if (this.countActive('laser') >= 2 + this.power.options) return;
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

    if (this.countActive('bullet') >= waves.player.maxBullets + this.power.options) return;
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
      const tx = this.ship.x + side * 16;
      const ty = this.ship.y + 4;
      o.x += (tx - o.x) * 0.15;
      o.y += (ty - o.y) * 0.15;
      o.setVisible(this.state === 'play');
    });
  }

  private animateFlame(): void {
    this.flame.setPosition(this.ship.x, this.ship.y + 6);
    if (this.state === 'play' || this.state === 'banner') {
      this.flame.setScale(1, Math.random() > 0.5 ? 1 : 1.5);
    }
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

  // ---------------------------------------------------------------- formation

  private invaderX(col: number): number {
    return this.gx + col * F.cellW;
  }

  private invaderY(row: number): number {
    return this.gy + row * F.cellH;
  }

  private layoutInvaders(): void {
    for (const v of this.invaders) {
      v.sprite.setPosition(this.invaderX(v.col), this.invaderY(v.row));
      v.sprite.setTexture(`inv-${v.species}-${this.anim}`);
      v.sprite.setVisible(v.alive);
    }
  }

  private marchFormation(): void {
    const alive = this.invaders.filter((v) => v.alive);
    if (alive.length === 0) return;
    const haste = (this.wave - 1) * waves.waves.marchHastePerWave;
    const period = Math.max(F.marchMinFrames, Math.round((F.marchBaseFrames * alive.length) / 45) - haste);
    if (++this.marchCounter < period) return;
    this.marchCounter = 0;
    this.anim ^= 1;
    audio.march(this.marchStep++);

    const xs = alive.map((v) => this.invaderX(v.col));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    if ((this.dir > 0 && maxX + F.stepX > GAME_W - 18) || (this.dir < 0 && minX - F.stepX < 10)) {
      this.dir *= -1;
      this.gy += F.dropY;
    } else {
      this.gx += F.stepX * this.dir;
    }
    this.layoutInvaders();

    for (const v of alive) {
      const y = this.invaderY(v.row);
      if (y > 150 && y < 186) {
        for (let k = 0; k < 4; k++) {
          const hit = this.shieldAt(this.invaderX(v.col) + (k - 1.5) * 5, y + 5);
          if (hit) this.erodeShield(hit.s, hit.lx, hit.ly, 3.2);
        }
      }
      if (y >= 188) {
        this.killPlayer(true);
        return;
      }
    }
  }

  private enemyFire(): void {
    if (--this.enemyFireCounter > 0) return;
    const interval = Math.max(
      waves.enemyFire.minIntervalFrames,
      waves.enemyFire.baseIntervalFrames - (this.wave - 1) * 6
    );
    this.enemyFireCounter = interval + Math.floor(Math.random() * 20);

    const alive = this.invaders.filter((v) => v.alive);
    if (alive.length === 0) return;
    const cols = [...new Set(alive.map((v) => v.col))];
    let col: number;
    if (Math.random() < waves.enemyFire.aimedShare) {
      col = cols.reduce((best, c) =>
        Math.abs(this.invaderX(c) - this.ship.x) < Math.abs(this.invaderX(best) - this.ship.x) ? c : best
      );
    } else {
      col = cols[Math.floor(Math.random() * cols.length)];
    }
    const shooter = alive.filter((v) => v.col === col).sort((a, b) => b.row - a.row)[0];
    const b = this.getFromPool(this.enemyBullets, 'ebullet-0');
    b.setPosition(this.invaderX(col), this.invaderY(shooter.row) + 8).setDepth(8);
  }

  private updateUfo(): void {
    if (!this.ufo) {
      if (++this.ufoCounter >= waves.ufo.intervalFrames) {
        this.ufoCounter = 0;
        const fromLeft = Math.random() < 0.5;
        this.ufo = this.add
          .image(fromLeft ? -10 : GAME_W + 10, 22, 'ufo')
          .setDepth(6)
          .setData('vx', (fromLeft ? 1 : -1) * (waves.ufo.speed / 60));
      }
      return;
    }
    this.ufo.x += this.ufo.getData('vx') as number;
    if (this.frame % 9 === 0) audio.ufo();
    if (this.ufo.x < -14 || this.ufo.x > GAME_W + 14) {
      this.ufo.destroy();
      this.ufo = undefined;
    }
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
      if (Math.abs(c.x - this.ship.x) < 9 && Math.abs(c.y - this.ship.y) < 9 && this.state === 'play') {
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

    const speed = (waves.enemyFire.bulletSpeedBase + (this.wave - 1) * waves.enemyFire.bulletSpeedPerWave) / 60;
    for (const b of this.enemyBullets) {
      if (!b.active) continue;
      b.y += speed;
      b.setTexture(Math.floor(b.y / 4) % 2 ? 'ebullet-1' : 'ebullet-0');
      if (b.y > GAME_H - 10) {
        this.deactivate(b);
        continue;
      }
      const hit = this.shieldAt(b.x, b.y + 2);
      if (hit) {
        this.erodeShield(hit.s, hit.lx, hit.ly);
        this.deactivate(b);
        continue;
      }
      if (this.state === 'play' && Math.abs(b.x - this.ship.x) < 6 && Math.abs(b.y - this.ship.y) < 5) {
        if (this.power.shieldHp > 0) {
          this.power.shieldHp--;
          this.deactivate(b);
          this.spawnSparks(b.x, b.y, 0x5ae1ff, 6);
          audio.shieldHit();
          continue;
        }
        if (this.invuln === 0) {
          this.deactivate(b);
          this.killPlayer(false);
        }
      }
    }
  }

  private resolvePlayerBullet(b: Phaser.GameObjects.Image, laser: boolean): void {
    const hit = this.shieldAt(b.x, b.y - 2);
    if (hit) {
      this.erodeShield(hit.s, hit.lx, hit.ly, laser ? 2.6 : 1.8);
      if (!laser) {
        this.deactivate(b);
        return;
      }
    }

    if (this.ufo && Math.abs(b.x - this.ufo.x) < 9 && Math.abs(b.y - this.ufo.y) < 5) {
      const pts = Phaser.Math.Snap.To(Phaser.Math.Between(waves.points.ufoMin, waves.points.ufoMax), 50);
      this.hud.addScore(pts);
      this.floatScore(this.ufo.x, this.ufo.y, `${pts}`);
      this.spawnSparks(this.ufo.x, this.ufo.y, 0xff3c3c, 16);
      this.cameras.main.shake(100, 0.006);
      audio.ufoDie();
      this.dropCapsule(this.ufo.x, this.ufo.y);
      this.ufo.destroy();
      this.ufo = undefined;
      this.deactivate(b);
      this.checkExtraLife();
      return;
    }

    for (const v of this.invaders) {
      if (!v.alive) continue;
      const x = this.invaderX(v.col);
      const y = this.invaderY(v.row);
      if (Math.abs(b.x - x) < 7 && Math.abs(b.y - y) < 6) {
        v.alive = false;
        v.sprite.setVisible(false);
        const tint = { small: 0xff46d2, medium: 0x46e6ff, large: 0x5aff82 }[v.species];
        this.spawnSparks(x, y, tint, 10);
        this.cameras.main.shake(60, 0.003);
        audio.alienDie();
        this.scoreKill(waves.points[v.species], x, y);
        if (Math.random() < waves.capsuleDropChance) this.dropCapsule(x, y);
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

  private deactivate(b: Phaser.GameObjects.Image): void {
    b.setActive(false).setVisible(false);
  }

  // ---------------------------------------------------------------- fx bits

  private spawnSparks(x: number, y: number, tint: number, n: number): void {
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
    const t = this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '8px', color: '#ffdc50', resolution: 2 })
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

  private killPlayer(invadersLanded: boolean): void {
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
    if (this.demo || invadersLanded) {
      this.lives = Math.min(this.lives, 0);
      this.gameOver();
      return;
    }
    this.state = 'dying';
    this.stateTimer = 70;
  }

  private gameOver(): void {
    this.state = 'gameover';
    this.stateTimer = this.demo ? 60 : 180;
    this.banner.setText('GAME OVER').setVisible(true);
    this.bannerSub.setY(112).setText(this.demo ? '' : `SCORE ${this.hud.score}`).setVisible(true);
  }

  private exitRun(): void {
    if (!this.demo && qualifies(this.hud.score)) {
      this.scene.start('initials', { score: this.hud.score, wave: this.wave });
    } else {
      this.scene.start('attract', { page: this.demo ? 'title' : 'scores' });
    }
  }
}
