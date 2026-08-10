import Link from 'next/link';
import { useRouter } from 'next/router';
import { DragEvent, useEffect, useRef, useState } from 'react';
import AccountMenu from '../../components/AccountMenu';
import AmbientBackground from '../../components/AmbientBackground';
import HeroFramePicker from '../../components/HeroFramePicker';
import { getSession } from '../../lib/auth';
import {
  addVideoToBoard,
  Board,
  BoardVideo,
  ensureStorageCapacity,
  formatBytes,
  getBoard,
  removeVideoFromBoard,
  renameBoardVideo,
  reorderBoardVideos,
  saveBoardHero,
  updateBoardDetails,
  UploadCancelledError
} from '../../lib/boards';
import { extractRandomHdFrame, isUsableImageSrc, pickRandomVideo } from '../../lib/mediaFrame';
import { buildAndPublishSnapshot } from '../../lib/publish';

type UploadItem = {
  id: string;
  name: string;
  total: number;
  loaded: number;
  status: 'queued' | 'uploading' | 'done' | 'error' | 'cancelled';
  error?: string;
};

export default function BoardWorkspacePage() {
  const router = useRouter();
  const { boardId } = router.query;
  const id = Array.isArray(boardId) ? boardId[0] : boardId;
  const inputRef = useRef<HTMLInputElement>(null);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadControllersRef = useRef<Map<string, AbortController>>(new Map());
  const cancelledUploadsRef = useRef<Set<string>>(new Set());

  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [heroFrame, setHeroFrame] = useState<string | null>(null);
  const [framePickerOpen, setFramePickerOpen] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [logline, setLogline] = useState('');

  function flashSaved() {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  }

  function queuePublishSync() {
    if (!id) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        const latest = await getBoard(id);
        if (!latest?.publishedAt) return;
        await buildAndPublishSnapshot(id);
      } catch {
        // silent autosync
      }
    }, 1000);
  }

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
        if (data) {
          setTitle(data.title);
          setClientName(data.clientName);
          setCompanyName(data.companyName);
          setLogline(data.logline || '');
          // Only use a validated hero URL — never block page load on full-video frame extraction
          setHeroFrame(isUsableImageSrc(data.heroFrameUrl) ? data.heroFrameUrl : null);
        } else {
          setHeroFrame(null);
        }
      } catch (err) {
        console.error('[board] load failed', err);
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

  async function persistDetails(next?: {
    title?: string;
    clientName?: string;
    companyName?: string;
    logline?: string;
  }) {
    if (!id || !board) return;
    const payload = {
      title: next?.title ?? title,
      clientName: next?.clientName ?? clientName,
      companyName: next?.companyName ?? companyName,
      logline: next?.logline ?? logline
    };
    try {
      await updateBoardDetails(id, payload);
      setBoard({ ...board, ...payload, logline: payload.logline || undefined });
      flashSaved();
      queuePublishSync();
    } catch (err: any) {
      alert(err?.message || 'Save failed');
    }
  }

  function cancelUpload(itemId: string) {
    cancelledUploadsRef.current.add(itemId);
    const controller = uploadControllersRef.current.get(itemId);
    if (controller) {
      controller.abort();
      uploadControllersRef.current.delete(itemId);
    }
    setUploads((prev) =>
      prev.map((item) =>
        item.id === itemId && (item.status === 'queued' || item.status === 'uploading')
          ? { ...item, status: 'cancelled', error: undefined }
          : item
      )
    );
  }

  async function onFiles(files: FileList | null) {
    if (!files || !id || !board) return;

    const selected = Array.from(files).filter(
      (file) => file.type.startsWith('video/') || file.type.startsWith('image/')
    );
    if (!selected.length) {
      setUploadError('Choose video or image files only.');
      return;
    }

    const neededBytes = selected.reduce((sum, file) => sum + file.size, 0);
    setUploadError(null);

    // Preflight: do not start any uploads if storage cannot fit this batch
    try {
      await ensureStorageCapacity(neededBytes);
    } catch (err: any) {
      console.error('[board] storage preflight failed', err);
      setUploadError(err?.message || 'Not enough storage to upload these files.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    const batch: UploadItem[] = selected.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      name: file.name,
      total: file.size,
      loaded: 0,
      status: 'queued'
    }));

    cancelledUploadsRef.current = new Set();
    uploadControllersRef.current = new Map();
    setUploads(batch);
    setAdding(true);

    try {
      const next = [...board.videos];
      const uploadedBatch: BoardVideo[] = [];

      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        const itemId = batch[i].id;

        if (cancelledUploadsRef.current.has(itemId)) {
          setUploads((prev) =>
            prev.map((item) => (item.id === itemId ? { ...item, status: 'cancelled' } : item))
          );
          continue;
        }

        const controller = new AbortController();
        uploadControllersRef.current.set(itemId, controller);

        setUploads((prev) =>
          prev.map((item) => (item.id === itemId ? { ...item, status: 'uploading', loaded: 0 } : item))
        );

        try {
          const video = await addVideoToBoard(
            id,
            file,
            (progress) => {
              if (cancelledUploadsRef.current.has(itemId)) return;
              setUploads((prev) =>
                prev.map((item) =>
                  item.id === itemId
                    ? {
                        ...item,
                        status: 'uploading',
                        loaded: progress.loaded,
                        total: progress.total || file.size
                      }
                    : item
                )
              );
            },
            controller.signal
          );

          uploadControllersRef.current.delete(itemId);

          if (cancelledUploadsRef.current.has(itemId)) {
            setUploads((prev) =>
              prev.map((item) => (item.id === itemId ? { ...item, status: 'cancelled' } : item))
            );
            continue;
          }

          if (video) {
            next.push(video);
            uploadedBatch.push(video);
          }
          setUploads((prev) =>
            prev.map((item) =>
              item.id === itemId ? { ...item, status: 'done', loaded: item.total } : item
            )
          );
        } catch (err: any) {
          uploadControllersRef.current.delete(itemId);
          if (err instanceof UploadCancelledError || err?.name === 'UploadCancelledError') {
            setUploads((prev) =>
              prev.map((item) => (item.id === itemId ? { ...item, status: 'cancelled' } : item))
            );
            continue;
          }
          console.error('[board] file upload failed', err);
          const message = err?.message || 'Upload failed';
          setUploads((prev) =>
            prev.map((item) =>
              item.id === itemId ? { ...item, status: 'error', error: message } : item
            )
          );
          // Stop the rest of the batch if storage ran out mid-upload
          if (/storage is full|not enough storage|too large/i.test(message)) {
            setUploadError(message);
            break;
          }
        }
      }

      let updated: Board = { ...board, videos: next };
      setBoard(updated);
      flashSaved();
      queuePublishSync();

      // Mood frame capture runs after UI unlocks so uploads don't feel frozen
      if (uploadedBatch.length > 0) {
        const source = pickRandomVideo(uploadedBatch) || pickRandomVideo(next);
        if (source) {
          void (async () => {
            try {
              const captured = await extractRandomHdFrame(source);
              if (!captured?.frameDataUrl) return;
              const url = await saveBoardHero(
                id,
                { mediaId: source.id, time: captured.time },
                captured.frameDataUrl
              );
              const nextHero = isUsableImageSrc(url) ? url : captured.frameDataUrl;
              setHeroFrame(nextHero);
              setBoard((prev) =>
                prev
                  ? {
                      ...prev,
                      hero: { mediaId: source.id, time: captured.time },
                      heroFrameUrl: nextHero
                    }
                  : prev
              );
              flashSaved();
              queuePublishSync();
            } catch (err) {
              console.error('[board] auto mood frame failed', err);
            }
          })();
        }
      }
    } catch (err: any) {
      console.error('[board] upload batch failed', err);
      setUploadError(err?.message || 'Upload failed. Check Supabase Storage bucket `board_assets` and RLS policies.');
    } finally {
      setAdding(false);
      uploadControllersRef.current.clear();
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  async function applyOrder(nextIds: string[]) {
    if (!id || !board) return;
    const map = new Map(board.videos.map((v) => [v.id, v]));
    const next = nextIds.map((vid) => map.get(vid)).filter(Boolean) as typeof board.videos;
    try {
      await reorderBoardVideos(id, nextIds);
      setBoard({ ...board, videos: next });
      flashSaved();
      queuePublishSync();
    } catch (err: any) {
      alert(err?.message || 'Reorder failed');
    }
  }

  function onDragStart(videoId: string) {
    setDragId(videoId);
  }

  function onDragOverItem(e: DragEvent, videoId: string) {
    e.preventDefault();
    if (dragId && dragId !== videoId) setOverId(videoId);
  }

  function onDropItem(targetId: string) {
    if (!board || !dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const ids = board.videos.map((v) => v.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    applyOrder(next);
    setDragId(null);
    setOverId(null);
  }

  async function onRenameVideo(videoId: string, name: string) {
    if (!id || !board) return;
    setBoard({
      ...board,
      videos: board.videos.map((v) => (v.id === videoId ? { ...v, name } : v))
    });
    try {
      await renameBoardVideo(id, videoId, name);
      flashSaved();
      queuePublishSync();
    } catch (err: any) {
      alert(err?.message || 'Rename failed');
    }
  }

  async function onDeleteVideo(videoId: string) {
    if (!id || !board) return;
    if (!confirm('Remove this media from the board?')) return;
    await removeVideoFromBoard(id, videoId);
    const nextVideos = board.videos.filter((v) => v.id !== videoId);
    const nextHero =
      board.hero?.mediaId === videoId ? null : board.hero;
    setBoard({ ...board, videos: nextVideos, hero: nextHero });
    if (board.hero?.mediaId === videoId) {
      setHeroFrame(null);
    }
    flashSaved();
    queuePublishSync();
  }

  async function onSaveHero(payload: { mediaId: string; time: number; frameDataUrl: string }) {
    if (!id || !board) return;
    try {
      const url = await saveBoardHero(
        id,
        { mediaId: payload.mediaId, time: payload.time },
        payload.frameDataUrl
      );
      setBoard({
        ...board,
        hero: { mediaId: payload.mediaId, time: payload.time },
        heroFrameUrl: url
      });
      // Prefer persisted URL; fall back to the live capture so the UI always updates
      setHeroFrame(isUsableImageSrc(url) ? url : isUsableImageSrc(payload.frameDataUrl) ? payload.frameDataUrl : null);
      setFramePickerOpen(false);
      flashSaved();
      queuePublishSync();
    } catch (err: any) {
      console.error('[board] save mood frame failed', err);
      throw err;
    }
  }

  async function onUploadMoodImage(file: File): Promise<BoardVideo | null> {
    if (!id || !board) return null;
    try {
      await ensureStorageCapacity(file.size);
      const video = await addVideoToBoard(id, file);
      if (!video) return null;
      setBoard({ ...board, videos: [...board.videos, video] });
      flashSaved();
      queuePublishSync();
      return video;
    } catch (err: any) {
      console.error('[board] mood image upload failed', err);
      alert(err?.message || 'Upload failed');
      return null;
    }
  }

  async function handlePublish() {
    if (!id) return;
    setPublishing(true);
    try {
      const result = await buildAndPublishSnapshot(id);
      const refreshed = await getBoard(id);
      if (refreshed) setBoard(refreshed);
      setPublishUrl(result.url);
      setPublishOpen(true);
      setCopied(false);
      flashSaved();
    } catch (e: any) {
      alert(e?.message || 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  async function copyPublishLink() {
    if (!publishUrl) return;
    await navigator.clipboard.writeText(publishUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (loading) {
    return <main className="min-h-screen bg-black" />;
  }

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center">
          <p className="mb-4 text-white/50">Board not found.</p>
          <Link href="/dashboard" className="text-[11px] uppercase tracking-[0.25em] underline">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-black text-white">
      <header className="fixed left-0 right-0 top-0 z-30 flex items-center justify-between px-6 py-6 md:px-10">
        <Link href="/dashboard" className="text-[11px] uppercase tracking-[0.4em] text-white/70">
          FramePort
        </Link>
        <div className="flex items-center gap-3">
          {savedFlash && (
            <span className="hidden text-[11px] uppercase tracking-[0.2em] text-white/50 sm:inline">
              Autosaved
            </span>
          )}
          <button
            type="button"
            onClick={() => setFramePickerOpen(true)}
            className="border border-white/35 bg-black/30 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white backdrop-blur-sm transition hover:border-white"
          >
            Mood frame
          </button>
          <Link
            href={`/board/${board.id}/vision`}
            className="border border-white/50 bg-black/30 px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-white backdrop-blur-sm transition hover:border-white hover:bg-white hover:text-black"
          >
            Preview Board
          </Link>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="border border-white bg-white px-5 py-2.5 text-[11px] font-medium uppercase tracking-[0.2em] text-black transition hover:bg-transparent hover:text-white disabled:opacity-50"
          >
            {publishing ? 'Publishing…' : board.publishedAt ? 'Publish' : 'Publish'}
          </button>
          <AccountMenu />
        </div>
      </header>

      {/* Hero — live preview of editable names over mood frame */}
      <section className="relative flex min-h-screen items-end overflow-hidden">
        <div className="absolute inset-0">
          {isUsableImageSrc(heroFrame) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroFrame}
              alt=""
              className="h-full w-full object-cover"
              style={{ imageRendering: 'auto' }}
              onError={() => {
                console.warn('[board] hero image failed to load', heroFrame);
                setHeroFrame(null);
              }}
            />
          ) : (
            <AmbientBackground />
          )}
          {/* Light gradient only at the bottom so type stays readable without washing out the HD frame */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        </div>

        <div className="relative z-10 w-full px-6 pb-16 pt-28 md:px-10 md:pb-24">
          <div className="mx-auto max-w-6xl">
            <input
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value);
              }}
              onBlur={() => persistDetails({ companyName })}
              className="mb-5 w-full max-w-xl bg-transparent text-[11px] uppercase tracking-[0.4em] text-white/50 outline-none placeholder:text-white/25"
              placeholder="COMPANY NAME"
            />
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => persistDetails({ title })}
              rows={2}
              className="font-display w-full max-w-5xl resize-none bg-transparent text-6xl leading-[0.92] tracking-tight text-white outline-none placeholder:text-white/25 sm:text-7xl md:text-8xl lg:text-9xl"
              placeholder="Board title"
            />
            <div className="mt-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div className="w-full max-w-2xl">
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">Client</p>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  onBlur={() => persistDetails({ clientName })}
                  className="font-display mt-2 w-full bg-transparent text-3xl outline-none placeholder:text-white/25 sm:text-4xl md:text-5xl"
                  placeholder="Client name"
                />
                <textarea
                  value={logline}
                  onChange={(e) => setLogline(e.target.value)}
                  onBlur={() => persistDetails({ logline })}
                  rows={2}
                  className="mt-5 w-full resize-none bg-transparent text-lg leading-relaxed text-white/65 outline-none placeholder:text-white/25 md:text-xl"
                  placeholder="Logline (optional)"
                />
              </div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-white/35">Scroll to edit media</p>
            </div>
          </div>
        </div>
      </section>

      {/* Edit workspace */}
      <section className="relative z-10 border-t border-white/10 bg-black px-6 py-20 md:px-10 md:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-white/35">Content order</p>
              <h2 className="font-display mt-2 text-3xl tracking-tight sm:text-4xl">Arrange your board</h2>
              <p className="mt-3 text-sm text-white/40">Drag media with your mouse to reorder. Aspect ratios are preserved.</p>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={adding}
              className="border border-white bg-white px-6 py-3 text-[11px] font-medium uppercase tracking-[0.22em] text-black transition hover:bg-transparent hover:text-white disabled:opacity-50"
            >
              {adding ? 'Uploading…' : 'Add media +'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="video/*,image/*"
              multiple
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
          </div>

          {uploadError && (
            <div className="mb-8 border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {uploadError}
            </div>
          )}

          {uploads.length > 0 && (
            <div className="mb-10 border border-white/15 bg-white/[0.03] p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <p className="text-[11px] uppercase tracking-[0.3em] text-white/45">
                  {adding ? 'Uploading media' : 'Upload status'}
                </p>
                {!adding && (
                  <button
                    type="button"
                    onClick={() => setUploads([])}
                    className="text-[11px] uppercase tracking-[0.2em] text-white/40 hover:text-white"
                  >
                    Dismiss
                  </button>
                )}
              </div>
              <div className="space-y-4">
                {uploads.map((item) => {
                  const pct =
                    item.total > 0 ? Math.min(100, Math.round((item.loaded / item.total) * 100)) : 0;
                  const canCancel = item.status === 'queued' || item.status === 'uploading';
                  return (
                    <div key={item.id}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-white/80">{item.name}</span>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                            {item.status === 'queued' && 'Queued'}
                            {item.status === 'uploading' &&
                              `${pct}% · ${formatBytes(item.loaded)} / ${formatBytes(item.total)}`}
                            {item.status === 'done' && 'Done'}
                            {item.status === 'error' && 'Failed'}
                            {item.status === 'cancelled' && 'Cancelled'}
                          </span>
                          {canCancel && (
                            <button
                              type="button"
                              onClick={() => cancelUpload(item.id)}
                              aria-label={`Cancel upload ${item.name}`}
                              className="flex h-6 w-6 items-center justify-center border border-white/25 text-white/60 transition hover:border-white hover:text-white"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden bg-white/10">
                        <div
                          className={`h-full transition-[width] duration-150 ${
                            item.status === 'error'
                              ? 'bg-red-400'
                              : item.status === 'cancelled'
                                ? 'bg-white/25'
                                : item.status === 'done'
                                  ? 'bg-white'
                                  : 'bg-white/70'
                          }`}
                          style={{
                            width: `${
                              item.status === 'queued' || item.status === 'cancelled'
                                ? item.status === 'cancelled'
                                  ? pct
                                  : 0
                                : item.status === 'done'
                                  ? 100
                                  : pct
                            }%`
                          }}
                        />
                      </div>
                      {item.error && <p className="mt-2 text-xs text-red-300">{item.error}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mb-12 flex justify-center">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={adding}
              className="group flex h-40 w-40 flex-col items-center justify-center border border-white/35 transition hover:border-white hover:bg-white/5 disabled:opacity-50"
              aria-label="Add videos"
            >
              <span className="font-display text-6xl leading-none text-white/80">+</span>
              <span className="mt-3 text-[11px] uppercase tracking-[0.25em] text-white/45">
                {adding ? 'Uploading…' : 'Add video'}
              </span>
            </button>
          </div>

          {board.videos.length > 0 ? (
            <div className="columns-1 gap-5 sm:columns-2 lg:columns-3">
              {board.videos.map((v, index) => (
                <div
                  key={v.id}
                  draggable
                  onDragStart={() => onDragStart(v.id)}
                  onDragOver={(e) => onDragOverItem(e, v.id)}
                  onDragLeave={() => setOverId((cur) => (cur === v.id ? null : cur))}
                  onDrop={() => onDropItem(v.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  className={`mb-5 break-inside-avoid border bg-white/[0.03] transition ${
                    dragId === v.id
                      ? 'border-white opacity-50'
                      : overId === v.id
                        ? 'border-white'
                        : 'border-white/15'
                  } cursor-grab active:cursor-grabbing`}
                >
                  <div className="relative bg-black">
                    {v.url ? (
                      v.mimeType.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={v.url} alt={v.name} className="block h-auto w-full" />
                      ) : (
                        <video
                          src={v.url}
                          className="block h-auto w-full"
                          muted
                          playsInline
                          preload="metadata"
                          controls={false}
                        />
                      )
                    ) : (
                      <div className="flex aspect-video items-center justify-center text-xs text-white/40">—</div>
                    )}
                    <div className="pointer-events-none absolute left-2 top-2 bg-black/55 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/80">
                      {index + 1}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3">
                    <input
                      value={v.name}
                      onChange={(e) => onRenameVideo(v.id, e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => onDeleteVideo(v.id)}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="shrink-0 text-[10px] uppercase tracking-[0.15em] text-white/40 hover:text-white"
                    >
                      Delete
                    </button>
                  </div>
                  {board.hero?.mediaId === v.id && (
                    <p className="px-3 pb-3 text-[10px] uppercase tracking-[0.2em] text-white/35">Mood source</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-white/35">
              No videos yet — tap + to add the first frame to this board.
            </p>
          )}
        </div>
      </section>

      {framePickerOpen && (
        <HeroFramePicker
          videos={board.videos}
          initialMediaId={board.hero?.mediaId}
          initialTime={board.hero?.time}
          onCancel={() => setFramePickerOpen(false)}
          onSave={onSaveHero}
          onUploadImage={onUploadMoodImage}
        />
      )}

      {publishOpen && publishUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg border border-white/20 bg-black p-8 text-white">
            <h2 className="font-display text-3xl tracking-tight">Published</h2>
            <p className="mt-3 text-sm text-white/50">
              Send this link to your client. Edits you make will autosave to this vision board.
            </p>
            <div className="mt-6 break-all border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80">
              {publishUrl}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={copyPublishLink}
                className="border border-white bg-white px-5 py-3 text-[11px] uppercase tracking-[0.2em] text-black"
              >
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <a
                href={publishUrl}
                target="_blank"
                rel="noreferrer"
                className="border border-white/35 px-5 py-3 text-[11px] uppercase tracking-[0.2em] text-white"
              >
                Open
              </a>
              <button
                type="button"
                onClick={() => setPublishOpen(false)}
                className="px-5 py-3 text-[11px] uppercase tracking-[0.2em] text-white/45 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
