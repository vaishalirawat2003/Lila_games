import React from 'react';
import { formatTime } from '../hooks/usePlayback';

const SPEEDS = [15, 30, 60, 120, 240];

/**
 * Timeline — playback controls bar shown at the bottom of the Match Explorer.
 *
 * Props:
 *   currentTs    number   absolute ts of current playback position
 *   minTs        number   match start ts
 *   maxTs        number   match end ts
 *   isPlaying    bool
 *   speed        number
 *   playbackMode string   'paths' | 'events'
 *   onTogglePlay fn
 *   onRewind     fn
 *   onScrub      fn(elapsedMs)
 *   onSpeed      fn(speed)
 *   onModeToggle fn
 */
export default function Timeline({
  currentTs,
  minTs,
  maxTs,
  isPlaying,
  speed,
  playbackMode,
  onTogglePlay,
  onRewind,
  onScrub,
  onSpeed,
  onModeToggle,
}) {
  const duration  = maxTs - minTs;
  const elapsed   = Math.max(0, currentTs - minTs);
  const progress  = duration > 0 ? elapsed / duration : 0;

  return (
    <div className="flex flex-col gap-2 border-t border-zinc-800 bg-zinc-950 px-4 py-3">

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={duration}
        step={100}
        value={Math.round(elapsed)}
        onChange={(e) => onScrub(Number(e.target.value))}
        className="w-full cursor-pointer accent-red-500"
        style={{ '--progress': `${progress * 100}%` }}
      />

      {/* Controls row */}
      <div className="flex items-center gap-3">

        {/* Rewind */}
        <button
          onClick={onRewind}
          title="Rewind to start"
          className="rounded p-1 text-zinc-400 transition hover:text-white"
        >
          <RewindIcon />
        </button>

        {/* Play / Pause */}
        <button
          onClick={onTogglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-500"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        {/* Speed selector */}
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSpeed(s)}
              className={[
                'rounded px-2 py-0.5 text-xs transition',
                speed === s
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-500 hover:text-zinc-200',
              ].join(' ')}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Time display */}
        <span className="ml-1 font-mono text-xs text-zinc-400">
          {formatTime(elapsed)}
          <span className="text-zinc-600"> / </span>
          {formatTime(duration)}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Playback mode toggle */}
        <button
          onClick={onModeToggle}
          className={[
            'rounded-lg border px-3 py-1 text-xs transition',
            playbackMode === 'paths'
              ? 'border-zinc-600 text-zinc-300'
              : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300',
          ].join(' ')}
          title="Toggle between God View (paths + events) and Events Only"
        >
          {playbackMode === 'paths' ? 'Paths + Events' : 'Events Only'}
        </button>

      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function PlayIcon() {
  return (
    <svg className="h-4 w-4 translate-x-px" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
      <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
    </svg>
  );
}

function RewindIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
      <path d="M7.712 3.624A1.5 1.5 0 0110 4.974v2.552l5.712-3.35A1.5 1.5 0 0118 5.474v9.052a1.5 1.5 0 01-2.288 1.298L10 12.474v2.552a1.5 1.5 0 01-2.288 1.298l-6-3.526a1.5 1.5 0 010-2.596l6-3.578z" />
    </svg>
  );
}
