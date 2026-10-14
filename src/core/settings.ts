/**
 * Player settings that survive scene changes and reloads: bloom, CRT,
 * sound effects, music. Stored per browser; storage failures (private mode,
 * blocked storage) just fall back to the defaults.
 */
export interface Settings {
  bloom: boolean;
  crt: boolean;
  sound: boolean;
  music: boolean;
}

const KEY = 'sdt-settings';
const DEFAULTS: Settings = { bloom: true, crt: true, sound: true, music: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}
