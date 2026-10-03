/** Public site origin for callbacks (Paystack, success redirects). No trailing slash. */
export function resolveAppBaseUrl(req?: { headers: Headers } | null): string | undefined {
  let appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (appUrl) return appUrl;

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;

  if (req) {
    const origin = req.headers.get('origin')?.trim();
    if (origin && /^https?:\/\//i.test(origin)) {
      return origin.replace(/\/$/, '');
    }
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    if (host) {
      const proto = (req.headers.get('x-forwarded-proto') ?? 'https').split(',')[0]!.trim();
      return `${proto}://${host.split(',')[0]!.trim()}`.replace(/\/$/, '');
    }
  }

  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT?.trim() || '3000';
    return `http://127.0.0.1:${port}`;
  }

  return undefined;
}
