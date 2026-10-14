import { POWER_SLOTS } from '../core/config';

export type FireMode = 'normal' | 'spread' | 'laser';

/**
 * Gradius-style power state. Capsules advance the cursor along the bar;
 * activating cashes the highlighted slot in and resets the cursor.
 * All of it is lost on death, classic-style.
 */
export class PowerState {
  cursor = -1; // -1 = nothing highlighted
  speedLevel = 0; // 0..2
  fireMode: FireMode = 'normal';
  shieldHp = 0; // 0..3
  options = 0; // 0..2

  collect(): void {
    this.cursor = (this.cursor + 1) % POWER_SLOTS.length;
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
