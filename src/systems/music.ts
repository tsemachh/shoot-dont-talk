import { audio } from './audio';

/**
 * Chiptune music sequencer - a real-time port of the preview video's
 * soundtrack generator (render.py synth()). 150 BPM eighth notes:
 *  - lead: 25% pulse arpeggio, an octave above the chord root
 *  - bass: triangle on every 4th step
 *  - drums: noise hats on 'drive' / 'boss' songs, accented on the beat
 * Each sector has its own key and 4-chord progression, exactly as in the
 * video. Notes are scheduled ahead on the AudioContext clock (lookahead
 * scheduler), so timing stays tight even when frames drop.
 */
export type SongKey = 'title' | 'invasion' | 'swarm' | 'lunar' | 'warp' | 'canyon' | 'boss';

type Note = [midi: number, steps: number] | null;

interface Song {
  root: number; // MIDI note
  prog: number[]; // semitone offsets per 2-bar block
  kind: 'arp' | 'drive' | 'boss' | 'organ';
  step?: number; // seconds per step (default: eighths at 150 BPM)
  seq?: { lead: Note[]; bass: Note[] }; // through-composed songs (one entry per step)
}

/**
 * Warp Ring theme: an original chiptune-organ arrangement built on the opening
 * motif of J.S. Bach's Toccata in D minor (public domain) - the piece Gyruss
 * made famous - stated in three octaves, then a running D-minor arpeggio
 * section over pedal bass. Returned as per-step lead/bass tracks.
 */
function toccata(): { lead: Note[]; bass: Note[] } {
  const lead: Note[] = [];
  const bass: Note[] = [];
  const put = (track: Note[], at: number, midi: number | null, len: number) => {
    while (track.length < at + len) track.push(null);
    if (midi !== null) track[at] = [midi, len];
  };
  let t = 0;
  // motif: A G A~ . G F E D C# D~
  const motif: [number | null, number][] = [
    [81, 1], [79, 1], [81, 6], [null, 2], [79, 1], [77, 1], [76, 1], [74, 1], [73, 3], [74, 5], [null, 2]
  ];
  for (const oct of [0, 12, 24]) {
    for (const [m, len] of motif) {
      put(lead, t, m === null ? null : m - oct, len);
      t += len;
    }
    put(bass, t - 7, 38, 7); // pedal D under each cadence
  }
  // running section: broken chords, two passes through Dm - Bb - Gm - A
  const chords: [number, number[]][] = [
    [62, [0, 3, 7, 12]],
    [58, [0, 4, 7, 12]],
    [55, [0, 3, 7, 12]],
    [57, [0, 4, 7, 12]]
  ];
  const shape = [0, 1, 2, 3, 2, 1, 2, 1, 0, 2, 1, 3, 2, 3, 1, 2];
  for (let pass = 0; pass < 2; pass++) {
    for (const [root, tones] of chords) {
      put(bass, t, root - 24, 15);
      for (let i = 0; i < 16; i++) put(lead, t + i, root + 12 + tones[shape[i]], 1);
      t += 16;
    }
  }
  while (bass.length < lead.length) bass.push(null);
  return { lead, bass };
}

const SONGS: Record<SongKey, Song> = {
  title: { root: 57, prog: [0, -4, -2, -5], kind: 'arp' },
  invasion: { root: 45, prog: [0, 0, -2, -4], kind: 'drive' },
  swarm: { root: 50, prog: [0, -4, -5, -2], kind: 'drive' },
  lunar: { root: 52, prog: [0, 3, 5, 3], kind: 'arp' },
  warp: { root: 50, prog: [0], kind: 'organ', step: 60 / 150 / 4, seq: toccata() },
  canyon: { root: 47, prog: [0, -2, -4, -5], kind: 'drive' },
  boss: { root: 40, prog: [0, 1, 0, -1], kind: 'boss' }
};

const STEP = 60 / 150 / 2; // eighth notes at 150 BPM
const LOOKAHEAD = 0.15; // seconds scheduled ahead
const TICK_MS = 25;
const ARP = [0, 7, 12, 7, 3, 7, 12, 15];
const ARP_BOSS = [0, 12, 1, 12, 0, 13, 6, 12];

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

class Music {
  private song?: Song;
  private wanted?: SongKey;
  private current?: SongKey;
  private step = 0;
  private nextTime = 0;
  private timer?: number;
  private bus?: GainNode;
  private pulse?: PeriodicWave;
  private organ?: PeriodicWave;
  private noiseBuf?: AudioBuffer;
  enabled = true;

  constructor() {
    audio.onUnlock(() => {
      if (this.wanted) this.start(this.wanted);
    });
  }

  /** Start (or keep playing) a sector's loop. Safe before audio unlock. */
  play(key: SongKey): void {
    this.wanted = key;
    if (!audio.ctx) return;
    if (this.current === key && this.timer !== undefined) return;
    this.start(key);
  }

  stop(): void {
    this.wanted = undefined;
    this.current = undefined;
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    if (this.bus && audio.ctx) {
      const t = audio.ctx.currentTime;
      this.bus.gain.cancelScheduledValues(t);
      this.bus.gain.setTargetAtTime(0, t, 0.08);
    }
  }

  /** N key: music on/off without touching sound effects. */
  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.bus && audio.ctx) this.bus.gain.setTargetAtTime(this.enabled ? 0.6 : 0, audio.ctx.currentTime, 0.05);
    return this.enabled;
  }

  private ensureNodes(ctx: AudioContext): void {
    if (this.bus) return;
    this.bus = ctx.createGain();
    this.bus.connect(audio.out!);
    // 25% duty pulse from its Fourier series
    const n = 32;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    this.pulse = ctx.createPeriodicWave(re, im);
    // drawbar-ish organ: fundamental + octaves + a little fifth
    const ore = new Float32Array(9);
    const oim = new Float32Array(9);
    oim[1] = 1;
    oim[2] = 0.55;
    oim[3] = 0.3;
    oim[4] = 0.35;
    oim[6] = 0.12;
    oim[8] = 0.15;
    this.organ = ctx.createPeriodicWave(ore, oim);
    const len = Math.floor(ctx.sampleRate * 0.05);
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private start(key: SongKey): void {
    const ctx = audio.ctx!;
    this.ensureNodes(ctx);
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.song = SONGS[key];
    this.current = key;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.06;
    const t = ctx.currentTime;
    this.bus!.gain.cancelScheduledValues(t);
    this.bus!.gain.setValueAtTime(0, t);
    this.bus!.gain.linearRampToValueAtTime(this.enabled ? 0.6 : 0, t + 0.25);
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
  }

  private schedule(): void {
    const ctx = audio.ctx;
    if (!ctx || !this.song) return;
    // after a long stall (tab hidden) skip ahead instead of firing a burst
    if (this.nextTime < ctx.currentTime - 0.3) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(ctx, this.step, this.nextTime);
      this.step++;
      this.nextTime += this.song.step ?? STEP;
    }
  }

  private playStep(ctx: AudioContext, i: number, t: number): void {
    const s = this.song!;
    if (s.seq) {
      const st = s.step ?? STEP;
      const k = i % s.seq.lead.length;
      const ln = s.seq.lead[k];
      if (ln) this.voice(ctx, t, hz(ln[0]), ln[1] * st * 0.95, 0.075, 'organ', 0);
      const bn = s.seq.bass[k];
      if (bn) this.voice(ctx, t, hz(bn[0]), bn[1] * st * 0.98, 0.16, 'triangle', 0);
      return;
    }
    const r = s.root + s.prog[Math.floor(i / 16) % s.prog.length];
    const arp = s.kind === 'boss' ? ARP_BOSS : ARP;

    // lead: pulse arpeggio, plucky decay
    this.voice(ctx, t, hz(r + 12 + arp[i % 8]), STEP * 0.95, 0.05, 'pulse', 6);
    // bass: triangle, held across 4 steps
    if (i % 4 === 0) this.voice(ctx, t, hz(r - 12), STEP * 3.8, 0.16, 'triangle', 0);
    // hats on driving songs
    if ((s.kind === 'drive' || s.kind === 'boss') && i % 2 === 0) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf!;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(i % 4 === 0 ? 0.16 : 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.bus!);
      src.start(t);
      src.stop(t + 0.05);
    }
    // kick on the bar for boss songs
    if (s.kind === 'boss' && i % 8 === 0) this.voice(ctx, t, 110, 0.18, 0.3, 'sine', 18, 40);
  }

  private voice(
    ctx: AudioContext,
    t: number,
    freq: number,
    dur: number,
    vol: number,
    type: 'pulse' | 'organ' | 'triangle' | 'sine',
    decay: number,
    toFreq?: number
  ): void {
    const o = ctx.createOscillator();
    if (type === 'pulse') o.setPeriodicWave(this.pulse!);
    else if (type === 'organ') o.setPeriodicWave(this.organ!);
    else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
    const g = ctx.createGain();
    if (decay > 0) {
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0005, vol * Math.exp(-decay * dur)), t + dur);
    } else {
      // held note with a short release, like the video's tri()
      const rel = Math.min(0.03, dur * 0.3);
      g.gain.setValueAtTime(vol, t);
      g.gain.setValueAtTime(vol, t + dur - rel);
      g.gain.linearRampToValueAtTime(0, t + dur);
    }
    o.connect(g);
    g.connect(this.bus!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

export const music = new Music();
