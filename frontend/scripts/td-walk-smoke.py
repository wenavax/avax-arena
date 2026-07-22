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
    b = p.chromium.launch(headless=True)
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
    # ── Faz 5.1: adaptif çözünürlük — tam-sayı zoom, viewport tam-doldurma, HUD konumu ──
    res = pg.evaluate("""() => {
        const sc = window.__tdGame.scale;
        const parent = window.__tdGame.canvas.parentElement;
        return { k: sc.zoom, w: sc.width, h: sc.height,
                 pw: parent.clientWidth, ph: parent.clientHeight };
    }""")
    print('view', json.dumps(res))
    check('zoom-integer', res['k'] == int(res['k']) and res['k'] >= 2)
    check('view-fills', res['w'] * res['k'] >= res['pw'] and res['h'] * res['k'] >= res['ph'])
    check('view-crop-max', res['w'] * res['k'] - res['pw'] < res['k'] and res['h'] * res['k'] - res['ph'] < res['k'])
    hud = pg.evaluate(S % "({hx: s.hintText.x, hy: s.hintText.y, fw: s.fogRect.width, mmx: s.minimapX})")
    check('hud-adaptive', abs(hud['hx'] - res['w'] / 2) < 1 and abs(hud['hy'] - (res['h'] - 14)) < 1
          and hud['fw'] == res['w'] and hud['mmx'] == res['w'] - 100)
    # savaşa gir/çık: native 1280×720'ye geçmeli, dönüşte k-tabanlı boyuta RESTORE etmeli
    mon = pg.evaluate(S % """((() => {
        for (const arr of s.chunkMonsters.values()) if (arr.length) return { x: arr[0].x, y: arr[0].y };
        return null;
    })())""")
    check('battle-mon-found', mon is not None)
    if mon:
        pg.evaluate(S % f"((s.heroPos.x = {mon['x']}, s.heroPos.y = {mon['y']}, true))")
        pg.wait_for_function("() => window.__tdGame.registry.get('tdBattle') === true", timeout=8000)
        bres = pg.evaluate("() => ({w: window.__tdGame.scale.width, h: window.__tdGame.scale.height, k: window.__tdGame.scale.zoom})")
        print('battle-view', json.dumps(bres))
        check('battle-native', bres['w'] == 1280 and bres['h'] == 720)
        check('battle-fit-zoom', abs(bres['k'] - min(res['pw'] / 1280, res['ph'] / 720)) < 0.01)
        pg.evaluate("""() => {
            const g = window.__tdGame;
            g.scene.keys.TdBattle.scene.stop();      // SHUTDOWN → çözünürlük restore
            g.scene.keys.TdWorld.scene.resume();
            g.scene.keys.TdWorld.battleActive = false;
        }""")
        time.sleep(0.5)
        rres = pg.evaluate("() => ({w: window.__tdGame.scale.width, h: window.__tdGame.scale.height, k: window.__tdGame.scale.zoom})")
        print('restored-view', json.dumps(rres))
        check('battle-restore-k', rres['k'] == res['k'] and rres['w'] == res['w'] and rres['h'] == res['h'])
    # fps
    time.sleep(1)
    fps = pg.evaluate("() => window.__tdGame.loop.actualFps")
    print('fps', round(fps))
    check('fps-ok', fps > 40)
    pg.screenshot(path='/tmp/td-smoke.png')
    b.close()

print(('OK' if not fails else 'FAILED: ' + ','.join(fails)))
sys.exit(1 if fails else 0)
