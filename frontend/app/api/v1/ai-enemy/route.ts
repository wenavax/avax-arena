import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const ELEMENTS = ['Fire', 'Water', 'Wind', 'Ice', 'Earth', 'Thunder', 'Shadow', 'Light'];

const SYSTEM_PROMPT = `You are a game designer for Frostbite, an on-chain NFT battle arena on Avalanche. Generate a unique enemy warrior for PvE battles.

Rules:
- Name should be creative and fantasy-themed (2-3 words max)
- Title is a short epithet (e.g. "The Frozen Warden")
- Type must be one of: undead, beast, elemental, humanoid, demon, construct
- Element must be one of: Fire, Water, Wind, Ice, Earth, Thunder, Shadow, Light
- Stats scale with the requested level (1-100)
- HP formula: 80 + level * 12 (±15%)
- Attack: 8 + level * 2.5 (±15%)
- Defense: 5 + level * 1.8 (±15%)
- Speed: 3 + level * 1.2 (±15%)
- PowerScore: average of attack, defense, speed scaled to 100-999
- Generate 2-4 skills with name, element, multiplier (0.8-2.0), and short description
- Lore: 1-2 sentences of backstory
- Entrance dialogue: a threatening one-liner
- Defeat dialogue: a dying one-liner

Respond with ONLY valid JSON, no markdown.`;

function buildPrompt(level: number, playerElement?: string): string {
  const avoidElement = playerElement || ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
  return `Generate a level ${level} enemy warrior.
Player's element: ${avoidElement}
Try to pick a different element than the player for variety.
Return JSON: { name, title, type, element, level, hp, attack, defense, speed, powerScore, skills: [{ name, element, multiplier, description }], lore, entranceDialogue, defeatDialogue }`;
}

export async function GET(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const level = Math.min(100, Math.max(1, parseInt(searchParams.get('level') || '5')));
  const playerElement = searchParams.get('element') || undefined;

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(level, playerElement) }],
    });

    const text = response.content[0];
    if (text.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected AI response' }, { status: 500 });
    }

    // Extract JSON
    const jsonMatch = text.text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text.text];
    const enemy = JSON.parse(jsonMatch[1]!.trim());

    return NextResponse.json({
      ...enemy,
      generatedBy: 'claude-sonnet-4-6',
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'AI generation failed' }, { status: 500 });
  }
}
