# World Faz 9 — Bağlantı Paketi + Yaşayan Dünya

**Tarih:** 2026-08-09 · **Branch:** `frozenfriends-mvp` · **Taban:** Faz 8 (`d4290f5`)
**Kullanıcı kararı:** Bağlantı paketi + Yaşayan dünya (Ekonomi paketi BİLİNÇLİ ERTELENDİ → Faz 10)

---

## Tespit — neden bu faz

`TdBattleScene` (2285 satır, yalnız **zindan boss'ları** = oyun zamanının ~%2'si) şu sistemleri
kullanıyor; `TdWorldScene` (1774 satır, ~%90) ve `TdDungeonScene` (568, trash mob'lar)
**hiçbirini import etmiyor**:

| Sistem | Satır | Boss savaşı | Dünya | Zindan trash |
|---|---|---|---|---|
| `lootTables.ts` (`rollLoot`) | 624 | ✅ | ❌ | ❌ |
| `skills.ts` (`CLASS_SKILLS`, `CLASS_MP`) | 44 | ✅ | ❌ | ❌ |
| `elements.ts` (`getElementMultiplier`) | 87 | ✅ | ❌ | ❌ |
| `musicSystem.ts` (`music.play`) | 461 | ✅ | ❌ | ❌ |
| `achievements.ts` (`incrementStat`) | 324 | ✅ | ❌ | ❌ |
| `lore.ts` (`getRandomMobLine`) | 566 | ✅ | ❌ | ❌ |

Dünya savaşı yalnızca `combat.ts`'in 34 satırı (`heroHit` = atk − def/2, ±%15, %10 krit)
ve ödül olarak `killRewards` (XP + altın). Yani **~2.100 satır yazılmış + testli içerik
oyunun %90'ında ölü duruyor.**

Ayrıca `grep` ile doğrulandı: **altını azaltan tek satır** `TdBattleScene.ts:2149`
(boss ölüm cezası %10). Dünyada hiçbir harcama noktası yok → Faz 10 (Ekonomi) konusu.

### ⚠️ Ön analizde çıkan sessiz boşluk — loot anahtarı örtüşmesi

`LOOT_TABLES` 97 anahtar · `monsterData` 106 tip. Kesişim ölçüldü:

- **79 tip kapsanıyor** → loot düşer
- **27 tip KAPSANMIYOR** → `rollLoot` boş dizi döner, **sessizce hiç loot düşmez**:
  `witch_apprentice, crystal_spider, vine_crawler, ruin_ghost, time_wraith, cloud_wisp,
  magma_hound, molten_smith, aurora_spirit, permafrost_wyrm, lich_acolyte, deep_slime,
  jellyfish, gem_golem, hammer_sentinel, magma_smith, titan_guard, succubus, blood_knight,
  infernal_mage, chaos_sprite, dark_seraphim, entropy_demon, primordial_beast, eternal_flame,
  ancient_dragon_king, maelstrom_spirit`
- **18 ölü tablo girdisi** (izo dönemi adları, hiçbir canavara karşılık gelmiyor):
  `slime, bat, demon, ogre, dragon, frost_dragon, boss_frost, boss_frost_v2, frost_sprite,
  crystal_wyrm, venomous_hydra, sea_serpent, deep_lurker, arcane_wisp, obsidian_guard,
  forge_golem, death_knight, flame_archon`

Kapsanmayan 27'nin çoğu **geç oyun** (voidrealm/eternal/demongate/forge tier). Loot'u
bağlayıp bunu düzeltmezsek: oyuncu erken bölgelerde loot alır, **endgame'e varınca loot
durur** — en kötü his. → İş 9A.0 zorunlu ön koşul.

---

## Faz 9A — Bağlantı paketi

### 9A.0 — Loot tablosu kapsama onarımı (ÖN KOŞUL)
- 27 kapsanmayan tip için `LOOT_TABLES` girdisi yaz. Mevcut `ITEMS` sözlüğü + rarity
  kelime dağarcığı kullanılacak; seviyeye uygun (endgame tipler epic/legendary ağırlıklı).
- 18 ölü girdi: **silme yok** — `TdBattleScene` boss'ları da bu tablodan okuyor ve
  `monsterData` dışı boss tipleri olabilir. Önce tüketici doğrula, sonra karar.
- 🔒 **Test çapası:** `td-loot-test.ts` — `monsterData`'daki HER tip için `rollLoot`
  en az bir tabloya isabet etmeli (kapsama %100). Yeni canavar eklenip loot yazılmazsa
  test kırmızı. *(Faz 8'in `DECO_SPEC` derleme-zamanı çaparının runtime karşılığı.)*

### 9A.1 — Loot düşürme (dünya + zindan trash)
- Tek boğaz noktası: `TdWorldScene.killMob()` (`:1585`) ve `TdDungeonScene.heroAttackMob()`
  kill bloğu (`:290-298`). **Boss'a DOKUNMA** — `TdBattleScene` zaten `rollLoot` çağırıyor;
  `despawnMonster` üzerinden ikinci kez düşürürsek **çift loot** olur.
- `rollLoot(type, isElite)` → yerde eşya sprite'ı (rarity renkli ışıma, `RARITY_COLORS`).
- **Tuzak:** `ps.addItem()` çanta doluysa `false` döner (12 slot limiti). O zaman eşya
  **yerde kalır** — sessizce yok olmaz. Faz 7'nin "ödül kısmi verilmez" ilkesiyle aynı.
- Otomatik toplama: üstüne yürü (yakınlık) → `addItem`; dolu ise kırmızı ipucu.
- Yerdeki eşyalar RAM'de (respawn kaynakları gibi) — **save şeması DEĞİŞMEZ**.

### 9A.2 — Yetenekler + MP (gerçek-zamanlıya uyarlama)
- `CLASS_SKILLS` **tur-tabanlı** tasarlanmış: `hits`, `stunChance`, `selfBuff{turns}`,
  `dot{turns}`. Gerçek-zamanlıda "tur" yok → **1 tur ≈ 2 sn** eşlemesi (TD katmanında,
  `skills.ts`'e DOKUNULMAZ — `TdBattleScene` ile paylaşılıyor).
- `skills.ts`'te **cooldown alanı yok** → TD katmanında yetenek başına CD tablosu.
- `PlayerState.mp/maxMp` zaten var (`:62-63`, levelUp +3) ama **dünyada regen yok** → ekle
  (`CLASS_MP[class].regen`/sn).
- Tuşlar `1-4`; `SPACE` temel vuruş **aynı kalır** (kas hafızası bozulmasın). Mobil için
  yetenek butonları (mevcut `td-ui-*` CustomEvent deseni).
- HUD: MP kapsül barı — `redrawStats()` cache-anahtarına `mp` eklenmeli, yoksa bar donuk kalır.

### 9A.3 — Element etkililiği
- `TdBattleScene:169-173` desenini birebir yansıt: `playerElement = CLASS_ELEMENTS[class]`,
  `monsterElement = MONSTER_ELEMENTS[baseType]` (**`elite_` öneki soyulur** — `rollLoot`'un
  yaptığı gibi, yoksa elitlerde element hep 'earth' fallback'ine düşer).
- `heroHit`'e çarpan: `combat.ts` saf kalsın → çarpan **parametre** olarak geçer
  (Faz 7'nin `rolloverRepeatables(rows, now)` deseni: mantık saf, veri sahneden).
- `getEffectivenessText` float text'i + `ELEMENT_COLORS` renklendirme.

### 9A.4 — Bölge müziği
- `ZoneMusic` 8 değer: `town|forest|dungeon|ice_cave|volcano|battle|boss|none` →
  18 bölge için eşleme tablosu.
- ⚠️ **Autoplay tuzağı:** `AudioContext` tarayıcı politikası gereği kullanıcı
  jesti olmadan çalmaz. `create()`'te DEĞİL, **ilk girdide** başlat.
- `frostbite_music` localStorage'ı (mute/volume) `musicSystem` içinde zaten var; HUD'a
  mute düğmesi.

### 9A.5 — Achievement sayımı
- Dünya/zindan kill'lerinde `incrementStat`.
- 🔴 **Sandbox tuzağı (Faz 3 review'ının yakaladığı Critical'in aynısı):**
  `frostbite_achievements` **canlı** veri. `tdMode !== 'live'` iken **yazma YASAK** —
  yoksa testnet/sandbox oynanışı canlı başarımları kirletir.

### 9A.6 — Canavar replikleri
- `getRandomMobLine` aggro anında baloncuk. Ucuz, karakter katar. Spam kilidi (mob başına 1).

---

## Faz 9B — Yaşayan dünya

### 9B.1 — Gündüz/gece döngüsü
- Zaman state'i **`tdState`'te** (`frostbite_td_save`, izole anahtar — canlı kayda risk yok).
  Şema değişimi → `migrateV1` deseni: alan yoksa default.
- Mevcut atmosfer lerp'inin (`:1350-1354`) **ÜSTÜNE** gece katmanı. `tintCur/fogCur`
  lerp'i bozulmayacak — gece ayrı bir çarpan.
- Gece: canavar statları ×1.3, loot şansı ×1.5 (risk/ödül).
- **Tuzak:** `atmoForRegion` saf fonksiyon, dokunulmaz; gece modülasyonu sahnede.

### 9B.2 — Hava durumu
- Biyoma göre kar (frostwastes/icecave) / yağmur (swamp/forest) / kül (volcano).
- Parçacıklar **kameraya sabit** (`scrollFactor(0)`) — dünya nesnesi değil, chunk
  redraw'a girmez (Faz 2'nin su-tick perf dersi).
- Deterministik olmayan tek yer: parçacık serpme. Smoke'u kırmaması için `?weather=0`.

### 9B.3 — NPC gündelik rutinleri
- Gece NPC'ler kaybolur/hana çekilir; diyalog "come back tomorrow".
- 🔴 **Faz 7 tuzağı:** görev TESLİMİ gece kilitlenirse oyuncu görevi tamamlayamaz.
  Karar: **teslim her zaman açık**, yalnız görsel/diyalog değişir.

### 9B.4 — Bina iç mekânları — ⚠️ KAPSAM UYARISI
Şu an kapılar hub iframe açıyor (`hubGames.ts`, XFO SAMEORIGIN, 4 test seti).
Gerçek iç mekân sahnesi **yeni bir sahne tipi** = Faz 9'un geri kalanı kadar iş.
→ **Bu faza ALINMIYOR.** Faz 10/11 adayı. Kullanıcıya ayrıca sorulacak.

---

## Süreç

1. **9A.0 önce** (loot kapsaması) — sonraki her şeyin ön koşulu
2. 9A.1–9A.6 → tek commit + test + doğrulama
3. 9B.1–9B.3 → ayrı commit
4. Her paket: subagent-driven çift review (Faz 1-3 deseni: gerçek bug buldu her seferinde)
5. Doğrulama: `td-*-test.ts` suite'leri + `td-walk-smoke.py` + `td-quest-smoke.py`
   (mevcut 797 testin hiçbiri kırılmayacak) + yeni `td-loot-test.ts`
6. Deploy: `deploy-mainnet.sh` blue-green

## Değişmeyecekler (regresyon çapaları)
- `frostbite_save` şeması (`v` 1) · `frostbite_td_save` izolasyonu
- Harita imzası `3830429448` · mevcut prop koordinatları
- `skills.ts` / `elements.ts` / `lootTables.ts` API'leri (TdBattleScene paylaşıyor)
- `SPACE` temel vuruş · `hubGames.ts`
