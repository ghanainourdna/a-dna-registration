'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

type VerifyState =
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'failed'; paymentStatus?: string }
  | { status: 'error'; message: string };

function SuccessContent() {
  const params = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref') ?? '';
  const [state, setState] = useState<VerifyState>({ status: 'loading' });

  useEffect(() => {
    if (!reference.trim()) {
      setState({
        status: 'error',
        message: 'Missing payment reference. Please return from the Paystack checkout link.',
      });
      return;
    }

    let cancelled = false;

    async function verify() {
      setState({ status: 'loading' });
      try {
        const res = await fetch('/api/paystack/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference }),
        });

        const data = (await res.json()) as {
          registrationId?: string;
          paymentStatus?: string;
          paystackStatus?: string;
          error?: string;
        };

        if (cancelled) return;

        if (!res.ok) {
          setState({
            status: 'error',
            message: data.error ?? `Verification failed (${res.status}).`,
          });
          return;
        }

        if (data.paymentStatus === 'paid') {
          setState({ status: 'success' });
          return;
        }

        setState({
          status: 'failed',
          paymentStatus: data.paystackStatus ?? data.paymentStatus,
        });
      } catch {
        if (!cancelled) {
          setState({ status: 'error', message: 'Unable to verify payment.' });
        }
      }
    }

    void verify();
    return () => {
      cancelled = true;
    };
  }, [reference]);

  const body =
    state.status === 'loading' ? (
      <p className="text-sm text-stone-600">Confirming payment on our servers (Paystack verification)…</p>
    ) : state.status === 'success' ? (
      <div className="space-y-4 text-sm text-stone-700">
        <p className="text-emerald-800">
          Payment confirmed — thank you! Your seat (and housing where selected) will be finalized by the registrar.
        </p>
        <p>
          Detailed logistics for the Johns Hopkins gathering will arrive by email shortly. Reach out anytime at{' '}
          <a className="text-emerald-700 underline underline-offset-2" href="mailto:info@g-dna.org">
            info@g-dna.org
          </a>
          .
        </p>
      </div>
    ) : state.status === 'failed' ? (
      <div className="space-y-3 text-sm text-stone-700">
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-amber-950">
          We could not verify a completed charge
          {state.paymentStatus ? ` (Paystack: ${state.paymentStatus}).` : '.'}{' '}
          If Paystack emailed a receipt but you still see this message, contact us with that receipt.
        </p>
      </div>
    ) : (
      <div className="space-y-3 text-sm">
        <p className="rounded-lg bg-red-50 px-4 py-3 text-red-900">{state.message}</p>
      </div>
    );

  return (
    <div className="mx-auto mt-14 max-w-lg rounded-2xl border border-stone-200 bg-white px-8 py-10 shadow-sm">
      <h1 className="font-heading text-3xl font-medium leading-snug tracking-tight text-stone-900">Registration status</h1>
      {reference ? <p className="mt-2 text-sm text-stone-500">Reference · {reference}</p> : null}
      <div className="mt-6">{body}</div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/register"
          className="inline-flex rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Registration form
        </Link>
        <a
          href="/"
          className="inline-flex rounded-full border border-stone-200 px-5 py-2 text-sm font-medium text-stone-800 hover:border-emerald-300"
        >
          Home
        </a>
      </div>
    </div>
  );
}

export default function RegisterSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto mt-24 max-w-lg px-6 text-center text-sm text-stone-600">Loading confirmation…</div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
