import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { badgeFor } from '@/lib/nftScore';

export const runtime = 'edge';

/**
 * GET /api/nft-score/og?w=0x..&s=173&n=40&t=Arena+Warriors&frost=1
 * 1200×630 paylaşım kartı (Twitter/OG). Değerler query'den gelir → DB/edge uyumlu.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const wallet = q.get('w') || '0x0000…0000';
  const score = Number(q.get('s') || 0);
  const total = Number(q.get('n') || 0);
  const top = q.get('t') || '';
  const frost = q.get('frost') === '1';
  const badge = badgeFor(score);

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0d0d10 0%, #16121a 55%, #0d0d10 100%)',
          padding: '64px',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* ambient orbs */}
        <div style={{ position: 'absolute', top: -120, left: -80, width: 460, height: 460, borderRadius: 460, background: 'radial-gradient(circle, rgba(237,47,57,0.28), transparent 70%)', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -140, right: -60, width: 520, height: 520, borderRadius: 520, background: 'radial-gradient(circle, rgba(56,152,236,0.20), transparent 70%)', display: 'flex' }} />

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
              <span style={{ color: '#ed2f39' }}>FROST</span>
              <span style={{ color: '#f1f1f4' }}>BITE</span>
            </div>
            <div style={{ display: 'flex', fontSize: 22, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>NFT Score · Avalanche</div>
          </div>
          {frost && (
            <div style={{ display: 'flex', fontSize: 22, color: '#ed2f39', background: 'rgba(237,47,57,0.12)', border: '1px solid rgba(237,47,57,0.3)', borderRadius: 12, padding: '8px 18px' }}>
              ❄ Frostbite Holder
            </div>
          )}
        </div>

        {/* score block */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', fontSize: 96, marginBottom: -8 }}>{badge.icon}</div>
          <div style={{ display: 'flex', fontSize: 34, color: 'rgba(255,255,255,0.55)', letterSpacing: 2 }}>{badge.label.toUpperCase()}</div>
          <div
            style={{
              display: 'flex',
              fontSize: 200,
              fontWeight: 900,
              lineHeight: 1,
              background: 'linear-gradient(135deg, #ed2f39, #f87171)',
              backgroundClip: 'text',
              color: 'transparent',
              marginTop: 8,
            }}
          >
            {score}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 28, color: '#f1f1f4', fontFamily: 'monospace' }}>{wallet}</div>
            <div style={{ display: 'flex', fontSize: 20, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
              {total} scored NFTs{top ? ` · top: ${top}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 24, color: 'rgba(255,255,255,0.5)' }}>frostbite.pro</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
