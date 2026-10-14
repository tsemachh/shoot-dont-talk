import { POWER_SLOTS } from '../core/config';

export type FireMode = 'normal' | 'spread' | 'laser';
export type Slot = (typeof POWER_SLOTS)[number];

/** Arkanoid-style letter capsules: the letter says what you get, catching it applies it at once. */
export const POWER_LETTER: Record<Slot, string> = { SPD: 'S', SPR: 'W', LSR: 'L', SHD: 'B', OPT: 'O' };
export const POWER_COLOR: Record<Slot, number> = {
  SPD: 0x5ae1ff,
  SPR: 0xffa028,
  LSR: 0xff46c8,
  SHD: 0x7cff8a,
  OPT: 0xffd25a
};
export const POWER_NAME: Record<Slot, string> = {
  SPD: 'S - SPEED UP',
  SPR: 'W - WIDE SHOT',
  LSR: 'L - LASER',
  SHD: 'B - BARRIER',
  OPT: 'O - OPTION'
};
export const powerName = (slot: string): string => POWER_NAME[slot as Slot] ?? slot;

/**
 * Power state. Each capsule carries one letter (rolled by roll()); collect(slot)
 * marks it and activate() applies it - sectors call both together, so catching a
 * capsule switches the power on immediately. All of it is lost on death.
 */
export class PowerState {
  cursor = -1; // -1 = nothing highlighted
  speedLevel = 0; // 0..2
  fireMode: FireMode = 'normal';
  shieldHp = 0; // 0..3
  options = 0; // 0..2

  collect(slot?: Slot): void {
    this.cursor = slot ? POWER_SLOTS.indexOf(slot) : (this.cursor + 1) % POWER_SLOTS.length;
  }

  /** Pick the letter for a new capsule, skipping powers that would do nothing right now. */
  roll(): Slot {
    const w: [Slot, number][] = [
      ['SPD', this.speedLevel >= 2 ? 0 : 24],
      ['SPR', this.fireMode === 'spread' ? 4 : 20],
      ['LSR', this.fireMode === 'laser' ? 4 : 20],
      ['SHD', this.shieldHp >= 3 ? 0 : 18],
      ['OPT', this.options >= 2 ? 0 : 16]
    ];
    const total = w.reduce((a, [, n]) => a + n, 0);
    let r = Math.random() * total;
    for (const [slot, n] of w) {
      if ((r -= n) < 0) return slot;
    }
    return 'SPR';
  }

  /** Returns the slot name that was activated, or null if nothing to activate. */
  activate(): string | null {
    if (this.cursor < 0) return null;
    const slot = POWER_SLOTS[this.cursor];
    switch (slot) {
      case 'SPD':
        this.speedLevel = Math.min(2, this.speedLevel + 1);
        break;
      case 'SPR':
        this.fireMode = 'spread';
        break;
      case 'LSR':
        this.fireMode = 'laser';
        break;
      case 'SHD':
        this.shieldHp = 3;
        break;
      case 'OPT':
        this.options = Math.min(2, this.options + 1);
        break;
    }
    this.cursor = -1;
    return slot;
  }

  reset(): void {
    this.cursor = -1;
    this.speedLevel = 0;
    this.fireMode = 'normal';
    this.shieldHp = 0;
    this.options = 0;
  }

  speedMultiplier(): number {
    return 1 + 0.35 * this.speedLevel;
  }
}
