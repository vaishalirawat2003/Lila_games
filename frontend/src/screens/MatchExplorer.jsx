import React, { useMemo, useState } from 'react';
import MatchCanvas from '../components/MatchCanvas';
import Timeline from '../components/Timeline';
import { useMatchList, useSingleMatch } from '../hooks/useMatchData';
import { formatTime, usePlayback } from '../hooks/usePlayback';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Label a date folder, flagging February_14 as partial. */
function dateLabel(d) {
  if (!d) return d;
  const label = d.replace('_', ' ');
  return d === 'February_14' ? `${label} (partial)` : label;
}

// ── Sidebar sub-components ────────────────────────────────────────────────────

/**
 * Clickable row for a single player in the player list.
 * Dims when another player is focused.
 */
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
        isFocused
          ? 'bg-zinc-800 text-white'
          : dimmed
          ? 'text-zinc-700'
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

function LegendMarker({ color, symbol, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ color }} className="w-4 text-center text-xs">{symbol}</span>
      <span>{label}</span>
    </span>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

/**
 * MatchExplorer — drill-down screen for individual match replay.
 *
 * Props:
 *   summary     object   { match_count, player_count, map_count, maps }
 *   onBack      fn       navigate back to Map Overview
 */
export default function MatchExplorer({ summary, onBack }) {
  const availableMaps = summary?.maps ?? [];

  // ── Selectors ──────────────────────────────────────────────────────────────
  const [selectedMap,     setSelectedMap]     = useState(availableMaps[0] ?? '');
  const [selectedDate,    setSelectedDate]    = useState('all');
  const [selectedMatchId, setSelectedMatchId] = useState('');

  // ── Visibility toggles ─────────────────────────────────────────────────────
  const [showHumans, setShowHumans] = useState(true);
  const [showBots,   setShowBots]   = useState(true);
  const [showEvents, setShowEvents] = useState({
    kills: true, deaths: true, loot: true, storm: true,
  });
  const [playbackMode,    setPlaybackMode]    = useState('paths');
  const [focusedPlayerId, setFocusedPlayerId] = useState(null); // null = all shown

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { matches, loading: matchesLoading, error: matchListError } = useMatchList(selectedMap);
  const { match,   loading: matchLoading,   error: matchError }     = useSingleMatch(selectedMatchId);

  // ── Derived: available dates + filtered match list ─────────────────────────
  const availableDates = useMemo(() => {
    const dates = [...new Set(matches.map((m) => m.date).filter(Boolean))].sort();
    return dates;
  }, [matches]);

  const filteredMatches = useMemo(() => {
    if (selectedDate === 'all') return matches;
    return matches.filter((m) => m.date === selectedDate);
  }, [matches, selectedDate]);

  // Auto-select first match when map/date changes
  React.useEffect(() => {
    if (filteredMatches.length > 0) {
      setSelectedMatchId(filteredMatches[0].match_id);
    } else {
      setSelectedMatchId('');
    }
    setFocusedPlayerId(null);
  }, [filteredMatches]);

  // Clear focus when match changes
  React.useEffect(() => {
    setFocusedPlayerId(null);
  }, [selectedMatchId]);

  // ── Playback ───────────────────────────────────────────────────────────────
  // Use iterative min/max to avoid spread-operator stack limits on large event arrays
  const minTs = useMemo(() => {
    if (!match) return 0;
    let min = Infinity;
    for (const p of match.players) {
      for (const e of p.events) {
        if (e.ts < min) min = e.ts;
      }
    }
    return min === Infinity ? 0 : min;
  }, [match]);

  const maxTs = useMemo(() => {
    if (!match) return 0;
    let max = -Infinity;
    for (const p of match.players) {
      for (const e of p.events) {
        if (e.ts > max) max = e.ts;
      }
    }
    return max === -Infinity ? 0 : max;
  }, [match]);

  const { currentTs, isPlaying, speed, setSpeed, togglePlay, rewind, scrub } =
    usePlayback(minTs, maxTs);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleMapChange(mapId) {
    setSelectedMap(mapId);
    setSelectedDate('all');
    setSelectedMatchId('');
    setFocusedPlayerId(null);
  }

  function handleEventToggle(cat) {
    setShowEvents((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  function handlePlayerFocus(userId) {
    setFocusedPlayerId((prev) => (prev === userId ? null : userId));
  }

  // ── Derived player lists ───────────────────────────────────────────────────
  const humanPlayers = match?.players.filter((p) => !p.is_bot) ?? [];
  const botPlayers   = match?.players.filter((p) =>  p.is_bot) ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-5 py-3">

        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-white"
        >
          <span aria-hidden>←</span> Map Overview
        </button>

        <span className="text-zinc-700">|</span>

        {/* Map tabs */}
        <nav className="flex gap-1">
          {availableMaps.map((mapId) => (
            <button
              key={mapId}
              onClick={() => handleMapChange(mapId)}
              className={[
                'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                selectedMap === mapId
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-200',
              ].join(' ')}
            >
              {mapId}
            </button>
          ))}
        </nav>

        <span className="text-zinc-700">|</span>

        {/* Date filter */}
        <select
          value={selectedDate}
          onChange={(e) => { setSelectedDate(e.target.value); setSelectedMatchId(''); }}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm
                     text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        >
          <option value="all">All dates</option>
          {availableDates.map((d) => (
            <option key={d} value={d}>{dateLabel(d)}</option>
          ))}
        </select>

        {/* Match stats chip */}
        {match && !matchLoading && (
          <span className="ml-1 text-xs text-zinc-500">
            {match.player_count}p · {match.bot_count}b · {formatTime(maxTs - minTs)}
          </span>
        )}

      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left sidebar ────────────────────────────────────────────────── */}
        <aside className="flex w-52 shrink-0 flex-col gap-5 overflow-y-auto py-5 pl-4 pr-3">

          {/* Match selector */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Match
            </p>
            <select
              value={selectedMatchId}
              onChange={(e) => setSelectedMatchId(e.target.value)}
              disabled={matchesLoading || filteredMatches.length === 0}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5
                         text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-500
                         disabled:opacity-40"
            >
              {filteredMatches.length === 0 ? (
                <option>No matches</option>
              ) : (
                filteredMatches.map((m) => (
                  <option key={m.match_id} value={m.match_id}>
                    Match {m.match_id.slice(0, 8)}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Player list */}
          {match && !matchLoading && (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Players
                {focusedPlayerId && (
                  <button
                    onClick={() => setFocusedPlayerId(null)}
                    className="ml-2 normal-case tracking-normal text-zinc-600 hover:text-zinc-400 transition"
                  >
                    clear
                  </button>
                )}
              </p>
              <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
                {humanPlayers.map((p) => (
                  <PlayerRow
                    key={p.user_id}
                    player={p}
                    isFocused={focusedPlayerId === p.user_id}
                    isAnyFocused={!!focusedPlayerId}
                    onClick={() => handlePlayerFocus(p.user_id)}
                  />
                ))}
                {botPlayers.length > 0 && humanPlayers.length > 0 && (
                  <div className="my-1 border-t border-zinc-800" />
                )}
                {botPlayers.map((p) => (
                  <PlayerRow
                    key={p.user_id}
                    player={p}
                    isFocused={focusedPlayerId === p.user_id}
                    isAnyFocused={!!focusedPlayerId}
                    onClick={() => handlePlayerFocus(p.user_id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Loading skeleton for player list */}
          {matchLoading && (
            <div className="flex flex-col gap-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-5 w-full animate-pulse rounded bg-zinc-800" />
              ))}
            </div>
          )}

          <div className="border-t border-zinc-800" />

          {/* Show section */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Show
            </p>
            <div className="flex flex-col gap-2">
              <Toggle label="Humans" checked={showHumans} onChange={() => setShowHumans((v) => !v)} color="white" />
              <Toggle label="Bots"   checked={showBots}   onChange={() => setShowBots((v) => !v)}   color="gray"  />
            </div>
          </div>

          {/* Events section */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Events
            </p>
            <div className="flex flex-col gap-2">
              <Toggle label="Kills"  checked={showEvents.kills}  onChange={() => handleEventToggle('kills')}  color="#ef4444" />
              <Toggle label="Deaths" checked={showEvents.deaths} onChange={() => handleEventToggle('deaths')} color="#991b1b" />
              <Toggle label="Loot"   checked={showEvents.loot}   onChange={() => handleEventToggle('loot')}   color="#eab308" />
              <Toggle label="Storm"  checked={showEvents.storm}  onChange={() => handleEventToggle('storm')}  color="#a855f7" />
            </div>
          </div>

          <div className="border-t border-zinc-800" />

          {/* Legend */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Legend
            </p>
            <div className="flex flex-col gap-1.5 text-xs text-zinc-400">
              <span><span className="mr-2 text-zinc-300">——</span>Human path</span>
              <span><span className="mr-2 text-zinc-600">- -</span>Bot path</span>
              <LegendMarker color="#ef4444" symbol="✕" label="Kill" />
              <LegendMarker color="#991b1b" symbol="●" label="Killed" />
              <LegendMarker color="#f97316" symbol="✕" label="BotKill" />
              <LegendMarker color="#f97316" symbol="●" label="BotKilled" />
              <LegendMarker color="#a855f7" symbol="◆" label="Storm" />
              <LegendMarker color="#eab308" symbol="★" label="Loot" />
            </div>
          </div>

        </aside>

        {/* Vertical divider */}
        <div className="w-px bg-zinc-800 self-stretch" />

        {/* ── Right: canvas + timeline ─────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Error banners */}
          <div className="px-4 pt-3">
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

          {/* Canvas area */}
          <div className="flex-1 overflow-hidden px-4 pb-2">
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

          {/* Timeline — only shown when a match is loaded */}
          {match && (
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
              onModeToggle={() =>
                setPlaybackMode((m) => (m === 'paths' ? 'events' : 'paths'))
              }
            />
          )}

        </div>
      </div>
    </div>
  );
}
