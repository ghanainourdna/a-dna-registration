import { createClient } from '@supabase/supabase-js';

export type CountryOption = {
  code: string;
  name: string;
};

/** Client for catalog reads: prefers service role, falls back to anon (needs public/countries SELECT policy). */
function createCountriesSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const key = serviceKey || anonKey;
  if (!key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ISO 3166-1 alpha-2 list from `public.countries` (sorted by name). */
export async function fetchCountriesCatalog(): Promise<CountryOption[]> {
  try {
    const supabase = createCountriesSupabaseClient();
    if (!supabase) {
      console.error(
        '[countries] missing NEXT_PUBLIC_SUPABASE_URL or (SUPABASE_SERVICE_ROLE_KEY | NEXT_PUBLIC_SUPABASE_ANON_KEY)',
      );
      return [];
    }
    const { data, error } = await supabase
      .from('countries')
      .select('code,name')
      .order('name', { ascending: true });
    if (error) {
      console.error('[countries] fetch failed:', error.message);
      return [];
    }
    const rows = (data ?? []) as { code: string; name: string }[];
    return rows.map((row) => ({
      code: String(row.code ?? '')
        .trim()
        .toUpperCase(),
      name: row.name ?? '',
    }));
  } catch (e) {
    console.error('[countries]', e);
    return [];
  }
}
