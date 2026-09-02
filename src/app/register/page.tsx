import type { Metadata } from "next";

import { RegisterEventPage } from "@/components/registration/register-event-page";
import {
  DEFAULT_CONFERENCE_SLUG,
  DEFAULT_GHANA_2027_CONFERENCE,
  fetchConferenceBySlug,
} from "@/lib/conferences";
import { fetchCountriesCatalog } from "@/lib/countries/catalog";

export const metadata: Metadata = {
  title: `Conference Registration · ${DEFAULT_GHANA_2027_CONFERENCE.title}`,
  description: [
    DEFAULT_GHANA_2027_CONFERENCE.tagline,
    DEFAULT_GHANA_2027_CONFERENCE.theme,
    `${DEFAULT_GHANA_2027_CONFERENCE.dates_label}, ${DEFAULT_GHANA_2027_CONFERENCE.location_label}`,
  ]
    .filter(Boolean)
    .join(" · "),
};

/** Load `countries` on each request; static prerender leaves the catalog empty without build-time secrets. */
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const [countries, conference] = await Promise.all([
    fetchCountriesCatalog(),
    fetchConferenceBySlug(DEFAULT_CONFERENCE_SLUG),
  ]);

  return (
    <RegisterEventPage
      conference={conference ?? DEFAULT_GHANA_2027_CONFERENCE}
      countries={countries}
    />
  );
}
