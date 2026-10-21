/**
 * iPhone and iPad need their own advice: Safari deletes a site's data after
 * 7 days without a visit, and an app added to the Home Screen gets its own,
 * separate storage (lists made in Safari don't show up in it).
 */

/** iPhone, iPod or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/** Running as an installed app (from the Home Screen), not in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  try {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches || false;
  } catch {
    return false;
  }
}

/** iPhone/iPad in Safari (or another iOS browser), not the installed app. */
export const isIOSBrowser = () => isIOS() && !isStandalone();

export type StoragePlatform = 'ios-browser' | 'ios-app' | 'other';
export const storagePlatform = (): StoragePlatform => (isIOS() ? (isStandalone() ? 'ios-app' : 'ios-browser') : 'other');
