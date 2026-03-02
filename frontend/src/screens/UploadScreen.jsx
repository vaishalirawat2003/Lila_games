import React, { useCallback, useRef, useState } from 'react';
import { uploadFiles } from '../utils/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all File objects from a DataTransferItemList.
 * Handles both plain files and dropped folders (via FileSystemEntry API).
 */
async function collectFiles(dataTransferItems) {
  const files = [];

  async function readEntry(entry) {
    if (entry.isFile) {
      await new Promise((resolve) => {
        entry.file((f) => {
          // Attach the full relative path so the backend sees the date folder
          Object.defineProperty(f, 'webkitRelativePath', {
            value: entry.fullPath.replace(/^\//, ''),
            writable: false,
          });
          files.push(f);
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      await new Promise((resolve) => {
        // readEntries only returns up to 100 entries at a time — loop until empty
        const readBatch = () => {
          reader.readEntries(async (entries) => {
            if (!entries.length) return resolve();
            await Promise.all(entries.map(readEntry));
            readBatch();
          });
        };
        readBatch();
      });
    }
  }

  await Promise.all(
    Array.from(dataTransferItems)
      .filter((item) => item.kind === 'file')
      .map((item) => item.webkitGetAsEntry?.() || item.getAsEntry?.())
      .filter(Boolean)
      .map(readEntry)
  );

  return files;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UploadIcon() {
  return (
    <svg
      className="mx-auto mb-4 h-12 w-12 text-zinc-500"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}

function ProgressBar({ value, max }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="w-full rounded-full bg-zinc-800 h-1.5 mt-3">
      <div
        className="h-1.5 rounded-full bg-red-500 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * UploadScreen
 *
 * Props:
 *   onUploadComplete(summary) — called when /upload succeeds.
 *   summary shape: { match_count, player_count, map_count, maps }
 */
export default function UploadScreen({ onUploadComplete }) {
  const [state, setState] = useState('idle'); // idle | uploading | error
  const [dragging, setDragging] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Two hidden file inputs — one for individual files, one for a whole folder
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // ── Upload logic ───────────────────────────────────────────────────────────

  const handleFiles = useCallback(
    async (files) => {
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      setFileCount(fileArray.length);
      setState('uploading');
      setErrorMsg('');

      try {
        const summary = await uploadFiles(fileArray);
        onUploadComplete(summary);
      } catch (err) {
        setErrorMsg(err.message || 'Upload failed. Please try again.');
        setState('error');
      }
    },
    [onUploadComplete]
  );

  // ── Drag & drop handlers ───────────────────────────────────────────────────

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    // Only clear if we're actually leaving the zone (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragging(false);
    }
  }, []);

  const onDrop = useCallback(
    async (e) => {
      e.preventDefault();
      setDragging(false);

      const files = await collectFiles(e.dataTransfer.items);
      if (files.length === 0) {
        // Fallback: try dataTransfer.files (plain files, no folder recursion)
        handleFiles(e.dataTransfer.files);
      } else {
        handleFiles(files);
      }
    },
    [handleFiles]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const isUploading = state === 'uploading';

  const dropZoneClasses = [
    'relative flex flex-col items-center justify-center',
    'w-full rounded-2xl border-2 border-dashed',
    'px-8 py-16 text-center transition-all duration-200',
    dragging
      ? 'border-red-500 bg-red-500/5 scale-[1.01]'
      : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-900',
    isUploading ? 'pointer-events-none opacity-60' : 'cursor-pointer',
  ].join(' ');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-red-500">
          Telemetry Visualizer
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          LILA BLACK
        </h1>
        <p className="mt-1 text-sm text-zinc-500">Player Journey Visualization Tool</p>
      </div>

      {/* Drop zone */}
      <div className="w-full max-w-xl">
        <div
          className={dropZoneClasses}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !isUploading && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          aria-label="Upload zone"
        >
          <UploadIcon />

          {isUploading ? (
            <>
              <p className="text-sm font-medium text-zinc-300">
                Uploading {fileCount} {fileCount === 1 ? 'file' : 'files'}…
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Processing events and computing heatmaps
              </p>
              <ProgressBar value={0} max={1} />
              <div className="mt-4 h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-red-500" />
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-zinc-300">
                Drop parquet files here
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                or click to select files
              </p>
            </>
          )}
        </div>

        {/* Select folder button — separate from the drop zone click */}
        {!isUploading && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              onClick={() => folderInputRef.current?.click()}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs text-zinc-400
                         transition hover:border-zinc-500 hover:text-white"
            >
              Select folder instead
            </button>
          </div>
        )}

        {/* Tip */}
        <p className="mt-4 text-center text-xs text-zinc-600">
          Tip: select all files from all date folders at once for the full dataset
        </p>

        {/* Error message */}
        {state === 'error' && (
          <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">
            {errorMsg}
            <button
              onClick={() => setState('idle')}
              className="ml-3 underline text-red-300 hover:text-white"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // webkitdirectory lets the user pick an entire folder
        webkitdirectory=""
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
