# Avalanche World Mobile App — Capacitor Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Platforms:** iOS + Android
**Approach:** Capacitor wrapper around existing Next.js + Phaser web app

---

## 1. Architecture Overview

```
frontend/                         (existing Next.js + Phaser)
├── capacitor.config.ts           Capacitor configuration
├── ios/                          Xcode project (auto-generated)
├── android/                      Android Studio project (auto-generated)
├── out/                          Static export (next export target)
└── lib/game/
    ├── mobile/
    │   ├── haptics.ts            Haptic feedback wrapper
    │   ├── push.ts               Push notification setup + token management
    │   └── platform.ts           Platform detection (web/ios/android)
    ├── sceneLoader.ts            Dynamic scene registration + preloading
    └── iso/
        └── IsoBaseScene.ts       Touch controls (existing, to be improved)
```

**Build flow:** `next build && next export` → static HTML/JS/CSS in `out/` → Capacitor serves in native WebView → iOS/Android app

---

## 2. Scene Lazy-Loading System

### Problem
23 Phaser scenes loaded via single `Promise.all` in PhaserGame.tsx. On mobile this means:
- ~800KB+ JS parsed at startup
- RAM spike loading all scenes simultaneously
- Slow initial load (3-5s on mid-range phones)

### Solution: Hybrid Lazy-Loading

**Core bundle (always loaded, ~240KB):**
- BootScene, CharacterSelectScene, IsoWorldScene, HUDScene

**Town bundle (loaded on first town entry, ~80KB):**
- IsoTownScene, ShopScene, InventoryScene, SettingsScene

**Combat bundle (loaded on first battle, ~60KB):**
- BattleScene

**Zone bundles (loaded on demand, ~20-40KB each):**
- Each zone scene is its own chunk
- 13 zone scenes: Forest, Dungeon, IceCave, Volcano, Crypt, Abyss, Sanctum, Swamp, Mines, Citadel, Necropolis, FrostWastes, DemonGate, Ruins, VoidRealm, Forge, Eternal

### Implementation: sceneLoader.ts

```typescript
// Scene registry — maps scene key to dynamic import
const SCENE_IMPORTS: Record<string, () => Promise<any>> = {
  // Town bundle
  'Town':       () => import('./scenes/IsoTownScene'),
  'Shop':       () => import('./scenes/ShopScene'),
  'Inventory':  () => import('./scenes/InventoryScene'),
  'Settings':   () => import('./scenes/SettingsScene'),
  // Combat
  'Battle':     () => import('./scenes/BattleScene'),
  // Zone scenes (each is its own chunk)
  'Forest':     () => import('./scenes/IsoForestScene'),
  'Dungeon':    () => import('./scenes/IsoDungeonScene'),
  // ... etc for all 18 zones
};

// Load and register a scene dynamically
async function loadScene(game: Phaser.Game, key: string): Promise<void> {
  if (game.scene.getScene(key)) return; // already loaded
  const module = await SCENE_IMPORTS[key]();
  const SceneClass = Object.values(module).find(v => typeof v === 'function');
  game.scene.add(key, SceneClass as any);
}

// Preload neighbor zones in background
async function preloadNeighbors(game: Phaser.Game, currentZone: string): Promise<void> {
  const neighbors = ZONE_NEIGHBORS[currentZone] || [];
  await Promise.all(neighbors.map(key => loadScene(game, key)));
}
```

### Zone Neighbor Map

```
Town     → [Forest]
Forest   → [Town, Dungeon, Volcano, Crypt, Abyss, Sanctum, Swamp, Mines, ...]
Dungeon  → [Forest, IceCave]
IceCave  → [Dungeon]
Volcano  → [Forest]
// ... each zone lists its connected exits
```

### Transition Flow

1. Player walks onto exit tile
2. Fade-out begins (500ms)
3. During fade: `await loadScene(game, targetZone)` + `await loadScene(game, 'Battle')`
4. Fade-out completes → `scene.start(targetZone)`
5. Background: `preloadNeighbors(game, targetZone)` (non-blocking)

If scene is already cached (preloaded), step 3 is instant. Worst case: ~100ms delay on first visit (hidden by fade animation).

---

## 3. Mobile Touch Optimization

### Joystick Improvements
- Increase joystick radius: 50px → 65px
- Increase deadzone: 15px → 20px
- Add visual feedback: thumb glow on active
- Allow joystick to appear wherever player touches (floating joystick option)

### Battle UI for Mobile
- Attack/Skill/Item/Defend buttons: minimum 48x48px touch targets
- 8px minimum spacing between buttons
- Skills shown as icon grid (2x2) instead of text list
- Swipe gestures: swipe left for items, swipe right for skills

### HUD Responsive Scaling
- Detect screen DPI via `window.devicePixelRatio`
- Scale HUD text: base 10px × clamp(DPI, 1, 2) = 10-20px
- Minimap: 160px on desktop, 120px on mobile
- Stat bars: full width on mobile (not fixed 154px)

### Fat Finger Protection
- All interactive elements minimum 44x44px (Apple HIG standard)
- No two interactive elements closer than 8px
- Click-to-move ignores taps within 60px of any HUD element

---

## 4. Capacitor Setup

### Dependencies
```
@capacitor/core
@capacitor/cli
@capacitor/ios
@capacitor/android
@capacitor/haptics
@capacitor/push-notifications
@capacitor/splash-screen
@capacitor/status-bar
```

### capacitor.config.ts
```typescript
{
  appId: 'pro.frostbite.world',
  appName: 'Frostbite World',
  webDir: 'out',
  server: {
    // For development: load from dev server
    // url: 'http://localhost:3000',
    // For production: use bundled static files
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0a0e1a',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
}
```

### Next.js Static Export Config
```typescript
// next.config.mjs additions
{
  output: 'export',        // Static HTML export for Capacitor
  basePath: '',            // No basePath for native app (override /avalanche)
  trailingSlash: true,
}
```

**Note:** Need separate build config for mobile vs web deployment. Mobile uses `output: 'export'` with no basePath, web keeps `basePath: '/avalanche'`.

### Privy Wallet in WebView
- Privy embedded wallets work in Capacitor WebView (confirmed compatible)
- WalletConnect deep links: register `frostbite://` URL scheme in both iOS and Android
- Fallback: if external wallet connect fails, prompt user to use embedded wallet

---

## 5. Native Features

### Push Notifications

**Server-side:**
- New API endpoint: `POST /api/v1/push/register` — saves device token + wallet address
- New API endpoint: `POST /api/v1/push/send` — sends notification to specific user
- Storage: SQLite table `push_tokens(wallet, platform, token, created_at)`
- Firebase Cloud Messaging for Android, APNs for iOS (both via Firebase Admin SDK)

**Client-side (push.ts):**
```typescript
import { PushNotifications } from '@capacitor/push-notifications';

async function initPush(walletAddress: string) {
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;

  await PushNotifications.register();

  PushNotifications.addListener('registration', (token) => {
    fetch('/api/v1/push/register', {
      method: 'POST',
      body: JSON.stringify({ wallet: walletAddress, token: token.value }),
    });
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // Show in-game toast
  });
}
```

**Notification types:**
- Daily quest reminder (scheduled, 1x/day)
- Battle Royale starting soon
- Leaderboard position change
- New dungeon unlocked (level milestone)

### Haptic Feedback

**haptics.ts wrapper:**
```typescript
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export const haptic = {
  light: () => Capacitor.isNativePlatform() && Haptics.impact({ style: ImpactStyle.Light }),
  medium: () => Capacitor.isNativePlatform() && Haptics.impact({ style: ImpactStyle.Medium }),
  heavy: () => Capacitor.isNativePlatform() && Haptics.impact({ style: ImpactStyle.Heavy }),
};
```

**Integration points:**
- `BattleScene` — damage taken: `haptic.light()`, critical hit: `haptic.medium()`, KO: `haptic.heavy()`
- `ShopScene` — purchase confirmed: `haptic.medium()`
- Loot drop received: `haptic.medium()`
- Boss defeated: `haptic.heavy()`
- Level up: `haptic.medium()`
- Web platform: all calls silently no-op

---

## 6. Performance Budget

| Metric | Target (Mobile) | Current (Web) |
|--------|----------------|---------------|
| Initial JS parse | <300KB | ~800KB |
| Time to interactive | <3s | ~5s |
| Zone transition | <200ms perceived | ~100ms |
| Memory (peak) | <150MB | ~200MB |
| FPS (gameplay) | 30fps stable | 60fps |
| Battery drain | <15%/hour | N/A |

### Optimizations
- Scene lazy-loading (Faz 2 core feature)
- Terrain render caching: draw terrain to RenderTexture once, only redraw on zone change
- Reduce ambient particles on mobile: 50% count
- Lower camera zoom range on mobile: 0.8-1.5x (vs 0.6-2.5x desktop)
- Disable water animation on low-end devices (detect via `navigator.hardwareConcurrency < 4`)

---

## 7. Implementation Phases

### Phase 1: Scene Lazy-Loading + Mobile Touch Polish
- Refactor PhaserGame.tsx to use sceneLoader.ts
- Core/Town/Combat/Zone bundle split
- Neighbor preloading system
- Joystick improvements
- Battle UI touch targets
- HUD responsive scaling
- **Deliverable:** Faster web loading + better mobile web experience

### Phase 2: Capacitor Setup + Build Pipeline
- Install Capacitor, init iOS + Android projects
- Configure static export (separate from web build)
- Test Phaser rendering in native WebView
- Test Privy wallet in WebView
- Add platform detection (platform.ts)
- **Deliverable:** App runs on iOS Simulator + Android Emulator

### Phase 3: Native Features
- Haptic feedback integration
- Push notification setup (Firebase)
- Push token registration API
- Notification scheduling (daily quests)
- Splash screen + status bar config
- **Deliverable:** Native features working on device

### Phase 4: App Store Preparation
- App icons (all sizes: 20-1024px iOS, 48-512px Android)
- Splash screen assets
- App Store screenshots (6.7", 6.1", iPad)
- Google Play screenshots (phone, tablet)
- Privacy policy URL (already exists at /privacy)
- Apple Developer + Google Play accounts
- Handle Apple NFT/crypto review guidelines
- **Deliverable:** Apps submitted to stores

---

## 8. Apple NFT/Crypto Risk Mitigation

Apple requires in-app purchases to go through their system (30% cut). For NFT apps:
- **Allowed:** Viewing NFTs, using NFTs in gameplay, displaying blockchain data
- **Not allowed:** Purchasing NFTs in-app bypassing Apple IAP, directing users to external purchase
- **Gray area:** Embedded wallets that can purchase (Privy)

**Strategy:**
- iOS: Disable mint page, disable shop AVAX purchases, show "Mint on web" message
- iOS: NFT viewing + gameplay features remain fully functional
- Android: Full functionality (Google is more lenient)
- Detect platform in `platform.ts` and conditionally show/hide purchase UI

---

## 9. Not In Scope (Future)

- Offline gameplay mode
- Social features (friends list, guilds)
- In-app purchases via Apple IAP / Google Play Billing
- AR features
- Tablet-specific layout
- Apple Watch companion
