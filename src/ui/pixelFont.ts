import Phaser from 'phaser';
import { GLYPHS } from './glyphs';

/**
 * Crisp 5x7 arcade font (the same glyphs the preview video was rendered with),
 * generated at boot into a RetroFont bitmap font. Text is drawn white and
 * tinted per object, at integer scales only, so it stays pixel-sharp.
 */
const KEY = 'pix';
const CELL_W = 6; // 5px glyph + 1px gap
const CELL_H = 8; // 7px glyph + 1px gap
const CHARS = Object.keys(GLYPHS).join('');
const PER_ROW = 16;

export function ensurePixelFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.exists(KEY)) return;
  const rows = Math.ceil(CHARS.length / PER_ROW);
  const tex = scene.textures.createCanvas(`${KEY}-tex`, PER_ROW * CELL_W, rows * CELL_H)!;
  const ctx = tex.getContext();
  ctx.fillStyle = '#ffffff';
  [...CHARS].forEach((ch, i) => {
    const ox = (i % PER_ROW) * CELL_W;
    const oy = Math.floor(i / PER_ROW) * CELL_H;
    GLYPHS[ch].forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === 'X') ctx.fillRect(ox + x, oy + y, 1, 1);
    });
  });
  tex.refresh();
  const data = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: `${KEY}-tex`,
    width: CELL_W,
    height: CELL_H,
    chars: CHARS,
    charsPerRow: PER_ROW,
    'spacing.x': 0,
    'spacing.y': 0,
    'offset.x': 0,
    'offset.y': 0,
    lineSpacing: 3
  });
  scene.cache.bitmapFont.add(KEY, data);
}

function toTint(c: string | number): number {
  return typeof c === 'number' ? c : parseInt(c.replace('#', ''), 16);
}

function upper(v: string | string[]): string | string[] {
  return Array.isArray(v) ? v.map((s) => s.toUpperCase()) : String(v).toUpperCase();
}

/** Bitmap text with a Text-like API: integer `scale` (1 = 7px glyphs), CSS or numeric colour. */
export class PText extends Phaser.GameObjects.BitmapText {
  constructor(scene: Phaser.Scene, x: number, y: number, text: string, scale = 1, color: string | number = '#ffffff') {
    ensurePixelFont(scene);
    // RetroFont base size is the cell WIDTH, so integer scales need CELL_W * scale
    super(scene, x, y, KEY, String(text).toUpperCase(), CELL_W * scale);
    scene.add.existing(this);
    this.setTint(toTint(color));
  }

  setColor(color: string | number): this {
    this.setTint(toTint(color));
    return this;
  }

  override setText(value: string | string[]): this {
    return super.setText(upper(value));
  }
}

/** Factory: `ptext(scene, x, y, 'SCORE', 2, '#ffd25a').setOrigin(0.5)` */
export function ptext(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  scale = 1,
  color: string | number = '#ffffff'
): PText {
  return new PText(scene, x, y, text, scale, color);
}

/** Two-layer text with a hard 1-px-per-scale drop shadow (title cards). */
export function ptextShadow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  scale: number,
  color: string | number,
  shadow: string | number
): { main: PText; back: PText } {
  const back = ptext(scene, x + scale, y + scale, text, scale, shadow);
  const main = ptext(scene, x, y, text, scale, color);
  return { main, back };
}
