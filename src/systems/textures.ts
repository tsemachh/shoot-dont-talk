import Phaser from 'phaser';
import { GLYPHS } from '../ui/glyphs';
import { POWER_LETTER, POWER_COLOR } from './powerups';
import { POWER_SLOTS } from '../core/config';

/**
 * Procedural pixel-art textures, generated at boot from string grids.
 * Placeholder art: final sprites will come from Aseprite atlases with the
 * same keys, so sectors never need to change.
 */
type Palette = Record<string, number>;

function pixelTexture(scene: Phaser.Scene, key: string, rows: string[], palette: Palette): void {
  if (scene.textures.exists(key)) return;
  const h = rows.length;
  const w = rows[0].length;
  const g = scene.add.graphics();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const color = palette[rows[y][x]];
      if (color !== undefined) {
        g.fillStyle(color, 1);
        g.fillRect(x, y, 1, 1);
      }
    }
  }
  g.generateTexture(key, w, h);
  g.destroy();
}

const SHIP = [
  '.....W.....',
  '....XWX....',
  '....XXX....',
  '...XXXXX...',
  '.R.XXBXX.R.',
  'RXXXXXXXXXR',
  'XXX.XXX.XXX',
  'O.........O'
];

const SHIP_PAL: Palette = {
  X: 0x5ae1ff,
  W: 0xffffff,
  R: 0xff46c8,
  B: 0x2846d2,
  O: 0xffa028
};

// invaders: 3 species, 2 animation frames each (original art in the classic spirit)
const INV_SMALL = [
  ['...XX...', '..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '..X..X..', '.X.XX.X.', 'X.X..X.X'],
  ['...XX...', '..XXXX..', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '.X.XX.X.', 'X......X', '.X....X.']
];
const INV_MED = [
  ['...XXXX...', '.XXXXXXXX.', 'XXX.WW.XXX', 'XXX.WW.XXX', 'XXXXXXXXXX', '.XX.XX.XX.', 'X..X..X..X', '.X......X.'],
  ['...XXXX...', '.XXXXXXXX.', 'XXX.WW.XXX', 'XXX.WW.XXX', 'XXXXXXXXXX', '.XX.XX.XX.', '.X..XX..X.', '..X....X..']
];
const INV_LARGE = [
  ['X.........X', '.X..XXX..X.', '..XXXXXXX..', '.XXWXXXWXX.', 'XXXXXXXXXXX', 'X.XX...XX.X', 'X.X.....X.X', '..XX...XX..'],
  ['...........', 'X...XXX...X', '.XXXXXXXXX.', '.XXWXXXWXX.', 'XXXXXXXXXXX', '..XX...XX..', '.X.X...X.X.', 'X.........X']
];
const UFO = [
  '.....XXXXXX.....',
  '...XXXXXXXXXX...',
  '..XX.XX.XX.XX.X.',
  'XXXXXXXXXXXXXXXX',
  '..XXX..XX..XXX..',
  '...X........X...'
];

// swarm sector: bee / butterfly / boss, 2 wing frames each (original art)
const BEE = [
  ['.B....B.', 'B.X..X.B', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '.X....X.', '..B..B..'],
  ['.B....B.', 'B.X..X.B', '.XXXXXX.', 'XX.XX.XX', 'XXXXXXXX', '..X..X..', '.B....B.']
];
const BFLY = [
  ['X......X', 'XX....XX', 'XWXXXXWX', '.XXXXXX.', '.XW..WX.', '.XXXXXX.', '..X..X..', '.X....X.'],
  ['.X....X.', 'XX....XX', 'XWXXXXWX', '.XXXXXX.', '.XW..WX.', '.XXXXXX.', '.X....X.', 'X......X']
];
const BOSS = [
  [
    '..X......X..',
    '..XX....XX..',
    '.XXXXXXXXXX.',
    'XXW.XXXX.WXX',
    'XXXXXXXXXXXX',
    '.XX.XXXX.XX.',
    '..X..XX..X..',
    '.X..X..X..X.'
  ],
  [
    '..X......X..',
    '.XXX....XXX.',
    '.XXXXXXXXXX.',
    'XXW.XXXX.WXX',
    'XXXXXXXXXXXX',
    '.XX.XXXX.XX.',
    '.X...XX...X.',
    'X...X..X...X'
  ]
];

export function makeSwarmTextures(scene: Phaser.Scene): void {
  const w = 0xffffff;
  BEE.forEach((f, i) => pixelTexture(scene, `sw-bee-${i}`, f, { X: 0xffd25a, B: 0x5ae1ff, W: w }));
  BFLY.forEach((f, i) => pixelTexture(scene, `sw-butterfly-${i}`, f, { X: 0xff5a78, W: w }));
  BOSS.forEach((f, i) => pixelTexture(scene, `sw-boss-${i}`, f, { X: 0x50ff9b, W: w }));
}

export function makeTextures(scene: Phaser.Scene): void {
  const w = 0xffffff;
  for (const [key, rows, color] of [
    ['inv-small', INV_SMALL, 0xff46d2],
    ['inv-medium', INV_MED, 0x46e6ff],
    ['inv-large', INV_LARGE, 0x5aff82]
  ] as const) {
    rows.forEach((frame, i) => pixelTexture(scene, `${key}-${i}`, frame, { X: color, W: w }));
  }
  pixelTexture(scene, 'ufo', UFO, { X: 0xff3c3c });
  pixelTexture(
    scene,
    'capsule',
    ['...X...', '..XWX..', '.XWWWX.', 'XWWWWWX', '.XWWWX.', '..XWX..', '...X...'],
    { X: 0xffa028, W: 0xffe67d }
  );
  // letter capsules: coloured rim, dark fill, white letter (5x7 font)
  for (const slot of POWER_SLOTS) {
    const glyph = GLYPHS[POWER_LETTER[slot]];
    const rows = ['.CCCCCCC.'];
    for (const r of glyph) rows.push('CF' + r.replace(/X/g, 'W').replace(/\./g, 'F') + 'FC');
    rows.push('.CCCCCCC.');
    pixelTexture(scene, `cap-${slot}`, rows, { C: POWER_COLOR[slot], F: 0x140a28, W: 0xffffff });
  }
  pixelTexture(scene, 'option', ['.XX.', 'XWWX', 'XWWX', '.XX.'], { X: 0xffa028, W: 0xfff5c8 });
  pixelTexture(scene, 'laser', ['X', 'W', 'W', 'X'], { X: 0x96e6ff, W: 0xffffff });
  pixelTexture(scene, 'ebullet-0', ['.X', 'X.', '.X', 'X.'], { X: 0xff5ad2 });
  pixelTexture(scene, 'ebullet-1', ['X.', '.X', 'X.', '.X'], { X: 0xff5ad2 });
  makeBaseTextures(scene);
}

function makeBaseTextures(scene: Phaser.Scene): void {
  pixelTexture(scene, 'ship', SHIP, SHIP_PAL);
  makeShipTextures(scene);
  makeCanyonTextures(scene);
  pixelTexture(scene, 'ship-mini', ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', 'X.X.X.X'], { X: 0x5ae1ff });
  pixelTexture(scene, 'bullet', ['X', 'X', 'X', 'X'], { X: 0xffffb4 });
  pixelTexture(scene, 'flame', ['F', 'O', 'O'], { F: 0xfff0b4, O: 0xffa028 });
  pixelTexture(scene, 'star', ['X'], { X: 0xffffff });
  pixelTexture(scene, 'spark', ['X'], { X: 0xffe6c8 });
}

// ---------------------------------------------------------------- Lunar Run (sector 3)

const ROVER = [
  '.............WW.........',
  '............XXXX........',
  '......XXXXXXXXXXXXX.....',
  '....XXXBBBXXXXXXXXXXX...',
  '...XXXXBBBXXXXXXXXXXXXR.',
  '..RXXXXXXXXXXXXXXXXXXXXR',
  'OXXXXXXXXXXXXXXXXXXXXXX.',
  '..XX..............XX....'
];
const WHEEL = [
  ['.GGG.', 'GWGWG', 'GGXGG', 'GWGWG', '.GGG.'],
  ['.GWG.', 'GGGGG', 'WGXGW', 'GGGGG', '.GWG.']
];
const ROCK = ['...GGGG...', '..GLLGGG..', '.GLGGGGGG.', 'GGGGGDGGGG', 'GGGDGGGGDG', 'GDGGGGGGGG', 'GGGGGGDGGG'];
const BIGROCK = [
  '....GGGGG.....',
  '...GLLLGGG....',
  '..GLLGGGGGGG..',
  '.GLGGGGGDGGGG.',
  '.GGGGGGGGGGGG.',
  'GGGGDGGGGGGDGG',
  'GGGGGGGGDGGGGG',
  'GDGGGGGGGGGGGG',
  'GGGGGGDGGGGDGG',
  'GGDGGGGGGGGGGG',
  'GGGGGGGGGDGGGG'
];
const MINE = [
  ['..RRRR..', '.RWRRWR.', 'RRRRRRRR', 'G.G..G.G'],
  ['..RRRR..', '.RYRRYR.', 'RRRRRRRR', 'G.G..G.G']
];
const SAUCER = [
  ['....XXXXX....', '..XXWWWWWXX..', 'XXXXXXXXXXXXX', '.XRX.XXX.XRX.', '...XXXXXXX...'],
  ['....XXXXX....', '..XXWWWWWXX..', 'XXXXXXXXXXXXX', '.XYX.XXX.XYX.', '...XXXXXXX...']
];
const SKIMMER = ['.......XXXX...', '..XXXXXXWWXXX.', 'XXXXXXXXXXXXXR', '..XXXXXXXXXX..', '....OO...OO...'];


/** Seamless (period = width) silhouette strip for TileSprite parallax. */
function silhouette(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  heightAt: (x: number) => number,
  fill: number,
  rim: number,
  extra?: (g: Phaser.GameObjects.Graphics) => void
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  let prev = Math.round(h - heightAt(w - 1));
  for (let x = 0; x < w; x++) {
    const top = Math.round(h - heightAt(x));
    g.fillStyle(fill, 1).fillRect(x, top, 1, h - top);
    // continuous rim: bridge the step from the previous column so slopes read as one neon line
    const a = Math.min(prev, top);
    g.fillStyle(rim, 1).fillRect(x, a, 1, Math.max(1, Math.abs(prev - top)));
    prev = top;
  }
  extra?.(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function ringedPlanet(scene: Phaser.Scene): void {
  if (scene.textures.exists('ln-planet')) return;
  const g = scene.add.graphics();
  const cx = 36;
  const cy = 22;
  const r = 15;
  g.lineStyle(1, 0xc8b4ff, 0.75).strokeEllipse(cx, cy + 1, 66, 13);
  const bands = [0x3c64d2, 0x5a82e6, 0x3250b4, 0x78a0f0, 0x3c64d2];
  for (let y = -r; y <= r; y++) {
    const half = Math.sqrt(r * r - y * y);
    const band = bands[Math.floor(((y + r) / (2 * r + 1)) * bands.length)];
    g.fillStyle(band, 1).fillRect(Math.round(cx - half), cy + y, Math.round(half * 2), 1);
    // terminator shadow on the right
    g.fillStyle(0x0a0820, 0.55).fillRect(Math.round(cx + half * 0.25), cy + y, Math.round(half * 0.75), 1);
  }
  // ring front arc passes over the lower half of the planet
  g.lineStyle(1, 0xe6dcff, 0.9).beginPath();
  for (let a = 0; a <= Math.PI; a += 0.05) {
    const x = cx + Math.cos(a) * 33;
    const y = cy + 1 + Math.sin(a) * 6.5;
    if (a === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokePath();
  g.generateTexture('ln-planet', 72, 44);
  g.destroy();
}

/** Synthwave sky: deep violet to magenta gradient, full screen. */
function lunarSky(scene: Phaser.Scene, w: number, h: number, horizon: number): void {
  if (scene.textures.exists('ln-sky')) return;
  const t = scene.textures.createCanvas('ln-sky', w, h)!;
  const ctx = t.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, 'rgb(14,4,40)');
  g.addColorStop(1, 'rgb(150,50,120)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  t.refresh();
}

/** Striped retro sun: yellow to hot pink, with gaps that widen toward the horizon. */
function stripedSun(scene: Phaser.Scene, r: number): void {
  if (scene.textures.exists('ln-sun')) return;
  const d = r * 2 + 1;
  const t = scene.textures.createCanvas('ln-sun', d, d)!;
  const ctx = t.getContext();
  const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
  for (let y = 0; y < d; y++) {
    const k = y / (d - 1);
    // gap stripes start just above the centre, each one a pixel thicker
    const rel = y - (r - 2);
    if (rel >= 0) {
      const band = Math.floor(rel / 6);
      if (rel % 6 < 1 + Math.floor(band / 2)) continue;
    }
    const half = Math.sqrt(Math.max(0, r * r - (y - r) * (y - r)));
    ctx.fillStyle = `rgb(${lerp(255, 255, k)},${lerp(230, 70, k)},${lerp(90, 110, k)})`;
    ctx.fillRect(Math.round(r - half), y, Math.round(half * 2) + 1, 1);
  }
  t.refresh();
}

export function makeLunarTextures(scene: Phaser.Scene): void {
  lunarSky(scene, scene.scale.gameSize.width, scene.scale.gameSize.height, 154);
  stripedSun(scene, 34);
  pixelTexture(scene, 'rover', ROVER, SHIP_PAL);
  WHEEL.forEach((f, i) => pixelTexture(scene, `wheel-${i}`, f, { G: 0x8c96b4, W: 0xffffff, X: 0x2846d2 }));
  const rockPal = { L: 0xd8b48c, G: 0x9a7456, D: 0x5e3e2a };
  pixelTexture(scene, 'ln-rock', ROCK, rockPal);
  pixelTexture(scene, 'ln-bigrock', BIGROCK, rockPal);
  MINE.forEach((f, i) => pixelTexture(scene, `ln-mine-${i}`, f, { R: 0xff3c50, W: 0xffffff, Y: 0xffd25a, G: 0x8c96b4 }));
  SAUCER.forEach((f, i) =>
    pixelTexture(scene, `ln-saucer-${i}`, f, { X: 0x50ff9b, W: 0xdcfff0, R: 0xff46c8, Y: 0xffd25a })
  );
  pixelTexture(scene, 'ln-skimmer', SKIMMER, { X: 0xff5a5a, W: 0xffffff, R: 0xffa028, O: 0x5a1e28 });
  pixelTexture(scene, 'ln-bomb', ['.Y.', 'YWY', 'YYY', 'YYY', '.Y.'], { Y: 0xffb43c, W: 0xffffff });
  // UFO missile, falling nose-down: fins + exhaust on top, grey body, red band, white tip
  pixelTexture(
    scene,
    'ln-missile',
    ['.O.', 'FOF', 'F.F', '.G.', '.G.', '.R.', '.G.', '.G.', '.W.'],
    { O: 0xffd25a, F: 0x8c96b4, G: 0xc8c8d8, R: 0xff3c50, W: 0xffffff }
  );
  pixelTexture(scene, 'hbullet', ['XXXXXW'], { X: 0xffffb4, W: 0xffffff });
  pixelTexture(scene, 'hlaser', ['XWWWWWWWWX', 'XWWWWWWWWX'], { X: 0x96e6ff, W: 0xffffff });
  ringedPlanet(scene);

  // far range: smooth rolling ridge with a neon rim (as in the preview video), period 512 px
  const S = (x: number, k: number, ph = 0) => Math.sin((x * 2 * Math.PI * k) / 512 + ph);
  silhouette(scene, 'ln-far', 512, 112, (x) => 66 + 16 * S(x, 2) + 9 * S(x, 5, 1), 0x4e2268, 0xbe6ec8);
  // near hills + a lunar base with lit domes
  silhouette(
    scene,
    'ln-near',
    512,
    56,
    (x) => 1.2 * (28 + 10 * S(x, 3, 2) + 6 * Math.abs(S(x, 4))),
    0x2c123e,
    0x824696,
    (g) => {
      for (const [dx, r] of [
        [60, 9],
        [78, 6],
        [190, 11]
      ] as const) {
        g.fillStyle(0x6a5aa0, 1).fillCircle(dx, 56 - 14, r);
        g.fillStyle(0x2c123e, 1).fillRect(dx - r, 56 - 14, r * 2 + 1, 14);
        g.fillStyle(0xffd25a, 1).fillRect(dx - 2, 56 - 14 - Math.floor(r / 2), 1, 1);
        g.fillStyle(0xffd25a, 1).fillRect(dx + 2, 56 - 14 - Math.floor(r / 2), 1, 1);
      }
      g.fillStyle(0x9a8ac8, 1).fillRect(330, 12, 1, 30); // antenna mast
      g.fillStyle(0xff46c8, 1).fillRect(329, 11, 3, 2);
    }
  );
}

// ---------------------------------------------------------------- Warp Ring (sector 4)

const RAIDER = ['....X....', '...XWX...', '..XXXXX..', '.XXRXRXX.', 'XXXXXXXXX', 'X.XXXXX.X', 'X..X.X..X', '...X.X...'];
const STINGER = ['....X....', '....X....', '.X.XXX.X.', '.XXXWXXX.', 'XXXXXXXXX', '..XXXXX..', '..X...X..', '.X.....X.'];
const MANTA = ['...XXX...', '..XWWWX..', '.XXXXXXX.', 'XX.XXX.XX', 'X..XXX..X', '...X.X...', '..X...X..'];

/** Procedural Earth: oceans, seeded continents, cloud streaks, night-side shading, cyan rim. */
function earth(scene: Phaser.Scene, r: number): void {
  if (scene.textures.exists('wr-earth')) return;
  const d = r * 2 + 4;
  const t = scene.textures.createCanvas('wr-earth', d, d)!;
  const ctx = t.getContext();
  const c = d / 2;
  const rng = new Phaser.Math.RandomDataGenerator(['earth']);
  const blobs = Array.from({ length: 9 }, () => ({
    x: rng.realInRange(-0.8, 0.8) * r,
    y: rng.realInRange(-0.8, 0.8) * r,
    s: rng.realInRange(0.18, 0.42) * r
  }));
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const dd = x * x + y * y;
      if (dd > r * r) continue;
      let land = 0;
      for (const b of blobs) land += Math.max(0, 1 - Math.hypot(x - b.x, y - b.y) / b.s);
      const cloud = Math.sin(x * 0.35 + y * 0.9) * Math.sin(y * 0.5) > 0.55;
      let col = land > 0.55 ? [70, 170, 90] : land > 0.4 ? [200, 190, 120] : [40, 90, 210];
      if (cloud) col = [235, 240, 255];
      // light from upper-left, night side to the lower-right
      const lit = Math.max(0.18, Math.min(1, 0.95 - (x + y) / (2.2 * r)));
      ctx.fillStyle = `rgb(${Math.round(col[0] * lit)},${Math.round(col[1] * lit)},${Math.round(col[2] * lit)})`;
      ctx.fillRect(c + x, c + y, 1, 1);
    }
  }
  ctx.strokeStyle = 'rgba(120,220,255,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c, c, r + 0.5, Math.PI * 0.75, Math.PI * 1.95);
  ctx.stroke();
  t.refresh();
}

export function makeWarpTextures(scene: Phaser.Scene): void {
  const w = 0xffffff;
  pixelTexture(scene, 'wr-raider', RAIDER, { X: 0xff5a3c, R: 0xffd25a, W: w });
  pixelTexture(scene, 'wr-stinger', STINGER, { X: 0x5a8cff, W: w });
  pixelTexture(scene, 'wr-manta', MANTA, { X: 0x50ff9b, W: w });
  pixelTexture(scene, 'wr-core', ['..X..', '.XWX.', 'XWWWX', '.XWX.', '..X..'], { X: 0x5ae1ff, W: w });
  pixelTexture(scene, 'wr-escort', ['.X.', 'XWX', '.X.'], { X: 0xffa028, W: w });
  earth(scene, 22);
}

// ---------------------------------------------------------------- per-sector player ships
// Each game-world flies its own craft; JumpScene morphs one into the next.

const SHIP_INV = [
  '......W......',
  '.....XXX.....',
  '.....XXX.....',
  '.XXXXXXXXXXX.',
  'XXXXXXXXXXXXX',
  'XXXXXXXXXXXXX',
  'XXXXXXXXXXXXX',
  'XX.X.....X.XX'
];
const SHIP_SWARM = [
  '......W......',
  '......W......',
  '.....WWW.....',
  '.....WRW.....',
  '..R..WWW..R..',
  '..R.WWWWW.R..',
  '.WW.WBWBW.WW.',
  '.WWWWWWWWWWW.',
  'WWWWWRWRWWWWW',
  'WW..WWWWW..WW',
  'R...WW.WW...R',
  '....R...R....'
];
const SHIP_WARP = [
  '.....W.....',
  '.....X.....',
  '....XXX....',
  '....XWX....',
  '...XXXXX...',
  '...XBBBX...',
  '..XXXXXXX..',
  '.RXXXXXXXR.',
  'RRX.XXX.XRR',
  'R...XXX...R',
  '....O.O....'
];

export function makeShipTextures(scene: Phaser.Scene): void {
  pixelTexture(scene, 'ship-inv', SHIP_INV, { X: 0x5aff82, W: 0xffffff });
  pixelTexture(scene, 'ship-swarm', SHIP_SWARM, { W: 0xf0f0ff, R: 0xff3c50, B: 0x2864ff });
  pixelTexture(scene, 'ship-warp', SHIP_WARP, { X: 0xff46c8, W: 0xffffff, B: 0x5ae1ff, R: 0xffd25a, O: 0xffa028 });
}

// ---------------------------------------------------------------- Canyon River (sector 5)

const SHIP_JET = [
  '.....W.....',
  '.....Y.....',
  '....YYY....',
  '....YBY....',
  '...YYYYY...',
  '.YYYYYYYYY.',
  'YYYYYYYYYYY',
  'Y...YYY...Y',
  '....YYY....',
  '...YYYYY...',
  '...Y...Y...'
];
const BOAT = ['......WW........', '.....WWWW.......', 'XXXXXXXXXXXXXXXX', '.XXXXXXXXXXXXXX.', '..RRRRRRRRRRRR..'];
const HELI = [
  ['GGGGGGGGGGGG', '.....G......', '.YYYYYY..Y.Y', 'YYBYYYYYYYYY', '.YYYYYY..Y..', '..Y..Y......', '.YYYYYY.....'],
  ['...GGGGGG...', '.....G......', '.YYYYYY..Y.Y', 'YYBYYYYYYYYY', '.YYYYYY..Y..', '..Y..Y......', '.YYYYYY.....']
];
const EJET = ['X...........', 'XX....XXX...', 'XXXXXXXXXXXX', 'XX....XXX...', 'X...........'];
const FUEL = [
  '.WWWWWW.',
  'WWWWWWWW',
  'WRRRRRRW',
  'WRWWWWWW',
  'WRRRRWWW',
  'WRWWWWWW',
  'WWWWWWWW',
  'WRWWWWRW',
  'WRWWWWRW',
  'WRRRRRRW',
  'WWWWWWWW',
  'WRRRRRRW',
  'WRRRRWWW',
  'WRRRRRRW',
  'WWWWWWWW',
  '.WWWWWW.'
];
const TREE = ['..GGG..', '.GHHGG.', 'GHHGGGG', 'GHGGGGG', 'GGGGGGG', '.GGGGG.', '..GGG..'];
const HOUSE = ['.RRRRRR.', 'RRRRRRRR', 'WWWWWWWW', 'WBWWWWBW', 'WWWDDWWW', 'WWWDDWWW'];

export function makeCanyonTextures(scene: Phaser.Scene): void {
  // river water: deep blue with the preview video's diagonal shimmer, seamless 41x41 tile
  if (!scene.textures.exists('cy-water')) {
    const g = scene.add.graphics();
    g.fillStyle(0x124e96, 1).fillRect(0, 0, 41, 41);
    g.fillStyle(0x50a0dc, 1);
    for (let y = 0; y < 41; y++) for (let x = 0; x < 41; x++) if ((((5 * x - 3 * y) % 41) + 41) % 41 < 2) g.fillRect(x, y, 1, 1);
    g.generateTexture('cy-water', 41, 41);
    g.destroy();
  }
  pixelTexture(scene, 'ship-jet', SHIP_JET, { Y: 0xffe14a, W: 0xffffff, B: 0x2864ff });
  pixelTexture(scene, 'cy-boat', BOAT, { X: 0xe83c50, R: 0x7a1020, W: 0xffffff });
  HELI.forEach((f, i) => pixelTexture(scene, `cy-heli-${i}`, f, { G: 0xc8d4dc, Y: 0xffd23c, B: 0x2864ff }));
  pixelTexture(scene, 'cy-jet', EJET, { X: 0x8ad24a });
  pixelTexture(scene, 'cy-fuel', FUEL, { W: 0xe6e6f0, R: 0xe02828 });
  pixelTexture(scene, 'cy-tree', TREE, { G: 0x14461e, H: 0x46a046 });
  pixelTexture(scene, 'cy-house', HOUSE, { R: 0xc83c32, W: 0xe6dcc8, B: 0x3a6ad0, D: 0x6a4a2a });
}
