/** Unified Cloudflare R2 object key helpers for FramePort media. */

export function safeR2FileName(name: string) {
  const cleaned = (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || 'file';
}

/** `originals/board-{boardId}/{filename}` */
export function originalObjectKey(boardId: string, fileName: string) {
  return `originals/board-${boardId}/${safeR2FileName(fileName)}`;
}

/**
 * `thumbnails/board-{boardId}/{filename}-thumb.webp`
 * Strips an existing extension from filename before appending `-thumb.webp`.
 */
export function thumbnailObjectKey(boardId: string, fileName: string) {
  const safe = safeR2FileName(fileName);
  const base = safe.replace(/\.[^.]+$/, '') || safe;
  return `thumbnails/board-${boardId}/${base}-thumb.webp`;
}

/** `hero-frames/board-{boardId}-{timestamp}.webp` */
export function heroFrameObjectKey(boardId: string, timestamp = Date.now()) {
  return `hero-frames/board-${boardId}-${timestamp}.webp`;
}

export function isBoardScopedR2Key(fileKey: string, boardId: string) {
  const id = String(boardId);
  return (
    fileKey.startsWith(`originals/board-${id}/`) ||
    fileKey.startsWith(`thumbnails/board-${id}/`) ||
    fileKey.startsWith(`hero-frames/board-${id}-`)
  );
}

/** Best-effort Content-Type from File metadata / extension. */
export function resolveUploadContentType(file: Pick<File, 'name' | 'type'>, fallback = 'application/octet-stream') {
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const lower = (file.name || '').toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.avif')) return 'image/avif';
  return file.type || fallback;
}
