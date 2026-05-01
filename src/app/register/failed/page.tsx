import Link from 'next/link';

export default function RegisterFailedPage() {
  return (
    <main className="min-h-[70vh] bg-[#f6f7f9] px-4 py-16 text-stone-800">
      <div className="mx-auto mt-12 max-w-lg rounded-2xl border border-amber-200 bg-white px-8 py-10 shadow-sm">
        <h1 className="font-sans text-xl font-semibold leading-snug tracking-tight text-stone-900 sm:text-2xl">Payment interrupted</h1>
        <p className="mt-4 text-sm leading-relaxed text-stone-700">
          Your booking was not completed. Funds are not settled until checkout finishes successfully — you may restart the
          process with the same email if your enrollment is still pending.
        </p>
        <p className="mt-6 text-xs text-stone-500">
          Technical questions:&nbsp;
          <a href="mailto:info@g-dna.org" className="text-emerald-700 underline underline-offset-2 hover:text-emerald-900">
            info@g-dna.org
          </a>
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/register" className="inline-flex rounded-full bg-emerald-700 px-6 py-2 text-sm font-semibold text-white">
            Try registration again
          </Link>
          <a
            href="/"
            className="inline-flex rounded-full border border-stone-200 px-6 py-2 text-sm font-medium hover:border-emerald-300"
          >
            Home
          </a>
        </div>
      </div>
    </main>
  );
}
