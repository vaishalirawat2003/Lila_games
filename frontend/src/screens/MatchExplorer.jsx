import React, { useMemo, useState } from 'react';
import MatchCanvas from '../components/MatchCanvas';
import Timeline from '../components/Timeline';
import { useMatchList, useSingleMatch } from '../hooks/useMatchData';
import { usePlayback } from '../hooks/usePlayback';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Truncate a UUID match ID for display: first 8 chars. */
function shortId(id) {
  return id ? id.slice(0, 8) + '…' : '—';
}

/** Label a date folder, flagging February_14 as partial. */
function dateLabel(d) {
  if (!d) return d;
  const label = d.replace('_', ' ');
  return d === 'February_14' ? `${label} (partial)` : label;
}

// ── Left sidebar ──────────────────────────────────────────────────────────────

function ExplorerControls({
  showHumans, onShowHumans,
  showBots,   onShowBots,
  showEvents, onShowEvent,
}) {
  return (
    <aside className="flex w-44 shrink-0 flex-col gap-6 py-6 pl-5 pr-4">

      {/* Show section */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Show
        </p>
        <div className="flex flex-col gap-2">
          <Toggle label="Humans" checked={showHumans} onChange={onShowHumans} color="white" />
          <Toggle label="Bots"   checked={showBots}   onChange={onShowBots}   color="gray" />
        </div>
      </div>

      {/* Events section */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Events
        </p>
        <div className="flex flex-col gap-2">
          <Toggle label="Kills"  checked={showEvents.kills}  onChange={() => onShowEvent('kills')}  color="#ef4444" />
          <Toggle label="Deaths" checked={showEvents.deaths} onChange={() => onShowEvent('deaths')} color="#991b1b" />
          <Toggle label="Loot"   checked={showEvents.loot}   onChange={() => onShowEvent('loot')}   color="#eab308" />
          <Toggle label="Storm"  checked={showEvents.storm}  onChange={() => onShowEvent('storm')}  color="#a855f7" />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* Legend */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
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
        style={{ color: checked ? (color === 'white' ? '#e5e7eb' : color === 'gray' ? '#6b7280' : color) : undefined }}
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
  const [playbackMode, setPlaybackMode] = useState('paths'); // 'paths' | 'events'

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { matches, loading: matchesLoading } = useMatchList(selectedMap);
  const { match,   loading: matchLoading, error: matchError } = useSingleMatch(selectedMatchId);

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
  }, [filteredMatches]);

  // ── Playback ───────────────────────────────────────────────────────────────
  const minTs = useMemo(() => {
    if (!match) return 0;
    const allTs = match.players.flatMap((p) => p.events.map((e) => e.ts));
    return allTs.length ? Math.min(...allTs) : 0;
  }, [match]);

  const maxTs = useMemo(() => {
    if (!match) return 1;
    const allTs = match.players.flatMap((p) => p.events.map((e) => e.ts));
    return allTs.length ? Math.max(...allTs) : 1;
  }, [match]);

  const { currentTs, isPlaying, speed, setSpeed, togglePlay, rewind, scrub } =
    usePlayback(minTs, maxTs);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleMapChange(mapId) {
    setSelectedMap(mapId);
    setSelectedDate('all');
    setSelectedMatchId('');
  }

  function handleEventToggle(cat) {
    setShowEvents((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-5 py-3">

        {/* Back link */}
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
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-300
                     focus:outline-none focus:ring-1 focus:ring-zinc-500"
        >
          <option value="all">All dates</option>
          {availableDates.map((d) => (
            <option key={d} value={d}>{dateLabel(d)}</option>
          ))}
        </select>

        {/* Match selector */}
        <select
          value={selectedMatchId}
          onChange={(e) => setSelectedMatchId(e.target.value)}
          disabled={matchesLoading || filteredMatches.length === 0}
          className="max-w-xs flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5
                     text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-500
                     disabled:opacity-40"
        >
          {filteredMatches.length === 0 ? (
            <option>No matches</option>
          ) : (
            filteredMatches.map((m) => (
              <option key={m.match_id} value={m.match_id}>
                {shortId(m.match_id)} — {m.player_count}p / {m.bot_count}b
              </option>
            ))
          )}
        </select>

      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left controls */}
        <ExplorerControls
          showHumans={showHumans} onShowHumans={() => setShowHumans((v) => !v)}
          showBots={showBots}     onShowBots={() => setShowBots((v) => !v)}
          showEvents={showEvents} onShowEvent={handleEventToggle}
        />

        {/* Vertical divider */}
        <div className="w-px bg-zinc-800 self-stretch" />

        {/* Right: canvas + timeline */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Canvas area */}
          <div className="flex-1 overflow-hidden p-4">
            {matchError && (
              <div className="mb-3 rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-400">
                {matchError}
              </div>
            )}
            <MatchCanvas
              mapId={selectedMap}
              matchData={match}
              currentTs={currentTs}
              playbackMode={playbackMode}
              showHumans={showHumans}
              showBots={showBots}
              showEvents={showEvents}
              loading={matchLoading}
            />
          </div>

          {/* Timeline */}
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
