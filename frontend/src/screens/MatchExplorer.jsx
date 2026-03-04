import React, { useEffect, useMemo, useState } from 'react';
import MatchCanvas from '../components/MatchCanvas';
import Timeline from '../components/Timeline';
import { useMatchList, useSingleMatch } from '../hooks/useMatchData';
import { formatTime, usePlayback } from '../hooks/usePlayback';

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateLabel(d) {
  if (!d) return d;
  const label = d.replace('_', ' ');
  return d === 'February_14' ? `${label} (partial)` : label;
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
      {children}
    </p>
  );
}

// ── Chevron icon ──────────────────────────────────────────────────────────────

function Chevron({ open }) {
  return (
    <svg
      className={['h-3 w-3 transition-transform duration-150', open ? 'rotate-180' : ''].join(' ')}
      fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ── Player row ────────────────────────────────────────────────────────────────

function PlayerRow({ player, isFocused, isAnyFocused, onClick }) {
  const label = player.is_bot
    ? `Bot ${player.user_id}`
    : `P ${player.user_id.slice(0, 8)}`;
  const dimmed = isAnyFocused && !isFocused;

  return (
    <button
      onClick={onClick}
      title={player.user_id}
      className={[
        'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition',
        isFocused  ? 'bg-zinc-800 text-white'
        : dimmed   ? 'text-zinc-700'
                   : 'text-zinc-400 hover:text-zinc-200',
      ].join(' ')}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{
          background: player.is_bot ? '#6b7280' : player.color,
          opacity: dimmed ? 0.3 : player.is_bot ? 0.6 : 1,
        }}
      />
      <span className="truncate font-mono">{label}</span>
    </button>
  );
}

// ── Collapsible player list ───────────────────────────────────────────────────

function PlayerList({ humanPlayers, botPlayers, focusedPlayerId, onFocus }) {
  const total = humanPlayers.length + botPlayers.length;

  // Collapse by default if > 5 participants; auto-adjust when match changes
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(total > 0 && total <= 5);
  }, [total]);

  const hasFocus = !!focusedPlayerId;

  return (
    <div>
      {/* Header: toggle button with summary + chevron */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between group mb-1.5"
      >
        <SectionLabel>Players</SectionLabel>
        <span className="flex items-center gap-1 text-[10px] text-zinc-600 group-hover:text-zinc-400 transition">
          {humanPlayers.length}P · {botPlayers.length}B
          <Chevron open={expanded} />
        </span>
      </button>

      {hasFocus && (
        <button
          onClick={() => onFocus(null)}
          className="mb-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition"
        >
          clear focus
        </button>
      )}

      {expanded && (
        // Max 5 rows visible (~120px), scrollable for larger rosters
        <div className="flex flex-col gap-0.5 overflow-y-auto" style={{ maxHeight: 120 }}>
          {humanPlayers.map((p) => (
            <PlayerRow
              key={p.user_id}
              player={p}
              isFocused={focusedPlayerId === p.user_id}
              isAnyFocused={hasFocus}
              onClick={() => onFocus(p.user_id)}
            />
          ))}
          {humanPlayers.length > 0 && botPlayers.length > 0 && (
            <div className="my-0.5 border-t border-zinc-800" />
          )}
          {botPlayers.map((p) => (
            <PlayerRow
              key={p.user_id}
              player={p}
              isFocused={focusedPlayerId === p.user_id}
              isAnyFocused={hasFocus}
              onClick={() => onFocus(p.user_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Toggle checkbox ───────────────────────────────────────────────────────────

function Toggle({ label, checked, onChange, color }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <span
        className={[
          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition',
          checked ? 'border-transparent bg-current' : 'border-zinc-600 bg-transparent',
        ].join(' ')}
        style={{
          color: checked
            ? color === 'white' ? '#e5e7eb'
            : color === 'gray'  ? '#6b7280'
            : color
            : undefined,
        }}
      >
        {checked && (
          <svg className="h-2.5 w-2.5 text-zinc-950" fill="currentColor" viewBox="0 0 16 16">
            <path d="M13.5 3.5l-8 8-3.5-3.5L3.5 6.5 5.5 8.5l6.5-6.5z" />
          </svg>
        )}
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
      <span className={checked ? 'text-zinc-200' : 'text-zinc-500'}>{label}</span>
    </label>
  );
}

/**
 * HUD-style legend overlay — positioned absolutely over the top-right of the
 * canvas area. humanPathColor and botPathColor reflect the actual canvas colours.
 */
function LegendOverlay({ humanPathColor }) {
  const BOT_COLOR = '#faff00';

  const rows = [
    {
      sample: (
        <svg width="24" height="10" aria-hidden>
          <line x1="0" y1="5" x2="24" y2="5" stroke={humanPathColor} strokeWidth="1.5" />
        </svg>
      ),
      label: 'Human path',
    },
    {
      sample: (
        <svg width="24" height="10" aria-hidden>
          <line x1="0" y1="5" x2="24" y2="5" stroke={BOT_COLOR} strokeWidth="1.5" strokeDasharray="4 4" />
        </svg>
      ),
      label: 'Bot path',
    },
    { sample: <Sym color="#ef4444">✕</Sym>, label: 'Kill' },
    { sample: <Sym color="#991b1b">●</Sym>, label: 'Killed' },
    { sample: <Sym color="#f97316">✕</Sym>, label: 'BotKill' },
    { sample: <Sym color="#f97316">●</Sym>, label: 'BotKilled' },
    { sample: <Sym color="#a855f7">◆</Sym>, label: 'Storm' },
    { sample: <Sym color="#eab308">★</Sym>, label: 'Loot' },
  ];

  return (
    <div
      className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 rounded-lg px-3 py-2.5 text-xs text-zinc-300"
      style={{
        background: 'rgba(0,0,0,0.72)',
        border: '1px solid rgba(255,255,255,0.10)',
        backdropFilter: 'blur(4px)',
      }}
    >
      {rows.map(({ sample, label }) => (
        <span key={label} className="flex items-center gap-2">
          <span className="flex w-6 items-center justify-center">{sample}</span>
          <span className="text-zinc-400">{label}</span>
        </span>
      ))}
    </div>
  );
}

function Sym({ color, children }) {
  return (
    <span style={{ color }} className="w-4 text-center leading-none">{children}</span>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function MatchExplorer({ summary, onBack }) {
  const availableMaps = summary?.maps ?? [];

  const [selectedMap,     setSelectedMap]     = useState(availableMaps[0] ?? '');
  const [selectedDate,    setSelectedDate]    = useState('all');
  const [selectedMatchId, setSelectedMatchId] = useState('');

  const [showHumans,      setShowHumans]      = useState(true);
  const [showBots,        setShowBots]        = useState(true);
  const [showEvents,      setShowEvents]      = useState({
    kills: true, deaths: true, loot: true, storm: true,
  });
  const [playbackMode,    setPlaybackMode]    = useState('paths');
  const [focusedPlayerId, setFocusedPlayerId] = useState(null);

  const { matches, loading: matchesLoading, error: matchListError } = useMatchList(selectedMap);
  const { match,   loading: matchLoading,   error: matchError }     = useSingleMatch(selectedMatchId);

  const availableDates = useMemo(() => {
    const dates = [...new Set(matches.map((m) => m.date).filter(Boolean))].sort();
    return dates;
  }, [matches]);

  const filteredMatches = useMemo(() => {
    if (selectedDate === 'all') return matches;
    return matches.filter((m) => m.date === selectedDate);
  }, [matches, selectedDate]);

  useEffect(() => {
    if (filteredMatches.length > 0) {
      setSelectedMatchId(filteredMatches[0].match_id);
    } else {
      setSelectedMatchId('');
    }
    setFocusedPlayerId(null);
  }, [filteredMatches]);

  useEffect(() => { setFocusedPlayerId(null); }, [selectedMatchId]);

  // ── Playback ────────────────────────────────────────────────────────────────

  const minTs = useMemo(() => {
    if (!match) return 0;
    let min = Infinity;
    for (const p of match.players) for (const e of p.events) if (e.ts < min) min = e.ts;
    return min === Infinity ? 0 : min;
  }, [match]);

  const maxTs = useMemo(() => {
    if (!match) return 0;
    let max = -Infinity;
    for (const p of match.players) for (const e of p.events) if (e.ts > max) max = e.ts;
    return max === -Infinity ? 0 : max;
  }, [match]);

  const { currentTs, isPlaying, speed, setSpeed, togglePlay, rewind, scrub } =
    usePlayback(minTs, maxTs);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleMapChange(mapId) {
    setSelectedMap(mapId);
    setSelectedDate('all');
    setSelectedMatchId('');
    setFocusedPlayerId(null);
  }

  function handlePlayerFocus(userId) {
    setFocusedPlayerId((prev) => (prev === userId ? null : userId));
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const humanPlayers = match?.players.filter((p) => !p.is_bot) ?? [];
  const botPlayers   = match?.players.filter((p) =>  p.is_bot) ?? [];

  // Legend uses the focused player's colour if one is selected, otherwise the
  // first human player's colour, falling back to a neutral white.
  const humanLegendColor =
    (focusedPlayerId
      ? humanPlayers.find((p) => p.user_id === focusedPlayerId)?.color
      : humanPlayers[0]?.color) ?? '#e5e7eb';

  const selectCls = [
    'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5',
    'text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-500',
    'disabled:opacity-40',
  ].join(' ');

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    // h-screen + overflow-hidden → zero page scroll; sidebar scrolls independently
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-white">

      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <aside className="flex w-[185px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-zinc-800 py-4 px-3">

        {/* Back */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-white"
        >
          <span aria-hidden>←</span> Map Overview
        </button>

        {/* Map tabs */}
        <div>
          <SectionLabel>Map</SectionLabel>
          <nav className="mt-2 flex flex-col gap-0.5">
            {availableMaps.map((mapId) => (
              <button
                key={mapId}
                onClick={() => handleMapChange(mapId)}
                className={[
                  'rounded-lg px-2 py-1.5 text-left text-sm font-medium transition',
                  selectedMap === mapId
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-zinc-200',
                ].join(' ')}
              >
                {mapId}
              </button>
            ))}
          </nav>
        </div>

        {/* Date filter */}
        <div>
          <SectionLabel>Date</SectionLabel>
          <select
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); setSelectedMatchId(''); }}
            className={['mt-2', selectCls].join(' ')}
          >
            <option value="all">All dates</option>
            {availableDates.map((d) => (
              <option key={d} value={d}>{dateLabel(d)}</option>
            ))}
          </select>
        </div>

        {/* Match selector */}
        <div>
          <SectionLabel>Match</SectionLabel>
          <select
            value={selectedMatchId}
            onChange={(e) => setSelectedMatchId(e.target.value)}
            disabled={matchesLoading || filteredMatches.length === 0}
            className={['mt-2', selectCls].join(' ')}
          >
            {filteredMatches.length === 0 ? (
              <option>No matches</option>
            ) : (
              filteredMatches.map((m) => (
                <option key={m.match_id} value={m.match_id}>
                  {m.match_id.slice(0, 8)}
                </option>
              ))
            )}
          </select>
          {match && !matchLoading && (
            <p className="mt-1.5 text-[10px] text-zinc-600">
              {match.player_count}p · {match.bot_count}b · {formatTime(maxTs - minTs)}
            </p>
          )}
        </div>

        <div className="border-t border-zinc-800" />

        {/* Collapsible player list */}
        {matchLoading ? (
          <div className="flex flex-col gap-1.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-5 w-full animate-pulse rounded bg-zinc-800" />
            ))}
          </div>
        ) : match ? (
          <PlayerList
            humanPlayers={humanPlayers}
            botPlayers={botPlayers}
            focusedPlayerId={focusedPlayerId}
            onFocus={handlePlayerFocus}
          />
        ) : null}

        <div className="border-t border-zinc-800" />

        {/* Show toggles */}
        <div>
          <SectionLabel>Show</SectionLabel>
          <div className="mt-2 flex flex-col gap-2">
            <Toggle label="Humans" checked={showHumans} onChange={() => setShowHumans((v) => !v)} color="white" />
            <Toggle label="Bots"   checked={showBots}   onChange={() => setShowBots((v) => !v)}   color="gray"  />
          </div>
        </div>

        {/* Event toggles */}
        <div>
          <SectionLabel>Events</SectionLabel>
          <div className="mt-2 flex flex-col gap-2">
            <Toggle label="Kills"  checked={showEvents.kills}  onChange={() => setShowEvents((p) => ({ ...p, kills:  !p.kills  }))} color="#ef4444" />
            <Toggle label="Deaths" checked={showEvents.deaths} onChange={() => setShowEvents((p) => ({ ...p, deaths: !p.deaths }))} color="#991b1b" />
            <Toggle label="Loot"   checked={showEvents.loot}   onChange={() => setShowEvents((p) => ({ ...p, loot:   !p.loot   }))} color="#eab308" />
            <Toggle label="Storm"  checked={showEvents.storm}  onChange={() => setShowEvents((p) => ({ ...p, storm:  !p.storm  }))} color="#a855f7" />
          </div>
        </div>

      </aside>

      {/* ── Right zone: map + playback bar ────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Error banners — only shown when present; collapse when empty */}
        {(matchListError || matchError) && (
          <div className="shrink-0 px-4 pt-3">
            {matchListError && (
              <div className="mb-2 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-400">
                Failed to load match list: {matchListError}
              </div>
            )}
            {matchError && (
              <div className="mb-2 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-400">
                {matchError}
              </div>
            )}
          </div>
        )}

        {/* Canvas — takes all remaining height above the playback bar */}
        <div className="relative flex-1 min-h-0">
          <LegendOverlay humanPathColor={humanLegendColor} />
          <MatchCanvas
            mapId={selectedMap}
            matchData={match}
            currentTs={currentTs}
            playbackMode={playbackMode}
            showHumans={showHumans}
            showBots={showBots}
            showEvents={showEvents}
            focusedPlayerId={focusedPlayerId}
            loading={matchLoading}
          />
        </div>

        {/* Playback bar — always at the bottom, never scrolls away.
            Placeholder div keeps layout stable when no match is loaded. */}
        <div className="shrink-0">
          {match ? (
            <Timeline
              currentTs={currentTs}
              minTs={minTs}
              maxTs={maxTs}
              isPlaying={isPlaying}
              speed={speed}
              playbackMode={playbackMode}
              onTogglePlay={togglePlay}
              onRewind={rewind}
              onScrub={scrub}
              onSpeed={setSpeed}
              onModeToggle={() => setPlaybackMode((m) => (m === 'paths' ? 'events' : 'paths'))}
            />
          ) : (
            <div className="border-t border-zinc-800" style={{ height: 72 }} />
          )}
        </div>

      </div>
    </div>
  );
}
