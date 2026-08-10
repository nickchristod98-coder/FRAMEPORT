import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useEffect, useState } from 'react';
import AccountMenu from '../components/AccountMenu';
import AmbientBackground from '../components/AmbientBackground';
import { getSession } from '../lib/auth';
import { createBoard, listBoards } from '../lib/boards';

type BoardMeta = {
  id: string;
  title: string;
  clientName: string;
  companyName: string;
  logline?: string;
  createdAt: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [logline, setLogline] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getSession();
        if (!user) {
          router.replace('/signin');
          return;
        }
        const rows = await listBoards();
        if (!cancelled) {
          setBoards(rows);
          setReady(true);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load boards');
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function openModal() {
    setTitle('');
    setClientName('');
    setCompanyName('');
    setLogline('');
    setModalOpen(true);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !clientName.trim() || !companyName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const board = await createBoard({ title, clientName, companyName, logline });
      if (!board?.id) throw new Error('Board was created but no id was returned.');
      setModalOpen(false);
      // Always land inside the new board editor
      await router.push(`/board/${board.id}`);
    } catch (err: any) {
      console.error('[dashboard] create board failed', err);
      setError(err?.message || 'Could not create board');
    } finally {
      setCreating(false);
    }
  }

  if (!ready) {
    return <main className="min-h-screen bg-black" />;
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <AmbientBackground />

      <header className="relative z-20 flex items-center justify-between px-6 py-6 md:px-10">
        <Link href="/dashboard" className="text-[11px] uppercase tracking-[0.4em] text-white/50">
          FramePort
        </Link>
        <AccountMenu />
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-10 md:px-10 md:pt-16">
        <h1 className="font-display max-w-4xl text-left text-5xl leading-[0.95] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
          Start creating
          <br />
          your board
        </h1>

        <button
          type="button"
          onClick={openModal}
          className="mt-12 border border-white bg-white px-10 py-5 text-sm font-medium uppercase tracking-[0.22em] text-black transition hover:bg-transparent hover:text-white"
        >
          Create Board +
        </button>

        {error && <p className="mt-6 text-sm text-red-300">{error}</p>}

        {boards.length > 0 && (
          <section className="mt-20">
            <p className="mb-6 text-[11px] uppercase tracking-[0.35em] text-white/40">Your boards</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {boards.map((b) => (
                <Link
                  key={b.id}
                  href={`/board/${b.id}`}
                  className="border border-white/15 bg-white/5 p-6 transition hover:border-white/40 hover:bg-white/10"
                >
                  <div className="font-display text-2xl">{b.title}</div>
                  <div className="mt-2 text-sm text-white/50">{b.clientName}</div>
                  <div className="mt-1 text-xs text-white/30">{b.companyName}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreate}
            className="relative w-full max-w-xl border border-white/20 bg-black p-8 shadow-2xl"
          >
            <div className="mb-8 flex items-start justify-between gap-4">
              <h2 className="font-display text-3xl tracking-tight">New board</h2>
              <button
                type="submit"
                disabled={creating}
                className="shrink-0 border border-white bg-white px-5 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-black transition hover:bg-transparent hover:text-white disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>

            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-white/45">
                  Board Title
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  disabled={creating}
                  className="w-full border border-white/20 bg-transparent px-4 py-3 outline-none focus:border-white/60 disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-white/45">
                  Client&apos;s Name
                </span>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  required
                  disabled={creating}
                  className="w-full border border-white/20 bg-transparent px-4 py-3 outline-none focus:border-white/60 disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-white/45">
                  Company&apos;s Name
                </span>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                  disabled={creating}
                  className="w-full border border-white/20 bg-transparent px-4 py-3 outline-none focus:border-white/60 disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] uppercase tracking-[0.25em] text-white/45">
                  Logline <span className="text-white/30">(optional)</span>
                </span>
                <textarea
                  value={logline}
                  onChange={(e) => setLogline(e.target.value)}
                  rows={3}
                  disabled={creating}
                  className="w-full resize-none border border-white/20 bg-transparent px-4 py-3 outline-none focus:border-white/60 disabled:opacity-50"
                />
              </label>
            </div>

            {error && <p className="mt-5 text-sm text-red-300">{error}</p>}

            <button
              type="button"
              onClick={() => {
                if (creating) return;
                setModalOpen(false);
                setError(null);
              }}
              className="mt-8 text-[11px] uppercase tracking-[0.25em] text-white/40 hover:text-white"
            >
              Cancel
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
