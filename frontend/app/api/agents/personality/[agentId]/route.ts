import { NextRequest, NextResponse } from 'next/server';
import { getPersonality, getAgentById } from '@/lib/db-queries';
import { generatePersonality } from '@/lib/personality-generator';

function securityHeaders(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const { agentId } = params;
    const agent = getAgentById(agentId);

    if (!agent) {
      return NextResponse.json(
        { error: 'Agent not found', code: 'AGENT_NOT_FOUND' },
        { status: 404, headers: securityHeaders() }
      );
    }

    // Generate if doesn't exist
    let personality = getPersonality(agentId);
    if (!personality) {
      personality = generatePersonality(agent);
    }

    return NextResponse.json({
      personality: {
        agentId: personality.agent_id,
        bio: personality.bio,
        catchphrase: personality.catchphrase,
        personalityType: personality.personality_type,
        avatarSeed: personality.avatar_seed,
        avatarGradient: personality.avatar_gradient,
        tauntStyle: personality.taunt_style,
        rivalAgentId: personality.rival_agent_id,
        favoriteElement: personality.favorite_element,
      },
    }, { headers: securityHeaders() });
  } catch (err) {
    console.error('[personality]', err);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500, headers: securityHeaders() }
    );
  }
}
