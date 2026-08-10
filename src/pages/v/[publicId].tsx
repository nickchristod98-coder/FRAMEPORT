import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import AmbientBackground from '../../components/AmbientBackground';
import ProjectMediaGallery from '../../components/ProjectMediaGallery';
import StickyBoardHeader from '../../components/StickyBoardHeader';
import { formatBytes } from '../../lib/boards';
import {
  formatUploadDate,
  isImageMime,
  isVideoMime
} from '../../lib/mediaUrls';
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

function unlockStorageKey(publicId: string) {
  return `fp_board_unlock_${publicId}`;
}

export default function PublicVisionPage() {
  const router = useRouter();
  const { publicId } = router.query;
  const id = Array.isArray(publicId) ? publicId[0] : publicId;

  const [payload, setPayload] = useState<PublishedPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroBroken, setHeroBroken] = useState(false);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setHeroBroken(false);
      setPasswordError(null);

      const alreadyUnlocked =
        typeof window !== 'undefined' &&
        sessionStorage.getItem(unlockStorageKey(id)) === '1';

      try {
        const res = await fetch(`/api/boards/published/${id}`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.payload) {
            const needsPassword = Boolean(json.requiresPassword ?? json.payload.passwordProtected);
            setPayload(json.payload);
            setRequiresPassword(needsPassword);
            setUnlocked(!needsPassword || alreadyUnlocked);
            setLoading(false);
            return;
          }
        }
      } catch {
        // fall through
      }

      const local = getLocalPublished(id);
      if (!cancelled) {
        if (local) {
          setPayload(local);
          setRequiresPassword(Boolean(local.passwordProtected));
          setUnlocked(!local.passwordProtected || alreadyUnlocked);
        } else {
          setError('This vision board is unavailable or has not been published yet.');
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleUnlock(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setUnlocking(true);
    setPasswordError(null);
    try {
      const res = await fetch(`/api/boards/published/${id}/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Incorrect password');
      }
      sessionStorage.setItem(unlockStorageKey(id), '1');
      setUnlocked(true);
      setPasswordInput('');
    } catch (err: any) {
      setPasswordError(err?.message || 'Incorrect password');
    } finally {
      setUnlocking(false);
    }
  }

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

  const photoCount = useMemo(
    () => (payload?.videos || []).filter((v) => isImageMime(v.mimeType)).length,
    [payload]
  );
  const videoCount = useMemo(
    () => (payload?.videos || []).filter((v) => isVideoMime(v.mimeType)).length,
    [payload]
  );

  const metadataLine = useMemo(() => {
    const parts: string[] = [];
    if (uploadDateLabel) parts.push(uploadDateLabel);
    if (totalSize > 0) parts.push(formatBytes(totalSize));
    parts.push(`${photoCount} ${photoCount === 1 ? 'Photo' : 'Photos'}`);
    parts.push(`${videoCount} ${videoCount === 1 ? 'Video' : 'Videos'}`);
    return parts.join(' • ');
  }, [uploadDateLabel, totalSize, photoCount, videoCount]);

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

  if (requiresPassword && !unlocked) {
    return (
      <main className="relative flex min-h-screen items-center justify-center bg-black px-6 text-white">
        <AmbientBackground />
        <form
          onSubmit={handleUnlock}
          className="relative z-10 w-full max-w-md border border-white/15 bg-black/80 p-8 backdrop-blur-md"
        >
          <p className="text-[11px] uppercase tracking-[0.35em] text-white/45">Protected board</p>
          <h1 className="font-display mt-3 text-3xl tracking-tight">{payload.title}</h1>
          <p className="mt-3 text-sm text-white/55">
            Enter the board password to view this vision board.
          </p>
          <label className="mt-8 block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-white/40">
              Password
            </span>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              autoFocus
              required
              className="w-full border border-white/20 bg-transparent px-4 py-3 outline-none focus:border-white/55"
              placeholder="Board password"
            />
          </label>
          {passwordError ? <p className="mt-3 text-sm text-red-300">{passwordError}</p> : null}
          <button
            type="submit"
            disabled={unlocking || !passwordInput.trim()}
            className="mt-6 w-full bg-white px-5 py-3 text-[11px] uppercase tracking-[0.25em] text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {unlocking ? 'Checking…' : 'Unlock board'}
          </button>
        </form>
      </main>
    );
  }

  const heroUrl =
    !heroBroken && isRenderablePublicUrl(payload.heroFrameUrl) ? payload.heroFrameUrl : null;

  return (
    <main className="relative min-h-screen bg-black text-white">
      <StickyBoardHeader
        left={<p className="text-[11px] uppercase tracking-[0.4em] text-white">FramePort</p>}
        right={
          <p className="text-[11px] uppercase tracking-[0.35em] text-white">Vision Board</p>
        }
      />

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
              {metadataLine ? (
                <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-white">{metadataLine}</p>
              ) : null}
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
