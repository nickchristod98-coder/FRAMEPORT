import React, { useCallback, useRef, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

type UploadResult = {
  name: string;
  path: string;
  size: number;
  mimeType: string;
};

export default function UploadDropzone({ projectId }: { projectId: string | null }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [totalFiles, setTotalFiles] = useState(0);
  const [completedFiles, setCompletedFiles] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);
  const [bytesUploaded, setBytesUploaded] = useState(0);
  const [fileProgress, setFileProgress] = useState<
    { name: string; loaded: number; total: number; status: 'pending' | 'uploading' | 'done' | 'error' }[]
  >([]);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      if (!projectId) {
        // eslint-disable-next-line no-console
        console.error('UploadDropzone: missing projectId — select a project before uploading.');
        return;
      }
      const projId = String(projectId);
      setUploading(true);
      setTotalFiles(files.length);
      setCompletedFiles(0);
      const total = Array.from(files).reduce((s, f) => s + f.size, 0);
      setBytesTotal(total);
      setBytesUploaded(0);
      setFileProgress(Array.from(files).map((f) => ({ name: f.name, loaded: 0, total: f.size, status: 'pending' })));
      const uploaded: UploadResult[] = [];
      // per-file previous loaded map to compute deltas
      const prevLoadedMap: Record<number, number> = {};
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // sanitize filename to avoid invalid keys (no spaces or special chars)
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const filename = `${Date.now()}-${safeName}`;
        const storagePath = `${projId}/${filename}`;
        const bucket = 'galleries';
        // Only accept image/video MIME types
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
          // eslint-disable-next-line no-console
          console.warn('Skipping unsupported file type', file.type);
          setFileProgress((fp) => fp.map((p, idx) => (idx === i ? { ...p, status: 'error', loaded: p.total } : p)));
          setCompletedFiles((c) => c + 1);
          setBytesUploaded((b) => b + file.size);
          continue;
        }

        // Use XMLHttpRequest directly to get byte-level progress events.
        // Build upload URL for Supabase Storage (use upsert query param).
        const uploadUrl =
          `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(
            bucket
          )}/${encodeURIComponent(storagePath)}?upsert=true`;

        const xhrUpload = () =>
          new Promise<{ ok: boolean; status: number }>((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl);
            // set headers: anon key and upsert
            const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
            xhr.setRequestHeader('Authorization', `Bearer ${anonKey}`);
            xhr.setRequestHeader('x-upsert', 'true');
            if (file.type) xhr.setRequestHeader('Content-Type', file.type);

            xhr.upload.onprogress = (ev) => {
              const prev = prevLoadedMap[i] || 0;
              const loaded = ev.loaded;
              const delta = loaded - prev;
              prevLoadedMap[i] = loaded;
              setBytesUploaded((b) => b + delta);
              // update per-file progress
              setFileProgress((fp) => fp.map((p, idx) => (idx === i ? { ...p, loaded, status: 'uploading' } : p)));
            };

            xhr.onload = () => {
              resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
            };
            xhr.onerror = () => resolve({ ok: false, status: xhr.status || 0 });
            xhr.send(file);
          });

        const result = await xhrUpload();
        if (!result.ok) {
          // eslint-disable-next-line no-console
          console.error('Upload error', { status: result.status, bucket, storagePath });
          setFileProgress((fp) => fp.map((p, idx) => (idx === i ? { ...p, status: 'error', loaded: p.total } : p)));
          // count as completed to avoid hanging progress
          setCompletedFiles((c) => c + 1);
          // also advance bytesUploaded to account for this file fully to avoid stuck percentage
          setBytesUploaded((b) => b + file.size);
          continue;
        }
        setFileProgress((fp) => fp.map((p, idx) => (idx === i ? { ...p, status: 'done', loaded: p.total } : p)));
        // Success - log minimal info
        // eslint-disable-next-line no-console
        console.log('[upload] uploaded to storage via XHR:', { bucket, storagePath, status: result.status });
        // register file metadata with server (server will add public_url if possible)
        const registerRes = await fetch('/api/admin/register-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: projId,
            storageBucket: bucket,
            storagePath: storagePath,
            filename: file.name,
            mimeType: file.type,
            size: file.size
          })
        });
        const json = await registerRes.json();
        // eslint-disable-next-line no-console
        console.log('[upload] register-file response', json);
        if (!registerRes.ok) {
          // eslint-disable-next-line no-console
          console.error('register-file failed', json);
        }
        const media = json.media;
        const publicUrl = media?.public_url || null;
        uploaded.push({ name: file.name, path: data.path, size: file.size, mimeType: file.type });
        setResults((r) => [...r, { name: file.name, path: data.path, size: file.size, mimeType: file.type }]);
        setCompletedFiles((c) => c + 1);
        // if available, update last entry with public url
        if (publicUrl) {
          setResults((r) => r.map((x) => (x.path === data.path ? { ...x, mimeType: x.mimeType } : x)));
        }
      }
      setUploading(false);
      setTotalFiles(0);
      setCompletedFiles(0);
      return uploaded;
    },
    [projectId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      onFiles(e.dataTransfer.files);
    },
    [onFiles]
  );

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-gray-300 rounded p-6 text-center relative"
      >
        <p className="mb-2">Drag & drop photos or videos here</p>
        <p className="text-sm text-gray-500">or</p>
        <button
          type="button"
          className="mt-3 px-4 py-2 bg-black text-white rounded"
          onClick={() => inputRef.current?.click()}
          disabled={!projectId || uploading}
        >
          Select files
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*,video/*"
          onChange={(e) => onFiles(e.target.files)}
        />

        {/* Glassmorphic overlay with byte-level progress */}
        {uploading && bytesTotal > 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="w-full max-w-2xl bg-white/6 backdrop-blur-md border border-white/10 rounded-lg p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-semibold">Uploading Cinematic Assets...</div>
                <div className="text-sm font-medium">{Math.round((bytesUploaded / bytesTotal) * 100)}%</div>
              </div>
              <div className="w-full bg-white/10 rounded h-2 overflow-hidden mb-3">
                <div
                  className="h-2 bg-gradient-to-r from-white to-white/60 shadow-[0_0_20px_rgba(255,255,255,0.08)] transition-all duration-200"
                  style={{ width: `${Math.min(100, Math.round((bytesUploaded / bytesTotal) * 100))}%` }}
                />
              </div>

              <div className="space-y-2 max-h-48 overflow-auto">
                {fileProgress.map((f, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <div className="truncate max-w-[70%]">{f.name}</div>
                    <div className="text-xs text-gray-200">
                      {f.status === 'uploading' && `${Math.round((f.loaded / f.total) * 100)}%`}
                      {f.status === 'done' && 'Uploaded'}
                      {f.status === 'error' && 'Error'}
                      {f.status === 'pending' && 'Queued'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium">Uploaded</h4>
          <ul className="space-y-2">
            {results.map((r) => (
              <li key={r.path} className="text-sm text-gray-700">
                {r.name} — <span className="text-gray-500">{(r.size / 1024).toFixed(1)} KB</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

