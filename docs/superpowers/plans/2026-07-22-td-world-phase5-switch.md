# TD World Faz 5 — Entegrasyon + Atomik Geçiş Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox'lı görevler.

**Goal:** TD'yi production-hazır yap (gerçek hub overlay, mobil kontroller, MP presence, canlı save entegrasyonu) ve `/world`'ü tek commit'le TD'ye geçir. İzo silme geçişten +1 hafta.

**Geçiş noktası keşfi:** `/world` = `WorldLoginGate.tsx:279 <PhaserGame />` → swap = `TdPhaserGame` import'u. sceneLoader'a dokunmak GEREKMİYOR.

**Save kararı (spec §6.2'den bilinçli sapma):** Çift-yazar race'inden kaçınmak için tdState LIVE modda da `frostbite_td_save` anahtarında KALIR; `migrateV1` canlı v1 kaydından yalnız OKUR (worldPos başlangıcı türetir), `frostbite_save`'e YAZMAZ. Savaş progression'ı sandbox:false ile PlayerState üzerinden (izo ile birebir davranış). Tek-şema birleşimi izo silindikten sonraki temizlik fazına.

**GO KAPISI:** Task 4 (swap+deploy) KULLANICI ONAYI olmadan çalıştırılmaz.

---

### Task 1: TdPhaserGame komponenti — live/preview modlu tek mount

**Files:** Create `frontend/lib/game/td/TdPhaserGame.tsx`; Modify `frontend/app/worldtestnet/page.tsx` (yeni komponenti kullan, incelt), `TdWorldScene.ts` + `TdBattleScene.ts`/`TdDungeonScene.ts` (mode registry data), `tdState.ts` (başlangıç worldPos: live modda migrateV1-türevi okuma)

- [ ] `TdPhaserGame({ mode: 'preview' | 'live' })`: worldtestnet page'in oyun-mount + toast mantığının komponentleşmişi. Farklar: mode scene registry data ile sahnelere geçer (`this.scene.start('TdWorld', {mode})` yerine Phaser config data — pratikte `game.registry.set('tdMode', mode)`; sahneler registry'den okur).
- [ ] LIVE mod: (a) TdWorldScene startBattle → `sandbox: mode!=='live'`; (b) create()'te canlı v1 kaydı varsa (`localStorage.frostbite_save`) `migrateV1(JSON.parse(...))` ÇAĞIR (yazMAdan) → dönen `worldPos`'u kahraman başlangıcı yap (tdState'te kayıtlı TD pozisyonu öncelikli; yoksa migrate worldPos; o da yoksa TOWN_SPAWN). tdState'e `worldPos` alanı + save/load ekle (hareket sonrası 5sn biriktiriciyle kaydet — enerji saveT'siyle paylaş).
- [ ] LIVE mod hub overlay: 'td-hub-open' → toast DEĞİL, gerçek same-origin iframe overlay. İzo mekanizmasını oku (`components/game/GameOverlay.tsx` + IsoBaseScene 'hub_' akışı) ve aynı overlay komponentini/pattern'ini TdPhaserGame'de kullan (url `?embed=1`, XFO SAMEORIGIN korunur, kapatınca oyuna dönüş + input focus). PREVIEW mod: mevcut toast davranışı kalır.
- [ ] Mobil kontroller (her iki mod): dokunmatik cihazda (pointer coarse) sol-alt sanal joystick (IsoBaseScene'deki izo joystick'ine bak, TD'ye sade uyarla: 8-yön → dx/dy) + sağ-alt E ve SPACE butonları (DOM butonları — TdPhaserGame içinde; sahneye `window` CustomEvent'leriyle değil, registry üzerinden basit input state objesiyle ilet: `game.registry.set('tdTouch', {dx,dy,e:false,space:false})`, sahne update'te okur-birleştirir).
- [ ] worldtestnet page → `<TdPhaserGame mode="preview" />` + monsters-grid dalı korunur. Typecheck+build+tüm testler+imza. Commit.

### Task 2: MP presence (minimal, graceful)

**Files:** Modify `TdWorldScene.ts`; oku: `lib/game/multiplayer/socket.ts`, `RemotePlayer.ts`
- [ ] LIVE modda: socket bağlıysa pozisyon yayını (mevcut socket API'sinin izo'daki kullanım sözleşmesiyle — event adları/format birebir; zone alanı `'td'` sabit) + gelen uzak oyuncuları chibi (DEFAULT_PALETTE varyant tint) olarak render (basit lerp, depth(x,y), isim etiketi). Socket YOKSA/hata → sessizce devre dışı (oyun etkilenmez). PREVIEW modda kapalı.
- [ ] Doğrulama: typecheck+build; MP server'a karşı canlı test Task 4 sonrası manuel. Commit.

### Task 3: Test paritesi + tam batarya

- [ ] Mevcut world-smoke + hub-embed test scriptlerini bul (`scripts/` — world/hub isimli), TD karşılıklarını yaz/uyarla: `td-world-smoke` (rota 200 + canvas + __tdGame yok prod... smoke mevcut td-walk-smoke yeterli — world-smoke'un kontrol ettiklerini TD'ye map'le) + `hub-embed` 18 testi TD hub overlay'ine koşacak şekilde parametrize (embed=1 sayfaları değişmiyor — sadece açan taraf değişti; mevcut script muhtemelen aynen geçer: KOŞ ve raporla). Tam batarya: 9 td script + hub + izo-dokunulmazlık. Commit (varsa script değişiklikleri).

### Task 4: 🔴 SWAP (kullanıcı GO onayıyla) + deploy

- [ ] `WorldLoginGate.tsx`: `PhaserGame` → `TdPhaserGame mode="live"` (dynamic import). `/worldtestnet` page: yönlendirme `redirect('/world')` (rota bir süre kalsın, link kırılmasın).
- [ ] Build → **build-önce-rsync** → pm2 → canlı doğrulama: /world TD açılıyor (Privy gate korunmuş), savaş+zindan+cozy+hub overlay çalışıyor, /avalanche ana sayfa sağlam. Rollback planı: tek `git revert` + redeploy (~3dk).
- [ ] Push + memory + izo-silme hatırlatması (+1 hafta, ayrı görev olarak kaydet).

## Notlar
- Arcade kartı "Avalanche World — isometric RPG" metni geçişte güncellenmeli (Task 4'e dahil: 'top-down' ifadesi).
- Teaser kartı ("beneath the snow") geçişten sonra kaldırılabilir/CTA'ya dönüştürülebilir — kullanıcı kararına bırakılacak not.
