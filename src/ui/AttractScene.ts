import Phaser from 'phaser';
import { GAME_W, COLORS } from '../core/config';
import { makeTextures } from '../systems/textures';
import { loadScores, hiScore, type ScoreEntry } from '../core/save';
import { StreakField } from '../systems/starfield';
import { fetchWorld, worldScores } from '../core/leaderboard';
import { audio } from '../systems/audio';
import { music } from '../systems/music';
import { Fx } from '../systems/fx';
import { ptext, ptextShadow, PText } from './pixelFont';
import { nextDemoScene } from './demo';
import { run } from '../core/run';
import { canOfferInstall, hasNativePrompt, isIOS, onInstallChange, promptInstall } from '../core/pwa';

/** Level select (cheat): key 1-5 or tap. Order matches the run. */
const LEVELS: { key: string; name: string }[] = [
  { key: 'invasion', name: 'INVASION GRID' },
  { key: 'swarm', name: 'SWARM' },
  { key: 'lunar', name: 'LUNAR RUN' },
  { key: 'warp', name: 'WARP RING' },
  { key: 'canyon', name: 'CANYON RIVER' }
];


/**
 * Entrance page / attract mode. Cycles: title card -> high-score table -> demo
 * (a self-playing round of Invasion Grid) -> back to title. Fire or tap starts
 * the game from any page, arcade-style.
 */
export class AttractScene extends Phaser.Scene {
  private page: 'title' | 'scores' = 'title';
  private pageTimer = 0;
  private titleGroup!: Phaser.GameObjects.Container;
  private scoresGroup!: Phaser.GameObjects.Container;
  private coinText!: PText;
  private starting = false;
  private selectPanel!: Phaser.GameObjects.Container;
  private selectOpen = false;
  private iosHint!: Phaser.GameObjects.Container;

  constructor() {
    super('attract');
  }

  create(data: { page?: 'title' | 'scores'; start?: boolean }): void {
    // dev/test hook: ?scene=invasion|swarm|lunar|warp|canyon|jump[&to=...][&demo][&auto] boots straight into a sector
    const params = new URLSearchParams(location.search);
    const jumpTo = params.get('scene');
    if (jumpTo && ['swarm', 'jump', 'invasion', 'lunar', 'warp', 'canyon'].includes(jumpTo)) {
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

    new StreakField(this, { seed: 'attract', count: 160, speed: 2 });

    this.titleGroup = this.buildTitle();
    this.scoresGroup = this.buildScores();
    this.showPage(this.page);

    this.selectOpen = false;
    this.buildLevelSelect();
    this.buildInstall();

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      audio.unlock();
      const n = /^Digit([1-5])$/.exec(e.code);
      if (n) return this.startAt(Number(n[1]) - 1);
      if (e.code === 'KeyL') return this.setSelect(!this.selectOpen);
      if (e.code === 'Escape' && this.selectOpen) return this.setSelect(false);
      if (this.selectOpen) return;
      if (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'Enter') this.startGame();
    });
    this.input.on('pointerdown', () => {
      audio.unlock();
      if (this.iosHint.visible) return void this.iosHint.setVisible(false);
      if (this.selectOpen) return this.setSelect(false); // tap outside the list closes it
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
    // warm arcade-marquee gradient (yellow -> orange -> red), as in the preview video
    const grad = (t: PText) => t.setTint(0xfff096, 0xfff096, 0xc8461e, 0xc8461e);
    const title = (text: string, y: number) => {
      const { main, back } = ptextShadow(this, GAME_W / 2, y, text, 4, '#ffffff', '#28100a');
      main.setOrigin(0.5);
      back.setOrigin(0.5);
      grad(main);
      c.add([back, main]);
    };
    const hi = ptext(this, GAME_W / 2 - 3, 6, 'HI', 1, '#ff50c8').setOrigin(1, 0);
    const hiVal = ptext(this, GAME_W / 2 + 3, 6, String(hiScore()).padStart(6, '0'), 1, '#ffffff');
    c.add([hi, hiVal]);
    title('SHOOT,', 50);
    title("DON'T TALK", 86);
    mk('CLASSIC ARCADE EDITION', 116, 1, '#5ae1ff');
    this.coinText = mk('INSERT COIN - PRESS FIRE', 140, 1, '#ffd25a');
    mk(this.sys.game.device.input.touch ? 'STICK MOVES   FIRE SHOOTS   TAP X: POWER-UP' : 'ARROWS MOVE   SPACE FIRE   X POWER-UP', 192, 1, '#5a6496');
    const ship = this.add.image(GAME_W / 2, 168, 'ship');
    c.add(ship);
    return c;
  }

  private buildScores(): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0);
    this.fillScores(c, worldScores());
    // refresh from the world board; redraw if it arrives while we are on screen
    void fetchWorld().then((list) => {
      if (list && this.scene.isActive() && this.scoresGroup === c) this.fillScores(c, list);
    });
    return c;
  }

  /** World top 8 when known (and non-empty), else this browser's local table. */
  private fillScores(c: Phaser.GameObjects.Container, world: ScoreEntry[] | null): void {
    c.removeAll(true);
    const useWorld = !!world && world.length > 0;
    const rows = useWorld ? world! : loadScores();
    c.add(ptext(this, GAME_W / 2, 30, 'HALL OF FAME', 2, '#ffd25a').setOrigin(0.5));
    c.add(
      ptext(this, GAME_W / 2, 45, useWorld ? 'WORLD TOP 8' : world ? 'LOCAL - WORLD BOARD: BE THE FIRST!' : 'LOCAL', 1, useWorld ? '#5aff82' : '#8c96dc').setOrigin(0.5)
    );
    rows.forEach((e, i) => {
      const color = i === 0 ? '#ff46c8' : i < 3 ? '#5ae1ff' : '#c8d0ff';
      c.add(
        ptext(
          this,
          GAME_W / 2,
          64 + i * 14,
          `${(i + 1).toString().padStart(2, ' ')}  ${e.initials}  ${e.score.toString().padStart(7, ' ')}  WAVE ${e.wave}`,
          1,
          color
        ).setOrigin(0.5)
      );
    });
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
    run.cheat = false;
    audio.coin();
    this.cameras.main.flash(200, 255, 255, 255);
    this.time.delayedCall(350, () => this.scene.start('invasion', { demo: false }));
  }

  /** Cheat: start a fresh run directly in world `i` (practice - not posted to the world board). */
  private startAt(i: number): void {
    if (this.starting) return;
    if (i === 0) {
      this.startGame();
      run.cheat = true;
      return;
    }
    this.starting = true;
    run.cheat = true;
    audio.coin();
    this.cameras.main.flash(200, 255, 255, 255);
    this.time.delayedCall(350, () =>
      this.scene.start(LEVELS[i].key, { demo: false, score: 0, lives: 3, waveBase: 2, loop: 1 })
    );
  }

  private setSelect(open: boolean): void {
    this.selectOpen = open;
    this.selectPanel.setVisible(open);
    this.pageTimer = 0;
  }

  /** INSTALL APP corner button: native prompt (Android/desktop Chrome) or iOS Add-to-Home-Screen steps. */
  private buildInstall(): void {
    const label = 'INSTALL APP';
    const bw = label.length * 6 + 6;
    const btn = this.add.rectangle(3 + bw / 2, 9, bw, 13, 0x0a0a19).setStrokeStyle(1, 0x7cff8a, 0.8).setDepth(150)
      .setInteractive({ useHandCursor: true });
    const txt = ptext(this, 6, 6, label, 1, '#7cff8a').setDepth(151);
    const sync = (): void => {
      const show = canOfferInstall();
      btn.setVisible(show);
      txt.setVisible(show);
    };
    sync();
    onInstallChange(() => this.sys.isActive() && sync());
    // gentle pulse so the offer is noticed
    this.tweens.add({ targets: [btn, txt], alpha: 0.45, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const c = this.add.container(0, 0).setDepth(170).setVisible(false);
    c.add(this.add.rectangle(GAME_W / 2, 108, 262, 92, 0x04020e, 0.95).setStrokeStyle(1, 0x7cff8a, 0.9));
    const steps = isIOS()
      ? [
          ['INSTALL ON IPHONE / IPAD', '#7cff8a', 70],
          ['1. TAP THE SHARE BUTTON IN SAFARI', '#ffffff', 90],
          ['2. CHOOSE  ADD TO HOME SCREEN', '#ffffff', 102],
          ['3. OPEN SHOOT FROM YOUR HOME SCREEN', '#ffffff', 114],
          ['FULL SCREEN, NO BROWSER BARS', '#8c96dc', 134]
        ]
      : [
          ['INSTALL ON ANDROID', '#7cff8a', 70],
          ['1. OPEN THE BROWSER MENU  (3 DOTS)', '#ffffff', 90],
          ['2. TAP  INSTALL APP / ADD TO HOME SCREEN', '#ffffff', 102],
          ['3. OPEN SHOOT FROM YOUR HOME SCREEN', '#ffffff', 114],
          ['FULL SCREEN, NO BROWSER BARS', '#8c96dc', 134]
        ];
    steps.forEach(([t, col, y]) => c.add(ptext(this, GAME_W / 2, y as number, t as string, 1, col as string).setOrigin(0.5, 0)));
    this.iosHint = c;

    btn.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      audio.unlock();
      if (hasNativePrompt()) void promptInstall().then(sync);
      else c.setVisible(!c.visible);
    });
  }

  private buildLevelSelect(): void {
    const stop = (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation();
    // corner button, always visible
    const label = 'L LEVEL SELECT';
    const bw = label.length * 6 + 6;
    const bx = GAME_W - bw - 3;
    const btn = this.add.rectangle(bx + bw / 2, 9, bw, 13, 0x0a0a19).setStrokeStyle(1, 0xffd25a, 0.8).setDepth(150)
      .setInteractive({ useHandCursor: true });
    ptext(this, bx + 3, 6, 'L', 1, '#ffd25a').setDepth(151);
    ptext(this, bx + 15, 6, 'LEVEL SELECT', 1, '#ffffff').setDepth(151);
    btn.on('pointerdown', (p: Phaser.Input.Pointer, x: number, y: number, ev: Phaser.Types.Input.EventData) => {
      stop(p, x, y, ev);
      audio.unlock();
      this.setSelect(!this.selectOpen);
    });

    // panel
    const c = this.add.container(0, 0).setDepth(160).setVisible(false);
    const pw = 176;
    const ph = 136;
    const px = GAME_W / 2;
    const py = 112;
    c.add(this.add.rectangle(px, py, pw, ph, 0x04020e, 0.94).setStrokeStyle(1, 0x5ae1ff, 0.9));
    c.add(ptext(this, px, py - ph / 2 + 8, 'LEVEL SELECT', 2, '#5ae1ff').setOrigin(0.5, 0));
    LEVELS.forEach((lv, i) => {
      const y = py - 30 + i * 17;
      const row = this.add.rectangle(px, y, pw - 24, 14, 0x0a0a19).setStrokeStyle(1, 0x8c96dc, 0.6)
        .setInteractive({ useHandCursor: true });
      row.on('pointerover', () => row.setFillStyle(0x24124a));
      row.on('pointerout', () => row.setFillStyle(0x0a0a19));
      row.on('pointerdown', (p: Phaser.Input.Pointer, x: number, y2: number, ev: Phaser.Types.Input.EventData) => {
        stop(p, x, y2, ev);
        this.startAt(i);
      });
      c.add(row);
      c.add(ptext(this, px - pw / 2 + 18, y - 3, String(i + 1), 1, '#ffd25a'));
      c.add(ptext(this, px - pw / 2 + 30, y - 3, lv.name, 1, '#ffffff'));
    });
    c.add(ptext(this, px, py + ph / 2 - 20, 'PRACTICE RUN - LOCAL SCORES ONLY', 1, '#ff46c8').setOrigin(0.5, 0));
    c.add(ptext(this, px, py + ph / 2 - 10, 'TAP OUTSIDE / ESC TO CLOSE', 1, '#8c96dc').setOrigin(0.5, 0));
    this.selectPanel = c;
  }

  update(_t: number, delta: number): void {
    this.coinText.setVisible(Math.floor(this.time.now / 500) % 2 === 0);

    this.pageTimer += delta;
    if (this.starting || this.selectOpen || this.iosHint.visible) return;
    if (this.page === 'title' && this.pageTimer > 7000) {
      this.showPage('scores');
    } else if (this.page === 'scores' && this.pageTimer > 6000) {
      // run the next sector's self-playing demo, which returns to the title page
      this.scene.start(nextDemoScene(), { demo: true });
    }
  }
}

export const HUD_ACCENT = COLORS.hudAccent;
