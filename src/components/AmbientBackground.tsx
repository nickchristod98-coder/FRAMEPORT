import React from 'react';

/** Soft, out-of-focus color fields that drift slowly behind content. */
export default function AmbientBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="ambient-blob ambient-blob-a" />
      <div className="ambient-blob ambient-blob-b" />
      <div className="ambient-blob ambient-blob-c" />
      <div className="absolute inset-0 bg-black/55" />
    </div>
  );
}
