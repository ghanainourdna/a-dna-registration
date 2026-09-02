import { InvalidConferenceError } from '@/lib/errors';
import { createClient } from '@supabase/supabase-js';

export const DEFAULT_CONFERENCE_SLUG = 'ghana-2027';

export type ConferenceWorldCountry = 'africa' | 'all';

export type Conference = {
  id: string | null;
  slug: string;
  title: string;
  tagline: string;
  theme: string;
  dates_label: string;
  location_label: string;
  reception_label: string;
  zeffy_checkout_url: string | null;
  world_country: ConferenceWorldCountry;
  is_active: boolean;
};

export function normalizeWorldCountry(
  raw: string | null | undefined,
): ConferenceWorldCountry {
  return raw?.trim().toLowerCase() === 'africa' ? 'africa' : 'all';
}

export const USA_2026_CONFERENCE_SLUG = 'usa-2026';
export const GHANA_2027_CONFERENCE_SLUG = 'ghana-2027';

/** Used when the conferences table is not migrated yet, or for E2E without Supabase. */
export const DEFAULT_USA_2026_CONFERENCE: Conference = {
  id: null,
  slug: USA_2026_CONFERENCE_SLUG,
  title: 'A-DNA Global Conference USA 2026',
  tagline: 'Voices of Change: Translating Innovation into Action for Global Health',
  theme: '',
  dates_label: 'August 21–22, 2026',
  location_label: 'Johns Hopkins Medical Campus · Baltimore, MD',
  reception_label: 'Reception · Aug 22, 6:00 PM',
  zeffy_checkout_url: null,
  world_country: 'all',
  is_active: true,
};

export const DEFAULT_GHANA_2027_CONFERENCE: Conference = {
  id: null,
  slug: GHANA_2027_CONFERENCE_SLUG,
  title: 'A-DNA Ghana Conference 2027',
  tagline: 'The Future Of African HealthCare',
  theme: 'Diaspora Partnership for sustainable Impact',
  dates_label: '7–9 January 2027',
  location_label: 'Kofi Ohene-Konadu Auditorium, UPSA, Accra, Ghana',
  reception_label: '',
  zeffy_checkout_url: null,
  world_country: 'africa',
  is_active: true,
};

const FALLBACK_CONFERENCES: Record<string, Conference> = {
  [USA_2026_CONFERENCE_SLUG]: DEFAULT_USA_2026_CONFERENCE,
  [GHANA_2027_CONFERENCE_SLUG]: DEFAULT_GHANA_2027_CONFERENCE,
};

function fallbackConference(slug: string): Conference | null {
  return FALLBACK_CONFERENCES[slug] ?? null;
}

export function normalizeConferenceSlug(raw: string | null | undefined): string {
  const slug = raw?.trim().toLowerCase() ?? '';
  return slug || DEFAULT_CONFERENCE_SLUG;
}

export function isReservedRegisterSlug(slug: string): boolean {
  return slug === 'success' || slug === 'failed';
}

function createCatalogClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapConferenceRow(row: {
  id?: string;
  slug: string;
  title: string;
  tagline?: string | null;
  theme?: string | null;
  dates_label: string;
  location_label: string;
  reception_label?: string | null;
  zeffy_checkout_url?: string | null;
  world_country?: string | null;
  is_active?: boolean;
}): Conference {
  return {
    id: row.id ?? null,
    slug: row.slug,
    title: row.title,
    tagline: row.tagline?.trim() || '',
    theme: row.theme?.trim() || '',
    dates_label: row.dates_label,
    location_label: row.location_label,
    reception_label: row.reception_label?.trim() || '',
    zeffy_checkout_url: row.zeffy_checkout_url?.trim() || null,
    world_country: normalizeWorldCountry(row.world_country),
    is_active: row.is_active !== false,
  };
}

/**
 * Public catalog read for the registration page.
 * Falls back to hardcoded conference copy when the table is missing or empty.
 */
export async function fetchConferenceBySlug(slugInput?: string | null): Promise<Conference | null> {
  const slug = normalizeConferenceSlug(slugInput);
  if (isReservedRegisterSlug(slug)) return null;

  if (process.env.E2E_FIXTURE_COUNTRIES === '1') {
    return fallbackConference(slug);
  }

  try {
    const supabase = createCatalogClient();
    if (!supabase) {
      return fallbackConference(slug);
    }

    const { data, error } = await supabase
      .from('conferences')
      .select(
        'id,slug,title,tagline,theme,dates_label,location_label,reception_label,zeffy_checkout_url,world_country,is_active',
      )
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('[conferences] fetch failed:', error.message);
      return fallbackConference(slug);
    }

    if (!data) {
      return fallbackConference(slug);
    }

    return mapConferenceRow(data);
  } catch (e) {
    console.error('[conferences]', e);
    return fallbackConference(slug);
  }
}

export async function requireConferenceBySlug(
  supabase: { from: ReturnType<typeof createClient>['from'] },
  slugInput?: string | null,
): Promise<{ id: string; conference: Conference }> {
  const slug = normalizeConferenceSlug(slugInput);
  const { data, error } = await supabase
    .from('conferences')
    .select(
      'id,slug,title,tagline,theme,dates_label,location_label,reception_label,zeffy_checkout_url,world_country,is_active',
    )
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data?.id) {
    throw new InvalidConferenceError();
  }

  return { id: data.id as string, conference: mapConferenceRow(data) };
}

export { InvalidConferenceError };
