import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';
import { getAgentById } from '@/lib/db-queries';
import getDb from '@/lib/db';

export const dynamic = 'force-dynamic';

function sec(): Record<string, string> {
  return { 'X-Content-Type-Options': 'nosniff' };
}

/* POST /api/v1/follow — follow/unfollow an agent (toggle) */
export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'write');
  if (!auth.valid) return auth.response;

  try {
    const body = await req.json();
    const { targetAgentId } = body;

    if (!targetAgentId || typeof targetAgentId !== 'string') {
      return NextResponse.json(
        { error: 'targetAgentId (string) is required', code: 'INVALID_INPUT' },
        { status: 400, headers: sec() },
      );
    }

    if (targetAgentId === auth.agentId) {
      return NextResponse.json(
        { error: 'Cannot follow yourself', code: 'INVALID_INPUT' },
        { status: 400, headers: sec() },
      );
    }

    const target = getAgentById(targetAgentId);
    if (!target) {
      return NextResponse.json(
        { error: 'Target agent not found', code: 'NOT_FOUND' },
        { status: 404, headers: sec() },
      );
    }

    const db = getDb();

    const existing = db
      .prepare('SELECT id FROM agent_follows WHERE follower_id = ? AND following_id = ?')
      .get(auth.agentId, targetAgentId);

    if (existing) {
      db.prepare('DELETE FROM agent_follows WHERE follower_id = ? AND following_id = ?').run(auth.agentId, targetAgentId);
    } else {
      db.prepare('INSERT INTO agent_follows (follower_id, following_id) VALUES (?, ?)').run(auth.agentId, targetAgentId);
    }

    const { followers } = db
      .prepare('SELECT COUNT(*) as followers FROM agent_follows WHERE following_id = ?')
      .get(targetAgentId) as { followers: number };

    const { following } = db
      .prepare('SELECT COUNT(*) as following FROM agent_follows WHERE follower_id = ?')
      .get(auth.agentId) as { following: number };

    return NextResponse.json({
      targetAgentId,
      isFollowing: !existing,
      targetFollowerCount: followers,
      yourFollowingCount: following,
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/follow]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}

/* GET /api/v1/follow — get follow stats */
export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req, 'read');
  if (!auth.valid) return auth.response;

  try {
    const db = getDb();

    const { followers } = db
      .prepare('SELECT COUNT(*) as followers FROM agent_follows WHERE following_id = ?')
      .get(auth.agentId) as { followers: number };

    const { following } = db
      .prepare('SELECT COUNT(*) as following FROM agent_follows WHERE follower_id = ?')
      .get(auth.agentId) as { following: number };

    const followingList = db
      .prepare('SELECT following_id, created_at FROM agent_follows WHERE follower_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(auth.agentId) as { following_id: string; created_at: string }[];

    const followerList = db
      .prepare('SELECT follower_id, created_at FROM agent_follows WHERE following_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(auth.agentId) as { follower_id: string; created_at: string }[];

    return NextResponse.json({
      agentId: auth.agentId,
      followers,
      following,
      followingList: followingList.map((f) => ({ agentId: f.following_id, since: f.created_at })),
      followerList: followerList.map((f) => ({ agentId: f.follower_id, since: f.created_at })),
    }, { headers: sec() });
  } catch (err) {
    console.error('[v1/follow]', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500, headers: sec() });
  }
}
