import React, { useCallback, useEffect, useState } from 'react';
import ControlPanel from '../components/ControlPanel';
import Legend from '../components/Legend';
import MapCanvas from '../components/MapCanvas';
import { fetchHeatmap } from '../utils/api';

const HEATMAP_TYPES = ['kills', 'deaths', 'storm', 'loot', 'traffic'];

/**
 * MapOverview — default screen after upload.
 *
 * Shows aggregate heatmaps across all matches for the selected map.
 * Level Designers use this to spot high-level spatial patterns before
 * drilling into individual matches via the Match Explorer.
 *
 * Props:
 *   summary         object   { match_count, player_count, map_count, maps }
 *   onExplore       fn()     navigate to Match Explorer
 *   onReupload      fn()     go back to Upload screen
 */
export default function MapOverview({ summary, onExplore, onReupload }) {
  const availableMaps = summary?.maps ?? [];
  const [selectedMap, setSelectedMap] = useState(availableMaps[0] ?? '');
  const [heatmapType, setHeatmapType] = useState('kills');
  const [showDeadZones, setShowDeadZones] = useState(false);

  // Cache: heatmaps[mapId][type] = heatmap response
  const [heatmapCache, setHeatmapCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Data fetching ──────────────────────────────────────────────────────────

  // Fetch all 5 heatmap types for a map in parallel and cache them.
  // This way switching between types is instant after the first load.
  const loadHeatmapsForMap = useCallback(async (mapId) => {
    if (!mapId) return;

    // Skip if already cached
    if (heatmapCache[mapId]) return;

    setLoading(true);
    setError('');

    try {
      const results = await Promise.all(
        HEATMAP_TYPES.map((type) => fetchHeatmap(mapId, type))
      );
      const byType = {};
      HEATMAP_TYPES.forEach((type, i) => { byType[type] = results[i]; });

      setHeatmapCache((prev) => ({ ...prev, [mapId]: byType }));
    } catch (err) {
      setError(err.message || 'Failed to load heatmap data.');
    } finally {
      setLoading(false);
    }
  }, [heatmapCache]);

  // Load on mount and whenever the selected map changes
  useEffect(() => {
    loadHeatmapsForMap(selectedMap);
  }, [selectedMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ───────────────────────────────────────────────────────────

  const currentHeatmap = heatmapCache[selectedMap]?.[heatmapType] ?? null;
  const trafficData    = heatmapCache[selectedMap]?.traffic ?? null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-red-500">
            LILA BLACK
          </span>
          {/* Map tabs */}
          <nav className="flex gap-1">
            {availableMaps.map((mapId) => (
              <button
                key={mapId}
                onClick={() => setSelectedMap(mapId)}
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
        </div>

        {/* Re-upload link */}
        <button
          onClick={onReupload}
          className="text-xs text-zinc-600 transition hover:text-zinc-400"
        >
          ↑ Upload new files
        </button>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: control panel */}
        <ControlPanel
          heatmapType={heatmapType}
          onHeatmapType={setHeatmapType}
          showDeadZones={showDeadZones}
          onDeadZones={() => setShowDeadZones((v) => !v)}
          summary={summary}
          loading={loading}
        />

        {/* Vertical divider */}
        <div className="w-px bg-zinc-800 self-stretch" />

        {/* Right: map canvas area */}
        <div className="flex flex-1 flex-col p-5 gap-3">

          {error && (
            <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex-1 min-h-0">
            <MapCanvas
              mapId={selectedMap}
              heatmapData={currentHeatmap}
              trafficData={trafficData}
              showDeadZones={showDeadZones}
              loading={loading && !currentHeatmap}
            />
          </div>

          {/* Colour scale legend */}
          <Legend />

          {/* Explore button */}
          <div className="flex justify-end border-t border-zinc-800 pt-3">
            <button
              onClick={onExplore}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
            >
              Explore individual matches
              <span aria-hidden>→</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
