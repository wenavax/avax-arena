// frontend/scripts/td-weather-test.ts — Faz 9B.2 hava durumu çapası
// Koşum: npx tsx scripts/td-weather-test.ts
import {
  weatherForRegion, stepParticle, seedParticle, WEATHER_SPEC, SPEC_KINDS, MAX_PARTICLES,
  type WeatherKind,
} from '../lib/game/td/weather';
import { REGIONS } from '../lib/game/td/worldMap';

let pass = 0; const fails: string[] = [];
function ok(name: string, cond: boolean) { if (cond) pass++; else fails.push(name); }

// ── 🔒 havuz çapası: hiçbir kip sahnenin yarattığı nesne sayısını aşamaz ──
ok(`her spec.count ≤ MAX_PARTICLES (${MAX_PARTICLES})`,
  SPEC_KINDS.every(k => WEATHER_SPEC[k].count <= MAX_PARTICLES));
ok('her spec pozitif hızda düşüyor', SPEC_KINDS.every(k => WEATHER_SPEC[k].vy > 0));
ok('her spec görünür (alpha>0, boyut>0)',
  SPEC_KINDS.every(k => WEATHER_SPEC[k].alpha > 0 && WEATHER_SPEC[k].w > 0 && WEATHER_SPEC[k].h > 0));
ok('yağmur dik (sway=0), kar/kül salınıyor',
  WEATHER_SPEC.rain.sway === 0 && WEATHER_SPEC.snow.sway > 0 && WEATHER_SPEC.ash.sway > 0);

// ── bölge eşlemesi: her bölge geçerli bir kip veriyor, bilinmeyen 'none' ──
const KINDS: WeatherKind[] = ['none', 'snow', 'rain', 'ash'];
ok('her bölge geçerli kip veriyor', REGIONS.every(r => KINDS.includes(weatherForRegion(r.key))));
ok('bilinmeyen bölge → none', weatherForRegion('__yok__') === 'none');
ok('kasabada hava var (özellik ilk oturumda görünür)', weatherForRegion('town') === 'snow');
ok('frostwastes → kar', weatherForRegion('frostwastes') === 'snow');
ok('volcano → kül', weatherForRegion('volcano') === 'ash');
ok('swamp → yağmur', weatherForRegion('swamp') === 'rain');
{
  // en az 3 farklı kip gerçekten haritada kullanılıyor (tablo ölü kalmasın)
  const used = new Set(REGIONS.map(r => weatherForRegion(r.key)));
  ok(`haritada ≥3 kip kullanılıyor (${[...used].join(',')})`, used.size >= 3);
  ok('kullanılan her kipin spec\'i var',
    [...used].filter(k => k !== 'none').every(k => !!WEATHER_SPEC[k as Exclude<WeatherKind, 'none'>]));
}

// ── seedParticle: deterministik + ekran içinde ──
{
  const W = 400, H = 260;
  const a = Array.from({ length: MAX_PARTICLES }, (_, i) => seedParticle(i, W, H));
  const b = Array.from({ length: MAX_PARTICLES }, (_, i) => seedParticle(i, W, H));
  ok('seed deterministik', a.every((p, i) => p.x === b[i].x && p.y === b[i].y && p.phase === b[i].phase));
  ok('seed ekran içinde', a.every(p => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H));
  ok('seed kümelenmiyor (≥90% benzersiz x)', new Set(a.map(p => p.x.toFixed(2))).size >= MAX_PARTICLES * 0.9);
}

// ── stepParticle: saf (girdiyi bozmaz) + ekranda kalır + gerçekten hareket eder ──
{
  const W = 400, H = 260;
  for (const k of SPEC_KINDS) {
    const spec = WEATHER_SPEC[k];
    let p = seedParticle(3, W, H);
    const frozen = { ...p };
    stepParticle(p, spec, 1 / 60, W, H, 0);
    ok(`${k}: stepParticle girdiyi MUTASYONA UĞRATMIYOR`,
      p.x === frozen.x && p.y === frozen.y && p.phase === frozen.phase);
    // 30 saniyelik koşum: hiçbir kare ekranı terk etmemeli (sarmalama çalışıyor)
    let inside = true, moved = 0;
    for (let f = 0; f < 1800; f++) {
      const n = stepParticle(p, spec, 1 / 60, W, H, f / 60);
      moved += Math.abs(n.y - p.y);
      p = { ...p, x: n.x, y: n.y };
      if (p.x < 0 || p.x > W || p.y < -8 || p.y > H) { inside = false; break; }
    }
    ok(`${k}: 30sn boyunca ekranda kalıyor`, inside);
    ok(`${k}: gerçekten hareket ediyor`, moved > H);
  }
}
// dejenere ekran (w=0) sıfıra bölme yapmamalı
{
  const p = seedParticle(1, 0, 0);
  const n = stepParticle(p, WEATHER_SPEC.snow, 1 / 60, 0, 0, 0);
  ok('w=0 dejenere durumda NaN üretmiyor', Number.isFinite(n.x) && Number.isFinite(n.y));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach(f => console.log('  FAIL ' + f)); process.exit(1); }
