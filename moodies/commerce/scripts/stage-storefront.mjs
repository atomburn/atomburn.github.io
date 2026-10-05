import { access, cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
// Vercel uploads only this app directory. The CLI deploy stages the canonical
// sibling storefront first, then includes those copies in the upload.
try {
  await access(`${root}../index.html`);
} catch {
  await access(`${root}public/index.html`);
  await access(`${root}public/assets/key-art.jpg`);
  console.log('Using storefront copies staged before the Vercel upload.');
  process.exit(0);
}
await mkdir(`${root}public`,{recursive:true});
await cp(`${root}../index.html`,`${root}public/index.html`);
await cp(`${root}../assets`,`${root}public/assets`,{recursive:true});
console.log('Copied storefront unchanged into public/. API routes are included by Next.js.');
