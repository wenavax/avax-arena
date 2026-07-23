# frontend/scripts/td-walk-smoke.py — TD world headless smoke (dev server gerekli)
# Kullanım: python3 scripts/td-walk-smoke.py  (önce: npm run dev)
# Faz 5.1: hedef /tddev (dev-only gate'siz mount — worldtestnet artık /world'e redirect,
# /world ise cüzdanlı WorldLoginGate arkasında).
import json, os, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('TD_URL', 'http://localhost:3000/avalanche/tddev')
fails = []
def check(name, cond):
    print(('PASS ' if cond else 'FAIL ') + name)
    if not cond: fails.append(name)

with sync_playwright() as p:
    # Faz 5.2: tam-çözünürlük WebGL render'ı headless'ın SwiftShader'ında (yazılım GPU)
    # yapay olarak yavaş — gerçek GPU'yu aç (M-serisi Mac'te ANGLE Metal; fps ölçümü gerçekçi olsun).
    b = p.chromium.launch(headless=True, args=['--enable-gpu', '--use-angle=metal'])
    pg = b.new_page(viewport={'width': 1200, 'height': 800})
    pg.goto(URL, wait_until='domcontentloaded')  # networkidle dev-HMR'da flake yapiyor
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(2.5)
    S = "() => { const s = window.__tdGame.scene.keys.TdWorld; return %s; }"
    hero = lambda: pg.evaluate(S % "({...s.heroPos})")
    p0 = hero()
    f0 = pg.evaluate("() => window.__tdGame.loop.frame")
    time.sleep(1)
    check('raf-alive', pg.evaluate("() => window.__tdGame.loop.frame") > f0)
    # hareket
    pg.keyboard.down('d'); time.sleep(1.5); pg.keyboard.up('d')
    p1 = hero()
    check('moves-east', p1['x'] - p0['x'] > 100)
    # prop'lar yüklendi + collision solid listesi dolu
    stats = pg.evaluate(S % "({chunks: s.chunkProps.size, solids: [...s.chunkProps.values()].reduce((n,c)=>n+c.solids.length,0), inter: [...s.chunkProps.values()].reduce((n,c)=>n+c.interactives.length,0)})")
    print('stats', json.dumps(stats))
    check('props-loaded', stats['chunks'] >= 4 and stats['solids'] > 20)
    check('town-interactives', stats['inter'] >= 9)  # 9 hub binası (+ yakın kapılar)
    # canavarlar: kahraman kasabada spawn olur (canavarsız); komşu chunk'larda olmalı.
    # Yeterli sayıda yoksa doğuya biraz daha yürüyüp komşu bölge chunk'larına gir.
    mons = pg.evaluate(S % "([...s.chunkMonsters.values()].reduce((n,c)=>n+c.length,0))")
    print('monsters', mons)
    if mons == 0:
        pg.keyboard.down('d'); time.sleep(3); pg.keyboard.up('d')
        mons = pg.evaluate(S % "([...s.chunkMonsters.values()].reduce((n,c)=>n+c.length,0))")
        print('monsters (after walk)', mons)
    check('monsters-spawned', mons > 0)
    # toplama: bir ağaç toplanabilirin yanına ışınlan, 3× SPACE bas, kaynak+enerji doğrula
    tree = pg.evaluate(S % """((() => {
        for (const g of s.chunkGatherables.values()) {
          for (const gv of g.values()) if (gv.kind === 'tree' && gv.alive) return { x: gv.x, y: gv.y };
        }
        return null;
    })())""")
    print('tree', json.dumps(tree))
    check('tree-found', tree is not None)
    if tree:
        energy0 = pg.evaluate(S % "(s.tdState.energy)")
        pg.evaluate(S % f"((s.heroPos.x = {tree['x']} + 10, s.heroPos.y = {tree['y']}, true))")
        time.sleep(0.3)
        for _ in range(3):
            pg.keyboard.press('Space')
            time.sleep(0.2)
        time.sleep(0.3)
        wood = pg.evaluate(S % "(s.tdState.resources.wood)")
        energy1 = pg.evaluate(S % "(s.tdState.energy)")
        print('wood', wood, 'energy0', energy0, 'energy1', energy1)
        check('gather-wood', wood >= 1)
        check('energy-spent', energy1 < energy0)
    # ── Faz 5.2 (Larvy paritesi): canvas TAM viewport çözünürlüğünde (Scale.RESIZE),
    # dünya kamerası tam-sayı zoom k, HUD screen→logical dönüşümlü + native metin ──
    res = pg.evaluate("""() => {
        const g = window.__tdGame, sc = g.scale;
        const parent = g.canvas.parentElement;
        const s = g.scene.keys.TdWorld;
        return { sw: sc.width, sh: sc.height, pw: parent.clientWidth, ph: parent.clientHeight,
                 attrW: g.canvas.width, attrH: g.canvas.height,
                 k: s.cameras.main.zoom, uiZoom: s.uiZoom };
    }""")
    print('view', json.dumps(res))
    check('canvas-full-res', res['sw'] == res['pw'] and res['sh'] == res['ph'] and res['attrW'] == res['pw'])
    check('cam-zoom-integer', res['k'] == int(res['k']) and res['k'] >= 2 and res['k'] == res['uiZoom'])
    k, sw, sh = res['k'], res['sw'], res['sh']
    # Faz 5.6: minimap slotu küçük mod 64+4 → sağ kenardan 68 içeride
    hud = pg.evaluate(S % "({hx: s.hintText.x, hy: s.hintText.y, fw: s.fogRect.width, mmx: s.minimapX, tres: s.hintText.style.resolution})")
    check('hud-adaptive', abs(hud['hx'] - sw / 2) < 1 and abs(hud['hy'] - (sh / 2 + sh / (2 * k) - 14)) < 1
          and abs(hud['fw'] - sw / k) < 1 and abs(hud['mmx'] - (sw / 2 + sw / (2 * k) - 68)) < 1)
    check('hud-text-native-res', hud['tres'] == k)
    # ── Faz 5.7: HARİTADA savaş — temas TdBattle AÇMAZ; SPACE saldırısı mobu öldürür ──
    mon = pg.evaluate(S % """((() => {
        for (const arr of s.chunkMonsters.values()) if (arr.length) return { x: arr[0].x, y: arr[0].y, hp: arr[0].hp };
        return null;
    })())""")
    check('battle-mon-found', mon is not None)
    if mon:
        pg.evaluate(S % f"((s.heroPos.x = {mon['x']} - 18, s.heroPos.y = {mon['y']}, true))")
        time.sleep(0.6)
        check('no-battle-scene-on-contact', not pg.evaluate("() => window.__tdGame.scene.keys.TdBattle.scene.isActive()"))
        check('attack-prompt', pg.evaluate(S % "(s.gatherHint.visible ? s.gatherHint.text : '')").startswith('[SPACE] attack'))
        killed = False
        for _ in range(30):
            pg.keyboard.press('Space'); time.sleep(0.38)
            alive = pg.evaluate(S % f"""((() => {{
                for (const arr of s.chunkMonsters.values()) for (const m of arr)
                  if (Math.abs(m.x - {mon['x']}) < 70 && Math.abs(m.y - {mon['y']}) < 70) return m.hp;
                return null;
            }})())""")
            if alive is None: killed = True; break
        check('map-combat-kill', killed)
        rres = pg.evaluate(S % "({k: s.cameras.main.zoom, sw: s.scale.width})")
        check('world-zoom-stable', rres['k'] == k and rres['sw'] == sw)
    # ── TdBattle regresyonu (yalnız zindan BOSS'u açar): mines'a ışınlan → boss → fit-zoom ──
    pg.evaluate(S % "((s.heroPos.x = 280*16, s.heroPos.y = 230*16, true))")
    time.sleep(1.2)  # chunk stream + kapı yüklensin
    door = pg.evaluate(S % """((() => {
        for (const cp of s.chunkProps.values())
          for (const p of cp.interactives) if (p.kind === 'door_dungeon') return {x: p.x, y: p.y};
        return null;
    })())""")
    check('dungeon-door-found', door is not None)
    if door:
        pg.evaluate(S % f"((s.heroPos.x = {door['x']}, s.heroPos.y = {door['y']} + 12, true))")
        time.sleep(0.4)
        pg.keyboard.press('e')
        pg.wait_for_function("() => window.__tdGame.scene.keys.TdDungeon.scene.isActive()", timeout=8000)
        time.sleep(1.0)
        boss = pg.evaluate("() => { const d = window.__tdGame.scene.keys.TdDungeon; return d.boss ? {x: d.boss.x, y: d.boss.y} : null; }")
        check('dungeon-boss-exists', boss is not None)
        if boss:
            pg.evaluate(f"() => {{ const d = window.__tdGame.scene.keys.TdDungeon; d.heroPos.x = {boss['x']}; d.heroPos.y = {boss['y']}; }}")
            pg.wait_for_function("() => window.__tdGame.scene.keys.TdBattle.scene.isActive()", timeout=8000)
            time.sleep(0.5)
            bres = pg.evaluate("""() => { const g = window.__tdGame; return {
                sw: g.scale.width, bz: g.scene.keys.TdBattle.cameras.main.zoom }; }""")
            print('boss-battle-view', json.dumps(bres))
            check('battle-canvas-untouched', bres['sw'] == sw)
            check('battle-cam-fit', abs(bres['bz'] - min(sw / 1280, sh / 720)) < 0.02)
            # Render-order regresyon çapası (23 Tem boss-donma bug'ı): TdBattle, duraklatılmış
            # TdDungeon'ın ÜSTÜNDE render edilmeli — yoksa savaş görünmez kalır ("donma").
            # Phaser sahneleri game.scene.scenes sırasıyla çizer; sonda olan üstte.
            order = pg.evaluate("""() => { const ss = window.__tdGame.scene.scenes.map(s => s.scene.key);
                const bt = window.__tdGame.scene.keys.TdBattle;
                return { idxBattle: ss.indexOf('TdBattle'), idxDungeon: ss.indexOf('TdDungeon'), battleVisible: bt.scene.isVisible() }; }""")
            print('boss-render-order', json.dumps(order))
            check('battle-renders-above-dungeon', order['idxBattle'] > order['idxDungeon'])
            check('battle-scene-visible', order['battleVisible'] is True)
            pg.evaluate("""() => {
                const g = window.__tdGame;
                g.scene.keys.TdBattle.scene.stop();
                g.scene.keys.TdDungeon.scene.stop();
                g.scene.keys.TdWorld.scene.resume();
            }""")
            time.sleep(0.5)
    # fps
    time.sleep(1)
    fps = pg.evaluate("() => window.__tdGame.loop.actualFps")
    print('fps', round(fps))
    check('fps-ok', fps > 40)
    pg.screenshot(path='/tmp/td-smoke.png')
    b.close()

print(('OK' if not fails else 'FAILED: ' + ','.join(fails)))
sys.exit(1 if fails else 0)
