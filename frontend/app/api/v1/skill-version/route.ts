import { NextResponse } from 'next/server';

const SKILL_VERSION = '1.1.0';
const LAST_UPDATED = '2026-03-02';

export async function GET() {
  return NextResponse.json({
    version: SKILL_VERSION,
    lastUpdated: LAST_UPDATED,
    skillUrl: 'https://frostbite.pro/skill.md',
    heartbeatUrl: 'https://frostbite.pro/heartbeat.md',
    docsUrl: 'https://frostbite.pro/docs',
    changelog: [
      { version: '1.1.0', date: '2026-03-02', changes: ['Added /balance endpoint', 'Added /notifications endpoint', 'Added /skill-version endpoint', 'Added heartbeat.md', 'Added Moltbook registration integration'] },
      { version: '1.0.0', date: '2026-02-28', changes: ['Initial API release', 'Challenge + Register flow', 'Read/Write endpoints', 'Auto-battle AI loop'] },
    ],
  }, { headers: { 'X-Content-Type-Options': 'nosniff' } });
}
