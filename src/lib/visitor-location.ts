import { isAfricanCountryCode } from '@/lib/countries/africa';

export type CheckoutRegion = 'africa' | 'other';

const HEADER_KEYS = [
  'x-vercel-ip-country',
  'cf-ipcountry',
  'x-country-code',
  'x-appengine-country',
] as const;

/** Common IANA zones → ISO country, used when edge geo headers are missing (local dev). */
const TIME_ZONE_COUNTRY: Record<string, string> = {
  'Africa/Accra': 'GH',
  'Africa/Abidjan': 'CI',
  'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE',
  'Africa/Johannesburg': 'ZA',
  'Africa/Cairo': 'EG',
  'Africa/Casablanca': 'MA',
  'Africa/Algiers': 'DZ',
  'Africa/Tunis': 'TN',
  'Africa/Addis_Ababa': 'ET',
  'Africa/Kampala': 'UG',
  'Africa/Dar_es_Salaam': 'TZ',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'Europe/London': 'GB',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
};

export function normalizeCountryCode(raw: string | null | undefined): string | null {
  const code = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return null;
  return code;
}

export function checkoutRegionForCountry(
  countryCode: string | null | undefined,
): CheckoutRegion | null {
  const code = normalizeCountryCode(countryCode);
  if (!code) return null;
  return isAfricanCountryCode(code) ? 'africa' : 'other';
}

export function detectVisitorCountryFromHeaders(
  headerGet: Pick<Headers, 'get'> | { get(name: string): string | null },
): string | null {
  const fromEnv = normalizeCountryCode(process.env.NEXT_PUBLIC_DEV_VISITOR_COUNTRY);
  if (fromEnv) return fromEnv;

  for (const key of HEADER_KEYS) {
    const code = normalizeCountryCode(headerGet.get(key));
    if (code) return code;
  }
  return null;
}

const IP_HEADER_KEYS = ['x-real-ip', 'cf-connecting-ip', 'x-forwarded-for'] as const;

export function isPublicIpAddress(raw: string | null | undefined): boolean {
  const ip = String(raw ?? '')
    .trim()
    .replace(/^\[|\]$/g, '');
  if (!ip) return false;
  if (ip === '::1' || ip === '0.0.0.0') return false;
  if (
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.')
  ) {
    return false;
  }
  const private172 = /^172\.(\d+)\./.exec(ip);
  if (private172) {
    const second = Number(private172[1]);
    if (second >= 16 && second <= 31) return false;
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:')) {
    return false;
  }
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.includes(':');
}

export function publicClientIpFromHeaders(
  headerGet: Pick<Headers, 'get'> | { get(name: string): string | null },
): string | null {
  for (const key of IP_HEADER_KEYS) {
    const first = String(headerGet.get(key) ?? '')
      .split(',')[0]
      ?.trim();
    if (isPublicIpAddress(first)) return first;
  }
  return null;
}

type PublicIpCountryCache = {
  key: string;
  country: string | null;
  expiresAt: number;
};

let publicIpCountryCache: PublicIpCountryCache | null = null;

export function resetPublicIpCountryCache() {
  publicIpCountryCache = null;
}

export async function lookupCountryFromPublicIp(
  ip?: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const key = ip && isPublicIpAddress(ip) ? ip : 'self';
  const now = Date.now();
  if (publicIpCountryCache && publicIpCountryCache.key === key && publicIpCountryCache.expiresAt > now) {
    return publicIpCountryCache.country;
  }

  const path = key === 'self' ? 'https://api.country.is/' : `https://api.country.is/${encodeURIComponent(key)}`;
  try {
    const response = await fetchImpl(path, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { country?: unknown };
    const country = normalizeCountryCode(typeof body.country === 'string' ? body.country : null);
    publicIpCountryCache = { key, country, expiresAt: now + 60_000 };
    return country;
  } catch {
    return null;
  }
}

export async function detectVisitorCountry(
  headerGet: Pick<Headers, 'get'> | { get(name: string): string | null },
): Promise<string | null> {
  const fromHeaders = detectVisitorCountryFromHeaders(headerGet);
  if (fromHeaders) return fromHeaders;
  if (process.env.E2E_FIXTURE_COUNTRIES === '1') return null;

  const clientIp = publicClientIpFromHeaders(headerGet);
  if (clientIp) return lookupCountryFromPublicIp(clientIp);

  // Vercel already sends country headers. Looking up without an IP would
  // geolocate the serverless region, not the visitor.
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    return null;
  }
  return lookupCountryFromPublicIp(null);
}

export function guessCountryFromTimeZone(timeZone: string | null | undefined): string | null {
  const tz = String(timeZone ?? '').trim();
  if (!tz) return null;
  const mapped = TIME_ZONE_COUNTRY[tz];
  if (mapped) return mapped;
  if (tz.startsWith('Africa/')) return null;
  return null;
}

export function guessRegionFromTimeZone(timeZone: string | null | undefined): CheckoutRegion | null {
  const country = guessCountryFromTimeZone(timeZone);
  if (country) return checkoutRegionForCountry(country);
  const tz = String(timeZone ?? '').trim();
  if (tz.startsWith('Africa/')) return 'africa';
  if (tz.includes('/')) return 'other';
  return null;
}

export function countryListScopeForVisitor(opts: {
  detectedCountry?: string | null;
  conferenceWorldCountry: 'africa' | 'all';
}): 'africa' | 'all' {
  const region = checkoutRegionForCountry(opts.detectedCountry);
  if (region === 'africa') return 'africa';
  if (region === 'other') return 'all';
  return opts.conferenceWorldCountry;
}
