import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { downloadAsset, downloadAssetsAsZip } from '../lib/download';
import { formatBytes } from '../lib/boards';
import {
  fullResolutionUrl,
  isImageMime,
  isVideoMime,
  resolveGridThumbnailUrl
} from '../lib/mediaUrls';
import BlurUpImage from './BlurUpImage';

export type GalleryMediaItem = {
  id: string;
  name: string;
  mimeType: string;
  /** Full-resolution / original URL */
  url: string;
  thumbnailUrl?: string | null;
  size?: number | null;
};

type FilterTab = 'all' | 'photos' | 'videos';

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

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'photos', label: 'Photos' },
  { id: 'videos', label: 'Videos' }
];

export default function ProjectMediaGallery({
  items,
  zipBaseName = 'project-files',
  emptyLabel = 'No project files yet.'
}: ProjectMediaGalleryProps) {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thumbFallback, setThumbFallback] = useState<Record<string, boolean>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [zipPercent, setZipPercent] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const playable = useMemo(
    () =>
      items.filter(
        (item) =>
          !!item.url &&
          (isImageMime(item.mimeType) || isVideoMime(item.mimeType) || !item.mimeType)
      ),
    [items]
  );

  const filtered = useMemo(() => {
    if (filter === 'photos') return playable.filter((item) => isImageMime(item.mimeType));
    if (filter === 'videos') return playable.filter((item) => isVideoMime(item.mimeType));
    return playable;
  }, [playable, filter]);

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
      await downloadAsset({ name: item.name, url: fullResolutionUrl(item.url) || item.url });
    } catch (err: any) {
      console.error('[gallery] download failed', err);
      setActionError(err?.message || 'Download failed');
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDownloadAll() {
    const targets = filtered.length ? filtered : playable;
    if (!targets.length || zipping) return;
    setActionError(null);
    setZipping(true);
    setZipPercent(0);
    try {
      await downloadAssetsAsZip(
        targets.map((item) => ({
          name: item.name,
          url: fullResolutionUrl(item.url) || item.url
        })),
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
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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

      <div className="mb-8 flex flex-wrap gap-2" role="tablist" aria-label="Media categories">
        {TABS.map((tab) => {
          const selected = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setFilter(tab.id)}
              className={`px-4 py-2 text-[11px] uppercase tracking-[0.28em] transition ${
                selected
                  ? 'bg-white text-black'
                  : 'border border-white/20 text-white/70 hover:border-white/40 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {actionError ? (
        <p className="mb-6 text-sm text-red-300/90">{actionError}</p>
      ) : null}

      {!filtered.length ? (
        <p className="text-sm text-white/35">No {filter === 'photos' ? 'photos' : 'videos'} in this board.</p>
      ) : (
        <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
          {filtered.map((item) => {
            const isImage = isImageMime(item.mimeType);
            const isVideo = isVideoMime(item.mimeType);
            const fullUrl = fullResolutionUrl(item.url) || item.url;
            const thumb = thumbFallback[item.id]
              ? fullUrl
              : resolveGridThumbnailUrl({
                  thumbnailUrl: item.thumbnailUrl,
                  originalUrl: item.url,
                  mimeType: item.mimeType
                }) || fullUrl;

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
                  {isImage || (isVideo && item.thumbnailUrl && !thumbFallback[item.id]) ? (
                    <BlurUpImage
                      src={thumb}
                      alt={item.name}
                      className="block h-auto w-full group-hover:brightness-110"
                      onError={() => {
                        setThumbFallback((prev) => ({ ...prev, [item.id]: true }));
                      }}
                    />
                  ) : isVideo ? (
                    <video
                      src={fullUrl}
                      className="pointer-events-none block h-auto w-full"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-xs text-white/35">
                      {item.name}
                    </div>
                  )}
                  {isVideo ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                        ▶
                      </span>
                    </div>
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={(e) => handleDownloadOne(item, e)}
                  disabled={downloadingId === item.id}
                  title={`Download ${item.name}`}
                  aria-label={`Download ${item.name}`}
                  className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/90 disabled:opacity-60"
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
      )}

      {active ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white"
          role="dialog"
          aria-modal="true"
          aria-label={active.name}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setActiveId(null);
            }}
            className="fixed right-4 top-4 z-50 cursor-pointer rounded-full bg-black/60 p-2 text-2xl leading-none text-white transition hover:bg-black/90 md:right-6 md:top-6"
            aria-label="Close preview"
          >
            <span className="flex h-7 w-7 items-center justify-center">×</span>
          </button>

          <div
            className="flex flex-1 items-center justify-center overflow-auto px-4 pb-10 pt-16 md:px-8"
            onClick={() => setActiveId(null)}
          >
            <div
              className="flex w-full max-w-6xl flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              {isImageMime(active.mimeType) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fullResolutionUrl(active.url) || active.url}
                  alt={active.name}
                  className="max-h-[70vh] w-auto max-w-full object-contain"
                />
              ) : (
                <video
                  src={fullResolutionUrl(active.url) || active.url}
                  className="max-h-[70vh] w-auto max-w-full"
                  controls
                  autoPlay
                  playsInline
                />
              )}

              <div className="mt-5 flex w-full max-w-xl flex-col items-center gap-4 text-center">
                <div>
                  <p className="truncate px-4 text-sm text-white md:text-base">{active.name}</p>
                  {typeof active.size === 'number' && active.size > 0 ? (
                    <p className="mt-1 text-xs lowercase tracking-wide text-white/70">
                      {formatBytes(active.size)}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => handleDownloadOne(active)}
                  disabled={downloadingId === active.id}
                  className="inline-flex items-center gap-2 border border-white/30 px-5 py-2.5 text-[11px] uppercase tracking-[0.25em] text-white transition hover:border-white/60 disabled:opacity-60"
                >
                  {downloadingId === active.id ? (
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                  ) : (
                    <DownloadIcon />
                  )}
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
