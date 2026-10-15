import { isInstalled } from './pwa';

/**
 * Browser-tab fullscreen (phones). Chrome always shows its "swipe to exit full
 * screen" notice when a page enters fullscreen - pages cannot suppress it. So
 * we only ever enter it from the title screen, on a tap that does nothing else,
 * and never mid-game: the notice shows and fades while the player is still on
 * the title. Installed apps are fullscreen from the manifest and skip all this.
 */
export function wantsFullscreen(): boolean {
  return (
    matchMedia('(pointer: coarse)').matches &&
    !isInstalled() &&
    !!document.documentElement.requestFullscreen &&
    !document.fullscreenElement
  );
}

/** Must run inside a user gesture (a DOM pointerup / click handler). */
export function enterFullscreen(): Promise<boolean> {
  try {
    return document.documentElement
      .requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions)
      .then(() => {
        const o = screen.orientation as unknown as { lock?: (mode: string) => Promise<void> } | undefined;
        o?.lock?.('landscape')?.catch(() => {
          /* unsupported - the rotate overlay covers it */
        });
        return true;
      })
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}
