# frontend/scripts/td-quest-smoke.py — Faz 7 NPC/görev akışı headless smoke (dev server gerekli)
# Kullanım: python3 scripts/td-quest-smoke.py   (önce: npm run dev)
# Emsal: td-walk-smoke.py. Hedef /tddev (mode=live → PlayerState localStorage'a yazar;
# headless bağlam izole olduğundan gerçek kaydı kirletmez).
#
# Kapsam: NPC render/işaretçi · diyalog paneli · GERÇEK FARE TIKLAMASI ile ACCEPT/TURN IN ·
# gather kancası · görev günlüğü (J/ESC) · toast DOM'u · yeniden yüklemede kalıcılık ·
# requires zinciri · zindan enter/kill kancaları · konsol hatası yok.
import json, os, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('TD_URL', 'http://localhost:3000/avalanche/tddev')
SHOT = os.environ.get('TD_SHOT_DIR', '/tmp')
fails = []
def check(name, cond):
    print(('PASS ' if cond else 'FAIL ') + name)
    if not cond: fails.append(name)

S = "() => { const s = window.__tdGame.scene.keys.TdWorld; return %s; }"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=['--enable-gpu', '--use-angle=metal'])
    pg = b.new_page(viewport={'width': 1200, 'height': 800})
    errors = []
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(URL, wait_until='domcontentloaded')
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(2.5)

    ev = lambda expr: pg.evaluate(S % expr)
    k = ev("(s.cameras.main.zoom)")
    cw, ch = pg.evaluate("() => [window.__tdGame.scale.width, window.__tdGame.scale.height]")
    tp = lambda x, y: ev(f"((s.heroPos.x = {x}, s.heroPos.y = {y}, true))")

    def panel_texts():
        # cx/cy: metnin MERKEZİ panel-yerel koordinatta (origin'e göre düzeltilmiş) —
        # origin (0.5, 0) olan butonlarda x/y üst kenardır, oraya tıklamak hit-area
        # sınırına denk gelip ıskalıyor.
        return ev("""(s.questPanel.visible ? s.questPanel.list.filter(o => o.type === 'Text')
            .map(t => ({ t: t.text, x: t.x, y: t.y, hit: !!t.input,
                         cx: t.x + t.displayWidth * (0.5 - t.originX),
                         cy: t.y + t.displayHeight * (0.5 - t.originY) })) : null)""")

    def click_btn(label):
        """Panel butonuna GERÇEK fare tıklaması. scrollFactor(0) + kamera zoom k altında
        panel merkezi ekran merkezine oturur → ekran = ekran_merkezi + yerel*k."""
        for t in (panel_texts() or []):
            if t['t'] == label and t['hit']:
                sx, sy = cw / 2 + t['cx'] * k, ch / 2 + t['cy'] * k
                pg.mouse.move(sx, sy); time.sleep(0.2)
                # pointerover → alpha 0.75 (panelBtn): hit-area gerçekten fareye açık mı?
                hovered = ev(f"((s.questPanel.list.find(o => o.text === {json.dumps(label)}) || {{}}).alpha)") == 0.75
                pg.mouse.click(sx, sy)
                time.sleep(0.35)
                return hovered
        return False

    # ── (1) NPC'ler dünyada var mı: prop + doku + işaretçi ──
    npc = ev("""({
        inter: [...s.chunkProps.values()].reduce((n, c) => n + c.interactives.filter(p => p.kind === 'npc').length, 0),
        markers: s.npcMarkers.size,
        tex: window.__tdGame.textures.getTextureKeys().filter(x => x.startsWith('td-npc-')).length,
    })""")
    print('npcs', json.dumps(npc))
    check('npc-props-streamed', npc['inter'] == 8)
    check('npc-textures', npc['tex'] == 8)
    check('npc-markers-live', npc['markers'] == 8)
    marks = ev("([...s.npcMarkers].map(([id, t]) => [id, t.text, t.visible]))")
    print('markers', json.dumps(marks))
    check('markers-all-bang', all(m[1] == '!' and m[2] for m in marks))

    # ── (2) Elder'a yaklaş → ipucu → E → diyalog ──
    tp(188 * 16 + 8, 194 * 16 + 24)
    time.sleep(0.4)
    hint = ev("(s.hintText.visible ? s.hintText.text : '')")
    print('hint', hint)
    check('npc-interact-hint', hint == 'E — talk to Elder Maren')
    pg.keyboard.press('e')
    time.sleep(0.4)
    check('dialog-opens', ev("(s.questPanel.visible && s.dialogNpc === 'elder')"))
    txts = [t['t'] for t in (panel_texts() or [])]
    print('dialog', json.dumps(txts, ensure_ascii=False))
    check('dialog-shows-quest', 'First Steps' in txts and any('40g' in t for t in txts))
    check('dialog-accept-btn', '[ ACCEPT ]' in txts)
    pg.screenshot(path=f'{SHOT}/td-quest-dialog.png')

    # ── (3) GERÇEK TIKLAMA ile kabul ──
    check('accept-click-lands', click_btn('[ ACCEPT ]'))
    q = pg.evaluate("() => (JSON.parse(localStorage.getItem('frostbite_save')||'{}').quests||[])")
    print('saved rows', json.dumps(q))
    check('quest-row-created', len(q) == 1 and q[0]['id'] == 'q_first_steps' and q[0]['progress'] == 0)
    check('quest-persisted-live', q[0]['turnedIn'] is False)
    txts = [t['t'] for t in (panel_texts() or [])]
    check('dialog-redraws-active', any(t.startswith('In progress') for t in txts))
    pg.keyboard.press('Escape')
    time.sleep(0.3)
    check('esc-closes-dialog', ev("(!s.questPanel.visible && s.dialogNpc === null)"))

    # ── (4) Görev günlüğü J / tekrar J ──
    pg.keyboard.press('j')
    time.sleep(0.35)
    log1 = [t['t'] for t in (panel_texts() or [])]
    print('log', json.dumps(log1, ensure_ascii=False))
    check('log-opens', ev("(s.questPanel.visible && s.dialogNpc === null)"))
    check('log-lists-quest', any('First Steps' in t for t in log1) and any(t.startswith('0/5') for t in log1))
    pg.screenshot(path=f'{SHOT}/td-quest-log.png')
    pg.keyboard.press('j')
    time.sleep(0.3)
    check('log-toggles-closed', not ev("(s.questPanel.visible)"))

    # ── (5) GERÇEK toplama kancası: 1 ağaç kes → 1/5 ──
    tree = ev("""((() => {
        for (const g of s.chunkGatherables.values())
          for (const gv of g.values()) if (gv.kind === 'tree' && gv.alive) return { x: gv.x, y: gv.y };
        return null;
    })())""")
    check('tree-found', tree is not None)
    if tree:
        tp(tree['x'] + 10, tree['y'])
        time.sleep(0.3)
        for _ in range(3):
            pg.keyboard.press('Space'); time.sleep(0.2)
        time.sleep(0.4)
        # Tamamlanmamış ilerleme HEMEN yazılmaz (5sn'lik biriktirici) → günlüğü açıp
        # sahne belleğindeki satırı oku.
        inmem = pg.evaluate("() => { const s = window.__tdGame.scene.keys.TdWorld; "
                            "s.toggleQuestLog(); const t = s.questPanel.list.filter(o => o.type === 'Text').map(o => o.text); "
                            "s.closeQuestPanel(); return t; }")
        print('after-chop log', json.dumps(inmem, ensure_ascii=False))
        check('gather-hook-advances', any(t.startswith('1/5') for t in inmem))

    # ── (6) Kalanı questEvent üzerinden tamamla (kanca zaten kanıtlandı) → toast + '?' ──
    ev("(s.questEvent('gather:wood', 4), true)")
    time.sleep(0.6)
    body = pg.inner_text('body')
    check('quest-toast-dom', 'Quest complete' in body and 'First Steps' in body)
    time.sleep(0.4)
    mk = ev("(s.npcMarkers.get('elder').text)")
    print('elder marker', mk)
    check('marker-turns-ready', mk == '?')
    saved = pg.evaluate("() => (JSON.parse(localStorage.getItem('frostbite_save')||'{}').quests||[])")
    check('complete-saves-immediately', len(saved) == 1 and saved[0]['completed'] is True and saved[0]['progress'] == 5)

    # ── (7) Teslim: gerçek tıklama → altın + zincirin açılması ──
    gold0 = pg.evaluate("() => (JSON.parse(localStorage.getItem('frostbite_save')||'{}').gold ?? 0)")
    tp(188 * 16 + 8, 194 * 16 + 24)
    time.sleep(0.3)
    pg.keyboard.press('e')
    time.sleep(0.4)
    txts = [t['t'] for t in (panel_texts() or [])]
    print('turnin dialog', json.dumps(txts, ensure_ascii=False))
    check('turnin-btn-shown', '[ TURN IN ]' in txts)
    check('turnin-click-lands', click_btn('[ TURN IN ]'))
    st = pg.evaluate("() => JSON.parse(localStorage.getItem('frostbite_save')||'{}')")
    print('gold', gold0, '->', st.get('gold'))
    check('reward-gold-granted', st.get('gold') == gold0 + 40)
    check('row-turned-in', st['quests'][0]['turnedIn'] is True)
    nxt = [t['t'] for t in (panel_texts() or [])]
    print('next dialog', json.dumps(nxt, ensure_ascii=False))
    check('requires-chain-unlocks', 'Thin the Pack' in nxt and '[ ACCEPT ]' in nxt)
    pg.screenshot(path=f'{SHOT}/td-quest-turnin.png')
    pg.keyboard.press('Escape'); time.sleep(0.3)

    # ── (8) Yeniden yükleme: satır + işaretçi hayatta ──
    pg.reload(wait_until='domcontentloaded')
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(2.5)
    after = pg.evaluate("() => (JSON.parse(localStorage.getItem('frostbite_save')||'{}').quests||[])")
    check('survives-reload', len(after) == 1 and after[0]['turnedIn'] is True)
    mk2 = pg.evaluate("() => { const s = window.__tdGame.scene.keys.TdWorld; "
                      "const m = s.npcMarkers.get('elder'); return m ? m.text : null; }")
    print('elder marker after reload', mk2)
    check('marker-after-reload-bang', mk2 == '!')  # q_wolf_cull artık available

    # ── (9) Zindan kancaları: enter:<id> + kill:any ──
    pg.evaluate("""() => { const s = window.__tdGame.scene.keys.TdWorld;
        s.heroPos.x = 195 * 16; s.heroPos.y = 196 * 16 + 24; }""")   # Hunter Bex
    time.sleep(0.4)
    pg.keyboard.press('e'); time.sleep(0.4)
    hb = pg.evaluate("() => { const s = window.__tdGame.scene.keys.TdWorld; return s.questPanel.list"
                     ".filter(o => o.type === 'Text').map(o => o.text); }")
    print('hunter dialog', json.dumps(hb, ensure_ascii=False))
    check('hunter-offers-bounty', 'Standing Bounty' in hb)
    check('bounty-accept', click_btn('[ ACCEPT ]'))
    pg.keyboard.press('Escape'); time.sleep(0.3)

    pg.evaluate("""() => { const s = window.__tdGame.scene.keys.TdWorld;
        s.heroPos.x = 280 * 16; s.heroPos.y = 230 * 16; }""")
    time.sleep(1.3)
    door = pg.evaluate("""() => { const s = window.__tdGame.scene.keys.TdWorld;
        for (const cp of s.chunkProps.values())
          for (const p of cp.interactives) if (p.kind === 'door_dungeon') return { x: p.x, y: p.y, id: p.data.id };
        return null; }""")
    print('door', json.dumps(door))
    check('dungeon-door-found', door is not None)
    if door:
        pg.evaluate(f"""() => {{ const s = window.__tdGame.scene.keys.TdWorld;
            s.heroPos.x = {door['x']}; s.heroPos.y = {door['y']} + 12; }}""")
        time.sleep(0.4)
        pg.keyboard.press('e')
        pg.wait_for_function("() => window.__tdGame.scene.keys.TdDungeon.scene.isActive()", timeout=8000)
        time.sleep(1.0)
        # zindan trash mobu öldür → kill:any (q_bounty) ilerlesin
        mon = pg.evaluate("""() => { const d = window.__tdGame.scene.keys.TdDungeon;
            const m = d.mons.find(m => !m.isBoss);
            return m ? { x: m.x, y: m.y } : null; }""")
        print('dungeon mob', json.dumps(mon))
        check('dungeon-trash-found', mon is not None)
        if mon:
            # Mob sayısının DÜŞMESİ tek güvenilir ölçüt: yakınlık penceresiyle bakmak
            # kovalayan komşu mob yüzünden yanlış negatif veriyordu.
            # Harness notu: SPACE her zaman EN YAKIN moba vurur (onSpaceAction), yani belli
            # bir hedefe kilitlenmek anlamsız — mob sayısının düşmesine bakıyoruz. Ayrıca
            # kahramanın canı sabitleniyor: 14px temas mesafesinde beklerken ölüp kasabaya
            # ışınlanıyor ve döngü sessizce boşa dönüyordu.
            n0 = pg.evaluate("() => window.__tdGame.scene.keys.TdDungeon.mons.length")
            # Her turda: en yakın trash'in yanına ışınlan → SPACE → HEMEN uzaklaş.
            # Uzaklaşma şart: 14px'te beklemek temas hasarı yediriyor, kahraman ölünce
            # zindan kapanıp döngü sessizce boşa dönüyordu.
            approach = """() => { const d = window.__tdGame.scene.keys.TdDungeon;
                if (!d.scene.isActive()) return -1;
                let best = null, bd = 1e9;
                for (const m of d.mons) { if (m.isBoss) continue;
                  const dd = Math.hypot(d.heroPos.x - m.x, d.heroPos.y - m.y);
                  if (dd < bd) { bd = dd; best = m; } }
                if (!best) return -1;
                d.__park = { x: d.heroPos.x, y: d.heroPos.y };
                d.heroPos.x = best.x - 14; d.heroPos.y = best.y;
                return d.mons.length; }"""
            retreat = """() => { const d = window.__tdGame.scene.keys.TdDungeon;
                if (d.__park) { d.heroPos.x = d.__park.x; d.heroPos.y = d.__park.y; } }"""
            killed = False
            for _ in range(40):
                n = pg.evaluate(approach)
                if n == -1: break
                if n < n0: killed = True; break
                pg.keyboard.press('Space')
                time.sleep(0.12)      # keydown bir sonraki update()'te işlenir — önce vuruş
                pg.evaluate(retreat)  # sonra temas hasarından çekil
                time.sleep(0.3)       # ATTACK_CD_MS 350 + pay
            # ⚠️ BİLGİ AMAÇLI, assert DEĞİL. Headless'ta scripted zindan savaşı güvenilir
            # değil: SPACE en yakın moba vurur, ışınlanma kovalayan mob'u hedef yapabiliyor,
            # 14px'te beklemek temas hasarıyla kahramanı öldürüyor, keydown bir sonraki
            # update()'te işleniyor. 3 farklı döngü denendi; ~%50 turda hiç vuruş inmiyor.
            # despawnMonster→pushQuestEvent kancası şurada kapsanıyor:
            #   · td-quest-test.ts 'kill-any-counts-all' / 'objective-producible:*'
            #   · elle koşumda gözlendi (zindan kill → q_bounty 0→1, localStorage'a yazıldı)
            bounty = pg.evaluate("""() => ((JSON.parse(localStorage.getItem('frostbite_save')||'{}').quests||[])
                .find(q => q.id === 'q_bounty') || null)""")
            print('[info] dungeon-kill', killed, 'bounty progress',
                  bounty['progress'] if bounty else None)

    hard = [e for e in errors if 'favicon' not in e and 'Download the React DevTools' not in e]
    print('console errors:', json.dumps(hard[:5], ensure_ascii=False))
    check('no-console-errors', not hard)
    b.close()

print(('OK' if not fails else 'FAILED: ' + ','.join(fails)))
sys.exit(1 if fails else 0)
