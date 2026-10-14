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
