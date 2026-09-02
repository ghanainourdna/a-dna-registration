/**
 * Minimal Zeffy REST client (Bearer API key).
 * @see https://support.zeffy.com/get-started-with-the-zeffy-api
 */

const ZEFFY_API_BASE = 'https://api.zeffy.com/api/v1';

function requireApiKey(): string {
  const k = process.env.ZEFFY_API_KEY?.trim();
  if (!k) throw new Error('Missing ZEFFY_API_KEY');
  return k;
}

export async function zeffyFetchJson(path: string, search?: Record<string, string>): Promise<unknown> {
  const key = requireApiKey();
  const url = new URL(`${ZEFFY_API_BASE}${path.startsWith('/') ? path : `/${path}`}`);
  if (search) {
    for (const [qk, qv] of Object.entries(search)) {
      url.searchParams.set(qk, qv);
    }
  }
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Zeffy API returned invalid JSON');
  }

  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'message' in json ? String((json as { message: unknown }).message) : text;
    throw new Error(msg || `Zeffy API error (${res.status})`);
  }

  return json;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/** Collect plausible email-shaped strings nested in a payment-like object */
export function extractEmailsDeep(root: unknown, into: Set<string>) {
  const walk = (v: unknown) => {
    if (v == null) return;
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (t.includes('@') && t.length < 254) into.add(t);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (typeof v !== 'object') return;
    for (const x of Object.values(v)) walk(x);
  };
  walk(root);
}

function pickStringDeep(obj: Record<string, unknown>, keys: string[]): string | null {
  const stack: unknown[] = [obj];
  while (stack.length) {
    const cur = stack.pop();
    const r = asRecord(cur);
    if (!r) continue;
    for (const k of keys) {
      const val = r[k];
      if (typeof val === 'string' && val.trim()) return val.trim();
      if (typeof val === 'number' && Number.isFinite(val)) return String(Math.trunc(val));
    }
    for (const v of Object.values(r)) {
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return null;
}

/** Normalize Zeffy payment objects to cents (USD prefers integer cents when available). */
export function coerceZeffyPaymentShape(payment: Record<string, unknown>): {
  id: string;
  status: string;
  currencyLower: string;
  amountCents: number | null;
} | null {
  const idRaw =
    pickStringDeep(payment, ['id', 'payment_id']) ??
    (typeof payment.id === 'string' ? payment.id : typeof payment.payment_id === 'string' ? payment.payment_id : null);
  const id = idRaw?.trim();
  if (!id) return null;

  const statusRaw = pickStringDeep(payment, ['status']);
  const status = (statusRaw ?? 'unknown').toLowerCase();

  const currencyRaw =
    pickStringDeep(payment, ['currency']) ?? pickStringDeep(payment, ['currency_code']) ?? 'usd';
  const currencyLower = currencyRaw.toLowerCase();

  const amountHints = ['amount_total', 'total', 'amount', 'net_amount', 'total_amount'] as const;
  let cents: number | null = null;
  for (const k of amountHints) {
    const raw = payment[k];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      cents = coerceToUsdCents(raw, currencyLower);
      if (cents != null) break;
    }
    if (typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
      cents = coerceToUsdCents(Number.parseFloat(raw.trim()), currencyLower);
      if (cents != null) break;
    }
  }

  return { id, status, currencyLower, amountCents: cents };
}

function coerceToUsdCents(amount: number, currencyLower: string): number | null {
  if (currencyLower !== 'usd') {
    /** Non-USD: still treat magnitude as fractional major units × 100 (best-effort). */
    if (!Number.isFinite(amount)) return null;
    return Math.round(amount * 100);
  }
  /** Heuristic: Zeffy may return dollars as float or cents as integers */
  const abs = Math.abs(amount);
  if (abs >= 10_000_000 || !Number.isFinite(amount)) return null;
  if (Number.isInteger(amount) && Number.isFinite(amount)) {
    if (amount > 250_000) return Math.round(amount);
    return Math.round(amount * 100);
  }
  return Math.round(amount * 100);
}

function unwrapDataArray(envelope: unknown): unknown[] {
  const r = asRecord(envelope);
  if (!r) return [];

  const tryKeys = ['data', 'payments', 'items', 'results'] as const;
  for (const k of tryKeys) {
    const v = r[k];
    if (Array.isArray(v)) return v;
  }

  /** Some APIs wrap as { data: { data: [] } } */
  const inner = r.data;
  if (inner && typeof inner === 'object' && Array.isArray((inner as { data?: unknown }).data)) {
    return (inner as { data: unknown[] }).data;
  }

  return Array.isArray(envelope) ? (envelope as unknown[]) : [];
}

function coerceCursorEnvelope(envelope: unknown): {
  items: unknown[];
  nextCursor?: string | null;
  hasMore?: boolean;
} {
  const r = asRecord(envelope);
  const items = unwrapDataArray(envelope);
  let nextCursor: string | undefined;
  let hasMore: boolean | undefined;

  const pickFrom = asRecord(r?.pagination) ?? asRecord(r?.meta) ?? r ?? undefined;
  if (pickFrom) {
    const nc = pickFrom.next_cursor ?? pickFrom.nextCursor ?? pickFrom.starting_after;
    if (typeof nc === 'string') nextCursor = nc;
    if (typeof pickFrom.has_more === 'boolean') hasMore = pickFrom.has_more;
    if (typeof pickFrom.hasMore === 'boolean') hasMore = pickFrom.hasMore;
  }

  return { items, nextCursor: nextCursor ?? null, hasMore };
}

export type ZeffyPaymentListScope = {
  campaignId?: string | null;
  createdGteUnix?: number;
};

function addPaymentScopeFilters(
  filters: Record<string, string>,
  scope: ZeffyPaymentListScope,
): void {
  const campaignId = scope.campaignId?.trim();
  if (campaignId) {
    filters.campaign = campaignId;
  }
  if (typeof scope.createdGteUnix === 'number' && Number.isFinite(scope.createdGteUnix)) {
    filters['created[gte]'] = String(Math.max(0, Math.trunc(scope.createdGteUnix)));
  }
}

export async function zeffyListRecentSucceededUsdPayments(
  scope: ZeffyPaymentListScope = {},
  limitPages = 8,
): Promise<Record<string, unknown>[]> {
  const collected: Record<string, unknown>[] = [];

  /** Try contact-scoped pagination first returns nothing - caller may filter broadly */
  const baseFilters: Record<string, string> = {
    currency: 'usd',
    status: 'succeeded',
    limit: '100',
  };
  addPaymentScopeFilters(baseFilters, scope);

  let cursor: string | undefined;

  for (let page = 0; page < limitPages; page++) {
    const search: Record<string, string> = { ...baseFilters };
    if (cursor) search.starting_after = cursor;

    const env = await zeffyFetchJson('/payments', search);
    const { items, nextCursor, hasMore } = coerceCursorEnvelope(env);

    for (const it of items) {
      const r = asRecord(it);
      if (r) collected.push(r);
    }

    if (!hasMore && !nextCursor) break;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return collected;
}

export async function zeffyFindContactIdByEmail(email: string): Promise<string | null> {
  const lower = email.trim().toLowerCase();
  /** Try likely query shapes documented as "Contacts support filtering by email" */
  const attempts: Record<string, string>[] = [
    { email: lower },
    { 'filter[email]': lower },
    { 'filter[email][eq]': lower },
    { q: lower },
    { query: lower },
  ];

  let successfulRequests = 0;
  let lastError: unknown;
  for (const qp of attempts) {
    try {
      const env = await zeffyFetchJson('/contacts', qp);
      successfulRequests += 1;
      const items = unwrapDataArray(env);
      for (const it of items) {
        const r = asRecord(it);
        if (!r) continue;
        const id = typeof r.id === 'string' ? r.id : typeof r.contact_id === 'string' ? r.contact_id : null;
        if (id?.trim()) return id.trim();

        /** Sometimes array of strings */
        const e = typeof r?.email === 'string' ? r.email.toLowerCase().trim() : '';
        if (e === lower && typeof r.id === 'string') return r.id.trim();
      }
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  if (successfulRequests === 0 && lastError) {
    throw lastError;
  }

  return null;
}

export async function zeffyListPaymentsForContact(
  contactId: string,
  scope: ZeffyPaymentListScope = {},
): Promise<Record<string, unknown>[]> {
  const collected: Record<string, unknown>[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 8; page++) {
    const search: Record<string, string> = {
      contact: contactId,
      currency: 'usd',
      status: 'succeeded',
      limit: '100',
    };
    addPaymentScopeFilters(search, scope);

    if (cursor) search.starting_after = cursor;

    const env = await zeffyFetchJson('/payments', search);
    const { items, nextCursor, hasMore } = coerceCursorEnvelope(env);

    for (const it of items) {
      const r = asRecord(it);
      if (r) collected.push(r);
    }

    if (!hasMore && !nextCursor) break;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return collected;
}

export type TrustedZeffyMatch = {
  paymentId: string;
  status: string;
  amountCents: number;
  currencyLower: string;
};

export async function trustedZeffyPaymentForPendingRegistration(opts: {
  email: string;
  expectedUsd: number;
  checkoutToken?: string | null;
  campaignId?: string | null;
  createdGteUnix?: number;
}): Promise<
  TrustedZeffyMatch | { notFoundReason: string } | { error: string }
> {
  const { centsFromUsd } = await import('@/lib/pricing');
  const expectedCents = centsFromUsd(opts.expectedUsd);
  if (expectedCents <= 0) return { error: 'Invalid registration total.' };

  const emailLower = opts.email.trim().toLowerCase();
  const tokenNeedle =
    opts.checkoutToken?.trim() && opts.checkoutToken.trim().length > 240
      ? opts.checkoutToken.trim().slice(0, 240)
      : opts.checkoutToken?.trim();

  try {
    const scope = {
      campaignId: opts.campaignId,
      createdGteUnix: opts.createdGteUnix,
    };
    const contactId = await zeffyFindContactIdByEmail(opts.email);

    /** Prefer payments scoped by Zeffy contact id (API filter). */
    const contactScoped =
      contactId !== null ? await zeffyListPaymentsForContact(contactId, scope) : [];

    /** Fall back to scanning recent succeeded USD payments when contact resolution fails */
    const recent =
      contactScoped.length === 0
        ? await zeffyListRecentSucceededUsdPayments(scope)
        : [];

    const candidates = contactScoped.length ? contactScoped : recent;
    const allowMissingEmailProof = contactScoped.length > 0;

    type Scored = { m: TrustedZeffyMatch; score: number };
    const scored: Scored[] = [];

    for (const row of candidates) {
      const coerced = coerceZeffyPaymentShape(row);
      if (!coerced || coerced.amountCents == null || coerced.status !== 'succeeded') continue;

      const emails = new Set<string>();
      extractEmailsDeep(row, emails);
      const emailOk = emails.size === 0 ? allowMissingEmailProof : emails.has(emailLower);

      if (!emailOk) continue;
      if (Math.round(coerced.amountCents) !== Math.round(expectedCents)) continue;

      let score = 1;
      if (emails.has(emailLower)) score += 2;
      const blob = JSON.stringify(row);
      if (tokenNeedle && blob.includes(tokenNeedle)) score += 100;

      scored.push({
        m: {
          paymentId: coerced.id,
          status: coerced.status,
          amountCents: Math.round(coerced.amountCents),
          currencyLower: coerced.currencyLower,
        },
        score,
      });
    }

    if (scored.length === 0) {
      return { notFoundReason: 'no_matching_payment_yet' };
    }

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0]!;
    if (scored.length > 1 && best.score === scored[1]!.score) {
      return { notFoundReason: 'ambiguous_payment_candidates' };
    }

    return best.m;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Zeffy API request failed.';
    return { error: msg };
  }
}

/**
 * Narrow payment object embedded in webhook body.
 */
export function extractWebhookPayment(body: Record<string, unknown>): Record<string, unknown> | null {
  const type = `${body.type ?? body.event ?? ''}`.toLowerCase();
  /** Support both hypothetical shapes without hard failure */
  if (type.includes('payment') || body.payment || body.data) {
    const direct = asRecord(body.payment);
    if (direct) return direct;

    const dataLayer = asRecord(body.data);
    if (dataLayer) {
      const p = asRecord(dataLayer.payment) ?? dataLayer;
      const hasId = !!(p?.id ?? p?.payment_id);
      if (hasId) return p;
    }
  }

  return null;
}
