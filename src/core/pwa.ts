/**
 * PWA helpers: service-worker registration, "already running as an installed app"
 * detection, and the install prompt (Android/desktop Chrome) or the iOS
 * "Share -> Add to Home Screen" hint.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners: (() => void)[] = [];

/**
 * Launched as the installed app? Decided once at boot: after the first tap the page itself goes
 * fullscreen (Fullscreen API), and Chrome then also reports display-mode: fullscreen - which
 * must not be mistaken for "installed".
 */
const launchedInstalled =
  new URLSearchParams(location.search).get('source') === 'pwa' ||
  matchMedia('(display-mode: standalone)').matches ||
  (matchMedia('(display-mode: fullscreen)').matches && !document.fullscreenElement) ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;
let installedNow = launchedInstalled;

export const isInstalled = (): boolean => installedNow;

export const isIOS = (): boolean =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isTouch = (): boolean => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

/**
 * Show an install offer? On every phone/tablet not already running the app, plus desktops where
 * Chrome offered a native prompt. Browsers that never fire the prompt (Samsung Internet, Firefox,
 * or Chrome before it decides) get manual steps instead.
 */
export const canOfferInstall = (): boolean => !isInstalled() && (deferred !== null || isTouch());
export const hasNativePrompt = (): boolean => deferred !== null;

export function onInstallChange(fn: () => void): void {
  listeners.push(fn);
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  listeners.forEach((f) => f());
  return outcome === 'accepted';
}

export function initPwa(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    // no preventDefault: Chrome may show its own install banner too; our button reuses this event
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    listeners.forEach((f) => f());
  });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        /* offline support is optional */
      });
    });
  }
}
