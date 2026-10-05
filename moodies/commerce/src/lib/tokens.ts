import 'server-only';
import { createHash, createHmac } from 'node:crypto';
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const orderToken = (id: string, secret: string) => createHmac('sha256', secret).update(`moodies-order:${id}`).digest('base64url');
