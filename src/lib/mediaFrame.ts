import { Board, BoardVideo, downloadMediaBlob } from './boards';

/** Prefer saved hero media, else first video/image with a URL. */
export function pickHeroMedia(board: Board): BoardVideo | null {
  const withUrl = board.videos.filter((v) => !!v.url);
  if (board.hero?.mediaId) {
    const chosen = withUrl.find((v) => v.id === board.hero?.mediaId);
    if (chosen) return chosen;
  }
  return (
    withUrl.find((v) => v.mimeType.startsWith('video/')) ||
    withUrl.find((v) => v.mimeType.startsWith('image/')) ||
    withUrl[0] ||
    null
  );
}

export function pickRandomVideo(videos: BoardVideo[]): BoardVideo | null {
  const pool = videos.filter((v) => v.mimeType.startsWith('video/') && (v.url || v.storagePath));
  if (!pool.length) {
    const images = videos.filter((v) => v.mimeType.startsWith('image/') && (v.url || v.storagePath));
    if (!images.length) return null;
    return images[Math.floor(Math.random() * images.length)];
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Random photo or video from board assets for the initial Hero Mood Frame. */
export function pickRandomHeroSource(videos: BoardVideo[]): BoardVideo | null {
  const pool = videos.filter(
    (v) =>
      (!!v.url || !!v.storagePath) &&
      (v.mimeType.startsWith('video/') || v.mimeType.startsWith('image/'))
  );
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Async frame capture — yields to the main thread and uses toBlob so large HD
 * frames don't freeze the UI. Safe under CORS failures.
 */
export async function captureVideoElementFrameAsync(
  video: HTMLVideoElement,
  maxEdge = 1920
): Promise<string | null> {
  await yieldToMain();
  try {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;

    let cw = w;
    let ch = h;
    const longest = Math.max(w, h);
    if (longest > maxEdge) {
      const scale = maxEdge / longest;
      cw = Math.max(1, Math.round(w * scale));
      ch = Math.max(1, Math.round(h * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, cw, ch);

    await yieldToMain();

    const blob: Blob | null = await new Promise((resolve) => {
      try {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
      } catch (err) {
        console.error('[mediaFrame] toBlob failed (tainted canvas / CORS)', err);
        resolve(null);
      }
    });

    if (blob) {
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }

    // Last resort — may throw on tainted canvas
    try {
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch (err) {
      console.error('[mediaFrame] toDataURL failed (tainted canvas / CORS)', err);
      return null;
    }
  } catch (err) {
    console.error('[mediaFrame] captureVideoElementFrameAsync failed', err);
    return null;
  }
}

/** @deprecated Prefer captureVideoElementFrameAsync */
export function captureVideoElementFrame(video: HTMLVideoElement): string | null {
  try {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (err) {
    console.error('[mediaFrame] capture failed (likely CORS)', err);
    return null;
  }
}

async function resolvePlayableSrc(media: BoardVideo): Promise<{ src: string; revoke?: () => void; kind: string }> {
  try {
    const { resolvePlayableMediaSource } = await import('./boards');
    const resolved = await resolvePlayableMediaSource(media);
    console.log('[mediaFrame] playable src=', resolved.src, 'kind=', resolved.kind);
    return resolved;
  } catch (err: any) {
    console.error('[mediaFrame] resolvePlayableSrc failed', {
      message: err?.message,
      err,
      url: media.url,
      storagePath: media.storagePath
    });
    if (media.url) {
      console.log('[mediaFrame] falling back to public URL:', media.url);
      return { src: media.url, kind: 'public' };
    }
    throw new Error(
      err?.message === 'Failed to fetch'
        ? 'Could not load video (network/CORS). Check console for the exact URL.'
        : err?.message || 'Could not resolve video URL.'
    );
  }
}

function loadVideoFrame(
  src: string,
  time: number | 'random'
): Promise<{ frameDataUrl: string; time: number } | null> {
  return new Promise((resolve) => {
    const useCors = /^https?:/i.test(src);
    console.log('[mediaFrame] loadVideoFrame src=', src, 'crossOrigin=', useCors);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    // Required for canvas export from remote media
    if (useCors) {
      video.crossOrigin = 'anonymous';
    }
    video.src = src;

    let settled = false;
    const finish = (result: { frameDataUrl: string; time: number } | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      try {
        video.removeAttribute('src');
        video.load();
      } catch {
        // ignore cleanup errors
      }
      resolve(result);
    };

    const timeout = window.setTimeout(() => {
      console.error('[mediaFrame] frame extract timed out for src=', src);
      finish(null);
    }, 20000);

    video.onerror = () => {
      console.error('[mediaFrame] video element error for src=', src, video.error);
      finish(null);
    };

    video.onloadedmetadata = () => {
      try {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        let t: number;
        if (time === 'random') {
          if (duration > 1) {
            const lo = duration * 0.12;
            const hi = duration * 0.88;
            t = lo + Math.random() * Math.max(hi - lo, 0.05);
          } else {
            t = Math.max(duration * 0.4, 0);
          }
        } else {
          t = Math.max(0, Math.min(time || 0, Math.max(duration - 0.05, 0)));
        }
        video.currentTime = t;
      } catch (err) {
        console.error('[mediaFrame] seek failed', err);
        finish(null);
      }
    };

    video.onseeked = () => {
      void (async () => {
        try {
          const frame = await captureVideoElementFrameAsync(video);
          if (!frame) {
            finish(null);
            return;
          }
          finish({ frameDataUrl: frame, time: video.currentTime || 0 });
        } catch (err) {
          console.error('[mediaFrame] capture on seeked failed', err);
          finish(null);
        }
      })();
    };
  });
}

/**
 * Capture a still from a video/image at an optional timestamp (seconds).
 */
export async function extractMediaFrameAt(
  media: BoardVideo,
  time = 0
): Promise<string | null> {
  try {
    if (!media.url && !media.storagePath) return null;

    if (media.mimeType.startsWith('image/')) {
      try {
        const blob = await downloadMediaBlob(media);
        if (blob) {
          return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : media.url);
            reader.onerror = () => resolve(media.url);
            reader.readAsDataURL(blob);
          });
        }
      } catch (err) {
        console.error('[mediaFrame] image blob read failed', err);
      }
      return media.url || null;
    }

    const resolved = await resolvePlayableSrc(media);
    try {
      const result = await loadVideoFrame(resolved.src, time);
      return result?.frameDataUrl || null;
    } finally {
      resolved.revoke?.();
    }
  } catch (err: any) {
    console.error('[mediaFrame] extractMediaFrameAt failed', err);
    return null;
  }
}

/** Random HD still from a video (or image fallback). */
export async function extractRandomHdFrame(
  media: BoardVideo
): Promise<{ frameDataUrl: string; time: number } | null> {
  try {
    if (!media.url && !media.storagePath) return null;

    if (media.mimeType.startsWith('image/')) {
      const frame = await extractMediaFrameAt(media, 0);
      return frame ? { frameDataUrl: frame, time: 0 } : null;
    }

    const resolved = await resolvePlayableSrc(media);
    try {
      return await loadVideoFrame(resolved.src, 'random');
    } finally {
      resolved.revoke?.();
    }
  } catch (err: any) {
    console.error('[mediaFrame] extractRandomHdFrame failed', err);
    return null;
  }
}

/**
 * Initial Hero Mood Frame still:
 * - Photos → high-res original
 * - Videos → first frame near 0.001s
 */
export async function extractInitialHeroFrame(
  media: BoardVideo
): Promise<{ frameDataUrl: string; time: number } | null> {
  try {
    if (!media.url && !media.storagePath) return null;

    if (media.mimeType.startsWith('image/')) {
      const frame = await extractMediaFrameAt(media, 0);
      return frame ? { frameDataUrl: frame, time: 0 } : null;
    }

    const resolved = await resolvePlayableSrc(media);
    try {
      return await loadVideoFrame(resolved.src, 0.001);
    } finally {
      resolved.revoke?.();
    }
  } catch (err: any) {
    console.error('[mediaFrame] extractInitialHeroFrame failed', err);
    return null;
  }
}

/** @deprecated use extractMediaFrameAt */
export function extractMediaFrame(media: BoardVideo): Promise<string | null> {
  return extractMediaFrameAt(media, 0.4);
}

export function formatTimecode(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${f}`;
}

export function isUsableImageSrc(src: string | null | undefined): src is string {
  if (!src || typeof src !== 'string') return false;
  if (src.startsWith('data:image/') || src.startsWith('blob:')) return true;
  try {
    const u = new URL(src);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
