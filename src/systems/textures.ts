import Phaser from 'phaser';

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
  pixelTexture(scene, 'option', ['.XX.', 'XWWX', 'XWWX', '.XX.'], { X: 0xffa028, W: 0xfff5c8 });
  pixelTexture(scene, 'laser', ['X', 'W', 'W', 'X'], { X: 0x96e6ff, W: 0xffffff });
  pixelTexture(scene, 'ebullet-0', ['.X', 'X.', '.X', 'X.'], { X: 0xff5ad2 });
  pixelTexture(scene, 'ebullet-1', ['X.', '.X', 'X.', '.X'], { X: 0xff5ad2 });
  makeBaseTextures(scene);
}

function makeBaseTextures(scene: Phaser.Scene): void {
  pixelTexture(scene, 'ship', SHIP, SHIP_PAL);
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

/** Periodic triangle wave in [-1, 1]. */
function tri(t: number): number {
  const f = t - Math.floor(t);
  return 4 * Math.abs(f - 0.5) - 1;
}

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
  for (let x = 0; x < w; x++) {
    const top = Math.round(h - heightAt(x));
    g.fillStyle(fill, 1).fillRect(x, top, 1, h - top);
    g.fillStyle(rim, 1).fillRect(x, top, 1, 1);
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

export function makeLunarTextures(scene: Phaser.Scene): void {
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
  pixelTexture(scene, 'hbullet', ['XXXXXW'], { X: 0xffffb4, W: 0xffffff });
  pixelTexture(scene, 'hlaser', ['XWWWWWWWWX', 'XWWWWWWWWX'], { X: 0x96e6ff, W: 0xffffff });
  ringedPlanet(scene);

  // far range: jagged peaks, period 256 px
  silhouette(
    scene,
    'ln-far',
    256,
    64,
    (x) => 30 + 16 * tri((x * 3) / 256) + 9 * tri((x * 7) / 256 + 0.3) + 4 * tri((x * 17) / 256 + 0.7),
    0x2a1a50,
    0x5a3c96
  );
  // near hills + a lunar base with lit domes
  silhouette(
    scene,
    'ln-near',
    256,
    64,
    (x) => 14 + 8 * Math.sin((x * 2 * Math.PI * 2) / 256) + 5 * Math.sin((x * 2 * Math.PI * 5) / 256 + 1),
    0x3e2350,
    0x6e4a8c,
    (g) => {
      for (const [dx, r] of [
        [60, 9],
        [78, 6],
        [190, 11]
      ] as const) {
        g.fillStyle(0x6a5aa0, 1).fillCircle(dx, 64 - 14, r);
        g.fillStyle(0x3e2350, 1).fillRect(dx - r, 64 - 14, r * 2 + 1, 14);
        g.fillStyle(0xffd25a, 1).fillRect(dx - 2, 64 - 14 - Math.floor(r / 2), 1, 1);
        g.fillStyle(0xffd25a, 1).fillRect(dx + 2, 64 - 14 - Math.floor(r / 2), 1, 1);
      }
      g.fillStyle(0x9a8ac8, 1).fillRect(120, 20, 1, 30); // antenna mast
      g.fillStyle(0xff46c8, 1).fillRect(119, 19, 3, 2);
    }
  );
}
