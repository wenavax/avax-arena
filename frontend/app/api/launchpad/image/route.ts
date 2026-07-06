import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/launchpad/image — token logo upload (multipart, alan adı "file").
 * ≤512KB png/jpg/webp/gif; içerik sha256'sıyla adlandırılır (dedupe + path
 * traversal imkânsız). Dosyalar data/uploads/launchpad/ altında yaşar (rsync
 * deploy'da --exclude ile korunur), GET /api/launchpad/image/[file] servis eder.
 */

const MAX_BYTES = 512 * 1024;
const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'launchpad');

// magic-byte kontrolü — content-type header'ına güvenme
function sniffExt(buf: Buffer): string | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 6 && buf.subarray(0, 6).toString('latin1').startsWith('GIF8')) return 'gif';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'file alanı eksik' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'max 512KB' }, { status: 413 });

    const buf = Buffer.from(await file.arrayBuffer());
    const ext = sniffExt(buf);
    if (!ext) return NextResponse.json({ error: 'sadece png/jpg/webp/gif' }, { status: 415 });

    const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 32)}.${ext}`;
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const dest = path.join(UPLOAD_DIR, name);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);

    return NextResponse.json({ url: `/avalanche/api/launchpad/image/${name}` });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message.slice(0, 100) : 'upload failed' },
      { status: 500 }
    );
  }
}
