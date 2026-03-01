import { NextRequest, NextResponse } from 'next/server';
import { generateWarriorImage, pollInferenceStatus } from '@/lib/layer-ai';
import { buildWarriorPrompt } from '@/lib/warrior-prompts';
import { imageCache } from '@/lib/image-cache';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

export async function POST(request: NextRequest) {
  // Rate limiting (SQLite-backed, 2/min per IP)
  const ip = getClientIp(request);
  const rateCheck = checkRateLimit(`metagen:${ip}`, 2, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.', retryAfterMs: rateCheck.resetMs },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rateCheck.resetMs / 1000)) } }
    );
  }

  // Validate Content-Type
  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 }
    );
  }

  // Referer check for same-origin requests
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');
  if (referer && host && !referer.includes(host)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    );
  }

  let body: {
    tokenId: number;
    element: number;
    attack: number;
    defense: number;
    speed: number;
    specialPower: number;
    level: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate required fields
  const { tokenId, element, attack, defense, speed, specialPower, level } = body;

  if (
    typeof tokenId !== 'number' || tokenId < 0 ||
    typeof element !== 'number' || element < 0 || element > 7 ||
    typeof attack !== 'number' || attack < 1 || attack > 100 ||
    typeof defense !== 'number' || defense < 1 || defense > 100 ||
    typeof speed !== 'number' || speed < 1 || speed > 100 ||
    typeof specialPower !== 'number' || specialPower < 1 || specialPower > 50 ||
    typeof level !== 'number' || level < 1
  ) {
    return NextResponse.json({ error: 'Invalid warrior parameters' }, { status: 400 });
  }

  // Check if already generated
  const cached = imageCache.get(tokenId);
  if (cached) {
    return NextResponse.json({
      tokenId,
      imageUrl: cached,
      status: 'cached',
    });
  }

  // Check if Layer.ai API key is configured
  if (!process.env.LAYER_AI_API_KEY) {
    return NextResponse.json(
      { error: 'Image generation not configured', tokenId, status: 'unavailable' },
      { status: 503 }
    );
  }

  try {
    // Build the prompt
    const prompt = buildWarriorPrompt({
      element,
      attack,
      defense,
      speed,
      specialPower,
      level,
      tokenId,
    });

    // Call Layer.ai API
    const result = await generateWarriorImage(prompt);

    let imageUrl = result.imageUrl;

    // If no image URL yet, poll for completion
    if (!imageUrl && result.id) {
      imageUrl = await pollInferenceStatus(result.id);
    }

    if (imageUrl) {
      // Cache the result
      imageCache.set(tokenId, imageUrl);

      return NextResponse.json({
        tokenId,
        imageUrl,
        status: 'generated',
        inferenceId: result.id,
      });
    }

    return NextResponse.json({
      tokenId,
      status: 'pending',
      inferenceId: result.id,
    });
  } catch (error) {
    console.error('[generate]', error instanceof Error ? error.message : error);

    return NextResponse.json(
      { error: 'Image generation failed', tokenId },
      { status: 500 }
    );
  }
}
