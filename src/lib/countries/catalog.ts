import { getSupabaseAdmin } from '@/lib/supabase/admin';

export type CountryOption = {
  code: string;
  name: string;
};

/** ISO 3166-1 alpha-2 list from `public.countries` (sorted by name). */
export async function fetchCountriesCatalog(): Promise<CountryOption[]> {
  try {
    const supabase = getSupabaseAdmin();
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
