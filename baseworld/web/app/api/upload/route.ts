/**
 * POST /api/upload — görsel yükleme.
 *
 * İKİ BACKEND:
 *   - STORAGE=local  → VPS disk'ine yazar, public URL döner
 *   - STORAGE=pinata → IPFS Pinata, ipfs:// URI döner
 *   - default = local (Pinata daha pahalı + rate limit)
 *
 * NEDEN SERVER:
 *   PINATA_JWT ve MODERATION API anahtarları asla client bundle'a sızmamalı.
 *   Local backend için de SHA-256 hashlemek ve disk yazmak server-side gerek.
 *
 * Rate limit:
 *   - In-memory token bucket per-IP, 5/dk 20 burst (varsayılan).
 *   - Production'da Upstash Redis'e geçilebilir, aynı arayüz.
 *
 * Moderation:
 *   - MODERATION_PROVIDER=openai + OPENAI_API_KEY varsa: OpenAI omni-moderation
 *     pre-pin check. Flagged → 422.
 *   - Yoksa: skip + warning log.
 */
import {NextResponse} from "next/server";
import {createHash} from "node:crypto";
import {mkdir, writeFile} from "node:fs/promises";
import {join, extname} from "node:path";
import {consume, getRateLimitKey} from "@/lib/rateLimit";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED = new Map<string, string>([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);

const RATE_LIMIT = {capacity: 20, refillPerSec: 5 / 60}; // 5/dk, 20 burst

type StorageMode = "local" | "pinata";
const STORAGE: StorageMode =
  (process.env.STORAGE as StorageMode) ?? "local";

// Local backend yapılandırması
const LOCAL_UPLOAD_DIR =
  process.env.LOCAL_UPLOAD_DIR ?? "./public/uploads";
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";

export async function POST(req: Request) {
  // ----- rate limit -----
  const key = getRateLimitKey(req);
  const limit = consume(key, RATE_LIMIT);
  if (!limit.allowed) {
    return NextResponse.json(
      {error: "rate limited", retryAfter: limit.retryAfter},
      {status: 429, headers: {"Retry-After": String(limit.retryAfter ?? 60)}}
    );
  }

  // ----- parse + validate -----
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({error: "missing 'file' field"}, {status: 400});
  }
  const ext = ALLOWED.get(file.type);
  if (!ext) {
    return NextResponse.json({error: `unsupported type: ${file.type}`}, {status: 415});
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {error: `file too large (max ${MAX_BYTES} bytes)`},
      {status: 413}
    );
  }

  // ----- moderation (opsiyonel) -----
  const moderation = await runModeration(file);
  if (moderation.flagged) {
    return NextResponse.json(
      {error: "content flagged by moderation", categories: moderation.categories},
      {status: 422}
    );
  }

  // ----- backend switch -----
  if (STORAGE === "pinata") {
    return await uploadToPinata(file);
  }
  return await uploadToLocal(file, ext);
}

// ----- backends -----

async function uploadToLocal(file: File, ext: string): Promise<NextResponse> {
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex");
  const filename = hash + ext;
  const dir = LOCAL_UPLOAD_DIR;
  try {
    await mkdir(dir, {recursive: true});
    await writeFile(join(dir, filename), buf);
  } catch (e) {
    console.error("[upload local] write failed", e);
    return NextResponse.json({error: "disk write failed"}, {status: 500});
  }
  // public URL — frontend setPixelImage'a bu URI'yi yazar
  const uri = `${PUBLIC_BASE_URL.replace(/\/$/, "")}/uploads/${filename}`;
  return NextResponse.json({uri, storage: "local", hash});
}

async function uploadToPinata(file: File): Promise<NextResponse> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json({error: "PINATA_JWT not configured"}, {status: 503});
  }
  const upstream = new FormData();
  upstream.append("file", file, file.name);
  upstream.append(
    "pinataMetadata",
    JSON.stringify({name: `pixel-${Date.now()}-${file.name}`})
  );
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: {Authorization: `Bearer ${jwt}`},
    body: upstream,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({error: "pinata pin failed", detail}, {status: 502});
  }
  const json = (await res.json()) as {IpfsHash: string};
  return NextResponse.json({uri: `ipfs://${json.IpfsHash}`, storage: "pinata"});
}

// ----- moderation impl -----
type ModerationResult = {flagged: boolean; categories?: string[]};

async function runModeration(file: File): Promise<ModerationResult> {
  const provider = process.env.MODERATION_PROVIDER;
  if (provider !== "openai") {
    if (process.env.NODE_ENV === "production") {
      console.warn("[moderation] no provider configured, skipping check");
    }
    return {flagged: false};
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn("[moderation] OPENAI_API_KEY missing, skipping check");
    return {flagged: false};
  }
  try {
    const bytes = await file.arrayBuffer();
    const b64 = Buffer.from(bytes).toString("base64");
    const dataUrl = `data:${file.type};base64,${b64}`;
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: {Authorization: `Bearer ${key}`, "Content-Type": "application/json"},
      body: JSON.stringify({
        model: "omni-moderation-latest",
        input: [{type: "image_url", image_url: {url: dataUrl}}],
      }),
    });
    if (!res.ok) {
      console.warn("[moderation] openai error", res.status, await res.text());
      return {flagged: false};
    }
    const j = (await res.json()) as {
      results: Array<{flagged: boolean; categories: Record<string, boolean>}>;
    };
    const r = j.results?.[0];
    if (!r) return {flagged: false};
    const flagged = Object.entries(r.categories ?? {})
      .filter(([, v]) => v)
      .map(([k]) => k);
    return {flagged: r.flagged, categories: flagged};
  } catch (e) {
    console.warn("[moderation] error", e);
    return {flagged: false};
  }
}
