import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
await mkdir(`${root}public`,{recursive:true});
await cp(`${root}../index.html`,`${root}public/index.html`);
await cp(`${root}../assets`,`${root}public/assets`,{recursive:true});
console.log('Copied storefront unchanged into public/. API routes are included by Next.js.');
