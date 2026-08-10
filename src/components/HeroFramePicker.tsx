import { useEffect, useMemo, useRef, useState } from 'react';
import { BoardVideo, resolvePlayableMediaSource } from '../lib/boards';
import { captureVideoElementFrameAsync, formatTimecode, isUsableImageSrc } from '../lib/mediaFrame';

type Props = {
  videos: BoardVideo[];
  initialMediaId?: string | null;
  initialTime?: number;
  onCancel: () => void;
  onSave: (payload: { mediaId: string; time: number; frameDataUrl: string }) => void | Promise<void>;
  /** Upload a still image into the board and return the new media item */
  onUploadImage: (file: File) => Promise<BoardVideo | null>;
};

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

  const mediaOptions = useMemo(() => localVideos.filter((v) => !!v.url || !!v.storagePath), [localVideos]);
  const [mediaId, setMediaId] = useState(
    initialMediaId && mediaOptions.some((v) => v.id === initialMediaId)
      ? initialMediaId
      : mediaOptions[0]?.id || ''
  );
  const selected = mediaOptions.find((v) => v.id === mediaId) || null;
  const isVideo = !!selected?.mimeType.startsWith('video/');

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const playableUrlRef = useRef<string | null>(null);
  const sourceKindRef = useRef<'blob' | 'signed' | 'public' | null>(null);
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

  // Always set crossOrigin for remote http(s) sources used for canvas capture.
  // Never for blob: — that can break loading.
  const useCrossOrigin = !!playableSrc && /^https?:/i.test(playableSrc);

  useEffect(() => {
    if (!mediaId && mediaOptions[0]) setMediaId(mediaOptions[0].id);
  }, [mediaOptions, mediaId]);

  // Resolve a playable src (blob preferred) so scrubbing + canvas capture work
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
      sourceKindRef.current = null;

      if (!selected) return;

      setLoadingSource(true);
      try {
        console.log('[mood-frame] loading source for', selected.name, selected.id);
        const resolved = await resolvePlayableMediaSource(selected);
        if (cancelled) {
          resolved.revoke?.();
          return;
        }

        console.log('[mood-frame] resolved <video>/<img> URL:', resolved.src, 'kind=', resolved.kind);
        playableUrlRef.current = resolved.kind === 'blob' ? resolved.src : null;
        sourceKindRef.current = resolved.kind;
        setSourceKind(resolved.kind);
        setPlayableSrc(resolved.src);

        if (!selected.mimeType.startsWith('video/')) {
          setPreview(resolved.src);
          setReady(true);
        }
      } catch (err: any) {
        console.error('[HeroFramePicker] source load failed', err);
        const message =
          err?.message === 'Failed to fetch'
            ? 'Could not load this video (network/CORS). Check the console for the exact URL and that the vision-board-media bucket allows authenticated reads.'
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

    console.log('[mood-frame] attaching <video> element src=', playableSrc, 'crossOrigin=', useCrossOrigin);

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
              useCrossOrigin
                ? 'Frame capture blocked by CORS. Enable CORS on the vision-board-media bucket, or reload so a blob source is used.'
                : 'Could not capture this frame. Try another position.'
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
        `Video failed to load. URL logged in console. ${
          mediaError?.message || 'Check storage permissions / CORS for vision-board-media.'
        }`
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
  }, [selected?.id, isVideo, playableSrc, useCrossOrigin]);

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
      console.log('[mood-frame] scrub to', next, 'src=', playableSrc);
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
    setUploading(true);
    setError(null);
    try {
      const added = await onUploadImage(file);
      if (added) {
        setLocalVideos((prev) => {
          if (prev.some((v) => v.id === added.id)) return prev;
          return [...prev, added];
        });
        setMediaId(added.id);
      }
    } catch (err: any) {
      setError(err?.message || 'Image upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!selected || !preview || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        mediaId: selected.id,
        time: isVideo ? time : 0,
        frameDataUrl: preview
      });
    } catch (err: any) {
      console.error('[HeroFramePicker] save failed', err);
      setError(err?.message || 'Could not save mood frame.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden border border-white/20 bg-black text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
          <div>
            <h2 className="font-display text-3xl tracking-tight">Mood frame</h2>
            <p className="mt-2 text-sm text-white/45">
              Choose a clip, scrub to a frame, or upload a still image.
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

        <div className="grid flex-1 gap-0 overflow-auto md:grid-cols-[220px_1fr]">
          <aside className="border-b border-white/10 md:border-b-0 md:border-r">
            <p className="px-4 py-3 text-[11px] uppercase tracking-[0.25em] text-white/35">Source</p>
            <div className="px-2 pb-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || saving}
                className="w-full border border-dashed border-white/30 px-3 py-3 text-left text-[11px] uppercase tracking-[0.18em] text-white/70 transition hover:border-white hover:text-white"
              >
                {uploading ? 'Uploading…' : '+ Upload image'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleImageUpload(e.target.files)}
              />
            </div>
            <div className="max-h-48 space-y-1 overflow-auto px-2 pb-4 md:max-h-none">
              {mediaOptions.length === 0 && (
                <p className="px-3 py-2 text-sm text-white/40">No media yet — upload an image.</p>
              )}
              {mediaOptions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setMediaId(v.id)}
                  disabled={saving}
                  className={`block w-full truncate px-3 py-3 text-left text-sm transition ${
                    v.id === mediaId ? 'bg-white text-black' : 'text-white/70 hover:bg-white/10'
                  }`}
                >
                  {v.name}
                </button>
              ))}
            </div>
          </aside>

          <div className="space-y-5 p-5">
            <div className="relative aspect-video overflow-hidden border border-white/15 bg-white/5">
              {loadingSource && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 text-sm text-white/60">
                  Loading source…
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
                  Select or upload a source
                </div>
              )}
            </div>

            {isVideo && (
              <div>
                <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/45">
                  <span>Frame position</span>
                  <span>{formatTimecode(time)}</span>
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

            {error && <p className="text-sm text-red-300">{error}</p>}

            {isUsableImageSrc(preview) && (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-[0.25em] text-white/35">Backdrop preview</p>
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
