import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RegisterEventPage } from "@/components/registration/register-event-page";
import {
  fetchConferenceBySlug,
  isReservedRegisterSlug,
  normalizeConferenceSlug,
} from "@/lib/conferences";
import { fetchCountriesCatalog } from "@/lib/countries/catalog";

export const dynamic = "force-dynamic";

type RegisterSlugPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: RegisterSlugPageProps): Promise<Metadata> {
  const { slug } = await params;
  const conference = await fetchConferenceBySlug(slug);
  if (!conference) {
    return { title: "Conference Registration" };
  }
  return {
    title: `Conference Registration · ${conference.title}`,
    description: [
      conference.tagline,
      conference.theme,
      `${conference.dates_label}, ${conference.location_label}`,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export default async function RegisterSlugPage({ params }: RegisterSlugPageProps) {
  const { slug: rawSlug } = await params;
  const slug = normalizeConferenceSlug(rawSlug);
  if (isReservedRegisterSlug(slug)) {
    notFound();
  }

  const [countries, conference] = await Promise.all([
    fetchCountriesCatalog(),
    fetchConferenceBySlug(slug),
  ]);

  if (!conference) {
    notFound();
  }

  return <RegisterEventPage conference={conference} countries={countries} />;
}
