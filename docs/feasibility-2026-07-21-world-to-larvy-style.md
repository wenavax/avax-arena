# Fizibilite Notu — World'ü "Larvy tarzına" çevirmek

**Tarih:** 2026-07-21
**Durum:** Değerlendirme (uygulama kararı YOK — yalnız fizibilite)
**Tetikleyen:** [larvy.fun](https://larvy.fun/) analizi sonrası "World'ü bu tarza çevirmek nasıl olur?" sorusu

---

## 0. Larvy nedir (referans)
Robinhood Chain üzerinde on-chain, "cozy" **top-down pixel-art çiftçilik** oyunu. $LARVY (ERC-20) ekonomisi:
- **Görsel:** top-down ortografik, sıcak palet, hazır ticari pixel-art tileset + 4-yön animasyonlu karakterler.
- **Mekanik:** gather (chop/mine/fish) → farm → sell (marketplace) → **enerji** ile pace'lenen döngü. 4 skill (Farming/Forestry/Mining/Fishing), Lv5×4 → public world açılır.
- **Ekonomi (asıl güçlü kısım):**
  - **Hold-to-play** — oynamak için min $LARVY tut.
  - **Hold-to-regen** — cüzdan bakiyesi arttıkça enerji hızlanır (10k=1.2× … 100M=20× max). Sürekli tutma teşviki.
  - **Daily Reward Pool** — oyun-içi coin kazan → açık round'a commit et (coin **yakılır** = sink) → round kapanınca havuzdaki $LARVY **pro-rata** dağıtılır, cüzdana **oto-ödeme** (claim yok).
  - Arz: yarısı kilitli, yarısı rezerv (public multisig).

---

## 1. "Larvy tarzı" iki bağımsız eksen
Larvy'nin kimliği iki ayrı şeyden oluşur; karıştırmamak şart:
1. **Görsel** — top-down + cozy pixel + sıcak palet.
2. **Mekanik/ekonomi** — gather/farm/enerji/reward-pool + hold-to-regen.

World şu an ikisinin de **zıddı**: izometrik + savaş-RPG. Yani "çevirmek" = iki ayrı büyük iş.

---

## 2. Mevcut World'ün durumu (kod tabanı)
- Phaser 3, **izometrik**, ~20 sahne.
- **Render tamamen prosedürel** — hiç sprite/tileset yok. Terrain her tile için elmas üst-yüz + sol/sağ duvar olarak `lib/game/iso/core.ts`'de *çiziliyor* (`drawColumn`/`drawTopFace`/`drawLeftWall`). Yükseklik 0-5 → duvar kolonları → 2.5D derinlik. Monster'lar (`monsterSprites.ts`, **0 image load**), hero, prop'lar hep vektör çizim.
- Ölçüler:
  - `IsoBaseScene.ts` 4120 LOC + iso çekirdeği ≈ 5.260 LOC
  - 14 `Iso*Scene` ≈ 14.280 LOC
  - İzo-koordinat çağrıları toplam **168**, bunun **78'i** tek yerde (`core.ts` + `IsoBaseScene`). Her sahne izo koordinatını yalnız ~4 kez kullanıyor → projeksiyon **merkezi**.

---

## 3. İzo→top-down geçişi — gerçek anatomi

### Karar A: Sadece projeksiyonu düzleştir (prosedürel kalır)
- `core.ts`: elmas→kare. `toScreen` → `x=tx·T, y=ty·T`; `isoDepth` → basit y-sort. **Duvar/yükseklik kolonları silinir** (izonun tüm kimliği buydu).
- `IsoBaseScene`: terrain çizim döngüsü, tıklama hit-test (`toTile`), derinlik sıralaması, kamera, minimap → yeniden.
- 14 sahne: tile-grid verisi (biome/height/collision/interact) **projeksiyondan bağımsız → korunur** ✅. Ama elle yerleştirilmiş prop offset'leri, monster siluetleri, battle backdrop ¾ görünüme ayarlı → denetim + rework.
- `zoneAtmosphere`, `lightPool`, minimap → yeniden yansıtma.
- **Efor: orta-yüksek** (~motorun 1/3'ü). **Getiri: düşük** — hâlâ Larvy gibi görünmez; sadece düzleşir ve elevation kimliğini kaybeder.

### Karar B: Üstüne gerçek pixel-art sprite pipeline (Larvy görünümü için ŞART)
- Şu an *hiç olmayan* asset pipeline: `load.spritesheet`, tile atlas, 4-yön animasyonlu karakter, ağaç/kaya/bina/mahsul sprite'ları.
- Yüzlerce tile + sprite **tedarik/üretim** (Larvy hazır ticari kit kullanıyor; biz lisanslar ya da üretiriz — süregelen sanat maliyeti).
- **Efor: yüksek + kalıcı.** Asıl maliyet burada — matematik değil, **sanat boru hattı**.

### Ne kalır / ne gider
| | Sanılan | Gerçek |
|---|---|---|
| Projeksiyon matematiği | "168 yeri düzelt, dev iş" | Merkezi → **orta**, korkulandan az |
| Tile-grid / zone verisi | "Baştan" | **Korunur** ✅ |
| Elevation / 2.5D kimlik | — | **Tamamen kaybolur** |
| Larvy'nin cozy pixel görünümü | "Projeksiyonu çevirince gelir" | **Gelmez** — sıfırdan sprite pipeline gerekir |

---

## 4. Verdict
- **Tam çevirmek** = motorun ~1/3'ünü yeniden yaz + sıfırdan pixel-art sanat boru hattı + mevcut savaş içeriğinin (~%70-80: BattleScene, 13 dungeon, 126 monster, battle royale, adventures) çoğunu **at**. Ortak kalan tek şey **altyapı** (wallet/Privy, save, FSB token, SQLite indexer). Teknik olarak mümkün ama **getirisi zayıf**; pratikte "çevirmek" değil "yeni oyun".
- Zor kısım tahminin **tersi**: koordinat matematiği merkezi olduğu için yönetilebilir; asıl duvar (1) düzleştirince **2.5D kimliğini** kaybetmek, (2) Larvy görünümünün **prosedürel motorla imkânsız** olması → yeni sprite pipeline zorunlu.

## 5. Öneri — görseli değil, ekonomiyi al
Larvy'den kopyalanası **görsel değil, token modeli**: *hold-to-play + hold-to-regen + daily reward pool (auto-payout, coin-sink)* — tam da FSB'nin eksiği olan "tutma sebebi + sink".

Bunu **World'e dokunmadan**, ayrı bir cozy top-down çiftlik modülü (ör. yeni küçük bir sahne / `/world/farm` benzeri route) olarak eklemek:
- İzo savaş World'ünü bozmaz (additive, yıkıcı değil).
- FSB/treasury/indexer altyapısını yeniden kullanır.
- Yeni sanat yükünü **tek bir top-down sahneyle** sınırlar (14 sahne değil).
- Larvy'nin en iyi fikrini (hold-to-regen + günlük havuz) Frostbite arcade'ine **ekonomik omurga** olarak getirir.

**Sonuç: "World'ü Larvy yap" yerine "Larvy'nin ekonomisini Frostbite'a küçük bir cozy modül olarak ekle" — ~%10 maliyetle faydanın çoğu.**

---

## 6. Sonraki adım (opsiyonel, karar user'da)
Eğer ekonomi-omurga yolu seçilirse: hibrit çiftlik-modül + FSB reward-pool için ayrı bir tasarım (brainstorming → spec) açılır. Bu not yalnız fizibilite; uygulama kararı verilmedi.
