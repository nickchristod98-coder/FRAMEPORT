import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import AmbientBackground from '../../components/AmbientBackground';
import ProjectMediaGallery from '../../components/ProjectMediaGallery';
import { formatBytes } from '../../lib/boards';
import { formatUploadDate } from '../../lib/mediaUrls';
import { getLocalPublished, PublishedPayload } from '../../lib/publish';

function isRenderablePublicUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith('blob:') || url.startsWith('data:')) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function PublicVisionPage() {
  const router = useRouter();
  const { publicId } = router.query;
  const id = Array.isArray(publicId) ? publicId[0] : publicId;

  const [payload, setPayload] = useState<PublishedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroBroken, setHeroBroken] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setHeroBroken(false);

      try {
        const res = await fetch(`/api/boards/published/${id}`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.payload) {
            setPayload(json.payload);
            setLoading(false);
            return;
          }
        }
      } catch {
        // fall through
      }

      const local = getLocalPublished(id);
      if (!cancelled) {
        if (local) setPayload(local);
        else setError('This vision board is unavailable or has not been published yet.');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const totalSize = useMemo(() => {
    if (!payload) return 0;
    if (typeof payload.totalSize === 'number' && payload.totalSize > 0) return payload.totalSize;
    return payload.videos.reduce((sum, v) => sum + (Number(v.size) || 0), 0);
  }, [payload]);

  const uploadDateLabel = useMemo(() => {
    if (!payload) return null;
    return (
      formatUploadDate(payload.createdAt) ||
      formatUploadDate(payload.updatedAt) ||
      formatUploadDate(payload.videos.find((v) => v.createdAt)?.createdAt)
    );
  }, [payload]);

  if (loading) return <main className="min-h-screen bg-black" />;

  if (error || !payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <div className="max-w-md text-center">
          <p className="font-display text-3xl">FramePort</p>
          <p className="mt-4 text-white/50">{error || 'Not found'}</p>
        </div>
      </main>
    );
  }

  const heroUrl =
    !heroBroken && isRenderablePublicUrl(payload.heroFrameUrl) ? payload.heroFrameUrl : null;

  return (
    <main className="relative min-h-screen bg-black text-white">
      <header className="fixed left-0 right-0 top-0 z-30 flex items-center justify-between px-6 py-6 md:px-10">
        <p className="text-[11px] uppercase tracking-[0.4em] text-white/55">FramePort</p>
        <p className="text-[11px] uppercase tracking-[0.35em] text-white/35">Vision Board</p>
      </header>

      <section className="relative flex min-h-screen items-end overflow-hidden">
        <div className="absolute inset-0">
          {heroUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={() => {
                console.warn('[public vision] hero image failed', heroUrl);
                setHeroBroken(true);
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
                {payload.title}
              </h1>
              {payload.logline ? (
                <p className="mt-8 max-w-2xl text-xl leading-relaxed text-white/70 md:text-2xl">
                  {payload.logline}
                </p>
              ) : null}
              <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-[11px] uppercase tracking-[0.28em] text-white/45">
                {uploadDateLabel ? <p>Upload Date: {uploadDateLabel}</p> : null}
                {totalSize > 0 ? <p>Total Size: {formatBytes(totalSize)}</p> : null}
              </div>
            </div>
            <div className="text-left md:pb-2 md:text-right">
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">Client</p>
              <p className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl">{payload.clientName}</p>
              <p className="mt-2 text-sm text-white/45">{payload.companyName}</p>
            </div>
          </div>
          <p className="mx-auto mt-14 max-w-6xl text-[11px] uppercase tracking-[0.35em] text-white/35">
            Scroll to explore
          </p>
        </div>
      </section>

      <section className="relative z-10 border-t border-white/10 bg-black px-6 py-20 md:px-10 md:py-28">
        <div className="mx-auto max-w-6xl">
          <ProjectMediaGallery
            items={payload.videos.filter((v) => isRenderablePublicUrl(v.url))}
            zipBaseName={`${payload.title || 'project'}-files`.replace(/\s+/g, '-').toLowerCase()}
          />
        </div>
      </section>
    </main>
  );
}
