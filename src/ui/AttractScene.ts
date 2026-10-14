import Phaser from 'phaser';
import { GAME_W, GAME_H, COLORS } from '../core/config';
import { makeTextures } from '../systems/textures';
import { loadScores } from '../core/save';
import { audio } from '../systems/audio';
import { music } from '../systems/music';
import { Fx } from '../systems/fx';
import { ptext, ptextShadow, PText } from './pixelFont';
import { nextDemoScene } from './demo';


/**
 * Entrance page / attract mode. Cycles: title card -> high-score table -> demo
 * (a self-playing round of Invasion Grid) -> back to title. Fire or tap starts
 * the game from any page, arcade-style.
 */
export class AttractScene extends Phaser.Scene {
  private page: 'title' | 'scores' = 'title';
  private pageTimer = 0;
  private stars: { img: Phaser.GameObjects.Image; speed: number }[] = [];
  private titleGroup!: Phaser.GameObjects.Container;
  private scoresGroup!: Phaser.GameObjects.Container;
  private coinText!: PText;
  private starting = false;

  constructor() {
    super('attract');
  }

  create(data: { page?: 'title' | 'scores'; start?: boolean }): void {
    // dev/test hook: ?scene=swarm|lunar|invasion|jump[&to=lunar][&demo][&auto] boots straight into a sector
    const params = new URLSearchParams(location.search);
    const jumpTo = params.get('scene');
    if (jumpTo && ['swarm', 'jump', 'invasion', 'lunar'].includes(jumpTo)) {
      history.replaceState(null, '', location.pathname);
      const to = params.get('to') ?? 'swarm';
      this.scene.start(jumpTo, { demo: params.has('demo'), auto: params.has('auto'), to, score: 0, lives: 3, waveBase: 2 });
      return;
    }
    makeTextures(this);
    new Fx(this);
    music.play('title');
    this.cameras.main.setBackgroundColor('#04020e');
    this.starting = false;
    this.page = data.page ?? 'title';
    this.pageTimer = 0;

    this.stars = [];
    const r = new Phaser.Math.RandomDataGenerator(['attract']);
    for (let i = 0; i < 120; i++) {
      const layer = i % 3;
      const img = this.add
        .image(r.between(0, GAME_W), r.between(0, GAME_H), 'star')
        .setAlpha(0.2 + layer * 0.28);
      this.stars.push({ img, speed: 14 + layer * 30 });
    }

    this.titleGroup = this.buildTitle();
    this.scoresGroup = this.buildScores();
    this.showPage(this.page);

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      audio.unlock();
      if (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'Enter') this.startGame();
    });
    this.input.on('pointerdown', () => {
      audio.unlock();
      this.startGame();
    });
    if (data.start) this.startGame();
  }

  private buildTitle(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const mk = (text: string, y: number, scale: number, color: string) => {
      const { main, back } = ptextShadow(this, GAME_W / 2, y, text, scale, color, '#3c0050');
      main.setOrigin(0.5);
      back.setOrigin(0.5);
      c.add([back, main]);
      return main;
    };
    mk('SHOOT,', 50, 4, '#5ae1ff');
    mk("DON'T TALK", 86, 4, '#ff46c8');
    mk('CLASSIC ARCADE EDITION', 116, 1, '#ffd25a');
    mk('ONE SHIP - FIVE GAMES - ONE RUN', 132, 1, '#8c96dc');
    this.coinText = mk('INSERT COIN - PRESS FIRE', 160, 1, '#ffffff');
    mk('ARROWS MOVE  FIRE SHOOTS  X POWER-UP  B BLOOM  C CRT  M SOUND', 204, 1, '#55608c');
    const ship = this.add.image(GAME_W / 2, 190, 'ship');
    c.add(ship);
    return c;
  }

  private buildScores(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    const title = ptext(this, GAME_W / 2, 34, 'HALL OF FAME', 2, '#ffd25a').setOrigin(0.5);
    c.add(title);
    loadScores().forEach((e, i) => {
      const y = 62 + i * 14;
      const color = i === 0 ? '#ff46c8' : i < 3 ? '#5ae1ff' : '#c8d0ff';
      const row = ptext(
        this,
        GAME_W / 2,
        y,
        `${(i + 1).toString().padStart(2, ' ')}  ${e.initials}  ${e.score.toString().padStart(7, ' ')}  WAVE ${e.wave}`,
        1,
        color
      ).setOrigin(0.5);
      c.add(row);
    });
    return c;
  }

  private showPage(page: 'title' | 'scores'): void {
    this.page = page;
    this.pageTimer = 0;
    this.titleGroup.setVisible(page === 'title');
    this.scoresGroup.setVisible(page === 'scores');
  }

  private startGame(): void {
    if (this.starting) return;
    this.starting = true;
    audio.coin();
    this.cameras.main.flash(200, 255, 255, 255);
    this.time.delayedCall(350, () => this.scene.start('invasion', { demo: false }));
  }

  update(_t: number, delta: number): void {
    for (const s of this.stars) {
      s.img.y += (s.speed * delta) / 1000;
      if (s.img.y > GAME_H) {
        s.img.y -= GAME_H;
        s.img.x = Math.random() * GAME_W;
      }
    }
    this.coinText.setVisible(Math.floor(this.time.now / 500) % 2 === 0);

    this.pageTimer += delta;
    if (this.starting) return;
    if (this.page === 'title' && this.pageTimer > 7000) {
      this.showPage('scores');
    } else if (this.page === 'scores' && this.pageTimer > 6000) {
      // run the next sector's self-playing demo, which returns to the title page
      this.scene.start(nextDemoScene(), { demo: true });
    }
  }
}

export const HUD_ACCENT = COLORS.hudAccent;
