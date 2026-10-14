import Phaser from 'phaser';
import { CrtPipeline } from './CrtPipeline';
import { GAME_H } from '../core/config';
import tuning from '../data/tuning.json';

/**
 * Post-processing control for one camera: bloom (Phaser built-in postFX) and
 * the CRT look. The CRT look is two parts: chromatic aberration in a WebGL
 * post pipeline, and scanlines + vignette in a DOM overlay that tracks the
 * canvas, so the lines are drawn at device resolution (one dark band per
 * internal pixel line) instead of aliasing inside the 384x216 buffer.
 */
export class Fx {
  bloomOn = true;
  crtOn = true;

  private scene: Phaser.Scene;
  private camera: Phaser.Cameras.Scene2D.Camera;
  private bloom?: Phaser.FX.Bloom;
  private crtApplied = false;
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
    // canvas is laid out after the first frame
    scene.time.delayedCall(0, align);
  }

  toggleBloom(): boolean {
    this.bloomOn = !this.bloomOn;
    this.apply();
    return this.bloomOn;
  }

  toggleCrt(): boolean {
    this.crtOn = !this.crtOn;
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
      'background-image:linear-gradient(to bottom, rgba(0,0,0,0) 72%, rgba(0,0,0,0.34) 72%, rgba(0,0,0,0.34) 100%),' +
        'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)',
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
    const t = tuning.fx;
    if (this.bloomOn && !this.bloom) {
      this.bloom = this.camera.postFX.addBloom(0xffffff, t.bloomBlurX, t.bloomBlurY, 1, t.bloomStrength);
    } else if (!this.bloomOn && this.bloom) {
      this.camera.postFX.remove(this.bloom);
      this.bloom.destroy();
      this.bloom = undefined;
    }

    if (this.crtOn && !this.crtApplied) {
      this.camera.setPostPipeline(CrtPipeline.KEY);
      this.crtApplied = true;
    } else if (!this.crtOn && this.crtApplied) {
      this.camera.removePostPipeline(CrtPipeline.KEY);
      this.crtApplied = false;
    }
    this.overlay.style.display = this.crtOn ? 'block' : 'none';
    this.alignOverlay();
  }
}
