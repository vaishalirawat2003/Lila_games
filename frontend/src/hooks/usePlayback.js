import { useEffect, useRef, useState } from 'react';

/**
 * usePlayback — RAF-based timeline playback for a match.
 *
 * ts values are absolute Unix timestamps in ms (from the backend).
 * Elapsed time = currentTs - minTs.
 *
 * @param {number} minTs  smallest ts in the match (match start)
 * @param {number} maxTs  largest ts in the match (match end)
 */
export function usePlayback(minTs, maxTs) {
  const [currentTs, setCurrentTs] = useState(minTs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed]         = useState(60); // default: 60× — 10-min match in ~10 sec

  const lastWallRef = useRef(null);

  // Reset whenever the match changes.
  // Watching BOTH minTs and maxTs ensures the reset fires even when ts values
  // are match-relative (starting at 0 for every match), where minTs alone
  // would be identical across matches and never re-trigger.
  useEffect(() => {
    setCurrentTs(minTs);
    setIsPlaying(false);
    lastWallRef.current = null;
  }, [minTs, maxTs]); // eslint-disable-line react-hooks/exhaustive-deps

  // RAF loop — advances currentTs by (wallDelta × speed) each frame
  useEffect(() => {
    if (!isPlaying) {
      lastWallRef.current = null;
      return;
    }

    let rafId;

    function tick(wallTime) {
      if (lastWallRef.current !== null) {
        const wallDelta = wallTime - lastWallRef.current;
        const tsDelta   = wallDelta * speed;

        setCurrentTs((prev) => {
          const next = prev + tsDelta;
          if (next >= maxTs) {
            setIsPlaying(false);
            return maxTs;
          }
          return next;
        });
      }
      lastWallRef.current = wallTime;
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      lastWallRef.current = null;
    };
  }, [isPlaying, speed, maxTs]);

  function togglePlay() {
    if (currentTs >= maxTs) {
      setCurrentTs(minTs);
    }
    setIsPlaying((p) => !p);
  }

  function rewind() {
    setCurrentTs(minTs);
    setIsPlaying(false);
  }

  // elapsedMs: time since match start (0 … maxTs-minTs)
  function scrub(elapsedMs) {
    setCurrentTs(minTs + elapsedMs);
    setIsPlaying(false);
  }

  return { currentTs, isPlaying, speed, setSpeed, togglePlay, rewind, scrub };
}

/**
 * Format elapsed milliseconds as MM:SS.
 */
export function formatTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
