/**
 * Tiny WebAudio synth - all SFX and music are generated, no asset files.
 * Signal chain mirrors the preview video's mixdown: everything sums into a
 * gain bus, then a tanh soft-clipper (warm, loud, "arcade cabinet") and a
 * gentle compressor. The context starts lazily on the first user gesture;
 * M toggles mute.
 */
import { settings } from '../core/settings';

class Synth {
  ctx?: AudioContext;
  /** Mix bus: SFX and the music sequencer both feed this. */
  out?: GainNode;
  muted = !settings.sound;
  private unlockListeners: (() => void)[] = [];

  /** Call from any input handler; safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.out = this.ctx.createGain();
        this.out.gain.value = this.muted ? 0 : 0.55;
        const shaper = this.ctx.createWaveShaper();
        const curve = new Float32Array(1024);
        for (let i = 0; i < curve.length; i++) {
          const x = (i / (curve.length - 1)) * 2 - 1;
          curve[i] = Math.tanh(x * 1.6) * 0.85;
        }
        shaper.curve = curve;
        shaper.oversample = '2x';
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 3;
        comp.attack.value = 0.004;
        comp.release.value = 0.18;
        this.out.connect(shaper);
        shaper.connect(comp);
        comp.connect(this.ctx.destination);
        this.unlockListeners.forEach((fn) => fn());
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Run once the AudioContext exists (immediately if it already does). */
  onUnlock(fn: () => void): void {
    if (this.ctx) fn();
    else this.unlockListeners.push(fn);
  }

  /** Filtered noise burst with its own low-pass sweep - used for booms. */
  private boom(duration: number, vol: number, from: number, to: number, thumpHz = 0): void {
    if (!this.ctx || !this.out || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    src.start(t);
    if (thumpHz > 0) this.sweep('sine', thumpHz, 30, Math.min(0.35, duration), vol * 0.9);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.out) this.out.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  private env(duration: number, vol: number): GainNode | undefined {
    if (!this.ctx || !this.out || this.muted) return undefined;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    g.connect(this.out);
    return g;
  }

  private sweep(type: OscillatorType, from: number, to: number, duration: number, vol: number): void {
    if (!this.ctx) return;
    const g = this.env(duration, vol);
    if (!g) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.ctx.currentTime;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + duration);
    o.connect(g);
    o.start(t);
    o.stop(t + duration);
  }

  private noise(duration: number, vol: number, lowpass = 1200): void {
    if (!this.ctx) return;
    const g = this.env(duration, vol);
    if (!g) return;
    const n = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    src.connect(f);
    f.connect(g);
    src.start();
  }

  shoot(): void {
    this.sweep('square', 1100, 180, 0.09, 0.12);
  }

  alienDie(): void {
    this.boom(0.32, 0.26, 3800, 300, 130);
    this.sweep('square', 420, 60, 0.14, 0.07);
  }

  playerDie(): void {
    this.boom(1.1, 0.42, 2400, 60, 90);
    this.sweep('sawtooth', 320, 35, 0.8, 0.16);
  }

  /** Big boss/bomb-class blast. */
  bigBoom(): void {
    this.boom(1.6, 0.5, 1800, 40, 70);
  }

  march(step: number): void {
    const notes = [110, 104, 98, 92];
    this.sweep('triangle', notes[step % 4], notes[step % 4], 0.07, 0.16);
  }

  ufo(): void {
    this.sweep('sine', 700, 980, 0.12, 0.05);
  }

  ufoDie(): void {
    this.sweep('square', 1200, 200, 0.35, 0.12);
    this.boom(0.7, 0.36, 3200, 90, 110);
  }

  shieldHit(): void {
    this.noise(0.06, 0.12, 3000);
  }

  capsule(): void {
    this.sweep('square', 600, 1200, 0.09, 0.08);
  }

  powerUp(): void {
    [392, 523, 659].forEach((f, i) => setTimeout(() => this.sweep('square', f, f, 0.09, 0.09), i * 60));
  }

  laser(): void {
    this.sweep('sawtooth', 1600, 300, 0.12, 0.08);
  }

  chain(level: number): void {
    this.sweep('triangle', 500 + level * 120, 500 + level * 120, 0.06, 0.07);
  }

  coin(): void {
    this.sweep('square', 988, 988, 0.08, 0.1);
    setTimeout(() => this.sweep('square', 1319, 1319, 0.3, 0.1), 80);
  }

  extraLife(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.sweep('square', f, f, 0.1, 0.1), i * 80)
    );
  }

  dive(): void {
    this.sweep('sawtooth', 880, 240, 0.28, 0.07);
  }

  tractor(): void {
    this.sweep('sine', 260, 540, 0.16, 0.09);
    setTimeout(() => this.sweep('sine', 540, 260, 0.16, 0.09), 150);
  }

  capture(): void {
    this.sweep('sawtooth', 180, 900, 0.55, 0.13);
    this.noise(0.4, 0.1, 1500);
  }

  rescue(): void {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      setTimeout(() => this.sweep('square', f, f, 0.12, 0.1), i * 80)
    );
  }

  jump(): void {
    this.sweep('sawtooth', 120, 1400, 1.1, 0.1);
    this.noise(0.9, 0.08, 2600);
  }

  roverJump(): void {
    this.sweep('square', 260, 720, 0.16, 0.09);
  }

  bombDrop(): void {
    this.sweep('sine', 1400, 380, 0.7, 0.04);
  }

  groundHit(): void {
    this.boom(0.55, 0.3, 1400, 60, 80);
  }

  rockBreak(): void {
    this.boom(0.3, 0.26, 2600, 200, 110);
    this.sweep('square', 220, 80, 0.14, 0.06);
  }

  skimmer(): void {
    this.sweep('sawtooth', 90, 260, 0.5, 0.07);
  }

  checkpoint(): void {
    [659, 784, 988].forEach((f, i) => setTimeout(() => this.sweep('square', f, f, 0.1, 0.09), i * 70));
  }

  waveClear(): void {
    [392, 523, 659, 784].forEach((f, i) =>
      setTimeout(() => this.sweep('triangle', f, f, 0.15, 0.12), i * 100)
    );
  }
}

export const audio = new Synth();
