import React, { useEffect, useRef } from 'react';
import { IMAGE_SIZE, MINIMAP_FILES, loadImage } from '../utils/canvas';

// ── Event categorisation ─────────────────────────────────────────────────────

const POSITION_EVENTS = new Set(['Position', 'BotPosition']);

const EVENT_CATEGORIES = {
  kills:  new Set(['Kill', 'BotKill']),
  deaths: new Set(['Killed', 'BotKilled']),
  loot:   new Set(['Loot']),
  storm:  new Set(['KilledByStorm']),
};

// ── Marker styles ─────────────────────────────────────────────────────────────

const MARKER_STYLES = {
  Kill:           { color: '#ef4444', size: 9  },
  Killed:         { color: '#991b1b', size: 8  },
  BotKill:        { color: '#f97316', size: 6  },
  BotKilled:      { color: '#f97316', size: 6  },
  KilledByStorm:  { color: '#a855f7', size: 9  },
  Loot:           { color: '#eab308', size: 7  },
};

// ── Drawing primitives ────────────────────────────────────────────────────────

function drawX(ctx, px, py, size) {
  const h = size / 2;
  ctx.beginPath();
  ctx.moveTo(px - h, py - h); ctx.lineTo(px + h, py + h);
  ctx.moveTo(px + h, py - h); ctx.lineTo(px - h, py + h);
  ctx.stroke();
}

function drawDot(ctx, px, py, r) {
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawDiamond(ctx, px, py, size) {
  ctx.beginPath();
  ctx.moveTo(px,        py - size);
  ctx.lineTo(px + size, py);
  ctx.lineTo(px,        py + size);
  ctx.lineTo(px - size, py);
  ctx.closePath();
  ctx.fill();
}

function drawStar(ctx, px, py, size) {
  const spikes = 5;
  const outerR = size;
  const innerR = size * 0.45;
  let angle = -Math.PI / 2;
  const step = Math.PI / spikes;

  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    ctx.lineTo(px + Math.cos(angle) * r, py + Math.sin(angle) * r);
    angle += step;
  }
  ctx.closePath();
  ctx.fill();
}

function drawEventMarker(ctx, event, px, py) {
  const style = MARKER_STYLES[event];
  if (!style) return;

  const { color, size } = style;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = 2;

  switch (event) {
    case 'Kill':
    case 'BotKill':
      drawX(ctx, px, py, size);
      break;
    case 'Killed':
    case 'BotKilled':
      drawDot(ctx, px, py, size / 2);
      break;
    case 'KilledByStorm':
      drawDiamond(ctx, px, py, size / 2);
      break;
    case 'Loot':
      drawStar(ctx, px, py, size / 2);
      break;
    default:
      break;
  }

  ctx.restore();
}

// ── Path drawing ──────────────────────────────────────────────────────────────

/**
 * @param {number} alpha  overall opacity for this path (0–1)
 */
function drawPath(ctx, posEvents, color, isBot, alpha) {
  if (posEvents.length < 2) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = isBot ? 1 : 1.5;
  ctx.globalAlpha = alpha;

  if (isBot) {
    ctx.setLineDash([4, 6]);
  }

  ctx.beginPath();
  ctx.moveTo(posEvents[0].px, posEvents[0].py);
  for (let i = 1; i < posEvents.length; i++) {
    ctx.lineTo(posEvents[i].px, posEvents[i].py);
  }
  ctx.stroke();
  ctx.restore();
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * MatchCanvas — renders minimap + player paths + event markers.
 *
 * Props:
 *   mapId           string
 *   matchData       object    full match from /match/{id}
 *   currentTs       number    current absolute playback timestamp
 *   playbackMode    string    'paths' | 'events'
 *   showHumans      bool
 *   showBots        bool
 *   showEvents      { kills, deaths, loot, storm }
 *   focusedPlayerId string|null  highlight one player, dim all others
 *   loading         bool
 */
export default function MatchCanvas({
  mapId,
  matchData,
  currentTs,
  playbackMode,
  showHumans,
  showBots,
  showEvents,
  focusedPlayerId,
  loading,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!mapId || loading) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const src = MINIMAP_FILES[mapId];
    if (!src) return;

    loadImage(src)
      .then((img) => {
        // 1. Minimap base — greyscale so markers and paths dominate
        ctx.clearRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
        ctx.filter = 'grayscale(100%) brightness(0.65)';
        ctx.drawImage(img, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
        ctx.filter = 'none';

        if (!matchData) {
          ctx.fillStyle = 'rgba(0,0,0,0.45)';
          ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = 'bold 28px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Select a match to begin', IMAGE_SIZE / 2, IMAGE_SIZE / 2);
          return;
        }

        const { players } = matchData;

        // Helper: opacity for a given player based on focus state
        function pathAlpha(player) {
          if (!focusedPlayerId) return 0.70;
          return player.user_id === focusedPlayerId ? 0.90 : 0.12;
        }
        function markerAlpha(player) {
          if (!focusedPlayerId) return 1.0;
          return player.user_id === focusedPlayerId ? 1.0 : 0.12;
        }

        // 2. Bot paths (drawn first so human paths render on top)
        if (playbackMode === 'paths' && showBots) {
          for (const player of players) {
            if (!player.is_bot) continue;
            const posEvents = player.events.filter(
              (e) => e.ts <= currentTs
            );
            drawPath(ctx, posEvents, '#faff00', true, pathAlpha(player));
          }
        }

        // 3. Human paths
        if (playbackMode === 'paths' && showHumans) {
          for (const player of players) {
            if (player.is_bot) continue;
            const posEvents = player.events.filter(
              (e) => e.ts <= currentTs
            );
            drawPath(ctx, posEvents, player.color, false, pathAlpha(player));
          }
        }

        // 4. Event markers — layered on top of all paths
        for (const player of players) {
          if (player.is_bot  && !showBots)   continue;
          if (!player.is_bot && !showHumans) continue;

          const mAlpha = markerAlpha(player);

          for (const ev of player.events) {
            if (ev.ts > currentTs) continue;
            if (POSITION_EVENTS.has(ev.event)) continue;

            const visible = Object.entries(EVENT_CATEGORIES).some(
              ([cat, evSet]) => evSet.has(ev.event) && showEvents[cat]
            );
            if (!visible) continue;

            ctx.save();
            ctx.globalAlpha = mAlpha;
            drawEventMarker(ctx, ev.event, ev.px, ev.py);
            ctx.restore();
          }
        }
      })
      .catch(() => {
        const ctx2 = canvasRef.current?.getContext('2d');
        if (!ctx2) return;
        ctx2.fillStyle = '#18181b';
        ctx2.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);
      });
  }, [mapId, matchData, currentTs, playbackMode, showHumans, showBots, showEvents, focusedPlayerId, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-zinc-900">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-red-500" />
          <span className="text-xs text-zinc-500">Loading match…</span>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={IMAGE_SIZE}
      height={IMAGE_SIZE}
      className="w-full rounded-xl"
    />
  );
}
