import { NextRequest, NextResponse } from 'next/server';
import { generateWarriorImage, pollInferenceStatus } from '@/lib/layer-ai';
import { buildWarriorPrompt } from '@/lib/warrior-prompts';
import { imageCache } from '@/lib/image-cache';

// Rate limiting: track recent generation requests
const recentRequests = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5; // max 5 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const key = `gen:${ip}`;
  const count = recentRequests.get(key) ?? 0;

  // Clean old entries periodically
  if (recentRequests.size > 1000) {
    recentRequests.clear();
  }

  if (count >= RATE_LIMIT_MAX) {
    return false;
  }

  recentRequests.set(key, count + 1);
  setTimeout(() => {
    const current = recentRequests.get(key) ?? 0;
    if (current <= 1) {
      recentRequests.delete(key);
    } else {
      recentRequests.set(key, current - 1);
    }
  }, RATE_LIMIT_WINDOW);

  return true;
}

export async function POST(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 }
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[generate] Failed for token ${tokenId}:`, message);

    return NextResponse.json(
      { error: 'Image generation failed', details: message, tokenId },
      { status: 500 }
    );
  }
}
