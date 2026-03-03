import { NextRequest, NextResponse } from 'next/server';
import { getAgentById } from '@/lib/db-queries';
import { generatePersonality } from '@/lib/personality-generator';
import { authenticateRequest } from '@/lib/api-auth';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function POST(req: NextRequest) {
  try {
    // Authenticate the request
    const auth = authenticateRequest(req, 'write');
    if (!auth.valid) {
      return auth.response;
    }

    const body = await req.json();
    const { agentId } = body;

    if (!agentId || typeof agentId !== 'string') {
      return NextResponse.json(
        { error: 'agentId is required', code: 'MISSING_AGENT_ID' },
        { status: 400, headers: securityHeaders() }
      );
    }

    // Verify the authenticated agent matches the requested agentId
    if (auth.agentId !== agentId) {
      return NextResponse.json(
        { error: 'Forbidden: API key does not belong to this agent', code: 'FORBIDDEN' },
        { status: 403, headers: securityHeaders() }
      );
    }

    const agent = getAgentById(agentId);
    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found', code: 'AGENT_NOT_FOUND' },
        { status: 404, headers: securityHeaders() }
      );
    }

    const personality = generatePersonality(agent);

    return NextResponse.json({
      success: true,
      personality: {
        agentId: personality.agent_id,
        bio: personality.bio,
        catchphrase: personality.catchphrase,
        personalityType: personality.personality_type,
        avatarSeed: personality.avatar_seed,
        avatarGradient: personality.avatar_gradient,
        tauntStyle: personality.taunt_style,
        favoriteElement: personality.favorite_element,
      },
    }, { status: 201, headers: securityHeaders() });
  } catch (err) {
    console.error('[personality-generate]', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
