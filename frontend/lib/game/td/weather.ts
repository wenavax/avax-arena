// frontend/lib/game/td/weather.ts
// ─── Faz 9B.2: biyoma göre hava durumu (SAF mantık — Phaser YOK) ───
//
// 🔒 PERF SÖZLEŞMESİ: parçacıklar KAMERAYA SABİT (scrollFactor 0), dünya nesnesi DEĞİL.
// Chunk redraw yoluna hiç girmezler (Faz 2'nin su-tick dersi: dünya-uzayı animasyonu
// chunk'ı kirletir → her karede yeniden çizim). Bu yüzden konumlar EKRAN koordinatında
// hesaplanır ve ekran dikdörtgeninde sarmalanır.

export type WeatherKind = 'none' | 'snow' | 'rain' | 'ash';

/**
 * Bölge → hava. `atmoForRegion` ile aynı `regionAt().key` alanından beslenir, ama
 * atmosfer tablosundan AYRI tutulur: atmosfer 18 bölgenin hepsine renk verir, hava
 * yalnız gerekçesi olan biyomlara verilir (kalanı 'none' → sıfır parçacık, sıfır maliyet).
 *
 * Kasaba bilinçli olarak 'snow': oyun "Frostbite" ve oyuncu erken saatlerinin çoğunu
 * kasabada geçiriyor — burası 'none' olsaydı özellik ilk oturumda görünmezdi.
 */
const REGION_WEATHER: Record<string, WeatherKind> = {
  town: 'snow', frostwastes: 'snow', citadel: 'snow',
  forest: 'rain', grassE: 'rain', grassS: 'rain', swamp: 'rain',
  volcano: 'ash', forge: 'ash', demongate: 'ash',
};

export function weatherForRegion(regionKey: string): WeatherKind {
  return REGION_WEATHER[regionKey] ?? 'none';
}

export interface WeatherSpec {
  /** Ekranda aynı anda duran parçacık sayısı (MAX_PARTICLES tavanının altında olmalı). */
  count: number;
  color: number;
  alpha: number;
  /** px/s düşüş ve yatay sürüklenme. */
  vy: number;
  vx: number;
  /** Parçacık dikdörtgeni (px) — yağmur ince+uzun, kar/kül kare. */
  w: number;
  h: number;
  /** Yatay salınım genliği (px) — yağmurda 0 (dik çizgi). */
  sway: number;
  /** Salınım frekansı (rad/s). */
  swaySpeed: number;
}

/** Sahnenin bir kez yarattığı havuz boyutu — tüm kipler bunun altında kalmalı. */
export const MAX_PARTICLES = 80;

export const WEATHER_SPEC: Record<Exclude<WeatherKind, 'none'>, WeatherSpec> = {
  snow: { count: 60, color: 0xffffff, alpha: 0.55, vy: 26, vx: 7, w: 2, h: 2, sway: 13, swaySpeed: 1.1 },
  rain: { count: 78, color: 0x9fd4ff, alpha: 0.42, vy: 300, vx: -46, w: 1, h: 7, sway: 0, swaySpeed: 0 },
  ash: { count: 44, color: 0xffa060, alpha: 0.50, vy: 18, vx: -6, w: 2, h: 2, sway: 10, swaySpeed: 0.8 },
};

/** 🔒 Havuz taşmasını DERLEME değil test zamanında yakalar (td-weather-test). */
export const SPEC_KINDS = Object.keys(WEATHER_SPEC) as Exclude<WeatherKind, 'none'>[];

export interface Particle {
  x: number;
  y: number;
  /** Salınım faz kayması — parçacıklar aynı anda sağa-sola gitmesin. */
  phase: number;
}

/**
 * Bir parçacığın bir sonraki EKRAN konumu. Saf: girdiyi mutasyona uğratmaz, yeni
 * koordinat döner (sahne uygular). `t` saniye cinsinden mutlak zaman (salınım için).
 *
 * Sarmalama: dikeyde alt kenarı geçince üst kenarın 4px üstüne, yatayda ekran genişliği
 * modülo. Rastgelelik YOK — deterministik, dolayısıyla test edilebilir; görsel çeşitliliği
 * spawn anındaki `phase`/başlangıç konumu sağlar.
 */
export function stepParticle(
  p: Particle, spec: WeatherSpec, dt: number, w: number, h: number, t: number,
): { x: number; y: number } {
  let y = p.y + spec.vy * dt;
  let x = p.x + spec.vx * dt + (spec.sway ? Math.cos(t * spec.swaySpeed + p.phase) * spec.sway * dt : 0);
  if (y > h) y = -4;
  else if (y < -8) y = h - 1;
  if (w > 0) {
    x = x % w;
    if (x < 0) x += w;
  }
  return { x, y };
}

/**
 * Deterministik başlangıç serpmesi — `i`. parçacığın ekran içindeki yeri. Math.random
 * KULLANILMAZ: aynı ekran boyutunda aynı düzen çıkar, smoke testi flake yapmaz
 * (`?weather=0` kapatma bayrağı yine de var — bkz. TdWorldScene).
 */
export function seedParticle(i: number, w: number, h: number): Particle {
  // altın-açı serpme (dropOffset ile aynı hile): kümelenme olmadan düzgün dağılım
  const gx = (i * 0.6180339887) % 1;
  const gy = (i * 0.7548776662) % 1;
  return { x: gx * w, y: gy * h, phase: (i * 2.39996) % (Math.PI * 2) };
}
