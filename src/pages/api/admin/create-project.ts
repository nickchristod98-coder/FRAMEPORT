import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

function generatePublicId() {
  // short alphanumeric token
  return Math.random().toString(36).slice(2, 9);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { projectName, clientName, password, expiresAt } = req.body;
  if (!projectName || !password) return res.status(400).json({ error: 'Missing fields' });

  try {
    // create project
    const { data: projectData, error: projectError } = await supabaseAdmin
      .from('projects')
      .insert([{ title: projectName, description: clientName }])
      .select()
      .single();
    if (projectError || !projectData) throw projectError || new Error('Project creation failed');

    const publicId = generatePublicId();

    // Log inputs for debugging (remove in production)
    // eslint-disable-next-line no-console
    console.log('[create-project] projectName:', projectName, 'clientName:', clientName, 'password:', password, 'publicId:', publicId);

    // call helper function to create gallery link with hashed password
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('create_gallery_link', {
      p_project: projectData.id,
      p_public_id: publicId,
      p_password: password,
      p_expires: expiresAt || null
    });
    if (rpcError) throw rpcError;

    return res.status(200).json({ project: projectData, public_id: publicId, link_id: rpcData });
  } catch (err: any) {
    // log full error for debugging
    // eslint-disable-next-line no-console
    console.error('API ERROR [create-project]:', err);
    return res.status(500).json({ error: err?.message || String(err) || 'Server error' });
  }
}

