import type { Metadata } from 'next';
import Image from 'next/image';

import { RegistrationForm } from '@/components/registration/registration-form';
import { REGISTER_PAGE_IMAGES } from '@/lib/event-assets';
import { fetchCountriesCatalog } from '@/lib/countries/catalog';

export const metadata: Metadata = {
  title: 'Conference Registration · A-DNA Global Conference USA 2026',
  description:
    'Register for Voices of Change: Translating Innovation into Action for Global Health · August 21–22, 2026, Baltimore.',
};

/** Load `countries` on each request; static prerender leaves the catalog empty without build-time secrets. */
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const countries = await fetchCountriesCatalog();

  return (
    <main className="bg-[#f6f7f9] pb-24">
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-emerald-900/20">
        <div className="absolute inset-0">
          <Image
            src={REGISTER_PAGE_IMAGES.hero}
            alt="G-DNA community members at the Ghana fundraising gala—diaspora nurses, clinicians, and supporters together"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[center_32%] sm:object-[center_28%]"
          />
          <div
            className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/55 to-emerald-950/40 sm:bg-gradient-to-r sm:from-black/82 sm:via-black/52 sm:to-emerald-900/35"
            aria-hidden
          />
        </div>

        <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 md:flex-row md:items-end md:justify-between md:gap-12 md:px-6 md:py-16">
          <div className="max-w-2xl space-y-3 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/95">
              African-Diaspora Nursing Alliance (A-DNA)
            </p>
            <h1 className="font-sans text-balance text-4xl font-semibold leading-tight tracking-tight md:text-[2.5rem] md:leading-snug">
              A-DNA Global Conference USA 2026
            </h1>
            <p className="max-w-xl text-lg font-medium text-emerald-100">
              Voices of Change: Translating Innovation into Action for Global Health
            </p>
            <p className="text-sm leading-relaxed text-stone-200/95">
              August 21–22, 2026
              <br />
              Johns Hopkins Medical Campus · Baltimore, Maryland
              <br />
              Fundraising Reception: August 22 at 6:00&nbsp;PM
            </p>
          </div>
          <div className="w-full shrink-0 rounded-2xl border border-white/20 bg-black/35 px-5 py-4 text-xs text-stone-100 shadow-lg backdrop-blur-md md:max-w-sm">
            <p className="font-semibold text-white">Secure checkout</p>
            <p className="mt-2 leading-relaxed text-stone-200">
              Payments are processed by Zeffy (no platform fees—donations optionally support Zeffy). Your contribution supports
              evidence-based advocacy and clinician leadership initiatives across diaspora communities worldwide.
            </p>
            <p className="mt-3 border-t border-white/15 pt-3 leading-relaxed text-stone-300/95">
              A-DNA is a 501(c)(4) nonprofit. Registration and payments are not tax-deductible.
            </p>
          </div>
        </div>
      </header>

      {/* Community / gala spotlight */}
      <section className="mx-auto max-w-6xl px-2 py-4 md:px-4 md:py-6">
        <div className="grid gap-4 overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm md:grid-cols-[1.15fr_minmax(0,1fr)] md:gap-0">
          <div className="relative min-h-[220px] sm:min-h-[280px] md:min-h-[320px]">
            <Image
              src={REGISTER_PAGE_IMAGES.spotlight}
              alt="African-Diaspora nursing leaders and clinicians at a formal G-DNA gathering in Ghana"
              fill
              sizes="(max-width: 768px) 100vw, 55vw"
              className="object-cover object-[center_25%]"
            />
          </div>
          <div className="flex flex-col justify-center p-5 md:p-6 lg:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">Together across borders</p>
            <h2 className="font-heading mt-2 text-xl font-medium leading-snug tracking-tight text-stone-900 md:text-2xl md:leading-snug">
              The community you&apos;re joining
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              A-DNA honors nurses and health leaders of African diaspora descent—connecting mentorship, scholarships, advocacy, and
              global health impact. Past gatherings like our Ghana fundraising gala bring together clinicians, patrons, and
              partners united in advancing health equity worldwide.
            </p>
            <p className="mt-4 text-xs text-stone-500">Photo: G-DNA fundraising gala · Ghana · 2024</p>
          </div>
        </div>
      </section>

      <RegistrationForm countries={countries} />

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-8 text-center text-xs text-stone-500 md:px-6">
        <p className="mx-auto mb-6 max-w-2xl leading-relaxed text-stone-600">
          African-Diaspora Nursing Alliance (A-DNA) is organized as a 501(c)(4) nonprofit. Registration fees and contributions are{' '}
          <span className="font-medium text-stone-700">not tax-deductible</span> as charitable donations.
        </p>
        Please direct any questions to{' '}
        <a
          href="mailto:info@g-dna.org"
          className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
        >
          info@g-dna.org
        </a>
      </footer>
    </main>
  );
}
