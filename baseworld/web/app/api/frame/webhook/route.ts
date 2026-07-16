/**
 * Farcaster Mini App webhook endpoint.
 *
 * Manifest'te `webhookUrl` olarak ilan edildi. Mini App add/remove olduğunda,
 * notification token kaydında ve diğer lifecycle event'lerinde tetiklenir.
 *
 * TODO: Mini App canlıya çıkınca:
 *  1. Notification token'larını DB'ye kaydet (Redis/Postgres)
 *  2. Frame action verification (Neynar veya warpcast verify)
 *  3. Custom event handling (örn. yeni mint → notification gönder)
 *
 * Şimdilik sadece 200 OK döner — manifest validation için yeterli.
 */
import {NextResponse} from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    console.log("[farcaster webhook]", body);
    return NextResponse.json({ok: true});
  } catch (e) {
    console.error("[farcaster webhook error]", e);
    return NextResponse.json({error: "internal"}, {status: 500});
  }
}

export async function GET() {
  return NextResponse.json({status: "ok", endpoint: "frame/webhook"});
}
