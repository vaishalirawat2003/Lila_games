import { useEffect, useRef, useState } from 'react';

/**
 * usePlayback — RAF-based timeline playback for a match.
 *
 * ts values are absolute Unix timestamps in ms (from the backend).
 * Elapsed time = currentTs - minTs.
 *
 * @param {number} minTs  smallest ts in the match (match start)
 * @param {number} maxTs  largest ts in the match (match end)
 *
 * Returns:
 *   currentTs   number   current absolute timestamp
 *   isPlaying   bool
 *   speed       number   1 | 0.5 | 2 | 4
 *   togglePlay  fn
 *   rewind      fn       jump back to start
 *   scrub       fn(elapsedMs)  jump to a specific elapsed position
 *   setSpeed    fn(n)
 */
export function usePlayback(minTs, maxTs) {
  const [currentTs, setCurrentTs] = useState(minTs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed]         = useState(1);

  const lastWallRef = useRef(null);

  // Reset when the match changes
  useEffect(() => {
    setCurrentTs(minTs);
    setIsPlaying(false);
    lastWallRef.current = null;
  }, [minTs]);

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
    // If at end, restart from beginning
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
