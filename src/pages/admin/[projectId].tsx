import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import UploadDropzone from '../../components/UploadDropzone';

type MediaRow = {
  id: string;
  filename: string;
  storage_path: string;
  public_url?: string | null;
  mime_type?: string;
};

export default function ProjectEditPage() {
  const router = useRouter();
  const { projectId } = router.query;
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    fetchMedia();
  }, [projectId]);

  async function fetchMedia() {
    setLoading(true);
    const res = await fetch(`/api/admin/project-media?projectId=${projectId}`);
    const json = await res.json();
    setMedia(json.media || []);
    setLoading(false);
  }

  async function handleDelete(m: MediaRow) {
    if (!confirm(`Delete ${m.filename}? This cannot be undone.`)) return;
    const res = await fetch('/api/admin/delete-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaId: m.id })
    });
    const json = await res.json();
    if (res.ok) {
      setMedia((s) => s.filter((x) => x.id !== m.id));
    } else {
      alert('Delete failed: ' + (json.error || 'unknown'));
    }
  }

  return (
    <main className="min-h-screen py-10">
      <div className="container">
        <button onClick={() => router.push('/admin')} className="mb-4 px-3 py-1 border rounded">
          ← Back
        </button>
        <h2 className="text-2xl font-semibold mb-4">Edit Project Content</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-4 border rounded">
            <h3 className="font-medium mb-2">Add media</h3>
            <UploadDropzone projectId={String(projectId)} />
          </div>
          <div className="p-4 border rounded">
            <h3 className="font-medium mb-2">Existing media</h3>
            {loading ? (
              <div>Loading…</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {media.map((m) => {
                  const src = (m as any).signedUrl || m.public_url || m.storage_path;
                  const isVideo = m.mime_type?.startsWith('video') || /\.mp4|\.mov|\.mkv$/i.test(m.filename || '');
                  return (
                    <div key={m.id} className="relative overflow-hidden rounded border">
                      <div className="w-full h-36 bg-black flex items-center justify-center">
                        {isVideo ? (
                          src ? (
                            <video
                              src={src as string}
                              className="w-full h-full object-cover"
                              muted
                              loop
                              playsInline
                              preload="metadata"
                              controls={false}
                            />
                          ) : (
                            <div className="text-white text-sm">📋 VIDEO: {m.filename}</div>
                          )
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src as string} alt={m.filename} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="p-2">
                        <div className="text-sm font-medium truncate">{m.filename}</div>
                        <div className="text-xs text-gray-500">{m.mime_type}</div>
                      </div>
                      <button
                        className="absolute top-2 right-2 text-sm px-2 py-1 border rounded bg-white/80"
                        onClick={() => handleDelete(m)}
                      >
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

