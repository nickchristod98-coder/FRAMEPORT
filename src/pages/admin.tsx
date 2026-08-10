import React, { useEffect, useState } from 'react';
import UploadDropzone from '../components/UploadDropzone';
import { supabase } from '../lib/supabaseClient';

type Project = {
  id: string;
  title: string;
  description?: string;
  created_at?: string;
  gallery_links?: Array<{ id: string; public_id: string }>;
};

export default function AdminPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [password, setPassword] = useState('');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setProjectsLoading(true);
    try {
      const res = await fetch('/api/admin/projects');
      const body = await res.json();
      setProjects(body.projects || []);
    } finally {
      setProjectsLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/admin/create-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName, clientName, password })
    });
    const json = await res.json();
    setLoading(false);
    if (json.error) {
      // eslint-disable-next-line no-console
      console.error(json.error);
      return;
    }
    setProjectName('');
    setClientName('');
    setPassword('');
    await fetchProjects();
    if (json.project) setSelectedProject(json.project.id);
    setMessage('Gallery created — copy the link from the list below.');
    setTimeout(() => setMessage(null), 4000);
  }

  function copyLink(publicId?: string) {
    if (!publicId) return;
    const url = `${window.location.origin}/g/${publicId}`;
    navigator.clipboard.writeText(url);
    // eslint-disable-next-line no-console
    console.log('Copied', url);
  }

  return (
    <main className="min-h-screen py-10">
      <div className="container">
        <h2 className="text-2xl font-semibold mb-4">Admin Dashboard</h2>

        <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          <form onSubmit={handleCreate} className="p-6 border rounded">
            <h3 className="text-lg font-medium mb-4">Create Client Gallery</h3>
            <label className="block mb-2">
              <div className="text-sm text-gray-700">Project Name</div>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="mt-1 w-full border px-3 py-2 rounded"
                required
              />
            </label>
            <label className="block mb-2">
              <div className="text-sm text-gray-700">Client Name</div>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="mt-1 w-full border px-3 py-2 rounded"
              />
            </label>
            <label className="block mb-4">
              <div className="text-sm text-gray-700">Password</div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full border px-3 py-2 rounded"
                required
              />
            </label>
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 bg-black text-white rounded" disabled={loading}>
                {loading ? 'Creating...' : 'Create Gallery'}
              </button>
            </div>
          </form>

          <div className="p-6 border rounded">
            <h3 className="text-lg font-medium mb-4">Upload Media</h3>
            <div className="mb-3">
              <label className="block text-sm text-gray-700 mb-1">Choose project</label>
              <select
                value={selectedProject || ''}
                onChange={(e) => setSelectedProject(e.target.value || null)}
                className="w-full border px-3 py-2 rounded"
              >
                <option value="">Select a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <UploadDropzone projectId={selectedProject} />
          </div>
        </section>

        <section>
          <h3 className="text-lg font-medium mb-4">Existing Projects</h3>
          {projectsLoading ? (
            <div className="text-sm text-gray-500">Loading projects…</div>
          ) : (
            <div className="space-y-4">
              {projects.map((p) => (
                <div key={p.id} className="p-4 border rounded flex items-center justify-between">
                  <div>
                    <div className="font-medium">{p.title}</div>
                    <div className="text-sm text-gray-500">{p.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.gallery_links && p.gallery_links[0] ? (
                      <>
                        <div className="text-sm text-gray-700">/{p.gallery_links[0].public_id}</div>
                        <button
                          className="px-3 py-1 border rounded text-sm"
                          onClick={() => copyLink(p.gallery_links && p.gallery_links[0]?.public_id)}
                        >
                          Copy link
                        </button>
                        <a
                          className="px-3 py-1 border rounded text-sm"
                          href={`/admin/${p.id}`}
                        >
                          Edit Project Content
                        </a>
                      </>
                    ) : (
                      <div className="text-sm text-gray-500">No link</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        {message && <div className="mt-4 text-sm text-green-600">{message}</div>}
      </div>
    </main>
  );
}

