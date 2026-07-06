import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'launchpad');
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** GET /api/launchpad/image/<sha256-32>.<ext> — yüklenmiş token logosunu servis eder. */
export async function GET(_req: NextRequest, { params }: { params: { file: string } }) {
  const m = /^([a-f0-9]{32})\.(png|jpg|gif|webp)$/.exec(params.file || '');
  if (!m) return new NextResponse('not found', { status: 404 });
  const fp = path.join(UPLOAD_DIR, m[0]);
  if (!fs.existsSync(fp)) return new NextResponse('not found', { status: 404 });
  const buf = fs.readFileSync(fp);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': MIME[m[2]],
      'Cache-Control': 'public, max-age=31536000, immutable', // içerik-adresli: sonsuz cache güvenli
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
