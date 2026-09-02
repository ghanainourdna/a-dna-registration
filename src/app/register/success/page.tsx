'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

type VerifyState =
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'pending'; triesLeft: number; reason?: string }
  | { status: 'failed'; paymentStatus?: string; reason?: string }
  | { status: 'error'; message: string };

const STORAGE_KEY = 'registration_pay_registration_id';

type VerifyPayload = {
  registrationId?: string;
  paymentStatus?: string;
  syncStatus?: string;
  providerPaymentId?: string;
  reason?: string;
  error?: string;
};

async function fetchVerify(registrationId: string): Promise<{ ok: boolean; json: VerifyPayload }> {
  const res = await fetch('/api/payment/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ registrationId }),
  });

  let json = {} as VerifyPayload;
  try {
    json = (await res.json()) as VerifyPayload;
  } catch {
    json = {};
  }

  return { ok: res.ok, json };
}

function SuccessContent() {
  const params = useSearchParams();
  const fromQuery = params.get('registration_id')?.trim() ?? '';

  const [registrationIdDisplay, setRegistrationIdDisplay] = useState('');
  const [state, setState] = useState<VerifyState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let registrationId = fromQuery;
    try {
      if (!registrationId) {
        const stored = sessionStorage.getItem(STORAGE_KEY)?.trim() ?? '';
        registrationId = stored;
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }

    if (!registrationId) {
      queueMicrotask(() => {
        if (!cancelled) {
          setState({
            status: 'error',
            message:
              'Missing registration confirmation. Complete payment on Zeffy, then return using the link shown after checkout.',
          });
        }
      });
      return () => {
        cancelled = true;
      };
    }

    queueMicrotask(() => {
      if (!cancelled) setRegistrationIdDisplay(registrationId);
    });

    let attempt = 0;
    const maxAttempts = 12;
    const delayMs = 2500;

    async function poll() {
      if (cancelled) return;
      attempt += 1;
      if (!cancelled && attempt > 1) {
        setState({
          status: 'pending',
          triesLeft: maxAttempts - attempt + 1,
          reason: 'syncing_with_zeffy',
        });
      }

      const { ok, json } = await fetchVerify(registrationId);

      if (cancelled) return;

      if (!ok || json.error) {
        setState({
          status: 'error',
          message: json.error ?? `Verification failed.`,
        });
        return;
      }

      if (json.paymentStatus === 'paid') {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        setState({ status: 'success' });
        return;
      }

      if (json.syncStatus === 'pending' || json.paymentStatus === 'pending') {
        if (attempt < maxAttempts) {
          window.setTimeout(poll, delayMs);
          setState({
            status: 'pending',
            triesLeft: maxAttempts - attempt,
            reason: json.reason ?? 'waiting_for_gateway',
          });
        } else {
          setState({
            status: 'failed',
            reason: json.reason ?? 'verification_timeout',
            paymentStatus: json.paymentStatus,
          });
        }
        return;
      }

      if (json.paymentStatus === 'failed') {
        setState({
          status: 'failed',
          paymentStatus: 'failed',
          reason: json.reason,
        });
        return;
      }

      /** Unexpected payload - retry briefly in case schemas changed */
      if (attempt < maxAttempts) {
        window.setTimeout(poll, delayMs);
        setState({ status: 'pending', triesLeft: maxAttempts - attempt, reason: 'unexpected_response_retrying' });
        return;
      }

      setState({
        status: 'failed',
        paymentStatus: json.paymentStatus,
        reason: json.reason ?? json.error ?? 'verification_failed',
      });
    }

    void poll();

    return () => {
      cancelled = true;
    };
  }, [fromQuery]);

  const body =
    state.status === 'loading' || state.status === 'pending' ? (
      <div className="space-y-2 text-sm text-stone-600">
        <p>Confirming payment with Zeffy and your registration record…</p>
        {state.status === 'pending' ? (
          <p className="text-xs text-stone-500">
            Payments can take a moment to sync. Automatic retries remaining:{' '}
            <span className="font-semibold tabular-nums">{state.triesLeft}</span>
          </p>
        ) : null}
      </div>
    ) : state.status === 'success' ? (
      <div className="space-y-4 text-sm text-stone-700">
        <p className="text-emerald-800">
          Payment confirmed. Thank you! Your seat will be finalized by the registrar.
        </p>
        <p>
          A confirmation email is on its way. Detailed logistics for the gathering will follow. Reach out anytime at{' '}
          <a className="text-emerald-700 underline underline-offset-2" href="mailto:info@g-dna.org">
            info@g-dna.org
          </a>
          .
        </p>
      </div>
    ) : state.status === 'failed' ? (
      <div className="space-y-3 text-sm text-stone-700">
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-amber-950">
          We could not confirm a completed payment for this registration
          {state.paymentStatus ? ` (status: ${state.paymentStatus}).` : '.'}
          {state.reason ? ` (${state.reason}).` : null}{' '}
          If Zeffy emailed a receipt, forward it to info@g-dna.org and we will match it manually.
        </p>
      </div>
    ) : (
      <div className="space-y-3 text-sm">
        <p className="rounded-lg bg-red-50 px-4 py-3 text-red-900">{state.message}</p>
      </div>
    );

  return (
    <div className="mx-auto mt-14 max-w-lg rounded-2xl border border-stone-200 bg-white px-8 py-10 shadow-sm">
      <h1 className="font-sans text-xl font-semibold leading-snug tracking-tight text-stone-900 sm:text-2xl">Registration status</h1>
      {registrationIdDisplay ? (
        <p className="mt-2 break-all text-xs text-stone-500">Registration ID · {registrationIdDisplay}</p>
      ) : null}
      <div className="mt-6">{body}</div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/register"
          className="inline-flex rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Registration form
        </Link>
        <Link
          href="/"
          className="inline-flex rounded-full border border-stone-200 px-5 py-2 text-sm font-medium text-stone-800 hover:border-emerald-300"
        >
          Home
        </Link>
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
