import { zeffyFetchJson } from '@/lib/zeffy-client';

import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

function authorized(req: NextRequest): boolean {
  const expected =
    process.env.CRON_SECRET?.trim() || process.env.ZEFFY_SYNC_SECRET?.trim();
  if (!expected) return false;
  const auth = req.headers.get('authorization')?.trim() ?? '';
  return auth === `Bearer ${expected}`;
}

type CampaignRow = { id?: string; title?: string; type?: string };

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.ZEFFY_API_KEY?.trim()) {
    return NextResponse.json({ error: 'Missing ZEFFY_API_KEY' }, { status: 503 });
  }

  try {
    const campaigns: CampaignRow[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const search = cursor ? { cursor } : undefined;
      const env = await zeffyFetchJson('/campaigns', search);
      const row = env as { data?: CampaignRow[]; has_more?: boolean; next_cursor?: string | null };
      for (const c of row.data ?? []) {
        campaigns.push({ id: c.id, title: c.title, type: c.type });
      }
      if (!row.has_more && !row.next_cursor) break;
      cursor = row.next_cursor ?? undefined;
    }
    return NextResponse.json({ campaigns });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Zeffy API request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
