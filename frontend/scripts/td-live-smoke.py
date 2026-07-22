# frontend/scripts/td-live-smoke.py — TD canlı-geçiş (Faz 5 Task 3) test paritesi
#
# Post-switch (Task 4), run this against /world with TD_LIVE=1 to assert the iframe
# overlay appears; pre-switch it only validates the preview-mode toast-based
# hub-open contract.
#
# Env vars:
#   TD_URL  — hedef sayfa (default http://localhost:3000/avalanche/worldtestnet, td-walk-smoke
#             ile aynı yerel-dev konvansiyonu)
#   TD_LIVE — "1"/truthy ise LIVE mod davranışı doğrulanır (same-origin iframe overlay);
#             boşsa/falsy ise PREVIEW mod (toast tabanlı 'td-hub-open' sözleşmesi) doğrulanır.
#
# Kullanım:
#   python3 scripts/td-live-smoke.py                 # preview-mode (varsayılan)
#   TD_LIVE=1 python3 scripts/td-live-smoke.py        # live-mode (Task 4 sonrası /world'e karşı anlamlı)
import json, os, sys, time
from playwright.sync_api import sync_playwright

URL = os.environ.get('TD_URL', 'http://localhost:3000/avalanche/worldtestnet')
LIVE = os.environ.get('TD_LIVE', '').strip().lower() in ('1', 'true', 'yes')
fails = []


def check(name, cond):
    print(('PASS ' if cond else 'FAIL ') + name)
    if not cond:
        fails.append(name)


with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    pg = b.new_page(viewport={'width': 1200, 'height': 800})
    console_errors = []
    pg.on('console', lambda m: console_errors.append(m.text()) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: console_errors.append(str(e)))

    pg.goto(URL, wait_until='domcontentloaded')  # networkidle dev-HMR'da flake yapiyor
    pg.wait_for_function('() => !!window.__tdGame', timeout=30000)
    time.sleep(2.5)

    # ── temel: canvas mount + konsol hatasız ──
    check('canvas-mounts', pg.evaluate("() => !!document.querySelector('canvas')"))
    real_errs = [e for e in console_errors if not __import__('re').search(
        r'net::ERR|Failed to fetch|walletconnect|favicon|status of 40', e, __import__('re').I)]
    check('no-console-errors', len(real_errs) == 0)
    if real_errs:
        for e in real_errs[:5]:
            print('   console:', e[:160])

    S = "() => { const s = window.__tdGame.scene.keys.TdWorld; return %s; }"

    # ── hub-open kontratı: en yakın hub binasına ışınlan + E bas (gerçek akış — td-walk-smoke
    # deseniyle aynı: doğrudan heroPos'u bina yanına taşı, sonra keydown-E tetikle) ──
    building = pg.evaluate(S % """((() => {
        for (const cp of s.chunkProps.values()) {
          for (const p of cp.interactives) if (p.kind === 'building') return { x: p.x, y: p.y, name: p.data.name };
        }
        return null;
    })())""")
    check('hub-building-found', building is not None)

    if building:
        pg.evaluate(S % f"((s.heroPos.x = {building['x']}, s.heroPos.y = {building['y']} + 10, true))")
        time.sleep(0.3)

        if not LIVE:
            # PREVIEW: 'td-hub-open' window event fires → toast görünür (Task 1 kapsamı).
            pg.evaluate("""() => {
                window.__tdHubOpenSeen = false;
                window.addEventListener('td-hub-open', () => { window.__tdHubOpenSeen = true; }, { once: true });
            }""")
            pg.keyboard.press('e')
            time.sleep(0.5)
            seen = pg.evaluate('() => !!window.__tdHubOpenSeen')
            check('preview-td-hub-open-fires', seen)
            # iframe overlay PREVIEW'da YOK — toast yolu kullanılır, bilinçli atlanır.
            # NOT: Privy'nin embedded-wallet iframe'i (auth.privy.io) sayfada zaten var —
            # same-origin (basePath /avalanche + embed=1) hub overlay iframe'i ile karışmasın diye
            # yalnız same-origin + '?embed=1' içeren src'ler sayılır.
            has_hub_iframe = pg.evaluate("""() => [...document.querySelectorAll('iframe')]
                .some(f => f.src.includes(location.origin) && f.src.includes('embed=1'))""")
            check('preview-no-iframe-overlay', not has_hub_iframe)
        else:
            # LIVE: aynı E-basma akışı 'hub-open-game' → GameOverlay same-origin iframe açar.
            # NOT: Task 4 (swap) öncesi /worldtestnet LIVE mod bağlamında meaningful bir hedef
            # olmayabilir — script yine de aynı TD_URL'e karşı dener (post-switch /world'de
            # yeniden kullanılabilir olması için).
            pg.keyboard.press('e')
            time.sleep(1.5)
            has_hub_iframe = pg.evaluate("""() => [...document.querySelectorAll('iframe')]
                .some(f => f.src.includes(location.origin) && f.src.includes('embed=1'))""")
            check('live-iframe-overlay-appears', has_hub_iframe)

    pg.screenshot(path='/tmp/td-live-smoke.png')
    b.close()

print(('OK' if not fails else 'FAILED: ' + ','.join(fails)))
sys.exit(1 if fails else 0)
