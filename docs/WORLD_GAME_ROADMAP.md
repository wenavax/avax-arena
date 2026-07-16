# Frostbite World — Gelistirme Yol Haritasi
> Tarih: 2026-04-07 | Platform: Avalanche C-Chain | Engine: Phaser 3

---

## MEVCUT DURUM

### Calisan Ozellikler
- 3 alan: Town (40x30), Forest (40x40), Dungeon (20x20)
- Turn-based 1v1 savas (Attack, Defend, Skill, Potion)
- 8 canavar tipi + Frost Dragon boss
- 2 NPC (Elder Frost, Merchant Bjorn)
- 2 quest zinciri (skeleton_hunt → dungeon_boss)
- Dukkan (2 potion, 2 silah, 2 zirh)
- Envanter (12 slot, 2 ekipman slotu)
- NFT wallet baglantisi + on-chain warrior yuklemesi
- HUD (HP/XP/Gold/Quest tracker)
- 15 SFX dosyasi
- Fullscreen destegi

### Kritik Eksikler
- Save/Load yok (sayfa yenilenince ilerleme kayip)
- Element sistemi savasta kullanilmiyor
- Guest modda sinif secimi yok
- Tek skill (Power Strike), sinif farki yok
- Canavar loot drop yok
- SPD stat'i hic kullanilmiyor
- Yurume animasyonu yok
- Mobil touch kontrol yok
- 2 quest ile oyun 15-20 dk'da bitiyor
- Dusman AI tek boyutlu (hepsi sadece attack)

---

## FAZ 1: TEMEL DUZELTMELER
> Hedef: Oyunu "tamamlanmis" hissettir
> Tahmini sure: 1-2 gun

### 1.1 Save/Load Sistemi
**Dosya**: `PlayerState.ts`
**Yapilacak**:
- `saveToLocal()` — PlayerState'i localStorage'a JSON olarak kaydet
- `loadFromLocal()` — Sayfa acilisinda otomatik yukle
- Auto-save: Her alan degisiminde, her savas sonrasinda, her dukkan isleminde
- Save slot: wallet address bazli (NFT oyuncu) + "guest" (misafir)
- Save gostergesi: HUD'da kucuk "saved" flash'i

**Kaydedilecek veriler**:
```
level, xp, hp, maxHp, atk, def, spd, gold
playerClass, name
inventory[], equipment (weapon + armor)
quests[], killCounts, flags
lastZone, spawnX, spawnY
nftTokenId (bagli warrior)
```

**Dikkat**: Quest state + flags dogru serilenestirilmeli (Set → Array → Set)

---

### 1.2 Element Avantaj Sistemi
**Dosya**: `BattleScene.ts`, yeni `elements.ts`
**Yapilacak**:
- 8 element: Fire, Water, Wind, Ice, Earth, Thunder, Shadow, Light
- Avantaj tablosu (Pokemon benzeri):
  ```
  Fire    > Ice, Wind    | Zayif: Water, Earth
  Water   > Fire, Earth  | Zayif: Thunder, Wind
  Wind    > Water, Earth | Zayif: Fire, Ice
  Ice     > Wind, Thunder| Zayif: Fire, Light
  Earth   > Thunder, Fire| Zayif: Water, Wind
  Thunder > Water, Ice   | Zayif: Earth, Shadow
  Shadow  > Light, Thunder| Zayif: Ice, Earth
  Light   > Shadow, Ice  | Zayif: Thunder, Wind
  ```
- Avantajli: 1.5x hasar
- Dezavantajli: 0.67x hasar
- Notral: 1.0x
- Savas ekraninda element gostergesi (ikon + renk)
- Hasar mesajinda "Super effective!" / "Not very effective..." yazisi

**NFT entegrasyonu**: Warrior NFT'nin element'i otomatik kullanilir
**Guest mod**: Sinif seciminde element de sec

---

### 1.3 SPD Stat Aktif Et
**Dosya**: `BattleScene.ts`
**Yapilacak**:
- Turn sirasi: Yuksek SPD olan once vurur
- Kritik vurus: base %10 + (SPD farki * %2), max %30. Crit = 1.75x hasar
- Kacirma/dodge: (SPD farki * %3), max %20. Miss = 0 hasar
- SPD >= 2x rakip: %15 sans ekstra tur (double strike)
- Savas logunda "Critical Hit!", "Missed!", "Double Strike!" mesajlari

---

### 1.4 Monster Loot Drop
**Dosya**: `BattleScene.ts`, yeni `lootTables.ts`
**Yapilacak**:
- Her canavar tipinin loot tablosu:
  ```
  skeleton: %20 Bone Shard (malzeme), %10 Iron Sword, %5 Health Potion
  slime:    %25 Slime Gel (malzeme), %10 Antidote, %5 Speed Tonic
  spider:   %20 Spider Silk (malzeme), %10 Leather Armor, %5 Poison Vial
  ghost:    %15 Ectoplasm (malzeme), %10 Spirit Ring, %3 Mana Potion
  bat:      %20 Bat Wing (malzeme), %10 Cloak, %5 Health Potion
  demon:    %15 Demon Horn (malzeme), %8 Flame Sword, %3 Fire Shield
  ogre:     %15 Ogre Hide (malzeme), %8 Heavy Armor, %5 Strength Tonic
  dragon:   %100 Frost Key, %50 Dragon Scale, %25 Ice Blade, %10 Dragon Armor
  ```
- Rarity tint'leri: Common=beyaz, Uncommon=yesil, Rare=mavi, Epic=mor
- Drop animasyonu: Ekranda esya ikonu belirip inventory'ye ucar
- Envanter dolu ise: "Inventory full! Item lost." uyarisi

---

### 1.5 Sinif Secimi + Sinifa Ozel Skill'ler
**Dosya**: `CharacterSelectScene.ts`, `BattleScene.ts`, `PlayerState.ts`

**Guest mod sinif secimi**:
- 3 kart: Knight (mavi), Mage (mor), Archer (yesil)
- Her kartta: sprite + stat dagilimi + ozel skill onizleme
- Tikla → secili sinif ile basla

**Sinif stat farklari**:
```
Knight:  HP+20, ATK+3, DEF+5, SPD+1  | Element: Earth
Mage:    HP+5,  ATK+6, DEF+1, SPD+3  | Element: Fire
Archer:  HP+10, ATK+4, DEF+2, SPD+5  | Element: Wind
```

**Sinifa ozel 4 skill (Attack yerine)**:
```
Knight:
  1. Slash (1.0x ATK, free)
  2. Shield Bash (0.8x ATK + %30 stun, 5 MP)
  3. Power Strike (1.5x ATK, 8 MP)
  4. Fortify (+50% DEF 2 tur, 6 MP)

Mage:
  1. Staff Hit (0.6x ATK, free)
  2. Fireball (1.4x ATK fire dmg, 6 MP)
  3. Ice Shard (1.2x ATK + %25 slow, 5 MP)
  4. Arcane Barrier (absorb 30 dmg, 8 MP)

Archer:
  1. Quick Shot (0.9x ATK, free)
  2. Double Shot (0.7x ATK * 2 hit, 5 MP)
  3. Poison Arrow (0.8x ATK + 3 tur zehir, 6 MP)
  4. Evasion (+40% dodge 2 tur, 4 MP)
```

**MP sistemi**:
- Baslangic: 30 MP (Mage 50, Archer 40, Knight 30)
- Yenilenme: Her tur +3 MP
- Mana Potion: +20 MP (dukkan 20g)

---

## FAZ 2: ICERIK DERINLIGI
> Hedef: Oyunu "tekrar oynanabilir" yap
> Tahmini sure: 3-5 gun

### 2.1 Durum Etkileri (Status Effects)
**Dosya**: `BattleScene.ts`, yeni `statusEffects.ts`

| Etki | Sure | Hasar/Efekt | Kaynak |
|------|------|-------------|--------|
| Yanik (Burn) | 3 tur | Max HP'nin %8'i/tur | Fire skill, Demon |
| Donma (Freeze) | 1 tur | Tur atlama (%30 sans) | Ice skill, Boss |
| Zehir (Poison) | 5 tur | Max HP'nin %5'i/tur | Poison Arrow, Spider |
| Stun | 1 tur | Tur atlama (%100) | Shield Bash |
| Slow | 2 tur | SPD %50 azalma | Ice Shard |
| Bleed | 3 tur | Max HP'nin %6'si/tur | kritik vurus |

- HUD'da status ikon gostergesi (HP barin altinda)
- Dusman da status etkileyebilir (Spider = zehir, Ghost = slow, Dragon = donma)

---

### 2.2 Dusman AI Cesitliligi
**Dosya**: `BattleScene.ts`, yeni `enemyAI.ts`

| Canavar | AI Davranisi |
|---------|-------------|
| Skeleton | Basit attack. HP < %30 → %40 sans kacinma |
| Slime | Her 3. turda kendini iyilestir (%15 HP) |
| Bat | %20 dodge sansi (yuksek SPD). Hep attack |
| Spider | 1. turda Poison Bite (%100 zehir), sonra attack |
| Ghost | %30 dodge (incorporeal). Her 4. turda Curse (slow) |
| Demon | Fireball (1.5x, burn) her 3. turda. Geri kalan attack |
| Ogre | Power Slam (2x ATK ama sonraki tur skip). HP < %50 → Rage (+30% ATK) |
| Dragon | Frost Breath (1.8x + freeze) → 2x attack → Ice Storm (tum HP'nin %15) dongusal |

---

### 2.3 Yeni Questler (8 ek quest)
**Dosya**: `TownScene.ts`, `ForestScene.ts`, `DungeonScene.ts`

**Ana Hikaye Zinciri (Elder Frost)**:
```
Quest 1: Forest Threat — 5 iskelet oldur [MEVCUT]
Quest 2: The Frost Key — Boss'u yen [MEVCUT]
Quest 3: Spider Infestation — 8 spider oldur (Forest guney bolgesi)
Quest 4: Ghost Hunters — 5 ghost oldur (Dungeon)
Quest 5: Dragon's Revenge — Boss'u 2. kez yen (daha guclu versiyon, level 30)
Quest 6: The Ancient Artifact — Dungeon'da 2. gizli sandigi bul + Elder'a getir
```

**Merchant Bjorn Yan Questleri**:
```
Quest 7: Supply Run — 3 farkli malzeme topla (Bone Shard + Spider Silk + Bat Wing)
Quest 8: Market Research — Forest'teki 3 farkli bolgeyi ziyaret et (zon kontrolu)
```

**Gunluk Gorevler (repeatable)**:
```
Daily 1: "Canavar Avci" — 10 canavar oldur (herhangi tip) → 50 gold
Daily 2: "Hazine Avcisi" — 500 gold topla (herhangi kaynaktan) → Health Potion x2
Daily 3: "Kahraman" — 1 boss yen → 100 gold + rare loot sansi
```

**Odul yapisi**:
- Quest 3: +75 XP, +40 Gold, Spider Silk Armor (rare)
- Quest 4: +100 XP, +50 Gold, Ghost Cloak (rare, +dodge)
- Quest 5: +200 XP, +100 Gold, Frost Blade (epic)
- Quest 6: +150 XP, +75 Gold, Ancient Amulet (epic, +all stats)
- Quest 7: +50 XP, +30 Gold, Merchant's Discount (kalici %10 indirim)
- Quest 8: +40 XP, +20 Gold, Explorer's Map (mini-map unlock)

---

### 2.4 Ekipman Sistemi Genisletme
**Dosya**: `PlayerState.ts`, `InventoryScene.ts`, `ShopScene.ts`

**Mevcut**: 2 slot (weapon + armor)
**Yeni**: 4 slot (weapon + armor + accessory + ring)

**Ekipman listesi**:
```
SILAHLAR:
  Wooden Stick    — +2 ATK (baslangi)
  Iron Sword      — +5 ATK (dukkan 60g)
  Steel Sword     — +12 ATK (dukkan 150g)
  Flame Sword     — +15 ATK, Fire element (demon drop)
  Ice Blade       — +18 ATK, Ice element (dragon drop)
  Shadow Dagger   — +10 ATK +8 SPD (ghost drop, rare)

ZIRHLAR:
  Cloth Robe      — +2 DEF (baslangi)
  Iron Shield     — +4 DEF (dukkan 50g)
  Chain Armor     — +8 DEF (dukkan 120g)
  Spider Silk     — +10 DEF +5 SPD (spider drop)
  Dragon Scale    — +16 DEF (dragon drop)
  Heavy Plate     — +20 DEF -3 SPD (ogre drop, rare)

AKSESUARLAR:
  Explorer Map    — Mini-map aktif et (quest odulu)
  Ghost Cloak     — +15% dodge (ghost drop)
  Fire Amulet     — +10% fire dmg (demon drop)
  Merchant Badge  — %10 dukkan indirimi (quest odulu)

YUZUKLER:
  Ring of Vitality — +30 Max HP (dukkan 200g)
  Ring of Power    — +5 ATK (rare drop)
  Ring of Speed    — +5 SPD (bat drop, rare)
  Ancient Amulet   — +3 ATK +3 DEF +3 SPD (quest odulu)
```

---

### 2.5 Yurume Animasyonu
**Dosya**: `Player.ts`
**Yapilacak**:
- 2-frame bob animasyonu: Hareket ederken sprite'i her 150ms'de 1-2px yukari/asagi kaydir
- Facing gostergesi: Yukari/asagi bakarken farkli frame (veya scale tweeni)
- Durma: Sprite normal pozisyona don
- NPC'ler icin de: Idle bob zaten var, merchant icin saga/sola bakma ekle

---

## FAZ 3: YENI ALANLAR
> Hedef: Oyun dunya hissini buyut
> Tahmini sure: 3-4 gun

### 3.1 Buz Magarasi (Ice Cavern)
**Dosyalar**: Yeni `maps/iceCaveMap.ts`, yeni `scenes/IceCaveScene.ts`

**Boyut**: 30x30 tile
**Giris**: Dungeon'dan kuzey cikis (boss yenildikten sonra acilir)
**Zemin**: ninja-interior sag blok (gri-yesil taş) + buz tilelari
**Ozellikler**:
- Kaygan zemin: Buz uzerinde hareket %50 daha hizli ama durma 0.5sn gecikmeli
- Buz kristalleri (aydinlatma efekti, mavi glow)
- 2 oda + 1 boss odasi
- Yeni canavarlar: Ice Golem (level 15-20), Frost Sprite (level 12-16), Yeti (level 18-22)
- Boss: Crystal Wyrm (level 30, 500 HP, Freeze + Ice Storm)
- Gizli gecit: Duvar kirilabilir (belirli silahla)

### 3.2 Yanardagi (Volcano)
**Dosyalar**: Yeni `maps/volcanoMap.ts`, yeni `scenes/VolcanoScene.ts`

**Boyut**: 35x35 tile
**Giris**: Forest'ten guney cikis (Quest 5 tamamlandiktan sonra acilir)
**Zemin**: ninja-floor turuncu/kirmizi tileler (row 0, row 22 right)
**Ozellikler**:
- Lav havuzlari (hasar veren zemin: 5 HP/sn)
- Volkanik kaya platformlari (guvenli alanlar)
- 3 oda + 1 boss odasi
- Yeni canavarlar: Fire Elemental (level 20-25), Lava Slime (level 18-22), Magma Golem (level 22-28)
- Boss: Infernal Dragon (level 40, 800 HP, Burn + Magma Rain)
- Ozel mekanik: Bazi canavarlar sadece Water/Ice elementle etkili oldurulebilir

---

## FAZ 4: TUTMA & SOSYAL
> Hedef: Oyuncuyu geri getir
> Tahmini sure: 1-2 hafta

### 4.1 Basarim Sistemi
**Dosyalar**: Yeni `achievements.ts`, `HUDScene.ts` guncelleme

**50 basarim ornekleri**:
```
Savas:
  - First Blood: Ilk canavari oldur
  - Monster Slayer: 100 canavar oldur
  - Dragon Slayer: Frost Dragon'i yen
  - Elemental Master: Her element ile 10 savas kazan
  - Untouchable: Hasar almadan savas kazan
  - Crit King: 10 kritik vurus yap

Kesif:
  - Explorer: Tum alanlari ziyaret et
  - Treasure Hunter: Tum sandiklari ac
  - Cartographer: Mini-map'i aktif et
  - Secret Finder: Gizli gecidi bul

Ekonomi:
  - First Purchase: Dukkan'dan ilk alisveris
  - Rich: 1000 gold biriktir
  - Collector: 10 farkli esya topla
  - Full Set: 4 ekipman slotunu doldur

Ilerleme:
  - Level 10, Level 20, Level 30, Level 50
  - Quest Master: Tum questleri tamamla
  - Daily Warrior: 7 gun ust uste gunluk gorev yap
```

**Odul**: Her basarim icin XP + Gold + bazen ozel esya/title

---

### 4.2 Mobil Touch Kontroller
**Dosya**: `Player.ts`, `PhaserGame.tsx`, `BattleScene.ts`
**Yapilacak**:
- Sol taraf: Sanal joystick (Phaser plugin veya custom)
- Sag taraf: A butonu (interact/attack), B butonu (cancel/menu)
- Savas ekrani: 4 skill butonu buyuk tile olarak (thumb-friendly, min 48x48px)
- Envanter/dukkan: Scroll + tap
- Otomatik algilama: Touch cihaz → joystick goster, masaustu → gizle

---

### 4.3 Gunluk Gorev Sistemi
**Dosya**: Yeni `dailyQuests.ts`, `HUDScene.ts`, `PlayerState.ts`
**Yapilacak**:
- 3 gunluk gorev havuzu (10+ gorevden rastgele 3 sec)
- Sifirlama: UTC 00:00'da
- Hepsini tamamlama bonusu: Bonus sandik (rare esya sansi)
- Streak: 7 gun ust uste → haftalik bonus (epic esya)
- HUD'da gunluk gorev ikonu (kirmizi nokta bildirim)
- localStorage'da gun bazli takip

---

### 4.4 Ambient Ses ve Muzik
**Dosya**: `BootScene.ts` (asset yukleme), tum scene'ler
**Yapilacak**:
- Town: Huzurlu koy muzigi (loop)
- Forest: Ruzgar + kus sesleri + gizemli melodi
- Dungeon: Karanlik ambient + su damlasi + uzak gurultu
- Ice Cavern: Eko'lu ruzgar + buz kirilma
- Volcano: Lav fokurtisu + ates parcikma
- Battle: Gerilimli savas muzigi
- Boss: Epik boss muzigi (farkli)
- Ses kontrol: Muzik acik/kapali + ses seviyesi (HUD'da ikon)

---

## FAZ 5: ON-CHAIN ENTEGRASYON
> Hedef: Blockchain ile oyun birlessin
> Tahmini sure: 1 hafta

### 5.1 On-chain Game Save
- PlayerProgress kontrati deploy (struct bazli, tek SSTORE)
- Save butonu: "Save to Chain" (gas ucreti ~0.001 AVAX)
- Load: Wallet baglaninca otomatik on-chain'den yukle
- Fallback: localStorage hala calisir (on-chain opsiyonel)

### 5.2 NFT Warrior Stat Senkronizasyonu
- World oyununda kazanilan XP → ArenaWarrior.recordBattle() ile on-chain level up
- Boss kill → on-chain quest completion (QuestEngine)
- Loot drop → on-chain equipment mint (gelecek ERC-1155)

### 5.3 Leaderboard Entegrasyonu
- World oyunu kill count → Leaderboard.updateScore()
- Haftalik FSB dagitimi icin World skor katkilari

---

## TEKNIK NOTLAR

### Paylasilan Kod Refactor
- `to2D()` → `lib/game/utils.ts`'ye tasi (3 scene'de tekrar)
- `seededRandom()` → `lib/game/utils.ts`'ye tasi (3 map'te tekrar)
- MapObject / ForestObject / DungeonObject → tek `MapObject` interface
- sprites.ts'i aktif kullan (su an raw tileIndex() kullaniliyor)

### Performans
- HUD `update()` → event-driven'a cevir (her frame refresh gereksiz)
- Monster pool: Destroy yerine recycle
- Asset lazy-load: Alan girisinde yukle, cikista temizle
- Sprite atlas: Tum Kenney tile'lari tek atlas

### Debug Degerler Temizle
- PlayerState baslangic gold: 9999 → 50
- ninja-village.png yukleniyor ama kullanilmiyor → kaldir veya kullan

---

## ZAMAN CIZELGESI

```
Hafta 1 (Faz 1): Temel Duzeltmeler
├── Gun 1: Save/Load + Element avantaji
├── Gun 2: SPD aktif + Kritik/Dodge + Loot drop
└── Gun 3: Sinif secimi + 4 skill + MP sistemi

Hafta 2 (Faz 2): Icerik
├── Gun 4: Status efektleri + Dusman AI
├── Gun 5: 8 yeni quest
├── Gun 6: Ekipman genisletme + yurume animasyonu
└── Gun 7: Test + bug fix + balans ayari

Hafta 3 (Faz 3): Yeni Alanlar
├── Gun 8-9: Buz Magarasi (harita + scene + canavarlar + boss)
└── Gun 10-11: Yanardagi (harita + scene + canavarlar + boss)

Hafta 4 (Faz 4): Tutma & Sosyal
├── Gun 12: Basarim sistemi
├── Gun 13: Mobil touch kontroller
├── Gun 14: Gunluk gorevler + streak
└── Gun 15: Ambient ses/muzik

Hafta 5 (Faz 5): On-chain
├── Gun 16: PlayerProgress kontrati + deploy
├── Gun 17: NFT senkronizasyon + leaderboard
└── Gun 18: Test + launch
```

---

## BASARI METRIKLERI

| Metrik | Simdi | Faz 1 Sonrasi | Faz 5 Sonrasi |
|--------|-------|---------------|---------------|
| Oyun suresi | 15-20 dk | 1-2 saat | 5+ saat |
| Quest sayisi | 2 | 10 | 10 + gunluk |
| Alan sayisi | 3 | 3 | 5 |
| Canavar tipi | 8 | 8 | 14 |
| Boss sayisi | 1 | 1 | 3 |
| Ekipman cesidi | 6 | 20+ | 30+ |
| Skill sayisi | 1 | 12 (4x3 sinif) | 12+ |
| Kayit | Yok | localStorage | On-chain |
| Mobil | Oynanamaz | Oynanamaz | Oynanabilir |
| Tekrar oynanabilirlik | Yok | Orta | Yuksek |
