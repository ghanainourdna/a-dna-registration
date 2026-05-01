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
    <main className="min-w-0 bg-[#f6f7f9] pb-24">
      {/* Hero — conference intro + checkout note */}
      <header className="relative isolate overflow-hidden rounded-b-[1.5rem] border-b border-emerald-900/25 shadow-[0_24px_48px_-24px_rgba(6,78,59,0.45)] max-md:flex max-md:min-h-[min(52dvh,26.5rem)] max-md:flex-col max-md:justify-end sm:rounded-b-[1.85rem] md:rounded-b-[2rem]">
        <div className="pointer-events-none absolute inset-0 bg-stone-950" aria-hidden />
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src={REGISTER_PAGE_IMAGES.hero}
            alt="A-DNA community members gathered for the conference—nurses, clinicians, and supporters together"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 100vw"
            className="object-cover max-md:object-[center_40%_20%] md:object-[center_center] md:scale-[0.93]"
          />
          <div
            className="absolute inset-0 bg-linear-to-b from-black/75 via-black/52 to-emerald-950/50 md:bg-linear-to-r md:from-black/82 md:via-black/48 md:to-emerald-900/42"
            aria-hidden
          />
          <div
            className="absolute inset-x-0 bottom-0 z-1 h-28 bg-linear-to-t from-[#f6f7f9]/95 via-transparent to-transparent md:h-36"
            aria-hidden
          />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[min(115rem,calc(100%-2rem))] min-w-0 px-4 pb-12 pt-14 max-md:pb-10 max-md:pt-12 sm:px-6 md:pb-16 md:pt-20 md:px-10">
          <div className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1fr)_min(360px,calc(100vw-18rem))] lg:items-end lg:gap-12 xl:gap-14">
            <div className="max-w-[40rem] space-y-5 text-white">
              <div
                className="flex max-w-fit items-center gap-2 rounded-full border border-white/20 bg-black/25 px-2.5 py-1.5 backdrop-blur-md"
                role="presentation"
              >
                <span className="flex h-1.5 w-8 shrink-0 overflow-hidden rounded-full" aria-hidden>
                  <span className="flex-1 bg-red-700" />
                  <span className="flex-1 bg-amber-300" />
                  <span className="flex-1 bg-emerald-700" />
                </span>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100/95">
                  Registration open
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/90">
                  African-Diaspora Nursing Alliance (A-DNA)
                </p>
                <h1
                  id="register-hero-title"
                  className="font-sans text-pretty text-2xl font-semibold leading-snug tracking-tight text-white sm:text-3xl md:text-[2rem] md:leading-snug lg:text-[2.35rem]"
                >
                  A-DNA Global Conference USA&nbsp;2026
                </h1>
              </div>

              <p className="max-w-xl text-sm font-medium leading-relaxed text-emerald-50/98 sm:text-[0.975rem] sm:leading-snug">
                Voices of Change: Translating Innovation into Action for Global Health
              </p>

              <ul className="flex max-w-xl flex-wrap gap-2 pt-1" aria-label="Conference details">
                <li className="rounded-lg border border-white/15 bg-white/[0.08] px-3 py-2 text-[13px] font-medium leading-tight text-stone-100 shadow-sm backdrop-blur-sm sm:text-sm">
                  August 21–22, 2026
                </li>
                <li className="rounded-lg border border-white/15 bg-white/[0.08] px-3 py-2 text-[13px] font-medium leading-tight text-stone-100 shadow-sm backdrop-blur-sm sm:text-sm">
                  Johns Hopkins Medical Campus · Baltimore, MD
                </li>
                <li className="rounded-lg border border-emerald-400/35 bg-emerald-900/35 px-3 py-2 text-[13px] font-medium leading-tight text-emerald-50 shadow-sm backdrop-blur-sm sm:text-sm">
                  Reception · Aug 22, 6:00&nbsp;PM
                </li>
              </ul>
            </div>

            <aside className="relative w-full shrink-0 overflow-hidden rounded-2xl border border-white/22 bg-black/42 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.55)] backdrop-blur-xl md:rounded-[1.15rem]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-white/35 to-transparent" aria-hidden />
              <div className="p-5 sm:p-6">
                <div className="flex gap-4">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-400/18 text-emerald-100 ring-1 ring-emerald-300/25"
                    aria-hidden
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="opacity-95" aria-hidden>
                      <path
                        d="M7 11V9a5 5 0 0 1 10 0v2m-12 0h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[15px] font-semibold leading-snug tracking-tight text-white sm:text-base">
                      Secure checkout with Zeffy
                    </p>
                    <p className="mt-2 text-[13px] leading-relaxed text-stone-200/95 sm:text-sm">
                      No platform fees. Optional tips support Zeffy. Your payment advances A-DNA mentorship, scholarships, advocacy,
                      and clinician leadership programming.
                    </p>
                  </div>
                </div>
                <p className="mt-5 border-t border-white/14 pt-4 text-[12px] leading-relaxed text-stone-400/95 sm:text-xs">
                  <span className="font-semibold text-stone-300">501(c)(3) nonprofit ·</span> Registration and payments are tax-deductible.
                </p>
              </div>
            </aside>
          </div>

          <p className="mt-8 flex justify-center text-center md:mt-12">
            <span className="inline-flex max-w-[min(100%,28rem)] items-center gap-2 rounded-full border border-white/12 bg-black/30 px-3 py-2 text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-white/70 backdrop-blur-md sm:text-[11px] sm:tracking-[0.2em]">
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)] motion-safe:animate-pulse" aria-hidden />
              Scroll to register below
            </span>
          </p>
        </div>
      </header>

      {/* Together across borders — community spotlight */}
      <section
        className="mx-auto w-full max-w-[min(115rem,calc(100%-2rem))] min-w-0 px-4 py-5 sm:px-6 md:py-8"
        aria-labelledby="community-spotlight-heading"
      >
        <div className="min-w-0 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.08)] ring-1 ring-stone-950/[0.03] md:rounded-[1.35rem]">
          <div className="flex h-2.5 shrink-0" aria-hidden role="presentation">
            <span className="flex-1 bg-red-800" />
            <span className="flex-1 bg-yellow-400" />
            <span className="flex-1 bg-emerald-900" />
          </div>

          <div className="grid min-w-0 md:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] md:items-stretch">
            <div className="relative aspect-[5/4] w-full max-h-[min(72dvh,28rem)] min-h-[12.5rem] overflow-hidden bg-stone-200 sm:aspect-[16/10] sm:max-h-[min(64dvh,32rem)] md:aspect-auto md:max-h-none md:min-h-[min(340px,50vh)]">
              <Image
                src={REGISTER_PAGE_IMAGES.spotlight}
                alt="African-Diaspora nursing leaders and clinicians together at an A-DNA gathering"
                fill
                sizes="(max-width: 768px) 96vw, 52vw"
                className="object-cover object-[center_30%] sm:object-[center_28%]"
                priority={false}
              />
              {/* Soft seam into content column on desktop */}
              <div
                className="pointer-events-none absolute inset-y-0 right-0 z-1 hidden w-24 bg-linear-to-l from-white from-35% via-white/85 to-transparent md:block"
                aria-hidden
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-1 h-20 bg-linear-to-t from-black/35 to-transparent md:hidden" aria-hidden />
            </div>

            <div className="relative flex min-w-0 flex-col justify-center border-t border-stone-100/90 bg-white px-4 py-5 sm:px-7 sm:py-7 md:border-t-0 md:border-l md:border-stone-100/90 md:px-8 lg:px-10 lg:py-9">
              <div className="flex max-w-full flex-wrap items-center gap-2 rounded-full border border-emerald-200/90 bg-emerald-50/80 px-2.5 py-1.5 ring-4 ring-emerald-50/60">
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-600 shadow-[0_0_0_2px_rgba(5,150,105,0.2)]" aria-hidden />
                <p className="min-w-0 text-[11px] font-semibold uppercase leading-snug tracking-[0.15em] text-emerald-900 sm:text-xs sm:tracking-[0.18em]">
                  Together across borders
                </p>
              </div>

              <h2
                id="community-spotlight-heading"
                className="font-sans mt-4 text-xl font-semibold leading-snug tracking-tight text-stone-900 sm:text-[1.35rem]"
              >
                The community you&apos;re joining
              </h2>

              <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-stone-600">
                A-DNA lifts up nurses and health leaders of African diaspora descent—from mentorship and scholarships to advocacy
                and global health partnerships. Gatherings such as our fundraiser in Ghana set the tone: clinicians,
                patrons, and allies advancing equity together.
              </p>

              <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                {(
                  [
                    ['Mentorship & scholarships', 'Grow the next generation of diaspora clinician-leaders'],
                    ['Policy & advocacy', 'Evidence-informed voice for underserved communities worldwide'],
                    ['Global gatherings', 'Conferences and fundraisers that deepen cross-border ties'],
                  ] as const
                ).map(([title, detail]) => (
                  <li
                    key={title}
                    className="rounded-xl border border-stone-100/95 bg-stone-50/70 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{title}</p>
                    <p className="mt-1 text-xs leading-snug text-stone-600">{detail}</p>
                  </li>
                ))}
              </ul>

              <p className="mt-8 border-t border-stone-100/90 pt-5 text-xs leading-relaxed text-stone-500">
                <span className="font-medium text-stone-600">Photos</span> · African-Diaspora Nursing Alliance (A-DNA)
                community events and gatherings—same spirit we bring to Baltimore, August&nbsp;2026.
              </p>
            </div>
          </div>
        </div>
      </section>

      <RegistrationForm countries={countries} />

      <footer className="mx-auto w-full max-w-[min(115rem,calc(100%-2rem))] min-w-0 px-4 pb-10 pt-8 text-center text-sm leading-relaxed text-stone-500 md:px-10">
        <p className="mx-auto mb-6 max-w-[62ch] text-sm leading-relaxed text-stone-600">
          African-Diaspora Nursing Alliance (A-DNA) is organized as a 501(c)(3) nonprofit. Registration fees and contributions are{' '}
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
