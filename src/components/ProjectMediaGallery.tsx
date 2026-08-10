import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { downloadAsset, downloadAssetsAsZip } from '../lib/download';
import { formatBytes } from '../lib/boards';
import {
  fullResolutionUrl,
  isImageMime,
  isVideoMime,
  thumbnailUrl
} from '../lib/mediaUrls';

export type GalleryMediaItem = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  size?: number | null;
};

type ProjectMediaGalleryProps = {
  items: GalleryMediaItem[];
  zipBaseName?: string;
  emptyLabel?: string;
};

function DownloadIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 4v10m0 0l-4-4m4 4l4-4M5 18h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ProjectMediaGallery({
  items,
  zipBaseName = 'project-files',
  emptyLabel = 'No project files yet.'
}: ProjectMediaGalleryProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thumbFallback, setThumbFallback] = useState<Record<string, boolean>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [zipPercent, setZipPercent] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const playable = useMemo(
    () => items.filter((item) => !!item.url && (isImageMime(item.mimeType) || isVideoMime(item.mimeType) || !item.mimeType)),
    [items]
  );

  const active = playable.find((item) => item.id === activeId) || null;

  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  async function handleDownloadOne(item: GalleryMediaItem, e?: MouseEvent) {
    e?.stopPropagation();
    e?.preventDefault();
    setActionError(null);
    setDownloadingId(item.id);
    try {
      await downloadAsset({ name: item.name, url: item.url });
    } catch (err: any) {
      console.error('[gallery] download failed', err);
      setActionError(err?.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDownloadAll() {
    if (!playable.length || zipping) return;
    setActionError(null);
    setZipping(true);
    setZipPercent(0);
    try {
      await downloadAssetsAsZip(
        playable.map((item) => ({ name: item.name, url: item.url })),
        `${zipBaseName}.zip`,
        (p) => setZipPercent(p.percent)
      );
    } catch (err: any) {
      console.error('[gallery] zip failed', err);
      setActionError(err?.message || 'Could not create ZIP');
    } finally {
      setZipping(false);
      setZipPercent(0);
    }
  }

  if (!playable.length) {
    return <p className="text-sm text-white/35">{emptyLabel}</p>;
  }

  return (
    <div>
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="font-display text-4xl tracking-tight sm:text-5xl">Project Files</h2>
        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={zipping}
          className="inline-flex items-center justify-center gap-2 border border-white/25 bg-white px-5 py-3 text-[11px] uppercase tracking-[0.28em] text-black transition hover:bg-white/90 disabled:cursor-wait disabled:opacity-70"
        >
          {zipping ? (
            <>
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
              Zipping files… {zipPercent}%
            </>
          ) : (
            <>
              <DownloadIcon className="h-4 w-4" />
              Download All
            </>
          )}
        </button>
      </div>

      {actionError ? (
        <p className="mb-6 text-sm text-red-300/90">{actionError}</p>
      ) : null}

      <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
        {playable.map((item) => {
          const isImage = isImageMime(item.mimeType);
          const isVideo = isVideoMime(item.mimeType);
          const fullUrl = fullResolutionUrl(item.url) || item.url;
          const thumb =
            isImage && !thumbFallback[item.id]
              ? thumbnailUrl(item.url, { width: 600, quality: 75 }) || fullUrl
              : fullUrl;

          return (
            <div
              key={item.id}
              className="group relative mb-6 break-inside-avoid overflow-hidden border border-white/10 bg-white/[0.03]"
            >
              <button
                type="button"
                onClick={() => setActiveId(item.id)}
                className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                aria-label={`Open ${item.name}`}
              >
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={item.name}
                    loading="lazy"
                    decoding="async"
                    className="block h-auto w-full transition duration-300 group-hover:brightness-110"
                    onError={() => {
                      setThumbFallback((prev) => ({ ...prev, [item.id]: true }));
                    }}
                  />
                ) : isVideo ? (
                  <video
                    src={fullUrl}
                    className="block h-auto w-full pointer-events-none"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center text-xs text-white/35">
                    {item.name}
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={(e) => handleDownloadOne(item, e)}
                disabled={downloadingId === item.id}
                title={`Download ${item.name}`}
                aria-label={`Download ${item.name}`}
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center border border-white/20 bg-black/55 text-white backdrop-blur-sm transition hover:border-white/40 hover:bg-black/75 disabled:opacity-60"
              >
                {downloadingId === item.id ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                ) : (
                  <DownloadIcon />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {active ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
          role="dialog"
          aria-modal="true"
          aria-label={active.name}
        >
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 md:px-8">
            <div className="min-w-0">
              <p className="truncate font-display text-xl md:text-2xl">{active.name}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.28em] text-white/45">
                {typeof active.size === 'number' && active.size > 0
                  ? formatBytes(active.size)
                  : 'Full resolution'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadOne(active)}
                disabled={downloadingId === active.id}
                className="inline-flex items-center gap-2 border border-white/25 px-4 py-2 text-[11px] uppercase tracking-[0.25em] transition hover:border-white/50 disabled:opacity-60"
              >
                {downloadingId === active.id ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                ) : (
                  <DownloadIcon />
                )}
                Download
              </button>
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="flex h-10 w-10 items-center justify-center border border-white/20 transition hover:border-white/45"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          <div
            className="flex flex-1 items-center justify-center overflow-auto p-4 md:p-8"
            onClick={() => setActiveId(null)}
          >
            <div className="max-h-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
              {isImageMime(active.mimeType) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fullResolutionUrl(active.url) || active.url}
                  alt={active.name}
                  className="max-h-[80vh] w-auto max-w-full object-contain"
                />
              ) : (
                <video
                  src={fullResolutionUrl(active.url) || active.url}
                  className="max-h-[80vh] w-auto max-w-full"
                  controls
                  autoPlay
                  playsInline
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
