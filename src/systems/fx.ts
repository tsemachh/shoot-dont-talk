import Phaser from 'phaser';
import { CrtPipeline } from './CrtPipeline';
import { GAME_H } from '../core/config';
import { settings, saveSettings } from '../core/settings';
import { ToggleBar } from '../ui/toggles';

/**
 * Post-processing control for one camera. One WebGL pass (CrtPipeline) does the
 * thresholded bloom, colour lift and chromatic aberration; scanlines + vignette
 * are a DOM overlay that tracks the canvas, so the lines are drawn at device
 * resolution (one dark band per internal pixel line) instead of aliasing.
 * B toggles bloom, C toggles the CRT look (aberration + scanlines).
 */
export class Fx {
  bloomOn = settings.bloom;
  crtOn = settings.crt;

  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private pipeline?: CrtPipeline;
  private overlay: HTMLDivElement;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.camera = scene.cameras.main;
    this.overlay = this.makeOverlay();
    const align = () => this.alignOverlay();
    scene.scale.on('resize', align);
    window.addEventListener('resize', align);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.scale.off('resize', align);
      window.removeEventListener('resize', align);
      this.overlay.remove();
    });
    this.apply();
    new ToggleBar(scene, this);
    // canvas is laid out after the first frame
    scene.time.delayedCall(0, align);
  }

  toggleBloom(): boolean {
    this.bloomOn = !this.bloomOn;
    settings.bloom = this.bloomOn;
    saveSettings();
    this.apply();
    return this.bloomOn;
  }

  toggleCrt(): boolean {
    this.crtOn = !this.crtOn;
    settings.crt = this.crtOn;
    saveSettings();
    this.apply();
    return this.crtOn;
  }

  private makeOverlay(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'crt-overlay';
    const linePct = 100 / GAME_H;
    el.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:10',
      'background-image:linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.1) 75%, rgba(0,0,0,0.38) 75%, rgba(0,0,0,0.38) 100%),' +
        'radial-gradient(ellipse at center, rgba(0,0,0,0) 62%, rgba(0,0,0,0.42) 100%)',
      `background-size:100% ${linePct}%, 100% 100%`,
      'background-repeat:repeat, no-repeat'
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  private alignOverlay(): void {
    const canvas = this.scene.game.canvas;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    this.overlay.style.left = `${r.left}px`;
    this.overlay.style.top = `${r.top}px`;
    this.overlay.style.width = `${r.width}px`;
    this.overlay.style.height = `${r.height}px`;
  }

  private apply(): void {
    if (!this.pipeline) {
      this.camera.setPostPipeline(CrtPipeline.KEY);
      this.pipeline = this.camera.getPostPipeline(CrtPipeline) as CrtPipeline;
    }
    this.pipeline.bloom = this.bloomOn ? 1 : 0;
    this.pipeline.ca = this.crtOn ? 1 : 0;
    this.overlay.style.display = this.crtOn ? 'block' : 'none';
    this.alignOverlay();
  }
}

/**
 * Explosion core: an additive soft disc that pops and fades, plus a white-hot
 * centre - the bright "flash" the preview video's booms have. `size` ~ the
 * spark count of the explosion (10 = enemy, 20+ = big).
 */
export function flashBurst(scene: Phaser.Scene, x: number, y: number, tint: number, size: number): void {
  if (!scene.textures.exists('flash')) {
    const t = scene.textures.createCanvas('flash', 32, 32)!;
    const ctx = t.getContext();
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    t.refresh();
  }
  const s = Math.min(2.2, 0.35 + size * 0.045);
  const halo = scene.add
    .image(x, y, 'flash')
    .setTint(tint)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(19)
    .setScale(s * 0.5);
  const core = scene.add
    .image(x, y, 'flash')
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(19)
    .setScale(s * 0.25);
  scene.tweens.add({ targets: halo, scale: s * 1.4, alpha: 0, duration: 320, ease: 'Quad.easeOut', onComplete: () => halo.destroy() });
  scene.tweens.add({ targets: core, scale: s * 0.6, alpha: 0, duration: 160, onComplete: () => core.destroy() });
}
