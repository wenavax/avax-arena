# frontend/scripts/td-daynight-smoke.py — Faz 9B headless smoke (dev server gerekli)
# Kullanım: npm run dev  →  python3 scripts/td-daynight-smoke.py
#
# `td-daynight-test.ts` / `td-weather-test.ts` SAF modülleri kanıtlar (darkness eğrisi,
# stepParticle sarmalaması). Bu script onların SAHNEDE gerçekten bağlandığını gösterir:
# perde kararıyor mu, parçacıklar hareket ediyor mu, NPC soluyor mu, saat işliyor mu,
# ziyaret kayda geçiyor mu, `?weather=0` gerçekten kapatıyor mu.
import os, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TD_URL', 'http://localhost:3000/avalanche/tddev')
fails = []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  {extra}' if extra else ''))
    if not cond: fails.append(name)

S = "() => { const s = window.__tdGame.scene.keys.TdWorld; return %s; }"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--enable-gpu', '--use-angle=metal'])
    pg = b.new_page(viewport={'width': 1200, 'height': 800})
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(BASE, wait_until='domcontentloaded')
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(3)

    def ev(expr): return pg.evaluate(S % expr)
    def setday(sec):
        pg.evaluate(S % f"(s.tdState.dayTime = {sec}, 0)")
        time.sleep(2.2)  # perde %8 lerp + NPC alpha kenar tetiklemesi otursun

    # ── 1. GÜNDÜZ temel çizgisi ──────────────────────────────────────────────
    setday(158)  # DEFAULT_DAY_TIME ≈ u 0.22 → tam gündüz
    day = ev("({clock: s.clockText.text, night: s.nightCache, alpha: s.nightRect.fillAlpha, "
             "npcA: [...s.npcImgs.values()].map(i=>i.alpha)})")
    check('gündüz: HUD saati ☀', day['clock'].startswith('☀'), day['clock'])
    check('gündüz: perde şeffaf', day['alpha'] < 0.02, f"alpha={day['alpha']:.4f}")
    check('gündüz: gece bayrağı kapalı', day['night'] is False)
    check('gündüz: NPC tam opak', len(day['npcA']) > 0 and all(a > 0.99 for a in day['npcA']),
          f"{len(day['npcA'])} npc")

    # ── 2. GECE ──────────────────────────────────────────────────────────────
    setday(504)  # u = 0.70 → tam gece (darkness 1)
    nt = ev("({clock: s.clockText.text, night: s.nightCache, alpha: s.nightRect.fillAlpha, "
            "color: s.nightRect.fillColor, npcA: [...s.npcImgs.values()].map(i=>i.alpha)})")
    check('gece: HUD saati 🌙', nt['clock'].startswith('🌙'), nt['clock'])
    check('gece: perde karardı (→0.38)', nt['alpha'] > 0.30, f"alpha={nt['alpha']:.4f}")
    check('gece: perde rengi lacivert', nt['color'] == 0x0a1030, hex(nt['color']))
    check('gece: NPC soluk (0.42)', len(nt['npcA']) > 0 and all(abs(a - 0.42) < 1e-6 for a in nt['npcA']),
          str(nt['npcA'][:3]))
    check('gece: perde gündüzden KOYU', nt['alpha'] > day['alpha'] + 0.25)

    # ── 3. Gece diyaloğu: 9B.3'ün SÖZLEŞMESİ görev akışının değişmemesi ──────
    # ⚠️ Gece SELAMI burada doğrulanamaz: selam dalı yalnız NPC'nin görevi
    # done/locked iken çizilir, önizleme modunda (`/tddev`) `frostbite_save` HİÇ
    # yazılmaz → taze durumda 8 NPC'nin 8'i de görev sunar. `greetingFor` saf
    # fonksiyonu birim testlerde kapsanıyor; buradaki çapa asıl riski kovalıyor:
    # gece metninin görev dalına SIZMAMASI (teslim kilitlenirse oyuncu mahsur kalır).
    PANEL = "s.questPanel.list.filter(o=>o.text!==undefined).map(o=>o.text).join(' | ')"
    setday(504)
    pg.evaluate(S % "(s.openDialog('elder'), 0)"); time.sleep(0.6)
    q_night = ev(PANEL)
    check('gece: görev dalı açık (ACCEPT var)', 'ACCEPT' in q_night, q_night[:80])
    check('gece: selam metni görev dalına sızmıyor', 'cold nights' not in q_night)
    setday(158)
    pg.evaluate(S % "(s.openDialog('elder'), 0)"); time.sleep(0.6)
    q_day = ev(PANEL)
    check('görev dalı gece/gündüz BİREBİR aynı', q_day == q_night, 'metin eşit')
    pg.evaluate(S % "(s.closeQuestPanel(), 0)"); time.sleep(0.3)

    # ── 4. Hava parçacıkları (kasaba = snow) ─────────────────────────────────
    w0 = ev("({kind: s.weatherKind, vis: s.weatherObjs.filter(o=>o.visible).length, "
            "pos: s.weatherObjs.slice(0,5).map(o=>[o.x,o.y])})")
    time.sleep(0.8)
    w1 = ev("({pos: s.weatherObjs.slice(0,5).map(o=>[o.x,o.y])})")
    check('hava: kasabada kar', w0['kind'] == 'snow', w0['kind'])
    check('hava: parçacıklar görünür', w0['vis'] == 60, f"görünür={w0['vis']} (snow.count=60)")
    moved = sum(1 for a, bb in zip(w0['pos'], w1['pos']) if a != bb)
    check('hava: parçacıklar HAREKET ediyor', moved >= 4, f"{moved}/5 taşındı")
    inside = ev("s.weatherObjs.filter(o=>o.visible).every(o => o.x>=s.hudX0-8 && o.x<=s.hudX0+s.hudW+8 "
                "&& o.y>=s.hudY0-8 && o.y<=s.hudY0+s.hudH+8)")
    check('hava: parçacıklar ekran içinde sarmalanıyor', inside)
    check('hava: havuz MAX_PARTICLES=80 sabit', ev("s.weatherObjs.length") == 80,
          str(ev("s.weatherObjs.length")))

    # ── 5. Bölge ziyareti → visitedZones ─────────────────────────────────────
    vz = ev("[...s.tdState.visitedZones]")
    check('ziyaret: kasaba kaydedildi', 'Town' in vz, str(vz))
    # uzak bölgeye ışınlan (volcano bölgesi) → yeni zone eklenmeli
    pg.evaluate(S % "(s.heroPos.x = 62*16*4, s.heroPos.y = 20*16*4, 0)")
    time.sleep(2.0)
    vz2 = ev("({zones: [...s.tdState.visitedZones], region: s.lastRegionKey, kind: s.weatherKind})")
    check('ziyaret: yeni bölge eklendi', len(vz2['zones']) > len(vz), str(vz2['zones']))
    check('ziyaret: kanonik BÜYÜK harfli ad', all(z[0].isupper() for z in vz2['zones']), str(vz2['zones']))
    check('hava: bölge değişince kip güncellendi',
          vz2['kind'] == pg.evaluate(S % "s.weatherKind"), f"region={vz2['region']} kind={vz2['kind']}")

    # ── 6. Kalıcılık: reload sonrası dayTime + visitedZones geri gelmeli ─────
    pg.evaluate(S % "(s.tdState.dayTime = 400, s.tdState.save(), 0)")
    time.sleep(0.4)
    pg.reload(wait_until='domcontentloaded')
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(3)
    after = ev("({t: s.tdState.dayTime, zones: [...s.tdState.visitedZones]})")
    check('kalıcılık: dayTime kayıttan geldi', 395 < after['t'] < 460, f"t={after['t']:.1f}")
    check('kalıcılık: visitedZones kayıttan geldi', len(after['zones']) >= 2, str(after['zones']))

    # ── 7. ?weather=0 kapatma bayrağı ────────────────────────────────────────
    pg.goto(BASE + '?weather=0', wait_until='domcontentloaded')
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(3)
    off = ev("({on: s.weatherOn, kind: s.weatherKind, vis: s.weatherObjs.filter(o=>o.visible).length})")
    check('?weather=0: hava kapalı', off['on'] is False and off['kind'] == 'none' and off['vis'] == 0, str(off))

    real = [e for e in errs if 'Download the React DevTools' not in e]
    check('konsol hatası yok', len(real) == 0, str(real[:3]))
    b.close()

print('\n' + ('OK — 9B runtime doğrulandı' if not fails else f'{len(fails)} FAIL: {fails}'))
raise SystemExit(1 if fails else 0)
