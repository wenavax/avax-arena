# Faz 11 — Bina İç Mekânları (TD World)

**Tarih:** 2026-08-13 · **Karar:** kullanıcı AskUserQuestion ile "Bina iç mekânları" seçti
(Faz 9 planı §9B.4'te "kullanıcıya ayrıca sorulacak" diye ertelenmişti).

## Çekirdek tespit (keşif raporundan)

- Kasabadaki **her** `building` prop'u bir hub-oyun kapısı (iframe/route). Dekoratif ev YOK —
  "4 ev mimarisi" (`4e153b6`) yalnız aynı 9 binanın çizim stilini dallandırır (`styleForId`).
  → İç mekânlar için **yeni binalar** eklenecek.
- `TdDungeonScene` birebir emsal: `scene.pause('TdWorld')` + `launch`, kendi canvas zemini,
  ESC/giriş-pad çıkışı, `leaving` guard'ı, pause-persist hero konumu (exitPos fiilen ölü).
- Dünya panelleri (questPanel/bagPanel/openService) **TdWorldScene'e gömülü** — iç mekân
  sahnesi kendi KÜÇÜK panel yardımcısını taşır (buildPanel kalıbının yerel kopyası).
  Dünya panel sistemine DOKUNULMAZ (quest-smoke 33 + economy-smoke 51 çapası orada).
- `tdState.tick()` yalnız dünya update'inde → iç mekânda zaman DONAR (zindanla aynı; istenen).
- Ayrı sahne = ayrı display list → gece perdesi/hava iç mekânı boyamaz; ekstra iş yok.

## Kapsam (4 adım)

### 11.1 Çekirdek: sahne + veri + kapılar
- `lib/game/td/interiors.ts` — SAF veri (Node'da testlenir): her iç mekân için
  `{ id, name, room: {w,h,floor,wall}, furniture: [{kind,tx,ty,solid?}], npc?, exitPad,
  features }`. Mobilya çizimleri `sprites/interiorProps.ts` içinde **`Record<FurnKind,…>`
  deseniyle** (Faz 8 `DECO_SPEC` dersi: eksik sprite derleme hatası olur, runtime'a sızamaz).
- `TdInteriorScene` — TdDungeonScene şablonu: sabit küçük oda (~14×10 tile) tek canvas,
  kamera zoom `applyZoom`/`layoutHud` ikizi, E/ESC çıkış (`leaving` guard),
  `scene.pause('TdWorld')`+`launch`, dönüş `stop()+resume('TdWorld')`.
  **Sahne dizisine SONA eklenir + `create()` başında `bringToTop()`** (boss-donma dersi:
  "sahne aktif ≠ görünür").
- `worldProps.ts`: yeni `PropKind` **`'house'`** (BİLEREK `'building'` DEĞİL —
  `td-props-test` `buildings-count === HUB_GAMES.length` çapası kırılmasın). Ev prop'u
  building ile aynı geometri sözleşmesi: kapı alt-orta, solid dikdörtgen, `data.interiorId`.
- `TdWorldScene`: interaktif filtresine `'house'`, `handleInteract`'a
  `door_dungeon` kalıbıyla launch, hint `E — enter <name>`.
- Ev dış çizimi: `mkBuilding` stil fabrikaları yeniden kullanılır (icon yerine küçük tabela
  varyantı serbest; W/H/kapı sözleşmesi AYNEN korunur).
- Test: `scripts/td-interior-test.ts` — oda verisi tutarlılığı (exitPad yürünebilir, mobilya
  oda içinde, solid'ler kapı/pad'i mühürlemez: oda-içi flood-fill kapı→her etkileşimli).
  `td-props-test`'e evler eklenir: çakışma yok + **spawn'dan flood-fill ev kapılarına da ulaşır**.

### 11.2 Han: The Frosted Hearth — uyku mekaniği
- Yeni ev: han (kuzey sıranın batı kanadı önerisi; kesin yer implementer'da —
  cadde bandına kapı, `td-props-test` + ekran görüntüsüyle doğrula).
- **Innkeeper iç-mekân NPC'si** (dünya NPC listesine GİRMEZ — quest-smoke'un
  `npc-props-streamed == 8` çapası ve npcs.ts dokunulmadan kalır; interiors.ts'te tanımlı,
  sahne yerel çizer, chibi üreticisi yeniden kullanılır).
- Yatak [E] → yerel panel: "Sleep until morning — 5g". Onay → fade →
  `tdState.dayTime = DEFAULT_DAY_TIME` + `tdState.save()` + HP/enerji FULL + `ps.gold -= 5`
  (+`ps.save()` live'da). Altın < 5 → kibar ret (kırmızı hint). Gündüz de çalışır
  (ertesi sabaha atlamaz — aynı günün sabahı değil; SADECE saat sabaha çekilir, gün sayacı yok).
  **Yeni gold sink** (Faz 10 ile uyumlu, ucuz tutuldu).
- Gece perdesiyle senkron: uyandıktan sonra dünyaya dönünce nightRect lerp'i kendiliğinden
  gündüze iner (dünya update'i halleder; iç mekânda ekstra iş yok).

### 11.3 Arşiv: Scribe's Archive — lore aktivasyonu
- İkinci ev: arşiv (doğu kanat önerisi). İçeride 4-6 kitap rahlesi; [E] → lore paneli.
- İçerik `lore.ts`'ten seçilir (566 satır, tek tüketicisi TdBattleScene idi — ölü içerik
  canlanıyor). `lore.ts` API'sine DOKUNULMAZ (TdBattleScene paylaşıyor); interiors.ts
  yalnız anahtar listesi tutar.
- (Opsiyonel, ucuzsa) üçüncü küçük ev: dekor-only cottage — mobilya + şömine, mekanik yok.

### 11.4 Runtime smoke + cila
- `scripts/td-interior-smoke.py` (economy-smoke deseni): kapı hint'i → E ile gir →
  sahne aktif+görünür (render-order çapası!) → innkeeper paneli → GERÇEK TIKLAMA ile uyku
  (altın -5, saat ☀, HP/enerji full, gece perdesi alpha→0) → kitap oku (lore metni panelde) →
  çık → dünya resume + hero kapı önünde → reload persist → konsol temiz.
- Ekran görüntüleri GÖZLE kontrol (9B dersi: ölçüm ≠ görünürlük/okunurluk).

## Değişmeyecekler (regresyon çapaları)
- `frostbite_save` v:1 şeması (uyku yalnız mevcut alanları yazar) · `frostbite_td_save` izolasyonu
- `hubGames.ts` + 9 hub binası + iframe akışı · npcs.ts 8 NPC + quest sistemi
- Harita imzası (townProps imzaya girmiyor; yine de `td-map-test` koşulur)
- Dünya panel kodu (openDialog/openService/renderShop/renderForge) — hiç dokunulmaz
- Mevcut smoke'lar: walk + quest 33 + economy 51 + daynight yeşil kalmalı

## Süreç
1. Her adım ayrı commit; 11.1 → 11.2 → 11.3 → 11.4 sırası.
2. Subagent uygular → ana bağlam diff'i OKUR (çift review — her fazda gerçek bug çıktı) →
   testler + tsc → commit.
3. Sonda: tüm TD suite + 4 smoke + yeni smoke → push → `deploy-mainnet.sh`
   (nohup+Monitor deseni) → canlı chunk string doğrulaması (HTTP; SSH auto-mode'da kapalı).

## Bilinen tuzaklar (implementer'a)
- Panel butonlarında container ÇOCUĞUNA da `.setScrollFactor(0)` (Faz 7 hitTest dersi).
- `fillRoundedRect` yarıçap > h/2 bozuk üçgenleme (Faz 5.10) — panel çizimlerinde kıskaç.
- Metinlere `.setResolution(k)` yoksa jilet değil bulanık (Faz 5.2).
- Sahne örneği yeniden kullanılır → `init()`'te TÜM mutable alanları sıfırla (Dungeon dersi).
- `tdMode !== 'live'` iken `frostbite_save`/achievements'a YAZMA (Faz 3 sandbox Critical'i).
- Uyku sonrası `redrawStats` cache anahtarı: hp/enerji değişimi bir sonraki karede
  kendiliğinden yakalanır (anahtar hp içeriyor) — elle çağrı GEREKMEZ, doğrula yeter.
