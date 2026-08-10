import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import AmbientBackground from '../../../components/AmbientBackground';
import { getSession } from '../../../lib/auth';
import { Board, getBoard } from '../../../lib/boards';
import { isUsableImageSrc } from '../../../lib/mediaFrame';

const PLACEHOLDER_COUNT = 8;

export default function VisionBoardPage() {
  const router = useRouter();
  const { boardId } = router.query;
  const id = Array.isArray(boardId) ? boardId[0] : boardId;

  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroFrame, setHeroFrame] = useState<string | null>(null);

  useEffect(() => {
    getSession()
      .then((user) => {
        if (!user) router.replace('/signin');
      })
      .catch(() => router.replace('/signin'));
  }, [router]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await getBoard(id);
        if (cancelled) return;
        setBoard(data);
        setHeroFrame(isUsableImageSrc(data?.heroFrameUrl) ? data!.heroFrameUrl! : null);
      } catch (err) {
        console.error('[vision] load failed', err);
        if (!cancelled) {
          setBoard(null);
          setHeroFrame(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <main className="min-h-screen bg-black" />;
  }

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <Link href="/dashboard" className="text-[11px] uppercase tracking-[0.25em] underline">
          Back to dashboard
        </Link>
      </main>
    );
  }

  const hasMedia = board.videos.length > 0;
  const items = hasMedia
    ? board.videos
    : Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => ({
        id: `ph-${i}`,
        name: `Placeholder ${i + 1}`,
        mimeType: '',
        url: ''
      }));

  return (
    <main className="relative min-h-screen bg-black text-white">
      <header className="fixed left-0 right-0 top-0 z-30 flex items-center justify-between px-6 py-6 md:px-10">
        <Link
          href={`/board/${board.id}`}
          className="text-[11px] uppercase tracking-[0.3em] text-white/70 transition hover:text-white"
        >
          ← Edit board
        </Link>
        <p className="text-[11px] uppercase tracking-[0.4em] text-white/45">Vision Board</p>
      </header>

      {/* Full front-page hero with video frame behind names */}
      <section className="relative flex min-h-screen items-end overflow-hidden">
        <div className="absolute inset-0">
          {isUsableImageSrc(heroFrame) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroFrame}
              alt=""
              className="h-full w-full object-cover"
              onError={() => {
                console.warn('[vision] hero image failed to load', heroFrame);
                setHeroFrame(null);
              }}
            />
          ) : (
            <AmbientBackground />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        </div>

        <div className="relative z-10 w-full px-6 pb-16 pt-28 md:px-10 md:pb-24">
          <div className="mx-auto flex max-w-6xl flex-col gap-10 md:flex-row md:items-end md:justify-between">
            <div className="max-w-4xl text-left">
              <h1 className="font-display text-6xl leading-[0.92] tracking-tight sm:text-7xl md:text-8xl lg:text-9xl">
                {board.title}
              </h1>
              {board.logline ? (
                <p className="mt-8 max-w-2xl text-xl leading-relaxed text-white/70 md:text-2xl">
                  {board.logline}
                </p>
              ) : null}
            </div>
            <div className="text-left md:pb-2 md:text-right">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">Client</p>
              <p className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl">{board.clientName}</p>
              <p className="mt-2 text-sm text-white/45">{board.companyName}</p>
            </div>
          </div>
          <p className="mx-auto mt-14 max-w-6xl text-[11px] uppercase tracking-[0.35em] text-white/35">
            Scroll to explore
          </p>
        </div>
      </section>

      {/* Media grid */}
      <section className="relative z-10 border-t border-white/10 bg-black px-6 py-20 md:px-10 md:py-28">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display mb-10 text-4xl tracking-tight sm:text-5xl">Project Files</h2>
          {!hasMedia && (
            <p className="mb-10 text-[11px] uppercase tracking-[0.3em] text-white/30">
              Placeholders — upload media from the board editor
            </p>
          )}

          <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="mb-6 break-inside-avoid overflow-hidden border border-white/10 bg-white/[0.03]"
              >
                {item.url ? (
                  item.mimeType.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.name} className="block h-auto w-full" />
                  ) : (
                    <video
                      src={item.url}
                      className="block h-auto w-full"
                      controls
                      playsInline
                      preload="metadata"
                    />
                  )
                ) : (
                  <div className="flex aspect-[4/5] flex-col items-center justify-center gap-3 p-8 text-center">
                    <div className="h-px w-12 bg-white/20" />
                    <p className="font-display text-2xl text-white/35">Frame</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-white/25">
                      Video placeholder
                    </p>
                    <div className="h-px w-12 bg-white/20" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
