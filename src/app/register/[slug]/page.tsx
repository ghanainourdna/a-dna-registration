import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { RegisterEventPage } from "@/components/registration/register-event-page";
import {
  fetchConferenceBySlug,
  isReservedRegisterSlug,
  normalizeConferenceSlug,
} from "@/lib/conferences";
import { fetchCountriesCatalog } from "@/lib/countries/catalog";
import { detectVisitorCountry } from "@/lib/visitor-location";

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

  const [countries, conference, headerStore] = await Promise.all([
    fetchCountriesCatalog(),
    fetchConferenceBySlug(slug),
    headers(),
  ]);

  if (!conference) {
    notFound();
  }

  return (
    <RegisterEventPage
      conference={conference}
      countries={countries}
      detectedCountry={await detectVisitorCountry(headerStore)}
      autoDetectLocation={process.env.E2E_FIXTURE_COUNTRIES !== "1"}
    />
  );
}
