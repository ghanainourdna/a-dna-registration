"use client";

/**
 * Temporary page for Sentry onboarding verification (run code in Sentry UI).
 */
export default function SentryExamplePage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-semibold">Sentry test</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Click the button to send a sample error to Sentry, then enter your run
        code in the Sentry setup wizard.
      </p>
      <button
        type="button"
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm text-white"
        onClick={() => {
          throw new Error("Sentry example page test error");
        }}
      >
        Throw sample error
      </button>
    </main>
  );
}
