import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { fullResolutionUrl } from './mediaUrls';

export type DownloadableAsset = {
  name: string;
  url: string;
};

function safeFileName(name: string, fallback = 'file') {
  const cleaned = (name || fallback).replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned || fallback;
}

async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.blob();
}

export async function downloadAsset(asset: DownloadableAsset): Promise<void> {
  const url = fullResolutionUrl(asset.url) || asset.url;
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    const blob = await fetchAsBlob(url);
    saveAs(blob, safeFileName(asset.name));
    return;
  }
  // Prefer opening/saving via an anchor for remote URLs (avoids CORS fetch when possible)
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFileName(asset.name);
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export type ZipProgress = {
  done: number;
  total: number;
  /** 0–100 */
  percent: number;
};

/**
 * Bundle all assets into a single .zip and download via file-saver.
 * Progress reports after each file is fetched.
 */
export async function downloadAssetsAsZip(
  assets: DownloadableAsset[],
  zipName: string,
  onProgress?: (progress: ZipProgress) => void
): Promise<void> {
  if (!assets.length) throw new Error('No files to download');

  const zip = new JSZip();
  const usedNames = new Map<string, number>();
  const total = assets.length;

  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i];
    const url = fullResolutionUrl(asset.url) || asset.url;
    const blob = await fetchAsBlob(url);

    let name = safeFileName(asset.name, `file-${i + 1}`);
    const count = usedNames.get(name) || 0;
    usedNames.set(name, count + 1);
    if (count > 0) {
      const dot = name.lastIndexOf('.');
      name =
        dot > 0
          ? `${name.slice(0, dot)} (${count})${name.slice(dot)}`
          : `${name} (${count})`;
    }

    zip.file(name, blob);
    onProgress?.({
      done: i + 1,
      total,
      percent: Math.round(((i + 1) / total) * 100)
    });
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' }, (meta) => {
    // Keep percent near 100 during compression if many files finished fetching
    if (meta.percent != null) {
      onProgress?.({
        done: total,
        total,
        percent: Math.min(100, Math.round(90 + meta.percent * 0.1))
      });
    }
  });

  saveAs(zipBlob, safeFileName(zipName.endsWith('.zip') ? zipName : `${zipName}.zip`, 'project.zip'));
  onProgress?.({ done: total, total, percent: 100 });
}
