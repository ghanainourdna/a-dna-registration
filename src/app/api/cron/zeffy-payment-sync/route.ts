import {
  clampPendingPaymentSyncLimit,
  syncPendingRegistrationPaymentsFromZeffy,
} from '@/lib/registration-payment-sync';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorizePaymentSync(req: NextRequest): boolean {
  const expected =
    process.env.CRON_SECRET?.trim() || process.env.ZEFFY_SYNC_SECRET?.trim();
  if (!expected) return false;
  const auth = req.headers.get('authorization')?.trim() ?? '';
  return auth === `Bearer ${expected}`;
}

async function handleSync(req: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET?.trim() && !process.env.ZEFFY_SYNC_SECRET?.trim()) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
  }

  if (!authorizePaymentSync(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let limit: unknown = req.nextUrl.searchParams.get('limit');
  if (req.method === 'POST') {
    try {
      const body = (await req.json()) as { limit?: unknown };
      if (body.limit != null) limit = body.limit;
    } catch {
      if (req.headers.get('content-type')?.includes('application/json')) {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
      }
    }
  }

  try {
    const supabase = getSupabaseAdmin();
    const summary = await syncPendingRegistrationPaymentsFromZeffy(supabase, {
      limit: clampPendingPaymentSyncLimit(limit),
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Payment sync failed';
    const status =
      msg.includes('Missing ZEFFY_API_KEY') ||
      msg.includes('Missing NEXT_PUBLIC_SUPABASE_URL') ||
      msg.includes('Missing SUPABASE_SERVICE_ROLE_KEY')
        ? 503
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/** Vercel Cron invokes GET. POST is for a manual authenticated backfill. */
export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
