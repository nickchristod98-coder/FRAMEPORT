import { supabase } from './supabaseClient';
import { getAuthUserId } from './auth';

export type BoardVideo = {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  storagePath?: string;
  sortOrder?: number;
  size?: number | null;
  createdAt?: string | null;
};

export type BoardHero = {
  mediaId: string;
  time: number;
};

export type Board = {
  id: string;
  title: string;
  clientName: string;
  companyName: string;
  logline?: string;
  createdAt: string;
  publicId?: string | null;
  publishedAt?: string | null;
  hero?: BoardHero | null;
  videos: BoardVideo[];
  heroFrameUrl?: string | null;
  heroFramePath?: string | null;
  /** Optional password required for public client view */
  accessPassword?: string | null;
};

/** Cloudflare R2 public base URL (no trailing slash). */
function r2PublicBaseUrl() {
  return (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || '').replace(/\/+$/, '');
}

export function getStorageBucketName() {
  return process.env.R2_BUCKET_NAME || process.env.NEXT_PUBLIC_R2_BUCKET_NAME || 'r2';
}

export function isLocalMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('blob:') || url.startsWith('data:');
}

/** Default 1GB — override with NEXT_PUBLIC_STORAGE_LIMIT_BYTES */
const DEFAULT_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

/** Columns returned after board writes — never quote identifiers; PostgREST quotes them itself. */
const BOARD_SELECT =
  'id,creator_id,title,client_name,company_name,logline,public_id,published_at,hero_media_id,hero_time,hero_frame_path,access_password,created_at,updated_at';

const BOARD_SELECT_LEGACY =
  'id,creator_id,title,client_name,company_name,logline,public_id,published_at,hero_media_id,hero_time,hero_frame_path,created_at,updated_at';

function isMissingAccessPasswordColumn(error: { message?: string } | null) {
  return !!error && /access_password|schema cache|Could not find/i.test(error.message || '');
}

export type UploadProgress = {
  loaded: number;
  total: number;
};

export type StorageQuota = {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  planTier?: string;
};

export class StorageUpgradeRequiredError extends Error {
  usedBytes: number;
  limitBytes: number;

  constructor(message: string, usedBytes: number, limitBytes: number) {
    super(message);
    this.name = 'StorageUpgradeRequiredError';
    this.usedBytes = usedBytes;
    this.limitBytes = limitBytes;
  }
}

function throwIfError(error: { message?: string; code?: string; details?: string; hint?: string } | null, context: string) {
  if (!error) return;
  console.error(`[boards] ${context}`, error);
  const parts = [error.message, error.details, error.hint].filter(Boolean);
  throw new Error(parts.join(' — ') || `${context} failed`);
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function storageLimitBytes() {
  const raw = process.env.NEXT_PUBLIC_STORAGE_LIMIT_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STORAGE_LIMIT_BYTES;
}

export async function getStorageQuota(): Promise<StorageQuota> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('fp_board_media')
    .select('size')
    .eq('creator_id', userId);
  throwIfError(error, 'getStorageQuota');
  const usedBytes = (data || []).reduce((sum, row: any) => sum + (Number(row.size) || 0), 0);

  let limitBytes = storageLimitBytes();
  let planTier = 'free';
  try {
    const { ensureProfile } = await import('./billing');
    const profile = await ensureProfile(userId);
    if (profile.storageLimitBytes > 0) limitBytes = profile.storageLimitBytes;
    planTier = profile.planTier;
  } catch (err) {
    console.warn('[boards] profile storage limit unavailable, using default', err);
  }

  return {
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    planTier
  };
}

/** Throws before any upload starts if there isn't enough free storage. */
export async function ensureStorageCapacity(neededBytes: number): Promise<StorageQuota> {
  const quota = await getStorageQuota();
  if (quota.remainingBytes <= 0 || neededBytes > quota.remainingBytes) {
    throw new StorageUpgradeRequiredError(
      `Storage limit reached (${formatBytes(quota.usedBytes)} of ${formatBytes(quota.limitBytes)} used). Upgrade to PRO or MAX for more space.`,
      quota.usedBytes,
      quota.limitBytes
    );
  }
  return quota;
}

function isStorageFullError(status: number, message: string) {
  if (status === 413 || status === 507 || status === 429) return true;
  return /quota|storage.*(full|limit|exceed)|insufficient.?space|payload too large|entity too large|no space/i.test(
    message
  );
}

export class UploadCancelledError extends Error {
  constructor(message = 'Upload cancelled') {
    super(message);
    this.name = 'UploadCancelledError';
  }
}

async function getAccessToken() {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) {
    console.error('[boards] getSession', sessionErr);
    throw sessionErr;
  }
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('You must be signed in.');
  return token;
}

type PresignedUploadResponse = {
  uploadUrl: string;
  fileKey: string;
  publicUrl: string;
  mediaId: string;
  usedBytes?: number;
  limitBytes?: number;
  remainingBytes?: number;
  error?: string;
};

async function requestPresignedUpload(opts: {
  boardId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  mediaId?: string;
  fileKey?: string;
}): Promise<PresignedUploadResponse> {
  const token = await getAccessToken();
  const res = await fetch('/api/upload/presigned-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      boardId: opts.boardId,
      fileName: opts.fileName,
      contentType: opts.contentType,
      fileSize: opts.fileSize,
      mediaId: opts.mediaId,
      fileKey: opts.fileKey
    })
  });

  let payload: PresignedUploadResponse | null = null;
  try {
    payload = (await res.json()) as PresignedUploadResponse;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const message = payload?.error || `Could not create upload URL (${res.status})`;
    if (res.status === 403 || isStorageFullError(res.status, message)) {
      throw new StorageUpgradeRequiredError(
        message,
        Number((payload as any)?.usedBytes) || 0,
        Number((payload as any)?.limitBytes) || storageLimitBytes()
      );
    }
    throw new Error(message);
  }

  if (!payload?.uploadUrl || !payload.fileKey || !payload.publicUrl) {
    throw new Error('Invalid presigned upload response');
  }
  return payload;
}

async function putFileToR2(
  uploadUrl: string,
  file: Blob,
  contentType: string,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal
) {
  if (signal?.aborted) throw new UploadCancelledError();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');

    const onAbort = () => {
      xhr.abort();
    };

    if (signal) {
      if (signal.aborted) {
        reject(new UploadCancelledError());
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.upload.onprogress = (event) => {
      if (signal?.aborted) return;
      if (!onProgress) return;
      const total = event.lengthComputable ? event.total : file.size;
      onProgress({ loaded: event.loaded, total: total || file.size });
    };

    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        reject(new UploadCancelledError());
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ loaded: file.size, total: file.size });
        resolve();
        return;
      }

      let message = `Upload failed (${xhr.status})`;
      try {
        const parsed = JSON.parse(xhr.responseText);
        message = parsed.message || parsed.error || message;
      } catch {
        if (xhr.responseText) message = xhr.responseText.slice(0, 200);
      }

      console.error('[boards] R2 upload failed', { status: xhr.status, message });
      if (isStorageFullError(xhr.status, message)) {
        reject(new Error('Storage is full or the file is too large. Free up space and try again.'));
        return;
      }
      reject(new Error(message));
    };

    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      console.error('[boards] R2 upload network error');
      reject(new Error('Network error during upload'));
    };

    xhr.onabort = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(new UploadCancelledError());
    };

    xhr.send(file);
  });
}

/** Request a presigned URL, then PUT the file binary straight to Cloudflare R2. */
async function uploadFileWithProgress(
  boardId: string,
  file: File,
  opts?: {
    mediaId?: string;
    fileKey?: string;
    onProgress?: (progress: UploadProgress) => void;
    signal?: AbortSignal;
  }
): Promise<{ fileKey: string; publicUrl: string; mediaId: string }> {
  if (opts?.signal?.aborted) throw new UploadCancelledError();

  const signed = await requestPresignedUpload({
    boardId,
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    fileSize: file.size,
    mediaId: opts?.mediaId,
    fileKey: opts?.fileKey
  });

  if (opts?.signal?.aborted) throw new UploadCancelledError();

  await putFileToR2(
    signed.uploadUrl,
    file,
    file.type || 'application/octet-stream',
    opts?.onProgress,
    opts?.signal
  );

  return {
    fileKey: signed.fileKey,
    publicUrl: signed.publicUrl,
    mediaId: signed.mediaId || opts?.mediaId || ''
  };
}

async function deleteR2File(fileKey: string, mediaId?: string) {
  if (!fileKey) return;
  try {
    const token = await getAccessToken();
    const res = await fetch('/api/upload/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ fileKey, mediaId })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.warn('[boards] R2 delete failed', payload?.error || res.status);
    }
  } catch (err) {
    console.warn('[boards] R2 delete threw', err);
  }
}

function isValidHttpUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Sync public URL helper — R2 public CDN / custom domain. */
function publicUrl(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string' || !path.trim()) return null;
  const clean = path.trim().replace(/^\/+/, '');

  // Already a full URL (legacy rows or stored public_url reused as path)
  if (isValidHttpUrl(clean)) return clean.split('?')[0];

  const base = r2PublicBaseUrl();
  if (!base) {
    console.warn('[boards] NEXT_PUBLIC_R2_PUBLIC_URL is not set');
    return null;
  }
  const url = `${base}/${clean}`;
  if (!isValidHttpUrl(url)) {
    console.warn('[boards] built invalid R2 public URL', { path: clean, url });
    return null;
  }
  return url;
}

/**
 * Permanent public URL for an object in Cloudflare R2 (never signed / never blob).
 */
export function getBoardAssetPublicUrl(path: string | null | undefined): string | null {
  return publicUrl(path);
}

/**
 * Resolve a playable URL for board media. Prefers permanent public R2 URLs
 * so published boards keep working across devices.
 */
export async function resolveStorageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path || typeof path !== 'string' || !path.trim()) return null;
  const pub = publicUrl(path.trim());
  if (pub) return pub;
  console.warn('[boards] resolveStorageUrl could not build a valid URL for', path);
  return null;
}

function withCacheBust(url: string | null | undefined): string | null {
  if (!isValidHttpUrl(url)) return null;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('t', String(Date.now()));
    return parsed.toString();
  } catch {
    return url;
  }
}

function mapBoardRow(row: any, videos: BoardVideo[] = [], heroFrameUrl: string | null = null): Board {
  return {
    id: row.id,
    title: row.title,
    clientName: row.client_name,
    companyName: row.company_name,
    logline: row.logline || undefined,
    createdAt: row.created_at,
    publicId: row.public_id,
    publishedAt: row.published_at,
    hero: row.hero_media_id
      ? { mediaId: row.hero_media_id, time: Number(row.hero_time || 0) }
      : null,
    videos,
    heroFrameUrl,
    heroFramePath: row.hero_frame_path || null,
    accessPassword: row.access_password ?? null
  };
}

async function requireUserId() {
  const userId = await getAuthUserId();
  if (!userId) throw new Error('You must be signed in.');
  return userId;
}

export async function listBoards(): Promise<Omit<Board, 'videos' | 'heroFrameUrl'>[]> {
  const userId = await requireUserId();
  let { data, error } = await supabase
    .from('vision_boards')
    .select(BOARD_SELECT)
    .eq('creator_id', userId)
    .order('created_at', { ascending: false });

  if (isMissingAccessPasswordColumn(error)) {
    const legacy = await supabase
      .from('vision_boards')
      .select(BOARD_SELECT_LEGACY)
      .eq('creator_id', userId)
      .order('created_at', { ascending: false });
    data = (legacy.data as any) || null;
    error = legacy.error;
  }

  throwIfError(error, 'listBoards');
  return (data || []).map((row) => mapBoardRow(row));
}

export async function createBoard(input: {
  title: string;
  clientName: string;
  companyName: string;
  logline?: string;
  accessPassword?: string;
}): Promise<Omit<Board, 'videos' | 'heroFrameUrl'>> {
  try {
    const userId = await requireUserId();
    const payload: Record<string, string | null> = {
      creator_id: userId,
      title: input.title.trim(),
      client_name: input.clientName.trim(),
      company_name: input.companyName.trim()
    };
    const trimmedLogline = input.logline?.trim();
    if (trimmedLogline) {
      payload.logline = trimmedLogline;
    }
    const trimmedPassword = input.accessPassword?.trim();
    if (trimmedPassword) {
      payload.access_password = trimmedPassword;
    }

    const { data, error } = await supabase
      .from('vision_boards')
      .insert(payload)
      .select(BOARD_SELECT)
      .single();

    // Older schemas may not have access_password yet — retry without it
    if (error && /access_password|schema cache|Could not find/i.test(error.message || '')) {
      delete payload.access_password;
      const retry = await supabase
        .from('vision_boards')
        .insert(payload)
        .select(
          'id,creator_id,title,client_name,company_name,logline,public_id,published_at,hero_media_id,hero_time,hero_frame_path,created_at,updated_at'
        )
        .single();
      throwIfError(retry.error, 'createBoard');
      if (!retry.data) throw new Error('Board was created but no row was returned.');
      return mapBoardRow(retry.data);
    }

    throwIfError(error, 'createBoard');
    if (!data) throw new Error('Board was created but no row was returned.');
    return mapBoardRow(data);
  } catch (err) {
    console.error('[boards] createBoard failed', err);
    throw err;
  }
}

export async function getBoard(id: string): Promise<Board | null> {
  const userId = await requireUserId();
  let { data: row, error } = await supabase
    .from('vision_boards')
    .select(BOARD_SELECT)
    .eq('id', id)
    .eq('creator_id', userId)
    .maybeSingle();

  if (isMissingAccessPasswordColumn(error)) {
    const legacy = await supabase
      .from('vision_boards')
      .select(BOARD_SELECT_LEGACY)
      .eq('id', id)
      .eq('creator_id', userId)
      .maybeSingle();
    row = (legacy.data as any) || null;
    error = legacy.error;
  }

  throwIfError(error, 'getBoard');
  if (!row) return null;

  const { data: mediaRows, error: mediaErr } = await supabase
    .from('fp_board_media')
    .select('*')
    .eq('board_id', id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  throwIfError(mediaErr, 'getBoard.media');

  const videos: BoardVideo[] = await Promise.all(
    (mediaRows || []).map(async (m: any) => {
      const storedPublic =
        typeof m.public_url === 'string' && isValidHttpUrl(m.public_url) ? m.public_url.split('?')[0] : null;
      const url =
        storedPublic ||
        getBoardAssetPublicUrl(m.storage_path) ||
        (await resolveStorageUrl(m.storage_path)) ||
        '';
      return {
        id: m.id,
        name: m.filename,
        mimeType: m.mime_type || '',
        storagePath: m.storage_path,
        sortOrder: m.sort_order,
        size: typeof m.size === 'number' ? m.size : Number(m.size) || null,
        createdAt: m.created_at || null,
        url
      };
    })
  );

  const heroFrameUrl = await resolveHeroFrameDisplayUrl(row.hero_frame_path);
  return mapBoardRow(row, videos, heroFrameUrl);
}

export async function updateBoardDetails(
  boardId: string,
  details: Partial<Pick<Board, 'title' | 'clientName' | 'companyName' | 'logline' | 'accessPassword'>>
) {
  const userId = await requireUserId();
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (details.title !== undefined) patch.title = details.title.trim();
  if (details.clientName !== undefined) patch.client_name = details.clientName.trim();
  if (details.companyName !== undefined) patch.company_name = details.companyName.trim();
  if (details.logline !== undefined) patch.logline = details.logline.trim() || null;
  if (details.accessPassword !== undefined) {
    patch.access_password = (details.accessPassword || '').trim() || null;
  }

  const { data, error } = await supabase
    .from('vision_boards')
    .update(patch)
    .eq('id', boardId)
    .eq('creator_id', userId)
    .select(BOARD_SELECT)
    .single();

  if (error && /access_password|schema cache|Could not find/i.test(error.message || '')) {
    delete patch.access_password;
    const retry = await supabase
      .from('vision_boards')
      .update(patch)
      .eq('id', boardId)
      .eq('creator_id', userId)
      .select(
        'id,creator_id,title,client_name,company_name,logline,public_id,published_at,hero_media_id,hero_time,hero_frame_path,created_at,updated_at'
      )
      .single();
    throwIfError(retry.error, 'updateBoardDetails');
    return mapBoardRow(retry.data);
  }

  throwIfError(error, 'updateBoardDetails');
  return mapBoardRow(data);
}

export async function renameBoardVideo(boardId: string, videoId: string, name: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('fp_board_media')
    .update({ filename: name.trim() || 'untitled' })
    .eq('id', videoId)
    .eq('board_id', boardId)
    .eq('creator_id', userId);
  if (error) throw error;
}

export async function reorderBoardVideos(boardId: string, orderedIds: string[]) {
  const userId = await requireUserId();
  // Update sort_order for each id
  await Promise.all(
    orderedIds.map(async (id, index) => {
      const { error } = await supabase
        .from('fp_board_media')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('board_id', boardId)
        .eq('creator_id', userId);
      if (error) throw error;
    })
  );
}

export async function addVideoToBoard(
  boardId: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal
): Promise<BoardVideo | null> {
  try {
    if (signal?.aborted) throw new UploadCancelledError();
    await ensureStorageCapacity(file.size);
    const userId = await requireUserId();

    // Confirm ownership
    const { data: board, error: boardErr } = await supabase
      .from('vision_boards')
      .select('id')
      .eq('id', boardId)
      .eq('creator_id', userId)
      .maybeSingle();
    throwIfError(boardErr, 'addVideoToBoard.board');
    if (!board) throw new Error('Board not found');
    if (signal?.aborted) throw new UploadCancelledError();

    const { count, error: countErr } = await supabase
      .from('fp_board_media')
      .select('*', { count: 'exact', head: true })
      .eq('board_id', boardId);
    throwIfError(countErr, 'addVideoToBoard.count');

    const mediaId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });

    const uploaded = await uploadFileWithProgress(boardId, file, {
      mediaId,
      onProgress,
      signal
    });
    if (signal?.aborted) throw new UploadCancelledError();

    const storagePath = uploaded.fileKey;
    const publicMediaUrl = uploaded.publicUrl || getBoardAssetPublicUrl(storagePath);
    if (!publicMediaUrl) {
      throw new Error(
        'Uploaded to Cloudflare R2 but could not resolve a public URL. Check NEXT_PUBLIC_R2_PUBLIC_URL.'
      );
    }

    const baseRow = {
      id: mediaId,
      board_id: boardId,
      creator_id: userId,
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      storage_path: storagePath,
      sort_order: count || 0,
      size: file.size
    };

    let { data: row, error } = await supabase
      .from('fp_board_media')
      .insert([{ ...baseRow, public_url: publicMediaUrl }])
      .select('*')
      .single();

    // Older schemas may not have public_url yet — retry without it
    if (error && /public_url|schema cache|Could not find/i.test(error.message || '')) {
      ({ data: row, error } = await supabase
        .from('fp_board_media')
        .insert([baseRow])
        .select('*')
        .single());
    }
    throwIfError(error, 'addVideoToBoard.insert');

    return {
      id: row.id,
      name: row.filename,
      mimeType: row.mime_type,
      storagePath: row.storage_path,
      sortOrder: row.sort_order,
      size: typeof row.size === 'number' ? row.size : Number(row.size) || file.size,
      createdAt: row.created_at || null,
      url: (typeof row.public_url === 'string' && row.public_url) || publicMediaUrl
    };
  } catch (err) {
    if (err instanceof UploadCancelledError || (err as any)?.name === 'UploadCancelledError') {
      throw err;
    }
    console.error('[boards] addVideoToBoard failed', err);
    throw err;
  }
}

export async function removeVideoFromBoard(boardId: string, videoId: string) {
  const userId = await requireUserId();
  const { data: row, error } = await supabase
    .from('fp_board_media')
    .select('*')
    .eq('id', videoId)
    .eq('board_id', boardId)
    .eq('creator_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return;

  await deleteR2File(row.storage_path, row.id);

  // Clear hero if needed
  await supabase
    .from('vision_boards')
    .update({ hero_media_id: null, hero_frame_path: null, hero_time: 0 })
    .eq('id', boardId)
    .eq('creator_id', userId)
    .eq('hero_media_id', videoId);

  const { error: delErr } = await supabase
    .from('fp_board_media')
    .delete()
    .eq('id', videoId)
    .eq('creator_id', userId);
  if (delErr) throw delErr;
}

export type PlayableMediaSource = {
  src: string;
  kind: 'blob' | 'signed' | 'public';
  revoke?: () => void;
};

/**
 * Resolve a playable video/image src for the mood-frame picker.
 * Prefers R2 public URL (optionally fetched to blob: for canvas), never Supabase Storage.
 */
export async function resolvePlayableMediaSource(
  media: Pick<BoardVideo, 'storagePath' | 'url' | 'name' | 'mimeType'>
): Promise<PlayableMediaSource> {
  const publicSrc =
    (isValidHttpUrl(media.url) ? media.url.split('?')[0] : null) ||
    getBoardAssetPublicUrl(media.storagePath);

  console.log('[mood-frame] resolve source input', {
    name: media.name,
    mimeType: media.mimeType,
    storagePath: media.storagePath || null,
    publicUrl: publicSrc || null
  });

  if (publicSrc) {
    // Prefer blob for canvas / scrubbing when CORS allows fetching from R2
    try {
      const res = await fetch(publicSrc);
      if (res.ok) {
        const blob = await res.blob();
        const src = URL.createObjectURL(blob);
        console.log('[mood-frame] <video> src (blob from R2):', src);
        return {
          src,
          kind: 'blob',
          revoke: () => URL.revokeObjectURL(src)
        };
      }
    } catch (err: any) {
      console.warn('[mood-frame] R2 fetch→blob failed, using public URL directly', err?.message);
    }

    console.log('[mood-frame] <video> src (public, direct):', publicSrc);
    return { src: publicSrc, kind: 'public' };
  }

  throw new Error(
    `Could not resolve a playable URL for "${media.name || 'media'}". Check NEXT_PUBLIC_R2_PUBLIC_URL and that the object exists in R2.`
  );
}

export async function downloadMediaBlob(media: Pick<BoardVideo, 'storagePath' | 'url'>): Promise<Blob | null> {
  try {
    const url =
      (isValidHttpUrl(media.url) ? media.url.split('?')[0] : null) ||
      getBoardAssetPublicUrl(media.storagePath);
    if (!url) return null;

    console.log('[mood-frame] downloadMediaBlob url:', url);
    const res = await fetch(url);
    if (!res.ok) {
      console.error('[mood-frame] downloadMediaBlob fetch failed', res.status);
      return null;
    }
    return await res.blob();
  } catch (err: any) {
    console.error('[mood-frame] downloadMediaBlob failed safely', {
      message: err?.message,
      storagePath: media.storagePath,
      url: media.url,
      err
    });
    return null;
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) {
    throw new Error('Invalid data URL for mood frame.');
  }
  const header = dataUrl.slice(0, comma);
  const data = dataUrl.slice(comma + 1);
  const mimeMatch = /data:([^;]+)/i.exec(header);
  const mime = mimeMatch?.[1] || 'image/jpeg';

  // After splitting on ',', the header is "data:image/jpeg;base64" (no trailing comma).
  if (/;base64/i.test(header)) {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  return new Blob([decodeURIComponent(data)], { type: mime });
}

/** True if bytes look like a real JPEG (SOI marker). */
function isJpegBinary(bytes: Uint8Array) {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/**
 * Older mood frames were accidentally uploaded as ASCII base64 text of a JPEG
 * (because dataUrlToBlob checked for ";base64," after splitting on ",").
 * Detect and decode those so the <img> can render.
 */
async function normalizeHeroImageBlob(input: Blob): Promise<Blob> {
  const buffer = await input.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (isJpegBinary(bytes)) {
    return input.type?.startsWith('image/') ? input : new Blob([bytes], { type: 'image/jpeg' });
  }

  // Base64-of-JPEG typically starts with "/9j/"
  const head = new TextDecoder().decode(bytes.slice(0, 8));
  if (head.startsWith('/9j/') || head.startsWith('iVBOR')) {
    try {
      const text = new TextDecoder().decode(bytes).replace(/\s+/g, '');
      const binary = atob(text);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
      const mime = head.startsWith('iVBOR') ? 'image/png' : 'image/jpeg';
      console.warn('[boards] decoded base64-stored hero frame into binary', { mime, bytes: out.length });
      return new Blob([out], { type: mime });
    } catch (err) {
      console.error('[boards] failed to decode base64 hero frame', err);
    }
  }

  return input;
}

/**
 * Resolve a permanent public mood-frame URL from Cloudflare R2 (never blob:/data:).
 */
export async function resolveHeroFrameDisplayUrl(
  path: string | null | undefined
): Promise<string | null> {
  if (!path || !path.trim()) return null;
  const clean = path.trim();
  const pub = publicUrl(clean);
  if (!pub) return null;

  try {
    const head = await fetch(pub, { method: 'HEAD' });
    if (head.ok) return withCacheBust(pub);
  } catch {
    // fall through — still return public URL; CDN may block HEAD
  }

  // Try to detect / repair legacy base64-stored JPEGs
  try {
    const res = await fetch(pub);
    if (!res.ok) return withCacheBust(pub);
    const data = await res.blob();
    const normalized = await normalizeHeroImageBlob(data);
    const rawHead = new Uint8Array(await data.slice(0, 4).arrayBuffer());
    if (!isJpegBinary(rawHead)) {
      // Caller should re-save via saveBoardHero; for display use object URL of normalized
      const objectUrl = URL.createObjectURL(normalized);
      return objectUrl;
    }
  } catch (err) {
    console.error('[boards] resolveHeroFrameDisplayUrl threw', err);
  }

  return withCacheBust(pub);
}

/**
 * Upload a local blob/data URL (or remote image) into Cloudflare R2 and return its public URL.
 */
export async function uploadBoardAsset(
  boardId: string,
  source: string | Blob,
  fileName = 'hero-frame.jpg'
): Promise<{ path: string; publicUrl: string }> {
  const userId = await requireUserId();
  let blob: Blob;
  if (typeof source === 'string') {
    if (source.startsWith('data:')) {
      blob = dataUrlToBlob(source);
    } else if (source.startsWith('blob:') || isValidHttpUrl(source)) {
      const res = await fetch(source);
      if (!res.ok) throw new Error('Could not read local image for upload.');
      blob = await res.blob();
    } else {
      throw new Error('Unsupported image source for board asset upload.');
    }
  } else {
    blob = source;
  }

  blob = await normalizeHeroImageBlob(blob);
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${boardId}/${safeName}`;
  const contentType = blob.type || 'image/jpeg';

  console.log('[boards] uploadBoardAsset → R2', { path, contentType, size: blob.size });

  const signed = await requestPresignedUpload({
    boardId,
    fileName: safeName,
    contentType,
    fileSize: blob.size || 1,
    fileKey: path
  });

  await putFileToR2(signed.uploadUrl, blob, contentType);

  const publicUrlValue = signed.publicUrl || publicUrl(path);
  if (!publicUrlValue) {
    throw new Error(
      'Uploaded to Cloudflare R2 but could not resolve a public URL. Check NEXT_PUBLIC_R2_PUBLIC_URL.'
    );
  }
  return { path: signed.fileKey || path, publicUrl: publicUrlValue };
}

export async function saveBoardHero(
  boardId: string,
  hero: BoardHero,
  frameDataUrl: string
): Promise<string | null> {
  try {
    const userId = await requireUserId();
    const { path, publicUrl: publicHeroUrl } = await uploadBoardAsset(
      boardId,
      frameDataUrl,
      'hero-frame.jpg'
    );

    const { error } = await supabase
      .from('vision_boards')
      .update({
        hero_media_id: hero.mediaId,
        hero_time: hero.time,
        hero_frame_path: path,
        updated_at: new Date().toISOString()
      })
      .eq('id', boardId)
      .eq('creator_id', userId);
    throwIfError(error, 'saveBoardHero.update');

    // Always return a permanent public URL (never blob:/data:)
    return withCacheBust(publicHeroUrl);
  } catch (err) {
    console.error('[boards] saveBoardHero failed', err);
    throw err;
  }
}

export async function clearBoardHero(boardId: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('vision_boards')
    .update({ hero_media_id: null, hero_time: 0, hero_frame_path: null })
    .eq('id', boardId)
    .eq('creator_id', userId);
  if (error) throw error;
}

export async function ensureBoardPublicId(boardId: string): Promise<string> {
  const userId = await requireUserId();
  const { data: row, error } = await supabase
    .from('vision_boards')
    .select('public_id')
    .eq('id', boardId)
    .eq('creator_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Board not found');
  if (row.public_id) return row.public_id;

  const publicId = Math.random().toString(36).slice(2, 10);
  const { error: updErr } = await supabase
    .from('vision_boards')
    .update({ public_id: publicId })
    .eq('id', boardId)
    .eq('creator_id', userId);
  if (updErr) throw updErr;
  return publicId;
}

export async function markBoardPublished(boardId: string) {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('vision_boards')
    .update({ published_at: new Date().toISOString() })
    .eq('id', boardId)
    .eq('creator_id', userId);
  if (error) throw error;
}

export async function getBoardMediaBlob(boardId: string, videoId: string): Promise<Blob | null> {
  const board = await getBoard(boardId);
  const media = board?.videos.find((v) => v.id === videoId);
  if (!media?.storagePath && !media?.url) return null;
  return downloadMediaBlob(media);
}

export async function getHeroFrameBlob(boardId: string): Promise<Blob | null> {
  const board = await getBoard(boardId);
  const url =
    (board?.heroFrameUrl && !isLocalMediaUrl(board.heroFrameUrl) ? board.heroFrameUrl.split('?')[0] : null) ||
    getBoardAssetPublicUrl(board?.heroFramePath);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return normalizeHeroImageBlob(await res.blob());
  } catch (err) {
    console.error('[boards] getHeroFrameBlob fetch failed', err);
    return null;
  }
}

export async function getBoardByPublicId(publicId: string) {
  // For owner tooling only — published payload is preferred for clients
  const { data, error } = await supabase
    .from('vision_boards')
    .select('*')
    .eq('public_id', publicId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBoardRow(data) : null;
}
