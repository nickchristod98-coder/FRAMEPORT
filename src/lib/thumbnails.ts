/** Client-side WebP thumbnail / hero-frame generation for R2 uploads. */

import { heroFrameObjectKey, thumbnailObjectKey } from './r2Paths';

export { heroFrameObjectKey, thumbnailObjectKey };

export const THUMB_MAX_EDGE = 600;
export const THUMB_QUALITY = 0.75;
export const HERO_WEBP_QUALITY = 0.85;

export type GeneratedThumbnail = {
  blob: Blob;
  file: File;
  width: number;
  height: number;
};

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality = THUMB_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode WebP'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      quality
    );
  });
}

function fitWithin(width: number, height: number, maxEdge: number) {
  if (width <= 0 || height <= 0) return { width: maxEdge, height: maxEdge };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function drawImageToThumbCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxEdge = THUMB_MAX_EDGE
): HTMLCanvasElement {
  const { width, height } = fitWithin(sourceWidth, sourceHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/** Compress a photo into a WebP thumbnail (max edge 600px, quality 0.75). */
export async function generateImageThumbnail(
  file: Blob,
  maxEdge = THUMB_MAX_EDGE,
  quality = THUMB_QUALITY
): Promise<GeneratedThumbnail> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image for thumbnail'));
      el.src = objectUrl;
    });
    const canvas = drawImageToThumbCanvas(
      img,
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      maxEdge
    );
    const blob = await canvasToWebpBlob(canvas, quality);
    return {
      blob,
      file: new File([blob], 'thumb.webp', { type: 'image/webp' }),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Capture a video frame near t=0.001s and export as WebP thumbnail.
 */
export async function generateVideoThumbnail(
  file: Blob,
  seekSeconds = 0.001,
  maxEdge = THUMB_MAX_EDGE,
  quality = THUMB_QUALITY
): Promise<GeneratedThumbnail> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = () => reject(new Error('Could not load video for thumbnail'));
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const target = Math.max(
      0,
      Math.min(seekSeconds, duration > 0 ? Math.max(duration - 0.05, 0) : seekSeconds)
    );

    await new Promise<void>((resolve, reject) => {
      const onSeeked = () => resolve();
      const onError = () => reject(new Error('Could not seek video for thumbnail'));
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
      try {
        video.currentTime = target;
      } catch (err) {
        reject(err);
      }
    });

    const canvas = drawImageToThumbCanvas(
      video,
      video.videoWidth || THUMB_MAX_EDGE,
      video.videoHeight || THUMB_MAX_EDGE,
      maxEdge
    );
    const blob = await canvasToWebpBlob(canvas, quality);
    return {
      blob,
      file: new File([blob], 'thumb.webp', { type: 'image/webp' }),
      width: canvas.width,
      height: canvas.height
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function generateMediaThumbnail(file: File): Promise<GeneratedThumbnail | null> {
  try {
    if (file.type.startsWith('image/')) {
      return await generateImageThumbnail(file);
    }
    if (file.type.startsWith('video/')) {
      return await generateVideoThumbnail(file);
    }
    const lower = file.name.toLowerCase();
    if (/\.(jpe?g|png|gif|webp|avif|heic)$/i.test(lower)) {
      return await generateImageThumbnail(file);
    }
    if (/\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(lower)) {
      return await generateVideoThumbnail(file);
    }
    return null;
  } catch (err) {
    console.warn('[thumbnails] generation failed', err);
    return null;
  }
}

/** Re-encode any image blob/data as WebP for hero mood frames. */
export async function encodeImageBlobAsWebp(
  input: Blob,
  quality = HERO_WEBP_QUALITY
): Promise<Blob> {
  const objectUrl = URL.createObjectURL(input);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image for WebP encode'));
      el.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width || 1;
    canvas.height = img.naturalHeight || img.height || 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0);
    return await canvasToWebpBlob(canvas, quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
