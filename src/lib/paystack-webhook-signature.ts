/**
 * Paystack validates webhooks using HMAC-SHA512(hex) over the **exact raw HTTP body**.
 * Implemented with Web Crypto for Edge handlers (no Node `crypto`).
 * @see https://paystack.com/docs/payments/webhooks/
 */

function timingSafeEqualHex(a: string, b: string): boolean {
  const an = a.toLowerCase();
  const bn = b.toLowerCase();
  if (an.length !== bn.length) return false;
  let bad = 0;
  for (let i = 0; i < an.length; i++) {
    bad |= an.charCodeAt(i) ^ bn.charCodeAt(i);
  }
  return bad === 0;
}

export async function verifyPaystackWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secretKey: string,
): Promise<boolean> {
  if (!signatureHeader || !secretKey) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hash = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');

  return timingSafeEqualHex(hash, signatureHeader.trim());
}
