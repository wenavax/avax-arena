// ─── Platform Detection ───
// Detects whether running as native app (Capacitor) or web browser

export type Platform = 'web' | 'android' | 'ios';

let cachedPlatform: Platform | null = null;

export function getPlatform(): Platform {
  if (cachedPlatform) return cachedPlatform;

  if (typeof window !== 'undefined' && (window as any).Capacitor) {
    const cap = (window as any).Capacitor;
    if (cap.getPlatform() === 'android') {
      cachedPlatform = 'android';
    } else if (cap.getPlatform() === 'ios') {
      cachedPlatform = 'ios';
    } else {
      cachedPlatform = 'web';
    }
  } else {
    cachedPlatform = 'web';
  }

  return cachedPlatform;
}

export function isNative(): boolean {
  return getPlatform() !== 'web';
}

export function isAndroid(): boolean {
  return getPlatform() === 'android';
}

export function isIOS(): boolean {
  return getPlatform() === 'ios';
}
