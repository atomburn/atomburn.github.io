import 'server-only';
import { CommerceError } from './input';
export function errorResponse(error: unknown): Response {
  if (error instanceof CommerceError) return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  // Avoid logging Stripe payloads, customer addresses, tokens, or credentials.
  console.error('Commerce operation failed', { type: error instanceof Error ? error.constructor.name : 'Unknown' });
  return Response.json({ error: 'Commerce is temporarily unavailable. Please retry.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
}
export function requireOrigin(request: Request, allowed: string[]) {
  const origin = request.headers.get('origin');
  if (origin && !allowed.includes(origin)) throw new CommerceError(403, 'Origin is not allowed.');
  if (!origin && request.headers.get('sec-fetch-site') === 'cross-site') throw new CommerceError(403, 'Origin is required.');
}
export function withCors(response: Response, request: Request, allowed: string[]) {
  const origin = request.headers.get('origin');
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Vary', 'Origin');
  if (origin && allowed.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
  }
  return response;
}
export async function readJson(request: Request, maxBytes = 16384): Promise<unknown> {
  const text = await readText(request, maxBytes);
  try { return JSON.parse(text); } catch { throw new CommerceError(400, 'Invalid JSON.'); }
}
export async function readText(request: Request, maxBytes: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new CommerceError(400, 'Request body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new CommerceError(413, 'Request body is too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
