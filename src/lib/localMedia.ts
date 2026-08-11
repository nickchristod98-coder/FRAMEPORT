/**
 * Session-local object URLs for board media.
 * Used for previews / mood-frame scrubbing without fetching R2 from the browser.
 */

const localUrls = new Map<string, string>();

export function setLocalMediaObjectUrl(mediaId: string, objectUrl: string) {
  const prev = localUrls.get(mediaId);
  if (prev && prev !== objectUrl && prev.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(prev);
    } catch {
      // ignore
    }
  }
  localUrls.set(mediaId, objectUrl);
}

export function getLocalMediaObjectUrl(mediaId: string | null | undefined): string | null {
  if (!mediaId) return null;
  return localUrls.get(mediaId) || null;
}

export function clearLocalMediaObjectUrl(mediaId: string) {
  const prev = localUrls.get(mediaId);
  if (prev?.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(prev);
    } catch {
      // ignore
    }
  }
  localUrls.delete(mediaId);
}

/** Create (or replace) a local blob URL from a File/Blob for this media id. */
export function rememberLocalFile(mediaId: string, file: Blob): string {
  const objectUrl = URL.createObjectURL(file);
  setLocalMediaObjectUrl(mediaId, objectUrl);
  return objectUrl;
}
