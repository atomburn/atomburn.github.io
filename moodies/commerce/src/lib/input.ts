import { z } from 'zod';
export class CommerceError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const cartSchema = z.strictObject({ items: z.array(z.strictObject({ sku: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), quantity: z.number().int().min(1).max(20) })).min(1).max(20) });
export type CartItem = z.infer<typeof cartSchema>['items'][number];
export function parseCart(body: unknown): CartItem[] {
  const parsed = cartSchema.safeParse(body);
  if (!parsed.success) throw new CommerceError(400, 'Send items containing SKU and integer quantity only (1–20).');
  const items = parsed.data.items;
  if (new Set(items.map(i => i.sku)).size !== items.length || items.reduce((n, i) => n + i.quantity, 0) > 50) throw new CommerceError(400, 'Duplicate SKU or too many items.');
  return items.sort((a, b) => a.sku.localeCompare(b.sku));
}
export function parseRequestKey(key: string | null): string {
  if (!key || !z.uuid().safeParse(key).success) throw new CommerceError(400, 'Supply a UUID Idempotency-Key header.');
  return key.toLowerCase();
}
export const validToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
