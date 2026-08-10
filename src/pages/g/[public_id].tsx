import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';

type MediaItem = {
  id: string;
  filename: string;
  mime_type?: string | null;
  signedUrl?: string | null;
  public_url?: string | null;
};

function getClientToken(publicId: string) {
  try {
    const key = `lux_client_token_${publicId}`;
    let t = localStorage.getItem(key);
    if (!t) {
      t = (crypto as any)?.randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2);
      localStorage.setItem(key, t);
    }
    return t;
  } catch {
    return 'guest';
  }
}

export default function GalleryPage() {
  const router = useRouter();
  const { public_id } = router.query;
  const publicId = Array.isArray(public_id) ? public_id[0] : public_id;

  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [linkInfo, setLinkInfo] = useState<any>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!publicId) return;
    // nothing else
  }, [publicId]);

  async function verify(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!publicId) return;
    setLoading(true);
    const res = await fetch('/api/gallery/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId, password })
    });
    const json = await res.json();
    setLoading(false);
    if (json.ok) {
      setAuthenticated(true);
      setLinkInfo(json.link);
      fetchMedia();
    } else {
      alert('Invalid password');
    }
  }

  async function fetchMedia() {
    if (!publicId) return;
    setLoading(true);
    const res = await fetch(`/api/gallery/media?publicId=${publicId}`);
    const json = await res.json();
    setMedia(json.media || []);
    setLoading(false);
  }

  function toggleFavorite(mediaId: string) {
    if (!linkInfo) return;
    const clientToken = getClientToken(publicId || 'guest');
    fetch('/api/gallery/favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkId: linkInfo.id, mediaId, clientToken })
    })
      .then((r) => r.json())
      .then((j) => {
        setFavorites((s) => ({ ...s, [mediaId]: j.favorited }));
      });
  }

  function openLightbox(idx: number) {
    setLightboxIndex(idx);
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    setLightboxIndex(null);
    document.body.style.overflow = '';
  }

  const visibleMedia = useMemo(() => {
    if (!showFavoritesOnly) return media;
    return media.filter((m) => favorites[m.id]);
  }, [media, showFavoritesOnly, favorites]);

  async function downloadAll() {
    if (!publicId) return;
    const mediaIds = media.map((m) => m.id);
    const res = await fetch('/api/gallery/zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicId, mediaIds })
    });
    if (!res.ok) {
      alert('Failed to create zip');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gallery_${publicId}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen py-12 bg-black text-white">
      <div className="container">
        <h1 className="text-3xl font-semibold mb-6">LUX ETERNA — Gallery</h1>
        {!authenticated ? (
          <div className="max-w-md mx-auto bg-white text-black p-8 rounded shadow">
            <h2 className="text-xl font-medium mb-4">Enter access password</h2>
            <form onSubmit={verify}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border rounded mb-4"
                placeholder="Password"
              />
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-black text-white rounded" disabled={loading}>
                  {loading ? 'Checking…' : 'Enter'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl">{linkInfo?.project_id ? 'Private Gallery' : 'Gallery'}</h2>
                <div className="text-sm text-gray-400">Browse and favorite the images you love.</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <button
                    className={`px-3 py-1 rounded ${showFavoritesOnly ? 'bg-white text-black' : 'border text-white/90'}`}
                    onClick={() => setShowFavoritesOnly((s) => !s)}
                  >
                    {showFavoritesOnly ? 'Showing Favorites' : 'Favorites'}
                  </button>
                  <button className="px-4 py-2 border rounded" onClick={downloadAll}>
                    Download All
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {visibleMedia.map((m, idx) => {
                const isVideo =
                  !!m.mime_type && m.mime_type.startsWith('video') || /\.mp4|\.mov|\.mkv$/i.test(m.filename || '');
                const src = m.signedUrl || m.public_url || (m as any).storage_path;
                return (
                  <div
                    key={m.id}
                    className="relative group overflow-hidden rounded cursor-pointer"
                    style={{ aspectRatio: '4/5' }}
                    onClick={() => openLightbox(idx)}
                  >
                    {isVideo ? (
                      src ? (
                        <video
                          src={src as string}
                          className="w-full h-full object-cover"
                          muted
                          loop
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <div className="flex items-center justify-center text-white text-sm">📋 VIDEO: {m.filename}</div>
                      )
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src as string} alt={m.filename} className="w-full h-full object-cover" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(m.id);
                      }}
                      className={`absolute top-2 right-2 p-2 rounded-full bg-white/80 text-black ${favorites[m.id] ? 'scale-110' : ''
                        }`}
                      aria-label="Favorite"
                    >
                      {favorites[m.id] ? '♥' : '♡'}
                    </button>
                    <a
                      onClick={(e) => e.stopPropagation()}
                      href={src as string}
                      download={m.filename}
                      className="absolute bottom-2 left-2 bg-white/80 text-black px-2 py-1 rounded text-sm"
                    >
                      Download
                    </a>
                  </div>
                );
              })}
            </div>

            {/* Lightbox Modal */}
            {lightboxIndex !== null && visibleMedia[lightboxIndex] && (
              <div
                className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-6"
                onClick={closeLightbox}
              >
                <div className="max-w-[90vw] max-h-[90vh] w-full">
                  {visibleMedia[lightboxIndex].mime_type?.startsWith('video') ? (
                    (visibleMedia[lightboxIndex].signedUrl ||
                      visibleMedia[lightboxIndex].public_url ||
                      (visibleMedia[lightboxIndex] as any).storage_path) ? (
                      <video
                        src={
                          visibleMedia[lightboxIndex].signedUrl ||
                          visibleMedia[lightboxIndex].public_url ||
                          (visibleMedia[lightboxIndex] as any).storage_path
                        }
                        controls
                        autoPlay
                        className="w-full h-auto max-h-[90vh] bg-black"
                      />
                    ) : (
                      <div className="text-white text-lg">📋 VIDEO: {visibleMedia[lightboxIndex].filename}</div>
                    )
                  ) : (
                    <img
                      src={visibleMedia[lightboxIndex].signedUrl || visibleMedia[lightboxIndex].public_url || (visibleMedia[lightboxIndex] as any).storage_path}
                      alt={visibleMedia[lightboxIndex].filename}
                      className="w-full h-auto max-h-[90vh] object-contain"
                    />
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeLightbox();
                  }}
                  className="absolute top-6 right-6 text-white text-2xl"
                >
                  ✕
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

