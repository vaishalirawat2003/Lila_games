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
// Icons
// ---------------------------------------------------------------------------

function FileIcon() {
  return (
    <svg className="mb-4 h-10 w-10 text-zinc-400" fill="none" stroke="currentColor"
      strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="mb-4 h-10 w-10 text-zinc-400" fill="none" stroke="currentColor"
      strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function ProgressBar() {
  return (
    <div className="w-full rounded-full bg-zinc-800 h-1.5 mt-3">
      <div className="h-1.5 rounded-full bg-red-500 animate-pulse w-1/2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Upload limits (must match backend constants)
// ---------------------------------------------------------------------------

const MAX_FILE_COUNT  = 2000;
const MAX_FILE_SIZE   = 5 * 1024 * 1024;    // 5 MB per file
const MAX_TOTAL_SIZE  = 100 * 1024 * 1024;  // 100 MB total

export default function UploadScreen({ onUploadComplete }) {
  // 'idle' | 'staged' | 'uploading' | 'error'
  const [status, setStatus] = useState('idle');
  const [dragging, setDragging]       = useState(false); // file card
  const [draggingFolder, setDraggingFolder] = useState(false); // folder card
  const [uploadingCount, setUploadingCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Folder staging — accumulate files from multiple folder picks before uploading
  const [stagedFiles, setStagedFiles] = useState([]);
  const [stagedFolderCount, setStagedFolderCount] = useState(0);

  const fileInputRef   = useRef(null);
  const folderInputRef = useRef(null);

  // ── Core upload ─────────────────────────────────────────────────────────────

  const handleFiles = useCallback(
    async (files) => {
      if (!files || files.length === 0) return;
      let fileArray = Array.from(files);

      // ── Client-side validation ───────────────────────────────────────────

      // 1. File count
      if (fileArray.length > MAX_FILE_COUNT) {
        setErrorMsg(
          `Too many files selected (${fileArray.length.toLocaleString()}). ` +
          `Maximum is ${MAX_FILE_COUNT.toLocaleString()} files.`
        );
        setStatus('error');
        return;
      }

      // 2. Per-file size — filter out oversized files and warn
      const oversized = fileArray.filter((f) => f.size > MAX_FILE_SIZE);
      if (oversized.length > 0) {
        fileArray = fileArray.filter((f) => f.size <= MAX_FILE_SIZE);
      }

      if (fileArray.length === 0) {
        setErrorMsg(
          `All selected files exceed the 5 MB per-file limit. ` +
          `Parquet data files are typically only ~6 KB each.`
        );
        setStatus('error');
        return;
      }

      // 3. Total size
      const totalSize = fileArray.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_TOTAL_SIZE) {
        setErrorMsg(
          `Total upload size (${(totalSize / (1024 * 1024)).toFixed(0)} MB) ` +
          `exceeds the 100 MB limit.`
        );
        setStatus('error');
        return;
      }

      // ── Proceed ─────────────────────────────────────────────────────────

      setSkippedCount(oversized.length);
      setUploadingCount(fileArray.length);
      setStatus('uploading');
      setErrorMsg('');
      setStagedFiles([]);
      setStagedFolderCount(0);
      try {
        const summary = await uploadFiles(fileArray);
        onUploadComplete(summary);
      } catch (err) {
        setErrorMsg(err.message || 'Upload failed. Please try again.');
        setStatus('error');
      }
    },
    [onUploadComplete]
  );

  // ── File card drag & drop ───────────────────────────────────────────────────

  const onDragOver = useCallback((e) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  }, []);
  const onDrop = useCallback(
    async (e) => {
      e.preventDefault();
      setDragging(false);
      const files = await collectFiles(e.dataTransfer.items);
      handleFiles(files.length ? files : e.dataTransfer.files);
    },
    [handleFiles]
  );

  // ── Folder card drag & drop (multiple folders at once) ─────────────────────

  const onFolderDragOver = useCallback((e) => { e.preventDefault(); setDraggingFolder(true); }, []);
  const onFolderDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDraggingFolder(false);
  }, []);
  const onFolderDrop = useCallback(
    async (e) => {
      e.preventDefault();
      setDraggingFolder(false);
      const files = await collectFiles(e.dataTransfer.items);
      if (files.length) handleFiles(files);
    },
    [handleFiles]
  );

  // ── Folder staging ──────────────────────────────────────────────────────────

  const onFolderChange = useCallback((e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setStagedFiles((prev) => [...prev, ...files]);
    setStagedFolderCount((prev) => prev + 1);
    setStatus('staged');
    // Reset input so the same folder can be added again if needed
    e.target.value = '';
  }, []);

  const clearStaged = useCallback(() => {
    setStagedFiles([]);
    setStagedFolderCount(0);
    setStatus('idle');
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const busy = status === 'uploading';

  const cardBase = [
    'flex flex-1 flex-col items-center justify-center',
    'rounded-2xl border-2 border-dashed px-6 py-12 text-center',
    'transition-all duration-200',
  ].join(' ');

  const fileCardClass = [
    cardBase,
    busy ? 'pointer-events-none opacity-50' : 'cursor-pointer',
    dragging
      ? 'border-red-500 bg-red-500/5 scale-[1.01]'
      : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-900',
  ].join(' ');

  const folderCardClass = [
    cardBase,
    busy ? 'pointer-events-none opacity-50' : 'cursor-pointer',
    draggingFolder
      ? 'border-red-500 bg-red-500/5 scale-[1.01]'
      : status === 'staged'
        ? 'border-red-700 bg-red-950/20'
        : 'border-zinc-700 bg-zinc-900/50 hover:border-zinc-500 hover:bg-zinc-900',
  ].join(' ');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-red-500">
          Telemetry Visualizer
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">LILA BLACK</h1>
        <p className="mt-1 text-sm text-zinc-500">Player Journey Visualization Tool</p>
      </div>

      <div className="w-full max-w-2xl">

        {/* ── Two upload cards ── */}
        <div className="flex items-stretch gap-0">

          {/* Left: Upload Files */}
          <div
            className={fileCardClass}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => !busy && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            aria-label="Upload files"
          >
            <FileIcon />
            <p className="text-sm font-semibold text-white">Upload Files</p>
            <p className="mt-1 text-xs text-zinc-500">
              Click to select parquet files<br />or drag &amp; drop
            </p>
          </div>

          {/* Divider */}
          <div className="flex flex-col items-center justify-center px-4 shrink-0">
            <div className="h-12 w-px bg-zinc-800" />
            <span className="my-2 text-xs text-zinc-600">or</span>
            <div className="h-12 w-px bg-zinc-800" />
          </div>

          {/* Right: Upload Folder */}
          <div
            className={folderCardClass}
            onDragOver={onFolderDragOver}
            onDragLeave={onFolderDragLeave}
            onDrop={onFolderDrop}
            onClick={() => !busy && folderInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && folderInputRef.current?.click()}
            aria-label="Upload folder"
          >
            <FolderIcon />
            <p className="text-sm font-semibold text-white">Upload Folder</p>
            <p className="mt-1 text-xs text-zinc-500">
              Drag multiple folders at once<br />or click to select one
            </p>
          </div>
        </div>

        {/* ── Uploading state ── */}
        {busy && (
          <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4 text-center">
            <p className="text-sm font-medium text-zinc-300">
              Uploading {uploadingCount.toLocaleString()} {uploadingCount === 1 ? 'file' : 'files'}…
            </p>
            {skippedCount > 0 && (
              <p className="mt-1 text-xs text-yellow-500">
                {skippedCount} {skippedCount === 1 ? 'file' : 'files'} skipped (exceeded 5 MB per-file limit)
              </p>
            )}
            <p className="mt-1 text-xs text-zinc-500">
              Processing events and computing heatmaps
            </p>
            <ProgressBar />
            <div className="mt-3 mx-auto h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-red-500" />
          </div>
        )}

        {/* ── Staged folders summary ── */}
        {status === 'staged' && (
          <div className="mt-5 flex items-center gap-4 rounded-xl border border-red-900/60 bg-red-950/20 px-5 py-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                {stagedFolderCount} {stagedFolderCount === 1 ? 'folder' : 'folders'} &nbsp;·&nbsp; {stagedFiles.length} files queued
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Click "Upload Folder" again to add more folders before uploading
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={clearStaged}
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-white"
              >
                Clear
              </button>
              <button
                onClick={() => handleFiles(stagedFiles)}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
              >
                Upload now
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {status === 'error' && (
          <div className="mt-5 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">
            {errorMsg}
            <button
              onClick={() => setStatus('idle')}
              className="ml-3 underline text-red-300 hover:text-white"
            >
              Try again
            </button>
          </div>
        )}

        {/* Tip */}
        {status === 'idle' && (
          <p className="mt-4 text-center text-xs text-zinc-600">
            Tip: select all 5 date folders in Finder and drag them onto the folder card at once
          </p>
        )}
      </div>

      {/* Hidden inputs */}
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
        webkitdirectory=""
        className="hidden"
        onChange={onFolderChange}
      />
    </div>
  );
}
