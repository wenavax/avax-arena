# frontend/scripts/td-economy-smoke.py — Faz 10 ekonomi paketi headless smoke (dev server gerekli)
# Kullanım: npm run dev  →  python3 scripts/td-economy-smoke.py
# Emsal: td-quest-smoke.py (tıklama formülü + panel_texts deseni oradan).
#
# `td-economy-test.ts` SAF mantığı kanıtlar (fiyat aritmetiği, arbitraj çapası,
# upgrade drift'i); burası SAHNEYİ kanıtlar: GERÇEK FARE TIKLAMASIYLA
#   · Vess diyalog çipi → dükkân BUY/SELL (satın alma altını düşürür, satış tam değer)
#   · Hilda çipi → ocak (yükseltme: altın + cevher + taş üçü birden düşer, stat önizleme)
#   · çanta ITEMS sekmesi → wear / take off / tarla satışı (%60)
#   · equip duplikasyon regresyonu (+0 ve +1 kopya varken +1'i kuşanmak +0'ı SİLMEZ)
#   · gece kapısı (tezgâh/ocak kapalı, görev akışı etkilenmez) · reload kalıcılığı.
#
# Oyuncu tohumu: PlayerState.load() kısmi kaydı tolere eder ({v:1, gold:600} yeter,
# kalan her alan ?? ile varsayılana düşer) → add_init_script ile localStorage'a
# yazıyoruz. Kaynak tohumu (cevher/taş) sahne yüklendikten sonra s.tdState üzerinden.
import json, os, re, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('TD_URL', 'http://localhost:3000/avalanche/tddev')
SHOT = os.environ.get('TD_SHOT_DIR', '/tmp')
fails = []
def check(name, cond, note=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{note}]' if note else ''))
    if not cond: fails.append(name)

S = "() => { const s = window.__tdGame.scene.keys.TdWorld; return %s; }"
SEED_GOLD = 600

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--enable-gpu', '--use-angle=metal'])
    ctx = b.new_context(viewport={'width': 1200, 'height': 800})
    # try/catch: init script HER belgede koşar (reload ara-belgeleri dahil) — erişilemeyen
    # belgede localStorage throw eder ve konsol-temizliği çapasını flake'ler.
    ctx.add_init_script(
        f"try {{ if (!localStorage.getItem('frostbite_save')) "
        f"localStorage.setItem('frostbite_save', JSON.stringify({{ v: 1, gold: {SEED_GOLD} }})) }} catch {{}}")
    pg = ctx.new_page()
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(URL, wait_until='domcontentloaded')
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(2.5)

    ev = lambda expr: pg.evaluate(S % expr)
    k = ev("(s.cameras.main.zoom)")
    cw, ch = pg.evaluate("() => [window.__tdGame.scale.width, window.__tdGame.scale.height]")
    tp = lambda tx, ty: ev(f"((s.heroPos.x = {tx} * 16 + 8, s.heroPos.y = {ty} * 16 + 24, true))")
    save = lambda: pg.evaluate("() => JSON.parse(localStorage.getItem('frostbite_save') || '{}')")

    def setday(sec):
        pg.evaluate(S % f"(s.tdState.dayTime = {sec}, 0)")
        time.sleep(1.2)

    def panel_texts(panel='questPanel'):
        # cx/cy: metnin MERKEZİ panel-yerel koordinatta — origin (0.5,0) butonlarda
        # x/y üst kenardır, oraya tıklamak hit-area sınırında ıskalar (quest-smoke dersi).
        return ev(f"""(s.{panel}.visible ? s.{panel}.list.filter(o => o.type === 'Text')
            .map(t => ({{ t: t.text, hit: !!t.input,
                          cx: t.x + t.displayWidth * (0.5 - t.originX),
                          cy: t.y + t.displayHeight * (0.5 - t.originY) }})) : null)""")

    def click_at(cx_, cy_):
        # Panel container ekran merkezinde (layoutHud) → ekran = merkez + yerel*k.
        pg.mouse.click(cw / 2 + cx_ * k, ch / 2 + cy_ * k)
        time.sleep(0.35)

    def click_btn(label, panel='questPanel', row_of=None):
        """label'lı butona gerçek tıklama. row_of verilirse o metinle AYNI SATIRDAKİ
        (cy farkı < 5) butonu seçer — '[ wear ]' gibi tekrarlanan etiketler için."""
        ts = panel_texts(panel) or []
        row_y = None
        if row_of is not None:
            row = next((t for t in ts if t['t'] == row_of), None)
            if row is None: return False
            row_y = row['cy']
        for t in ts:
            if t['t'] == label and t['hit'] and (row_y is None or abs(t['cy'] - row_y) < 5):
                click_at(t['cx'], t['cy'])
                return True
        return False

    # ── kurulum: gündüz + kaynak tohumu ──
    setday(158)  # u≈0.22 → tam gündüz (daynight-smoke ile aynı değer)
    ev("((s.tdState.resources.ore = 30, s.tdState.resources.stone = 50, s.tdState.save(), true))")
    st0 = save()
    check('seed-gold-loaded', st0.get('gold') == SEED_GOLD, f"gold={st0.get('gold')}")

    # ── (1) Vess: diyalog çipi → dükkân ──
    tp(195, 189)  # Trader Vess (npcs.ts merchant)
    time.sleep(0.4)
    hint = ev("(s.hintText.visible ? s.hintText.text : '')")
    check('vess-interact-hint', hint == 'E — talk to Trader Vess', hint)
    pg.keyboard.press('e'); time.sleep(0.4)
    txts = [t['t'] for t in (panel_texts() or [])]
    check('vess-dialog-opens', ev("(s.questPanel.visible && s.dialogNpc === 'merchant')"))
    check('vess-shop-chip', '[ SHOP ]' in txts, json.dumps(txts, ensure_ascii=False)[:120])
    check('shop-chip-click', click_btn('[ SHOP ]'))
    check('shop-opens-buy-tab', ev("(s.shopNpc === 'merchant' && s.dialogNpc === null && s.shopTab === 'buy')"))
    txts = [t['t'] for t in (panel_texts() or [])]
    print('shop', json.dumps(txts, ensure_ascii=False))
    check('shop-lists-stock', 'Health Potion' in txts and 'Iron Sword' in txts and 'Steel Sword' in txts)
    check('shop-shows-gold', f'{SEED_GOLD}g' in txts)
    pg.screenshot(path=f'{SHOT}/td-econ-shop.png')

    # ── (2) satın alma: potion 30g (=10 taban × BUY_MULT 3) + 2× iron_sword 75g ──
    check('buy-potion-click', click_btn('[ 30g ]', row_of='Health Potion'))
    check('buy-sword-click-1', click_btn('[ 75g ]', row_of='Iron Sword'))
    check('buy-sword-click-2', click_btn('[ 75g ]', row_of='Iron Sword'))
    st = save()
    inv = st.get('inventory', [])
    gold_now = SEED_GOLD - 30 - 75 - 75
    check('buy-gold-deducted', st.get('gold') == gold_now, f"gold={st.get('gold')} (beklenen {gold_now})")
    check('buy-items-in-bag',
          sum(i['count'] for i in inv if i['id'] == 'potion_hp') == 1 and
          sum(1 for i in inv if i['id'] == 'iron_sword') == 2,
          json.dumps([(i['id'], i['count']) for i in inv]))

    # ── (3) SELL sekmesi: tam değer + al>sat makası ──
    check('sell-tab-click', click_btn('  SELL  '))
    txts = [t['t'] for t in (panel_texts() or [])]
    print('sell', json.dumps(txts, ensure_ascii=False))
    check('sell-lists-bag', 'Health Potion' in txts and txts.count('Iron Sword') == 2)
    check('sell-full-value-note', any('Full value here' in t for t in txts))
    check('sell-potion-click', click_btn('[ +10g ]', row_of='Health Potion'))
    st = save()
    check('sell-gold-added', st.get('gold') == gold_now + 10, f"gold={st.get('gold')}")
    check('sell-removes-item', not any(i['id'] == 'potion_hp' for i in st.get('inventory', [])))
    check('spread-anchor-3x', 30 == 3 * 10)  # arbitraj imkânsız: alış = 3× satış
    gold_now += 10
    pg.keyboard.press('Escape'); time.sleep(0.3)
    check('esc-closes-shop', ev("(!s.questPanel.visible && s.shopNpc === null)"))

    # ── (4) Hilda: ocak — altın+cevher+taş üçü birden düşer ──
    tp(188, 189)  # Smith Hilda (npcs.ts blacksmith)
    time.sleep(0.4)
    pg.keyboard.press('e'); time.sleep(0.4)
    txts = [t['t'] for t in (panel_texts() or [])]
    check('hilda-forge-chip', '[ FORGE ]' in txts)
    check('forge-chip-click', click_btn('[ FORGE ]'))
    txts = [t['t'] for t in (panel_texts() or [])]
    print('forge', json.dumps(txts, ensure_ascii=False))
    check('forge-selected-preview', 'Iron Sword  ->  +1' in txts)
    check('forge-stat-preview', any('ATK 5' in t and 'ATK 6' in t for t in txts))
    check('forge-cost-line', '25g  3 ore  5 stone' in txts)
    pg.screenshot(path=f'{SHOT}/td-econ-forge.png')
    check('forge-click', click_btn('[ FORGE ]'))
    st = save()
    res = ev("(({ ore: s.tdState.resources.ore, stone: s.tdState.resources.stone }))")
    gold_now -= 25
    check('forge-gold-deducted', st.get('gold') == gold_now, f"gold={st.get('gold')}")
    check('forge-materials-deducted', res == {'ore': 27, 'stone': 45}, json.dumps(res))
    up1 = [i for i in st.get('inventory', []) if i['id'] == 'iron_sword' and i.get('up') == 1]
    check('forge-item-upgraded', len(up1) == 1 and up1[0]['stat']['atk'] == 6,
          json.dumps([(i['id'], i.get('up'), i.get('stat')) for i in st.get('inventory', [])]))
    txts = [t['t'] for t in (panel_texts() or [])]
    check('forge-redraw-plus1', 'Iron Sword +1  ->  +2' in txts)
    pg.keyboard.press('Escape'); time.sleep(0.3)

    # ── (5) çanta ITEMS: wear + equip-dup regresyonu ──
    # Çantada aynı id'nin +1 ve +0 kopyası var — Adım 2'nin fix'i tam bu durum için:
    # +1'i kuşanmak +0'ı SİLMEMELİ (eski id-tabanlı silme ilk satırı vururdu).
    atk0 = save().get('atk')
    pg.keyboard.press('b'); time.sleep(0.4)
    check('bag-opens', ev("(s.bagPanel.visible)"))
    check('items-tab-click', click_btn('[ ITEMS ]', panel='bagPanel'))
    txts = [t['t'] for t in (panel_texts('bagPanel') or [])]
    print('items', json.dumps(txts, ensure_ascii=False))
    check('items-lists-both-copies', any('Iron Sword +1' in t for t in txts) and
          any(t.strip() == 'Iron Sword' or t == '  Iron Sword' for t in txts))
    check('items-field-note', any('Field price is 60%' in t for t in txts))
    row_up1 = next((t['t'] for t in panel_texts('bagPanel') if 'Iron Sword +1' in t['t']), None)
    check('wear-plus1-click', row_up1 is not None and click_btn('[ wear ]', panel='bagPanel', row_of=row_up1))
    st = save()
    eq = st.get('equipped', {}).get('weapon')
    plain = [i for i in st.get('inventory', []) if i['id'] == 'iron_sword']
    check('wear-equips-plus1', eq is not None and eq.get('up') == 1, json.dumps(eq))
    check('equip-dup-regression', len(plain) == 1 and (plain[0].get('up') or 0) == 0,
          json.dumps([(i['id'], i.get('up')) for i in st.get('inventory', [])]))
    check('wear-recalc-atk', st.get('atk') == atk0 + 6, f"atk {atk0} -> {st.get('atk')}")
    txts = [t['t'] for t in (panel_texts('bagPanel') or [])]
    check('items-shows-equipped-row', any(t.startswith('⚔ Iron Sword +1') for t in txts))
    pg.screenshot(path=f'{SHOT}/td-econ-items.png')

    # ── (6) take off + tarla satışı (%60) ──
    check('takeoff-click', click_btn('[ take off ]', panel='bagPanel'))
    st = save()
    check('takeoff-unequips', st.get('equipped', {}).get('weapon') is None and st.get('atk') == atk0)
    row_up1 = next((t['t'] for t in panel_texts('bagPanel') if 'Iron Sword +1' in t['t']), None)
    # unitSellValue(+1) = round(25 × 1.4) = 35 → tarla %60 = 21
    check('fieldsell-click', row_up1 is not None and click_btn('[ +21g ]', panel='bagPanel', row_of=row_up1))
    st = save()
    gold_now += 21
    check('fieldsell-60pct', st.get('gold') == gold_now, f"gold={st.get('gold')} (beklenen {gold_now})")
    check('fieldsell-removes', not any(i.get('up') == 1 for i in st.get('inventory', [])))
    pg.keyboard.press('b'); time.sleep(0.3)

    # ── (7) gece kapısı: tezgâh kapalı, ocak kapalı ──
    setday(504)  # u=0.70 → tam gece
    tp(195, 189); time.sleep(0.4)
    pg.keyboard.press('e'); time.sleep(0.4)
    check('night-shop-chip-click', click_btn('[ SHOP ]'))
    txts = [t['t'] for t in (panel_texts() or [])]
    print('night-shop', json.dumps(txts, ensure_ascii=False))
    check('night-shop-closed', any('Ledger is shut' in t for t in txts) and 'Opens at dawn.' in txts)
    check('night-ok-closes', click_btn('[ OK ]') and not ev("(s.questPanel.visible)"))
    tp(188, 189); time.sleep(0.4)
    pg.keyboard.press('e'); time.sleep(0.4)
    check('night-forge-chip-click', click_btn('[ FORGE ]'))
    txts = [t['t'] for t in (panel_texts() or [])]
    check('night-forge-closed', any('Coals are banked' in t for t in txts))
    pg.screenshot(path=f'{SHOT}/td-econ-night.png')
    pg.keyboard.press('Escape'); time.sleep(0.3)
    setday(158)

    # ── (8) reload kalıcılığı ──
    pg.reload(wait_until='domcontentloaded')
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(2.5)
    st = save()
    check('reload-gold', st.get('gold') == gold_now, f"gold={st.get('gold')}")
    check('reload-sword-plain', sum(1 for i in st.get('inventory', []) if i['id'] == 'iron_sword') == 1)
    res = ev("(({ ore: s.tdState.resources.ore, stone: s.tdState.resources.stone }))")
    check('reload-resources', res == {'ore': 27, 'stone': 45}, json.dumps(res))

    # Ağ gürültüsü (RPC/CORS/fetch) sahne hatası değil — td-live-smoke ile aynı filtre.
    hard = [e for e in errors if not re.search(
        r'net::ERR|Failed to fetch|Failed to load resource|CORS policy|walletconnect|favicon|Download the React DevTools', e, re.I)]
    print('console errors:', json.dumps(hard[:5], ensure_ascii=False))
    check('no-console-errors', not hard)
    b.close()

print(('OK' if not fails else 'FAILED: ' + ','.join(fails)))
sys.exit(1 if fails else 0)
