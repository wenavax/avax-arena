# World Görsel Yükseltme — Hibrit Sanat Yönü Tasarımı

**Tarih:** 2026-07-18
**Durum:** Onaylandı (beyin fırtınası oturumu, görsel companion ile)
**Kapsam:** Avalanche World (izometrik RPG) görsellerinin ciddi yükseltilmesi — 18 zone, savaş sahnesi ve HUD dahil. Oynanış, save formatı ve hub mimarisi değişmez; bu tamamen görsel katman işidir.

## Mevcut durum (envanter özeti)

- Terrain %100 prosedürel Phaser Graphics: elmas üst yüz + iki duvar, `ZONE_BIOME_COLORS` düz renkleri, ±%5 seeded jitter (`lib/game/iso/core.ts:78-279`). Statik terrain her frame yeniden çiziliyor (`IsoBaseScene.ts:309-330`).
- Monster/NPC'ler statik renkli daire/dikdörtgen — animasyon yok. Oyuncu prosedürel 11 parça gövde + 4-frame yürüme bob'u + NFT aura.
- `public/sprites/` içinde yüklü ama **hiç kullanılmayan** CC0 setler: `tiny-dungeon.png`, `tiny-battle.png`, `micro-roguelike.png`, `kenney-1bit.png`, `ninja-*.png`.
- Işık/gölge çok sınırlı: meşale glow daireleri, 25'lik ambient partikül havuzu, yüksek kolon altı %8 gölge. Cast shadow, yönlü ışık, renk banyosu yok.
- Canvas 1280×720, `pixelArt:false, antialias:true` (`PhaserGame.tsx:35-62`).

## Kararlar

| Karar | Seçim |
|---|---|
| Sanat yönü | **Hibrit (C):** prosedürel zemin 2.0 (ışık/atmosfer) + sprite canlılar |
| NFT hero | Prosedürel kalır, detay+animasyon yükseltmesi alır — zincir trait kimliği birebir korunur |
| Boss'lar | Sprite OLMAZ — yükseltilmiş prosedürel imza görseller ("özel olan büyük ve benzersiz çizilir" kuralı) |
| Sprite kaynağı | CC0 (projedeki tiny-dungeon/tiny-battle + eksikler Kenney/OpenGameArt/itch CC0). **AI sprite üretimi YOK** |
| Kapsam | 4 alan: zemin ışık+atmosfer, monster/NPC sprite'ları, zone kimlik dekorları, savaş+HUD |
| Uygulama sırası | Town vitrini → kademeli 4 paket → bütünlük turu (1-2-3 sentezi) |
| Deploy | Her paket kendi commit + prod deploy'u ile |

## Uygulama aşamaları

### Aşama 0 — Town vitrini (stil doğrulama kapısı)

P1+P2'nin çekirdeği yalnız Town'a uygulanır: 5-6 monster/NPC sprite'a döner; güneş gölgeleri, ışık havuzları, renk banyosu Town'a girer. **Kullanıcı canlıda bakıp onaylamadan 18 zone'a yayılım başlamaz.** Yanlış stile 18 zone'luk emek gömülmesini engeller.

### P1 — Monster/NPC sprite'ları

- **Yeni dosya `lib/game/iso/monsterSprites.ts`** (tek doğruluk kaynağı):
  ```ts
  interface MonsterSpriteDef {
    sheet: string;        // 'tiny-dungeon' | 'tiny-battle' | eklenen CC0 sheet
    frames: number[];     // idle/yürüme frame indeksleri
    anim: 'bob' | 'frames';  // sheet frame'i yoksa tween bob fallback'i
    scale?: number;       // varsayılan ~3×
  }
  const MONSTER_SPRITES: Record<string, MonsterSpriteDef>
  ```
- BootScene'e tiny-dungeon/tiny-battle spritesheet yüklemeleri (16×16); texture'lara `setFilter(NEAREST)` → global antialias açıkken pixel keskinliği.
- Monster render: daire çizimi yerine `add.sprite`, yön flip'i, 2-4 frame idle/yürüme animasyonu, altına gölge elipsi. Depth formülü aynı `(tx+ty)` bandı.
- Elite sistemi korunur: tint + boyut çarpanı sprite üzerine uygulanır (baseType lookup mevcut).
- **Fallback:** eşlemi olmayan tip mevcut prosedürel çizime düşer — hiçbir monster görünmez kalmaz.
- Hero yükseltmesi (aynı paket): gövde detayı artar, yürüme döngüsü zenginleşir, silah efektleri; boss'lara P4'e kadar dokunulmaz.

### P2 — Zemin ışık + atmosfer (+ performans temeli)

- **Mimari parça — terrain chunk'lama + viewport culling:** statik terrain 16×16 tile'lık chunk Graphics'lerine bölünür; kamera dışındaki chunk'lar `setVisible(false)` ile tamamen atlanır. (Plan aşamasında RenderTexture cache'in yerini aldı: 96×96 harita tek RT'de ~80MB texture belleği isterdi; chunk+cull aynı perf kazancını bellek maliyetsiz verir.) Hem büyük perf kazancı (özellikle mobil) hem zengin detayın ön şartı.
- Güneş yönlü aydınlatma: KB (kuzey-batı) yüzler parlak, `(tx+ty)` gradyanı.
- Kolonların GD (güney-doğu) yönüne cast shadow'ları (terrain pass içinde, ucuz).
- Biome mikro-dokuları: taş çatlağı, kum dalgası, çim tutamı yoğunlaştırma — hepsi seeded (`tileHash`), deterministik.
- Zone renk banyosu + alt sis bandı: scrollFactor 0 overlay, zone başına palet tablosu.
- Işık havuzları: meşale/lav/kristal noktalarında titreyen radial ışık — tek seferlik üretilmiş radial-gradient texture + alpha tween. **Bütçe: sahne başına ≤6, mobilde ≤3.**

### P3 — Zone kimlik dekorları

- **Yeni dosya `lib/game/maps/zoneProps.ts`:** zone → prop seti + yoğunluk (Crypt: mezar taşı/kemik; Volcano: lav kayası/köz; Swamp: mantar/sarmaşık; Citadel: buz kristali; ...18 zone).
- Prop görselleri: CC0 sprite'lar + uygun yerde prosedürel; seeded yerleşim, yürünebilir tile'lara ve çıkışlara yerleşmez (BFS erişilebilirlik testi korunur).
- Ambient partiküller zone'a özelleşir: volcano köz, swamp spor, crypt toz, citadel kar yoğunluğu (mevcut 25'lik havuz genişletilir, mobil bütçe aynı kalır).
- ⚠️ Bilinen tuzak: kasaba hub binaları dekor/duvar geçiş sırasına duyarlı — dekorlar iki-geçiş kuralına uyar, `hub-town-check` 150/150 yeşil kalmalı.

### P4 — Savaş sahnesi + HUD

- BattleScene zone-temalı prosedürel arka plan: zone paleti + silüet katmanları (gradient gökyüzü, uzak tepeler/sütunlar).
- Monster savaş görseli: aynı sprite'ın 5-6× pixelated büyütmesi + idle animasyon; 17 Tem juice paketiyle (pop, zoom punch, hayalet HP, konfeti) birleşir.
- Boss'lar: prosedürel imza görsel yükseltmesi (13 boss'un imza AI'larına eşlik eden görsel kimlik).
- HUD hafif dokunuş: minimap çerçevesi, panel tutarlılığı. HUD yakın zamanda cilalandı — kapsam bilinçli dar.

### Kapanış — bütünlük turu

18 zone headless screenshot'lanıp yan yana incelenir; palet/yoğunluk uyumsuzlukları tek commit'te düzeltilir.

## Doğrulama (her pakette)

1. `tsc` temiz + `next build` ✓
2. `world-smoke.mjs` kalıbı: 4 world sayfası lokal+prod 0 konsol hatası
3. Hub testleri: `hub-registry-test` 9/9, `hub-town-check` 150/150 (dekor duvar/interact ezmemeli)
4. Headless screenshot karşılaştırması (Town + 2 örnek zone)
5. P4'te `/world/battle-test` harness kalıbı geri kurulur (commit öncesi silinir)
6. Mobil profil: partikül/ışık bütçeleri düşük; MSAA/pixelRatio katmanı mevcut davranışını korur

## Değişmeyenler / kısıtlar

- Save formatı (`frostbite_save`) ve PlayerState'e dokunulmaz — tamamen görsel katman.
- Hub mimarisi (hubGames.ts, overlay, XFO SAMEORIGIN) değişmez.
- `pixelArt:false` global kalır; keskinlik texture bazında NEAREST filtre ile.
- Tüm UI metinleri İngilizce (ürün dili kuralı).
- AI sprite üretimi ve ödül/ekonomi değişikliği kapsam dışı.

## Riskler

| Risk | Önlem |
|---|---|
| 16×16 chunky sprite ile pürüzsüz zemin stil uyumsuzluğu | Aşama 0 vitrin kapısı — Town'da kullanıcı onayı olmadan yayılmaz |
| Dekorların hub binalarını/yürünebilirliği bozması | İki-geçiş kuralı + hub-town-check + BFS testi her pakette |
| RenderTexture cache'inin tile değişimlerini kaçırması | Değişim noktalarında (kapı açılması vb.) açık invalidation; smoke testte zone geçiş kontrolü |
| Mobil perf gerilemesi | Işık/partikül bütçeleri + RenderTexture kazancı; mobil headless smoke her pakette |
| CC0 setlerde eksik monster tipi | Prosedürel fallback — görünmez monster imkânsız |
