import type { Metadata } from 'next';
export const metadata: Metadata = {title:'Your Moodies order',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
