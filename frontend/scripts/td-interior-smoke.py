# frontend/scripts/td-interior-smoke.py — Faz 11 iç mekân headless smoke (dev server gerekli)
# Kullanım: npm run dev  →  python3 scripts/td-interior-smoke.py
# Emsal: td-economy-smoke.py (tohum + gerçek tıklama), td-quest-smoke.py (panel formülü).
#
# `td-interior-test.ts` SAF veriyi kanıtlar (oda flood-fill, applySleep, loreKey'ler);
# burası SAHNEYİ kanıtlar: kapı hint'i → E ile giriş → sahne aktif + GÖRÜNÜR (render
# order çapası — boss-donma dersi) + opak bg (dünya sızmıyor) → hancı paneli GERÇEK
# TIKLAMAYLA uyku (altın/HP/enerji/saat) → yetersiz altın reddi → arşivde kitap okuma
# (flag + ikon soluklaşması) → çıkışta dünya resume → reload kalıcılığı → konsol temiz.
import json, os, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('TD_URL', 'http://localhost:3000/avalanche/tddev')
SHOT = os.environ.get('TD_SHOT_DIR', '/tmp')
fails = []
def check(name, cond, note=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{note}]' if note else ''))
    if not cond: fails.append(name)

W = "() => { const s = window.__tdGame.scene.keys.TdWorld; return %s; }"
I = "() => { const i = window.__tdGame.scene.keys.TdInterior; return %s; }"
INN_DOOR = (173, 191)      # abs kapı önü (worldProps TD_HOUSES inn rel(-19,-2))
ARCHIVE_DOOR = (210, 191)  # archive rel(18,-2)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--enable-gpu', '--use-angle=metal'])
    ctx = b.new_context(viewport={'width': 1200, 'height': 800})
    # Tohum: yetersiz altın senaryosuyla BAŞLA (3g < 5g) — sonra 60g'a geçilir.
    # try/catch: init script HER belgede koşar (reload ara-belgeleri dahil) — erişilemeyen
    # belgede localStorage throw eder ve konsol-temizliği çapasını flake'ler.
    ctx.add_init_script(
        "try { if (!localStorage.getItem('frostbite_save')) "
        "localStorage.setItem('frostbite_save', JSON.stringify({ v: 1, gold: 3, hp: 40, maxHp: 120 })) } catch {}")
    pg = ctx.new_page()
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(URL, wait_until='domcontentloaded')
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(2.5)

    ev  = lambda expr: pg.evaluate(W % expr)
    evi = lambda expr: pg.evaluate(I % expr)
    save = lambda: pg.evaluate("() => JSON.parse(localStorage.getItem('frostbite_save') || '{}')")
    tdsave = lambda: pg.evaluate("() => JSON.parse(localStorage.getItem('frostbite_td_save') || '{}')")
    k = ev("(s.cameras.main.zoom)")
    cw, ch = pg.evaluate("() => [window.__tdGame.scale.width, window.__tdGame.scale.height]")

    def goto_door(txy):
        pg.evaluate(W % f"((s.heroPos.x = {txy[0]}*16+8, s.heroPos.y = {txy[1]}*16+8, 0))")
        time.sleep(0.6)

    def enter():
        pg.keyboard.press('e')
        pg.wait_for_function("() => window.__tdGame.scene.keys.TdInterior.scene.isActive()", timeout=8000)
        time.sleep(1.2)   # timeIn ≥1 (pad çıkış guard'ı) + render otursun

    def panel_texts():
        return evi("""(i.panelC ? i.panelC.list.filter(o => o.type === 'Text')
            .map(t => ({ t: t.text, hit: !!t.input, vis: t.visible,
                         cx: t.x + t.displayWidth * (0.5 - t.originX),
                         cy: t.y + t.displayHeight * (0.5 - t.originY) })) : null)""")

    def click_btn(label):
        for t in (panel_texts() or []):
            if t['t'] == label and t['hit']:
                pg.mouse.click(cw / 2 + t['cx'] * k, ch / 2 + t['cy'] * k)
                time.sleep(0.4)
                return True
        return False

    # ── (1) kapı hint'i + giriş + görünürlük ──
    ev("((s.tdState.dayTime = 504, s.tdState.energy = 123, 0))")   # gece + düşük enerji
    goto_door(INN_DOOR)
    hint = ev("(s.hintText.visible ? s.hintText.text : '')")
    check('inn-door-hint', hint == 'E — enter The Frosted Hearth', hint)
    enter()
    check('interior-active', True)
    scenes = pg.evaluate("""() => window.__tdGame.scene.getScenes(true).map(s => s.scene.key)""")
    order = pg.evaluate("""() => { const m = window.__tdGame.scene;
        return { int: m.getIndex('TdInterior'), world: m.getIndex('TdWorld') }; }""")
    # boss-donma dersi: 'aktif ≠ görünür' — interior dünyanın ÜSTÜNDE render olmalı
    check('interior-renders-above-world', order['int'] > order['world'], json.dumps(order))
    check('interior-opaque-bg', evi("(i.cameras.main.backgroundColor.alpha)") == 255)
    check('world-paused', ev("(s.scene.isPaused())"))
    check('title-shown', evi("(i.titleText.text)") == 'The Frosted Hearth')

    # ── (2) hancı: hint + panel + gece selamı ──
    evi("((i.heroPos.x = 3*16+8, i.heroPos.y = 3*16+8, 0))")   # counter önü (NPC ≤24px)
    time.sleep(0.4)
    check('npc-talk-hint', evi("(i.hintText.text)") == '[E] talk to Keeper Sela')
    pg.keyboard.press('e'); time.sleep(0.5)
    txts = [t['t'] for t in (panel_texts() or [])]
    print('panel', json.dumps(txts, ensure_ascii=False))
    check('inn-panel-opens', 'Keeper Sela' in txts and any('SLEEP' in t for t in txts))
    check('night-greeting', any('asleep' in t for t in txts))
    pg.screenshot(path=f'{SHOT}/td-int-smoke-panel.png')

    # ── (3) yetersiz altın (3g < 5g): kızıl satır + SIFIR yazma ──
    check('sleep-click-poor', click_btn('[ SLEEP — 5g ]'))
    err_vis = next((t['vis'] for t in (panel_texts() or []) if t['t'] == 'Not enough coin.'), None)
    check('poor-red-line', err_vis is True)
    st = save()
    check('poor-no-writes', st.get('gold') == 3 and st.get('hp') == 40,
          f"gold={st.get('gold')} hp={st.get('hp')}")
    # dayTime 504'te set edildi ama kapıya yürürken dünya ~1sn tick işledi (zaman ancak
    # pause'la donar) → tam eşitlik değil dar aralık: uyku olsaydı 158.4'e sıçrardı.
    dt_now = ev("(s.tdState.dayTime)")
    check('poor-time-not-jumped', 504 <= dt_now < 512, f"dayTime={dt_now}")

    # ── (4) 60g ile tam akış: tohumla + reload + uyu ──
    pg.evaluate("() => localStorage.setItem('frostbite_save', JSON.stringify({ v: 1, gold: 60, hp: 40, maxHp: 120 }))")
    pg.reload(wait_until='domcontentloaded')
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(2.5)
    ev("((s.tdState.dayTime = 504, s.tdState.energy = 123, 0))")
    goto_door(INN_DOOR); enter()
    evi("((i.heroPos.x = 3*16+8, i.heroPos.y = 3*16+8, 0))"); time.sleep(0.4)
    pg.keyboard.press('e'); time.sleep(0.5)
    check('sleep-click-rich', click_btn('[ SLEEP — 5g ]'))
    time.sleep(2.2)   # fade 600 + morning 250+650+300 + pay
    st, td = save(), tdsave()
    check('sleep-gold-sink', st.get('gold') == 55, f"gold={st.get('gold')}")
    check('sleep-full-hp', st.get('hp') == 120, f"hp={st.get('hp')}")
    check('sleep-full-energy', td.get('energy') == 1000, f"energy={td.get('energy')}")
    check('sleep-morning', abs(td.get('dayTime', 0) - 158.4) < 1, f"dayTime={td.get('dayTime')}")
    check('sleep-unlocks-input', evi("(!i.sleeping)"))
    # çık → dünya resume + saat sabah + gece perdesi iniyor
    pg.keyboard.press('Escape'); time.sleep(1.0)
    check('exit-resumes-world', ev("(!s.scene.isPaused())") and not pg.evaluate(
        "() => window.__tdGame.scene.keys.TdInterior.scene.isActive()"))
    check('world-clock-morning', ev("(s.clockText.text)").startswith('☀'), ev("(s.clockText.text)"))
    pg.screenshot(path=f'{SHOT}/td-int-smoke-morning.png')

    # ── (5) arşiv: kitap oku → flag + ikon soluk ──
    goto_door(ARCHIVE_DOOR); enter()
    check('archive-title', evi("(i.titleText.text)") == "Scribe's Archive")
    check('archive-6-books', evi("(i.bookIcons.length)") == 6)
    # lectern (2,4) kitabının yanına: spot üstü hücre solid olabilir → alt komşusuna
    evi("((i.heroPos.x = 3*16+8, i.heroPos.y = 6*16+8, 0))"); time.sleep(0.4)
    check('read-hint', evi("(i.hintText.text)") == '[E] read', evi("(i.hintText.text)"))
    pg.keyboard.press('e'); time.sleep(0.5)
    txts = [t['t'] for t in (panel_texts() or [])]
    print('book', json.dumps(txts, ensure_ascii=False)[:200])
    check('book-panel-title', 'On the Frost Dragon' in txts)
    check('book-panel-body', any('Frost Dragon' in t and len(t) > 60 for t in txts))
    pg.screenshot(path=f'{SHOT}/td-int-smoke-book.png')
    st = save()
    check('book-flag-saved', 'lore_read_lore_frost_dragon' in (st.get('flags') or []))
    dim = evi("(i.bookIcons.find(b => b.book.loreKey === 'lore_frost_dragon').icon.alpha)")
    check('book-icon-dimmed', abs(dim - 0.5) < 0.01, f"alpha={dim}")
    check('close-book', click_btn('[ CLOSE ]') and evi("(!i.panelC)"))
    pg.keyboard.press('Escape'); time.sleep(0.8)

    # ── (6) reload kalıcılığı ──
    pg.reload(wait_until='domcontentloaded')
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(2.5)
    st = save()
    check('reload-gold', st.get('gold') == 55, f"gold={st.get('gold')}")
    check('reload-lore-flag', 'lore_read_lore_frost_dragon' in (st.get('flags') or []))
    goto_door(ARCHIVE_DOOR); enter()
    dim = evi("(i.bookIcons.find(b => b.book.loreKey === 'lore_frost_dragon').icon.alpha)")
    check('reload-icon-still-dim', abs(dim - 0.5) < 0.01, f"alpha={dim}")

    hard = [e for e in errors if 'favicon' not in e and 'Download the React DevTools' not in e
            and 'NETWORK_CHANGED' not in e]
    print('console errors:', json.dumps(hard[:5], ensure_ascii=False))
    check('no-console-errors', not hard)
    b.close()

print(('OK' if not fails else 'FAILED: ' + ','.join(fails)))
sys.exit(1 if fails else 0)
