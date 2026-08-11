/**
 * Full-resolution URL with cache-bust / transform query stripped.
 */
export function fullResolutionUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // Prefer original object URL (not image transform render path)
    if (parsed.pathname.includes('/storage/v1/render/image/public/')) {
      parsed.pathname = parsed.pathname.replace(
        '/storage/v1/render/image/public/',
        '/storage/v1/object/public/'
      );
    }
    // Drop transform / signed / cache-bust params for a stable full-res URL
    parsed.search = '';
    return parsed.toString();
  } catch {
    return url.split('?')[0] || url;
  }
}

/**
 * Prefer a session-local blob URL (upload/interaction), then stored R2 thumbnail,
 * then original. Never converts remote URLs into blobs — callers use the string as img/video src.
 */
export function resolveGridThumbnailUrl(opts: {
  localObjectUrl?: string | null;
  thumbnailUrl?: string | null;
  originalUrl?: string | null;
  mimeType?: string | null;
}): string | null {
  if (opts.localObjectUrl?.startsWith('blob:') || opts.localObjectUrl?.startsWith('data:')) {
    return opts.localObjectUrl;
  }
  if (opts.thumbnailUrl && /^https?:\/\//i.test(opts.thumbnailUrl)) {
    return opts.thumbnailUrl.split('?')[0];
  }
  const original = fullResolutionUrl(opts.originalUrl);
  if (!original) return null;
  if (opts.mimeType?.startsWith('video/')) return original;
  return thumbnailUrl(original, { width: 600, quality: 75 }) || original;
}

/**
 * Lower-res thumbnail URL for grid display.
 * Uses Supabase image transforms when the URL is a Storage public object URL;
 * otherwise appends width/quality query params as a best-effort hint.
 */
export function thumbnailUrl(
  url: string | null | undefined,
  opts: { width?: number; quality?: number } = {}
): string | null {
  const full = fullResolutionUrl(url);
  if (!full) return null;

  const width = opts.width ?? 600;
  const quality = opts.quality ?? 75;

  try {
    const parsed = new URL(full);
    if (parsed.pathname.includes('/storage/v1/object/public/')) {
      parsed.pathname = parsed.pathname.replace(
        '/storage/v1/object/public/',
        '/storage/v1/render/image/public/'
      );
      parsed.searchParams.set('width', String(width));
      parsed.searchParams.set('quality', String(quality));
      parsed.searchParams.set('resize', 'contain');
      return parsed.toString();
    }

    parsed.searchParams.set('width', String(width));
    parsed.searchParams.set('quality', String(quality));
    return parsed.toString();
  } catch {
    return full;
  }
}

export function isImageMime(mimeType: string | null | undefined) {
  return !!mimeType && mimeType.startsWith('image/');
}

export function isVideoMime(mimeType: string | null | undefined) {
  return !!mimeType && mimeType.startsWith('video/');
}

export function formatUploadDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}
