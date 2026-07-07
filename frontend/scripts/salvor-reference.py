#!/usr/bin/env python3
"""Salvor.io koleksiyon referansı — NFT Score tier tablosu kürasyonu için.

Salvor API'si curl'e kapalı (TLS/JS parmak izi) ama gerçek tarayıcıya açık;
bu script Playwright ile 7g hacim sıralamasını çeker ve lib/nftScore.ts'teki
küratörlü tier tablosunu güncellerken referans olarak kullanılır.

Kullanım: python3 scripts/salvor-reference.py
Çıktı:   scripts/data-salvor-snapshot-YYYYMMDD.json + konsol tablosu
"""
import json
import datetime
from playwright.sync_api import sync_playwright

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/145.0 Safari/537.36'

data = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(user_agent=UA)
    pg.on('response', lambda r: data.update({'report': r.json()}) if 'report-v2' in r.url and r.status == 200 else None)
    pg.goto('https://salvor.io/collections', wait_until='domcontentloaded', timeout=45000)
    pg.wait_for_timeout(8000)
    b.close()

items = (data.get('report') or {}).get('data') or []
if isinstance(items, dict):
    items = items.get('collections') or items.get('content') or items.get('rows') or []

rows = []
for it in items:
    c = it.get('collection') or it
    floor = it.get('floor') or {}
    vol = it.get('volume') or {}
    rows.append({
        'name': c.get('name'),
        'address': (c.get('address') or '').lower(),
        'floor_now': (floor or {}).get('all') if isinstance(floor, dict) else floor,
        'floor_d7': (floor or {}).get('d7') if isinstance(floor, dict) else None,
        'vol_d7': (vol or {}).get('d7') if isinstance(vol, dict) else vol,
        'vol_all': (vol or {}).get('all') if isinstance(vol, dict) else None,
    })

stamp = datetime.date.today().strftime('%Y%m%d')
out = f'scripts/data-salvor-snapshot-{stamp}.json'
json.dump(rows, open(out, 'w'), indent=1)
print(f'{len(rows)} koleksiyon → {out}\n')
print(f"{'KOLEKSİYON':<28} {'FLOOR':>8} {'F.7G':>8} {'VOL 7G':>10} {'VOL TÜM':>12}")
for r in rows:
    print(f"{(r['name'] or '?')[:27]:<28} {str(r['floor_now']):>8} {str(r['floor_d7']):>8} {str(r['vol_d7'])[:9]:>10} {str(r['vol_all'])[:11]:>12}")
print('\nNot: floor_now/floor_d7 büyük sapıyorsa (ör. giraffe) wash şüphesi — λ düşür.')
