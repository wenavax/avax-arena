// ─── Haptic Feedback ───
// Wraps Capacitor Haptics plugin. No-ops on web.

import { isNative } from './platform';

let Haptics: any = null;
let ImpactStyle: any = null;

// Lazy-load Capacitor haptics only on native
async function getHaptics() {
  if (Haptics) return Haptics;
  if (!isNative()) return null;
  try {
    const mod = await import('@capacitor/haptics');
    Haptics = mod.Haptics;
    ImpactStyle = mod.ImpactStyle;
    return Haptics;
  } catch {
    return null;
  }
}

export const haptic = {
  /** Light tap — UI button press, minor event */
  light: async () => {
    const h = await getHaptics();
    h?.impact({ style: ImpactStyle?.Light });
  },

  /** Medium impact — loot drop, purchase, damage taken */
  medium: async () => {
    const h = await getHaptics();
    h?.impact({ style: ImpactStyle?.Medium });
  },

  /** Heavy impact — boss defeat, level up, critical hit */
  heavy: async () => {
    const h = await getHaptics();
    h?.impact({ style: ImpactStyle?.Heavy });
  },
};
