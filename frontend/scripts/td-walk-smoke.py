# frontend/scripts/td-walk-smoke.py — TD world headless smoke (dev server gerekli)
# Kullanım: python3 scripts/td-walk-smoke.py  (önce: npm run dev)
import json, os, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('TD_URL', 'http://localhost:3000/avalanche/worldtestnet')
fails = []
def check(name, cond):
    print(('PASS ' if cond else 'FAIL ') + name)
    if not cond: fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1200, 'height': 800})
    pg.goto(URL, wait_until='networkidle')
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
    # fps
    time.sleep(1)
    fps = pg.evaluate("() => window.__tdGame.loop.actualFps")
    print('fps', round(fps))
    check('fps-ok', fps > 40)
    pg.screenshot(path='/tmp/td-smoke.png')
    b.close()

print(('OK' if not fails else 'FAILED: ' + ','.join(fails)))
sys.exit(1 if fails else 0)
