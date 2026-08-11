import { useEffect, useMemo, useRef, useState } from 'react';
import { BoardVideo, resolvePlayableMediaSource } from '../lib/boards';
import { captureVideoElementFrameAsync, formatTimecode, isUsableImageSrc } from '../lib/mediaFrame';
import { isImageMime, isVideoMime, resolveGridThumbnailUrl } from '../lib/mediaUrls';
import BlurUpImage from './BlurUpImage';

type Props = {
  videos: BoardVideo[];
  initialMediaId?: string | null;
  initialTime?: number;
  onCancel: () => void;
  onSave: (payload: { mediaId: string; time: number; frameDataUrl: string }) => void | Promise<void>;
  /** Upload a still image into the board and return the new media item */
  onUploadImage: (file: File) => Promise<BoardVideo | null>;
};

type SourceFilter = 'all' | 'photos' | 'videos';

/**
 * Mood Frame modal:
 * a) Pick an existing high-res photo from board files
 * b) Scrub a video via blob: URL.createObjectURL (avoids CORS)
 * c) Upload a separate image/screenshot
 */
export default function HeroFramePicker({
  videos,
  initialMediaId,
  initialTime = 0,
  onCancel,
  onSave,
  onUploadImage
}: Props) {
  const [localVideos, setLocalVideos] = useState(videos);
  useEffect(() => setLocalVideos(videos), [videos]);

  const [filter, setFilter] = useState<SourceFilter>('all');
  const mediaOptions = useMemo(() => {
    const withSrc = localVideos.filter((v) => !!v.url || !!v.storagePath);
    if (filter === 'photos') return withSrc.filter((v) => isImageMime(v.mimeType));
    if (filter === 'videos') return withSrc.filter((v) => isVideoMime(v.mimeType));
    return withSrc;
  }, [localVideos, filter]);

  const [mediaId, setMediaId] = useState(
    initialMediaId && localVideos.some((v) => v.id === initialMediaId)
      ? initialMediaId
      : mediaOptions[0]?.id || ''
  );
  const selected = localVideos.find((v) => v.id === mediaId) || mediaOptions[0] || null;
  const isVideo = !!selected && isVideoMime(selected.mimeType);
  const isPhoto = !!selected && isImageMime(selected.mimeType);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playableUrlRef = useRef<string | null>(null);
  const [playableSrc, setPlayableSrc] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<'blob' | 'signed' | 'public' | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(initialTime || 0);
  const [preview, setPreview] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only set crossOrigin for remote http(s) — never for blob: (breaks loading / capture)
  const useCrossOrigin = !!playableSrc && /^https?:/i.test(playableSrc);

  useEffect(() => {
    if (!mediaId && mediaOptions[0]) setMediaId(mediaOptions[0].id);
  }, [mediaOptions, mediaId]);

  // Resolve playable src — prefer blob: from original_url for CORS-safe canvas capture
  useEffect(() => {
    let cancelled = false;
    const prev = playableUrlRef.current;

    async function loadSource() {
      setReady(false);
      setPreview(null);
      setError(null);
      setDuration(0);
      setTime(initialMediaId === mediaId ? initialTime || 0 : 0);
      setPlayableSrc(null);
      setSourceKind(null);

      if (!selected) return;

      setLoadingSource(true);
      try {
        const resolved = await resolvePlayableMediaSource(selected);
        if (cancelled) {
          resolved.revoke?.();
          return;
        }

        playableUrlRef.current = resolved.kind === 'blob' ? resolved.src : null;
        setSourceKind(resolved.kind);
        setPlayableSrc(resolved.src);

        if (!isVideoMime(selected.mimeType)) {
          // High-res photo preview — use blob or original URL
          setPreview(resolved.src);
          setReady(true);
        }
      } catch (err: any) {
        console.error('[HeroFramePicker] source load failed', err);
        const message =
          err?.message === 'Failed to fetch'
            ? 'Could not load this file. Check R2 CORS allows GET from this origin.'
            : err?.message || 'Could not load media.';
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoadingSource(false);
      }
    }

    loadSource();

    return () => {
      cancelled = true;
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!selected || !isVideo || !playableSrc) return;
    const el = videoRef.current;
    if (!el) return;

    const onMeta = () => {
      try {
        setDuration(el.duration || 0);
        const t = Math.min(Math.max(time, 0), Math.max((el.duration || 0) - 0.05, 0));
        el.currentTime = t;
      } catch (err) {
        console.error('[HeroFramePicker] initial seek failed', err);
        setError('Could not seek in this video. Try another source.');
      }
    };

    const onSeeked = () => {
      void (async () => {
        try {
          const frame = await captureVideoElementFrameAsync(el);
          if (frame) {
            setPreview(frame);
            setReady(true);
            setError(null);
          } else {
            setError(
              sourceKind === 'blob'
                ? 'Could not capture this frame. Try another position.'
                : 'Frame capture blocked by CORS. Enable CORS on the R2 bucket, or reload so a local blob source is used.'
            );
            setReady(false);
          }
        } catch (err: any) {
          console.error('[HeroFramePicker] seeked capture failed', err);
          setError(err?.message || 'Could not capture this frame.');
          setReady(false);
        }
      })();
    };

    const onVideoError = () => {
      const mediaError = el.error;
      console.error('[mood-frame] <video> element error', {
        src: playableSrc,
        code: mediaError?.code,
        message: mediaError?.message
      });
      setError(
        `Video failed to load. ${mediaError?.message || 'Check R2 public access / CORS.'}`
      );
      setReady(false);
    };

    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('seeked', onSeeked);
    el.addEventListener('error', onVideoError);
    el.load();

    return () => {
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('seeked', onSeeked);
      el.removeEventListener('error', onVideoError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, isVideo, playableSrc, sourceKind, useCrossOrigin]);

  function scrub(next: number) {
    try {
      setTime(next);
      setReady(false);
      const el = videoRef.current;
      if (!el) return;
      if (!Number.isFinite(el.duration) || el.duration <= 0) {
        setError('Video metadata is not ready yet. Wait a moment and try again.');
        return;
      }
      el.currentTime = Math.min(Math.max(next, 0), Math.max(el.duration - 0.05, 0));
    } catch (err: any) {
      console.error('[HeroFramePicker] scrub failed', err);
      setError(err?.message || 'Could not scrub this video.');
    }
  }

  async function handleImageUpload(files: FileList | null) {
    if (!files?.[0]) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      return;
    }

    // Instant local preview via createObjectURL (no CORS)
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    setReady(true);
    setError(null);
    setUploading(true);

    try {
      const added = await onUploadImage(file);
      if (added) {
        setLocalVideos((prev) => {
          if (prev.some((v) => v.id === added.id)) return prev;
          return [...prev, added];
        });
        setMediaId(added.id);
        setFilter('photos');
      }
    } catch (err: any) {
      setError(err?.message || 'Image upload failed');
      setReady(false);
    } finally {
      setUploading(false);
      // Keep local preview until the selected source reloads; revoke later via effect cleanup
    }
  }

  async function handleSave() {
    if (!selected || !preview || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Prefer a durable data URL / http URL for R2 upload (blob: may be revoked)
      let frameDataUrl = preview;
      if (preview.startsWith('blob:') && isPhoto && playableSrc) {
        try {
          const res = await fetch(playableSrc.startsWith('blob:') ? playableSrc : preview);
          const blob = await res.blob();
          frameDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve(typeof reader.result === 'string' ? reader.result : preview);
            reader.onerror = () => reject(new Error('Could not read frame'));
            reader.readAsDataURL(blob);
          });
        } catch {
          // fall through with preview
        }
      }

      await onSave({
        mediaId: selected.id,
        time: isVideo ? time : 0,
        frameDataUrl
      });
    } catch (err: any) {
      console.error('[HeroFramePicker] save failed', err);
      setError(err?.message || 'Could not save mood frame.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden border border-white/20 bg-black text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="font-display text-3xl tracking-tight">Mood frame</h2>
            <p className="mt-2 max-w-xl text-sm text-white/45">
              Pick a photo, scrub a video for a high-res still, or upload a screenshot. Saved frames go to
              Cloudflare R2.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="border border-white/25 px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-white/70 hover:border-white hover:text-white disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!preview || !ready || saving || loadingSource}
              onClick={handleSave}
              className="border border-white bg-white px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-black disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save frame'}
            </button>
          </div>
        </div>

        <div className="grid flex-1 gap-0 overflow-auto md:grid-cols-[260px_1fr]">
          <aside className="border-b border-white/10 md:border-b-0 md:border-r">
            <div className="flex gap-1 px-3 pt-3">
              {(
                [
                  ['all', 'All'],
                  ['photos', 'Photos'],
                  ['videos', 'Videos']
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] transition ${
                    filter === id ? 'bg-white text-black' : 'text-white/50 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="px-3 py-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || saving}
                className="w-full border border-dashed border-white/30 px-3 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-white/70 transition hover:border-white hover:text-white"
              >
                {uploading ? 'Uploading…' : '+ Upload screenshot'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageUpload(e.target.files)}
              />
            </div>

            <div className="max-h-56 space-y-1 overflow-auto px-2 pb-4 md:max-h-[55vh]">
              {mediaOptions.length === 0 && (
                <p className="px-3 py-2 text-sm text-white/40">
                  No media yet — upload a screenshot or add files to the board.
                </p>
              )}
              {mediaOptions.map((v) => {
                const thumb =
                  resolveGridThumbnailUrl({
                    thumbnailUrl: v.thumbnailUrl,
                    originalUrl: v.url,
                    mimeType: v.mimeType
                  }) || v.url;
                const active = v.id === mediaId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setMediaId(v.id)}
                    disabled={saving}
                    className={`flex w-full items-center gap-3 px-2 py-2 text-left transition ${
                      active ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <div className="h-12 w-12 shrink-0 overflow-hidden bg-white/10">
                      {thumb ? (
                        <BlurUpImage
                          src={thumb}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm">{v.name}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="space-y-5 p-5">
            <div className="relative aspect-video overflow-hidden border border-white/15 bg-white/5">
              {loadingSource && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-sm text-white/60">
                  Loading high-res source…
                </div>
              )}
              {isVideo && selected && playableSrc ? (
                <video
                  key={`${selected.id}-${sourceKind}-${useCrossOrigin ? 'cors' : 'local'}`}
                  ref={videoRef}
                  src={playableSrc}
                  className="h-full w-full object-contain"
                  muted
                  playsInline
                  preload="auto"
                  {...(useCrossOrigin ? { crossOrigin: 'anonymous' as const } : {})}
                />
              ) : selected && playableSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={playableSrc} alt={selected.name} className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/35">
                  Select a photo, scrub a video, or upload a screenshot
                </div>
              )}
            </div>

            {isVideo && (
              <div>
                <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/45">
                  <span>Scrub frame</span>
                  <span>
                    {formatTimecode(time)}
                    {sourceKind === 'blob' ? ' · local blob' : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(duration || 0, 0.01)}
                  step={0.05}
                  value={Math.min(time, duration || 0)}
                  onChange={(e) => scrub(Number(e.target.value))}
                  disabled={loadingSource || saving || !duration}
                  className="w-full accent-white"
                />
              </div>
            )}

            {isPhoto && (
              <p className="text-sm text-white/45">
                Using this photo at full resolution as the mood frame.
              </p>
            )}

            {error && <p className="text-sm text-red-300">{error}</p>}

            {isUsableImageSrc(preview) && (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-white/35">
                  Hero preview
                </p>
                <div className="relative h-36 overflow-hidden border border-white/15">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setPreview(null)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
