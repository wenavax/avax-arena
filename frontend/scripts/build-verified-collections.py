#!/usr/bin/env python3
"""Build the combined verified-collection snapshot:
   Salvor (floor+volume, all collections) x Joepegs (verified enum) -> merged JSON.
Output: frontend/scripts/data-salvor-verified-20260707.json
"""
import json, urllib.request, collections, time
from playwright.sync_api import sync_playwright

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0 Safari/537.36'
OUT='/Users/hts_bot/avax-arena/frontend/scripts/data-salvor-verified-20260707.json'

# ---- 1. Joepegs verified map (public, no key) ----
def jp(pn):
    u=f"https://barn.joepegs.com/v3/collections?chain=avalanche&filterBy=total&orderBy=volume&pageSize=100&pageNum={pn}"
    return json.load(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':UA,'accept':'application/json'}),timeout=25))
jverified={}  # address -> {verified, floor_avax, volumeUsd, numSales}
for pn in range(1,40):
    d=jp(pn)
    if not isinstance(d,list) or not d: break
    for c in d:
        a=(c.get('address') or '').lower()
        if a:
            jverified[a]={'verified':c.get('verified'),
                          'jp_floor_avax': round(int(c.get('floor') or 0)/1e18,4),
                          'jp_volumeUsd': c.get('volumeUsd'),
                          'jp_numSales': c.get('numSales')}
    if len(d)<100: break
    time.sleep(0.15)
print('Joepegs verified map:', len(jverified), 'collections')

# ---- 2. Salvor full list (Playwright, visitor-id) ----
vid={'v':None}
rows=[]; total=None
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(user_agent=UA); pg=ctx.new_page()
    pg.on('request', lambda r: vid.__setitem__('v', r.headers.get('visitor-id') or vid['v']))
    pg.goto('https://salvor.io/collections', wait_until='domcontentloaded', timeout=60000)
    pg.wait_for_timeout(5000)
    print('visitor-id:', vid['v'])
    def fetch(pn):
        js="""async ([pn,v])=>{const r=await fetch(`https://salvor.io/api/collections/report-v2?range=d7&page=${pn}&size=20`,{headers:{'accept':'application/json','visitor-id':v},credentials:'include'});return await r.text();}"""
        return json.loads(pg.evaluate(js,[pn,vid['v']]))
    for pn in range(0,200):
        j=fetch(pn); data=j.get('data') or {}
        if total is None: total=data.get('count')
        items=data.get('rows') or []
        if not items: break
        for it in items:
            addr=(it.get('address') or '').lower()
            fp=it.get('floorPrice') or {}; vol=it.get('volume') or {}
            jp_meta=jverified.get(addr,{})
            rows.append({
                'name': it.get('name'),
                'address': addr,
                'symbol': it.get('symbol'),
                'floor': {'all': fp.get('all'), 'd1': fp.get('d1'), 'd7': fp.get('d7')},
                'volume': {'all': vol.get('all'), 'd1': vol.get('d1'), 'd7': vol.get('d7')},
                'saleCount_d7': (it.get('saleCount') or {}).get('d7'),
                'itemCount': it.get('itemCount'),
                'listedCount': it.get('listedCount'),
                'uniqHolderCount': it.get('uniqHolderCount'),
                'salvor_isVerified': None,  # only in detail endpoint; weak signal, omit bulk
                'joepegs_verified': jp_meta.get('verified'),   # verified_trusted|verified|unverified|None(absent)
                'joepegs_floor_avax': jp_meta.get('jp_floor_avax'),
                'joepegs_volumeUsd': jp_meta.get('jp_volumeUsd'),
            })
        if pn%25==0: print(f'salvor page {pn}: total {len(rows)}/{total}')
    b.close()

json.dump(rows, open(OUT,'w'), indent=1, ensure_ascii=False)
# stats
jv=collections.Counter(r['joepegs_verified'] for r in rows)
print('=== DONE ===')
print('Salvor total count field:', total)
print('Salvor rows saved:', len(rows), '->', OUT)
print('joepegs_verified distribution among Salvor collections:', dict(jv))
print('Salvor collections that are Joepegs verified/trusted:',
      sum(1 for r in rows if r['joepegs_verified'] in ('verified','verified_trusted')))
