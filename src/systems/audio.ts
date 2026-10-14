/**
 * Tiny WebAudio synth - all SFX are generated, no asset files (jsfxr style).
 * The context starts lazily on the first user gesture; M toggles mute.
 */
class Synth {
  private ctx?: AudioContext;
  private out?: GainNode;
  muted = false;

  /** Call from any input handler; safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.5;
        this.out.connect(this.ctx.destination);
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.out) this.out.gain.value = this.muted ? 0 : 0.5;
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
    this.noise(0.18, 0.22, 2000);
    this.sweep('square', 400, 60, 0.15, 0.1);
  }

  playerDie(): void {
    this.noise(0.6, 0.3, 900);
    this.sweep('sawtooth', 300, 40, 0.6, 0.18);
  }

  march(step: number): void {
    const notes = [110, 104, 98, 92];
    this.sweep('triangle', notes[step % 4], notes[step % 4], 0.07, 0.16);
  }

  ufo(): void {
    this.sweep('sine', 700, 980, 0.12, 0.05);
  }

  ufoDie(): void {
    this.sweep('square', 1200, 200, 0.35, 0.14);
    this.noise(0.3, 0.2, 2500);
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

  waveClear(): void {
    [392, 523, 659, 784].forEach((f, i) =>
      setTimeout(() => this.sweep('triangle', f, f, 0.15, 0.12), i * 100)
    );
  }
}

export const audio = new Synth();
