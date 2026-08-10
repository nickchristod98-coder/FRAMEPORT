import Link from 'next/link';
import AmbientBackground from '../components/AmbientBackground';

export default function Home() {
  return (
    <main className="bg-black text-white">
      {/* Hero */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center">
        <AmbientBackground />

        <div className="relative z-10">
          <p className="welcome-fade-in mb-6 text-[11px] font-medium uppercase tracking-[0.45em] text-white/45">
            FramePort
          </p>

          <h1 className="welcome-fade-in-delay font-display max-w-5xl text-5xl font-normal leading-[0.95] tracking-tight text-white sm:text-7xl md:text-8xl lg:text-9xl">
            Welcome to
            <br />
            <span className="italic text-white/95">FramePort</span>
          </h1>

          <div className="welcome-fade-in-late mt-14 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-center">
            <Link
              href="/signup"
              className="min-w-[180px] border border-white bg-white px-10 py-4 text-center text-sm font-medium uppercase tracking-[0.22em] text-black transition duration-300 hover:bg-transparent hover:text-white"
            >
              Let&apos;s Begin
            </Link>
            <Link
              href="/signin"
              className="min-w-[180px] border border-white/35 px-10 py-4 text-center text-sm font-medium uppercase tracking-[0.22em] text-white/90 transition duration-300 hover:border-white hover:text-white"
            >
              Sign in
            </Link>
          </div>

          <p className="welcome-fade-in-late mt-16 text-[11px] uppercase tracking-[0.35em] text-white/30">
            Scroll to explore
          </p>
        </div>
      </section>

      {/* About — white window */}
      <section className="bg-white text-black">
        <div className="mx-auto max-w-5xl px-6 py-24 md:py-32">
          <p className="mb-8 text-[11px] font-medium uppercase tracking-[0.4em] text-black/40">What we do</p>
          <h2 className="font-display max-w-3xl text-4xl leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            FramePort is where cinematic vision meets client collaboration.
          </h2>
          <div className="mt-12 max-w-2xl space-y-6 text-lg leading-relaxed text-black/70 md:text-xl">
            <p>
              We help production studios, filmmakers, and creative directors build private vision boards —
              curated spaces for high-resolution photos and films that clients can explore, favorite, and
              download with clarity.
            </p>
            <p>
              Create a board. Invite your client. Present the work as it was meant to be seen: minimal,
              immersive, and entirely yours.
            </p>
          </div>

          <div className="mt-16 grid gap-10 border-t border-black/10 pt-16 sm:grid-cols-3">
            <div>
              <div className="mb-3 text-[11px] uppercase tracking-[0.3em] text-black/40">01</div>
              <h3 className="font-display text-2xl">Boards</h3>
              <p className="mt-3 text-sm leading-relaxed text-black/60">
                Dedicated spaces for each project — title, client, company, and the story behind the work.
              </p>
            </div>
            <div>
              <div className="mb-3 text-[11px] uppercase tracking-[0.3em] text-black/40">02</div>
              <h3 className="font-display text-2xl">Delivery</h3>
              <p className="mt-3 text-sm leading-relaxed text-black/60">
                Upload full-quality video and stills. Clients preview and download without friction.
              </p>
            </div>
            <div>
              <div className="mb-3 text-[11px] uppercase tracking-[0.3em] text-black/40">03</div>
              <h3 className="font-display text-2xl">Vision</h3>
              <p className="mt-3 text-sm leading-relaxed text-black/60">
                Preview Board turns your workspace into a cinematic showcase — the client-facing Vision Board.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
