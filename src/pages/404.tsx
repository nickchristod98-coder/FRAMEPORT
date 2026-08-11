import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-black text-white">
      <div className="px-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">FramePort</p>
        <h1 className="mt-3 font-display text-5xl">404</h1>
        <p className="mt-3 text-white/60">This page could not be found.</p>
        <Link
          href="/"
          className="mt-8 inline-block border border-white px-6 py-3 text-[11px] uppercase tracking-[0.2em] text-white"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}
