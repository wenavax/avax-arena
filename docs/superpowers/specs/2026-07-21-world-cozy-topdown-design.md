# World → Cozy Top-Down Dönüşüm — Tasarım Spec'i

**Tarih:** 2026-07-21
**Durum:** Onaylandı (kullanıcı, bu tarihte)
**Referanslar:**
- Fizibilite: `docs/feasibility-2026-07-21-world-to-larvy-style.md`
- Larvy ölçümleri: gameplay.gif analizi (bu spec §4.1'de özet)
- Kanıt demosu: Claude Artifact `frostbite-cozy-demo.html` (tek dosya, prosedürel; reçete §4'e taşındı)

## 0. Karar özeti (kullanıcı onaylı)

| Karar | Seçim |
|---|---|
| Savaş/RPG sistemleri | **Kalır** — görsel top-down chibi'ye taşınır, üstüne cozy katman eklenir |
| Rollout | **Paralel inşa** (`lib/game/td/`) + tek atomik geçiş commit'i |
| Harita | **Tek dev kesintisiz dünya, 384×384 tile** (portalsız açık dünya; zindanlar ayrı sahne) |
| Cozy kapsam | **Demo seti, oyun-içi** (toplama/çiftçilik/enerji; FSB/on-chain ekonomi SONRAKI faz) |
| Sanat | **Prosedürel** (demo reçetesi; harici asset/tileset yok) |

Hedef: "hatasız, bugsız, dikkatli" — her görev doğrulamalı, subagent-driven, canlı izo World geçiş anına kadar bozulmaz.

## 1. Mimari

### 1.1 Yeni modül: `frontend/lib/game/td/` (izo koduna sıfır dokunuş)

| Dosya | Sorumluluk |
|---|---|
| `tdCore.ts` | Grid matematiği (`toScreen: x=tx·16, y=ty·16`), y-sort derinlik, kamera yardımcıları |
| `sprites/chibi.ts` | Sprite fabrikası: 1px koyu kontur (`outline`), zemin gölgesi, animasyon kare üretimi — demodan port |
| `sprites/hero.ts` | 4 yön × 4 kare yürüyüş + alet savurma (balta/kazma/olta, 3'er kare) + idle nefes; NFT rarity → palet varyantı (mevcut rarity mantığı korunur) |
| `sprites/monsters.ts` | 126 canavar: mevcut `iso/monsterSprites.ts` tip→renk/siluet verisi **5 chibi şablonuna** (blob / biped / dörtayak / uçan / boss) parametre olarak beslenir. Boss'lar büyük boy + imza detay |
| `sprites/props.ts` | Ağaç (varyantlı), kaya, çalı, çit, bina, kamp ateşi (4-kare), zindan kapısı, tarla parseli |
| `tiles.ts` | Biome tile renderer — chunk başına pre-render canvas; scallop kenarlar, kıyı yumuşatma, 3-kare su |
| `worldMap.ts` | 384×384 deterministik harita üretici — 18 zone'un `terrainGen` reçeteleri bölge tanımlarına dönüşür |
| `TdWorldScene.ts` | TEK açık-dünya sahnesi: chunk streaming, y-sort, encounter, gather node'ları, NPC/kapı etkileşimi, minimap |
| `TdDungeonScene.ts` | TEK parametrik zindan sahnesi; 13 zindanın layout'u `dungeonData.ts` veri dosyasına çıkarılır |
| `cozy/energy.ts` | Enerji (max 1000), maliyetler, pasif + kamp ateşi regen |
| `cozy/gather.ts` | Node etkileşimi: kes/kaz/topla/balık; respawn zamanlayıcıları |
| `cozy/farm.ts` | Ekim → büyüme aşamaları → hasat; parsel durumu |

### 1.2 Korunanlar (dokunulmaz ya da minimal uyarlama)
- `PlayerState.ts` — save/load, envanter, ekipman, quest (şema v2 için genişler, §6)
- `BattleScene.ts` — akış/mantık aynı; yalnız görsel reskin (§5)
- `HUDScene`, `InventoryScene`, `ShopScene`, `SettingsScene`, `CharacterSelectScene`, `BootScene` (sahne kayıtları güncellenir)
- Privy login / WorldLoginGate, hub iframe overlay (XFO SAMEORIGIN), mobil joystick + MobileTopBar, multiplayer istemcisi (koordinat düzlemi değişir, §6.2)

### 1.3 Geçişte silinecekler (geçiş + 1 hafta sonra, ayrı commit)
14 `Iso*Scene` + `IsoBaseScene.ts` + `iso/core.ts` + `iso/terrainGen.ts` (izo-özel kısımlar) ≈ 19K LOC → yerine ~8 odaklı TD dosyası.

## 2. Dünya haritası — 384×384 kesintisiz

### 2.1 Coğrafya = level-gate
```
        KUZEY: FrostWastes (lv 40+)     KD: Eternal kapısı
BATI: Necropolis (lv 35+)   ┌─────────┐   DOĞU: Citadel/Ruins (lv 25+)
                            │ halka2: │
                            │ bataklık│maden|harabe (lv 15-30)
                            │ ┌─────┐ │
                            │ │halka1│ orman/çayır/göller (lv 1-15)
                            │ │┌───┐│ │
                            │ ││TOWN││ │  ← spawn, hub binaları, TARLA
                            │ │└───┘│ │
                            └─────────┘
        GÜNEY-DOĞU: Volcano (lv 45+)   uç köşeler: DemonGate, Void (lv 55+)
```
- Merkez **kasaba**: spawn noktası, 9 hub oyun binası (hubGames.ts korunur), çiftlik alanı bitişik.
- Bölge sınırları yumuşak geçiş (biome blend 4-8 tile); uzaklık arttıkça canavar seviyesi artar (mevcut zone level aralıkları bölge tablolarına taşınır).
- **13 zindan girişi** dünyada kapı prop'u; etkileşim → `TdDungeonScene` (dungeonId parametresi).
- Deterministik seed: aynı harita her yüklemede birebir (test snapshot'ları buna dayanır).

### 2.2 Performans
- Chunk = 48×48 tile pre-render canvas; görünür pencere + 1 halka (~6 chunk) bellekte, LRU tahliye.
- Prop'lar chunk başına grup; ekran dışı chunk'ların prop'ları update almaz.
- Bütçe: masaüstü 60fps, mobil 30fps. İlk görevlerde chunk-stream benchmark'ı yazılır; bütçe tutmazsa chunk boyutu/halka ayarlanır.

## 3. Kamera & ölçek (Larvy ölçümlerinden)
- Tile 16px; görünür alan **384×256 iç çözünürlük** (24×16 tile), CSS pixelated upscale — karakter ekran yüksekliğinin ~%8'i.
- GIF analiz özeti: Larvy tile 16px @ 3× zoom; karakter ~1.5 tile chibi (kafa ~%55); ateş ~4 kare @ ~130ms; yürüyüş ~4 kare; su sürekli şimmer.

## 4. Görsel sistem (demo reçetesi)
- **Zorunlu reçete:** 1px koyu kontur her sprite'ta; zemin gölge elipsi; dama zemin + benekli yama; patika scallop kenar; kıyı köşe yumuşatma + sığ su bandı; 3-kare su (400ms), 4-kare ateş (130ms); yürüyüşte adım dalması (1px), idle nefes (520ms); vinyet + sıcak pencere ışığı.
- Chibi oran: kafa ≈ gövdenin %55'i, iri göz + yanak.
- **Atmosfer:** 18 zone'un `zoneAtmosphere` ayarları (ton/partikül) bölge bazlı gradient geçişle taşınır; ışık havuzları karanlık bölgelerde.
- **Canavar şablon onayı:** 5 şablonun her birinden ilk örnek üretildiğinde kullanıcıya screenshot'la onaya gelinir; onay sonrası 126 tip otomasyonla türetilir.

## 5. Savaş entegrasyonu
- Kontrat değişmez: `scene.launch('Battle', { monster: {type,name,level,hp,maxHp,atk,def,isElite}, returnScene })` + `battle-end` event. `returnScene` artık sabit `TdWorld` (veya `TdDungeon`+dungeonId).
- Overworld'de gezinen canavarlar chibi sprite; encounter tabloları bölge tanımlarında.
- BattleScene reskin: backdrop bölge paletinden prosedürel; canavar büyük boy chibi; mevcut juice (pop/zoom punch/hayalet HP/konfeti/nabız — 17 Tem paketi) aynen kalır.
- Freeze/stun/slow/Double Strike vb. mekanikler (17 Tem düzeltmeleri) davranışsal olarak birebir korunur — regresyon testi şart.

## 6. Cozy katman & save

### 6.1 Cozy mekanikler (oyun-içi, on-chain YOK)
- Node'lar: ağaç→odun, kaya→taş/cevher, kıyı→balık, çalı→frostberry; respawn 20-30sn.
- Tarla: kasaba bitişiği, 9-24 parsel; ek→2 büyüme aşaması→hasat.
- Enerji: max 1000; maliyet: kesme 15, kazma 21, balık 25, ek/hasat 5; pasif regen + kamp ateşi yakını ×4.
- Kaynaklar `PlayerState.inventory`'ye yeni item tipleri olarak; Shop'ta gold'a satış (fiyat dengesi 17 Tem satış-fiyat işiyle uyumlu).

### 6.2 Save göçü (kayıpsız) & multiplayer
- Şema v2: `schemaVersion:2`, yeni alanlar `energy`, `resources`, `farm`, `worldPos {x,y}`.
- v1 `zone` alanı → bölge spawn koordinat map tablosu (`Forest → (192,140)` gibi); `load()` v1 görünce otomatik migrate, hiçbir alan silinmez.
- Multiplayer: pozisyon tek düzlem; zone-kanal → tek kanal + mesafe cull (veya bölge-kanal — uygulamada basit olan seçilir, davranış: yakındaki oyuncular görünür).

## 7. Test & rollout

### 7.1 Test setleri
- **td-smoke** (yeni): (a) worldMap deterministik snapshot (seed→hash), (b) chunk stream in/out, (c) save v1→v2 migrate senaryoları, (d) battle launch/battle-end roundtrip, (e) energy/gather/farm birim testleri.
- Mevcut **world-smoke 4** + **hub-embed 18** TD'ye uyarlanır ve geçiş öncesi yeşil olmalı.
- Her görev sonunda headless screenshot turu: kasaba, 4 biome, zindan, battle.

### 7.2 Rollout
1. Tüm inşa `lib/game/td/` + yeni scene key'lerde; canlı izo World hiç etkilenmez.
2. Geçiş anı: `sceneLoader.ts` SCENE_IMPORTS map'i tek commit'le TD sahnelerine döner (atomik; ENV flag yok).
3. İzo dosyaları geçişten **1 hafta sonra** ayrı commit'le silinir (geri dönüş penceresi).
4. Uygulama subagent-driven; her görev kendi doğrulamasıyla biter.

## 8. Riskler ve önlemler
| Risk | Önlem |
|---|---|
| 126 canavar otomasyon kalitesi | Şablon başına ilk örnek kullanıcı onayına gelir (§4) |
| 384×384 performans | Chunk benchmark ilk görevlerde; bütçe tutmazsa chunk/halka ayarı |
| Multiplayer düzlem değişimi | İzole görev + kendi testi |
| Savaş mekaniği regresyonu | Davranış testleri (freeze/stun/slow/DS) geçiş kapısı |
| Save bozulması | Migrate birim testleri + gerçek v1 save fixture'ları |

## 9. Kapsam dışı (bilinçli)
- FSB hold-to-regen / günlük reward pool (ayrı faz, finansal karar)
- Gün/gece döngüsü, keşif sisi (fog) — P2 aday
- Yeni oyun içeriği (yeni zindan/canavar/quest) — dönüşüm birebir içerik taşır
