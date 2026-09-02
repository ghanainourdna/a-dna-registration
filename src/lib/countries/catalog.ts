import { AFRICAN_COUNTRIES } from '@/lib/countries/africa';
import { createClient } from '@supabase/supabase-js';

export type CountryOption = {
  code: string;
  name: string;
};

const AFRICAN_COUNTRY_OPTIONS: CountryOption[] = AFRICAN_COUNTRIES.map((country) => ({
  code: country.code,
  name: country.name,
}));

/** Deterministic list for Playwright E2E (`E2E_FIXTURE_COUNTRIES=1` on the Next.js server). */
const E2E_COUNTRY_OPTIONS: CountryOption[] = [
  ...AFRICAN_COUNTRY_OPTIONS,
  { code: 'US', name: 'United States of America' },
];

/** Client for catalog reads: prefers anon (public SELECT); service role is fallback only. */
function createCountriesSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  // Prefer anon so a stale/wrong service role key never breaks the country list.
  const key = anonKey || serviceKey;
  if (!key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let loggedMissingSupabaseEnv = false;

/** ISO 3166-1 alpha-2 list from `public.countries` (sorted by name). */
export async function fetchCountriesCatalog(): Promise<CountryOption[]> {
  if (process.env.E2E_FIXTURE_COUNTRIES === '1') {
    return E2E_COUNTRY_OPTIONS;
  }

  try {
    const supabase = createCountriesSupabaseClient();
    if (!supabase) {
      if (!loggedMissingSupabaseEnv) {
        loggedMissingSupabaseEnv = true;
        console.warn(
          '[countries] no Supabase env; using African country fallback. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for the full catalog.',
        );
      }
      return AFRICAN_COUNTRY_OPTIONS;
    }
    const { data, error } = await supabase
      .from('countries')
      .select('code,name')
      .order('name', { ascending: true });
    if (error) {
      console.error('[countries] fetch failed:', error.message);
      return AFRICAN_COUNTRY_OPTIONS;
    }
    const rows = (data ?? []) as { code: string; name: string }[];
    const catalog = rows
      .map((row) => ({
        code: String(row.code ?? '')
          .trim()
          .toUpperCase(),
        name: row.name ?? '',
      }))
      .filter((row) => row.code && row.name);
    return catalog.length > 0 ? catalog : AFRICAN_COUNTRY_OPTIONS;
  } catch (e) {
    console.error('[countries]', e);
    return AFRICAN_COUNTRY_OPTIONS;
  }
}
