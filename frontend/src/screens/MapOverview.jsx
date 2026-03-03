import React, { useCallback, useEffect, useState } from 'react';
import ControlPanel from '../components/ControlPanel';
import Legend from '../components/Legend';
import MapCanvas from '../components/MapCanvas';
import { fetchHeatmap, fetchMaps } from '../utils/api';

const HEATMAP_TYPES = ['kills', 'deaths', 'storm', 'loot', 'traffic'];

// Heatmap render order: traffic drawn first (bottom), kills last (top)
const LAYER_Z_ORDER = ['traffic', 'loot', 'storm', 'deaths', 'kills'];

/**
 * MapOverview — default screen after upload.
 *
 * Shows aggregate heatmaps across all matches for the selected map.
 * Multiple heatmap layers can be active simultaneously (independent toggles).
 *
 * Props:
 *   summary         object   { match_count, player_count, map_count, maps }
 *   onExplore       fn()     navigate to Match Explorer
 *   onReupload      fn()     go back to Upload screen
 */
export default function MapOverview({ summary, onExplore, onReupload }) {
  const availableMaps = summary?.maps ?? [];
  const [selectedMap, setSelectedMap] = useState(availableMaps[0] ?? '');

  // Independent layer toggles — kills on by default
  const [activeLayers, setActiveLayers] = useState({
    kills: true, deaths: false, storm: false, loot: false, traffic: false,
  });

  const [showDeadZones, setShowDeadZones] = useState(false);

  // Bots excluded by default — Level Designers care primarily about human behaviour
  const [includeBots, setIncludeBots] = useState(false);

  // Cache keyed by "mapId:includeBots" so both variants coexist without
  // invalidation — toggling bots twice costs one extra fetch, then it's instant.
  const [heatmapCache, setHeatmapCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Per-map stats: { [mapId]: { match_count, player_count } }
  const [mapStats, setMapStats] = useState({});

  // ── Data fetching ──────────────────────────────────────────────────────────

  // Re-fetch per-map stats whenever the bots toggle changes
  useEffect(() => {
    fetchMaps(includeBots)
      .then((data) => {
        const byMap = {};
        for (const item of data) {
          byMap[item.map_id] = item;
        }
        setMapStats(byMap);
      })
      .catch(() => {}); // non-critical — stats show '—' on failure
  }, [includeBots]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch all 5 heatmap types for the given map + bots setting in parallel.
  // Results are cached under "mapId:includeBots" so switching back is instant.
  const loadHeatmapsForMap = useCallback(async (mapId, bots) => {
    if (!mapId) return;
    const cacheKey = `${mapId}:${bots}`;
    if (heatmapCache[cacheKey]) return; // already cached

    setLoading(true);
    setError('');

    try {
      const results = await Promise.all(
        HEATMAP_TYPES.map((type) => fetchHeatmap(mapId, type, bots))
      );
      const byType = {};
      HEATMAP_TYPES.forEach((type, i) => { byType[type] = results[i]; });

      setHeatmapCache((prev) => ({ ...prev, [cacheKey]: byType }));
    } catch (err) {
      setError(err.message || 'Failed to load heatmap data.');
    } finally {
      setLoading(false);
    }
  }, [heatmapCache]);

  // Load whenever the selected map or bots toggle changes
  useEffect(() => {
    loadHeatmapsForMap(selectedMap, includeBots);
  }, [selectedMap, includeBots]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived data ───────────────────────────────────────────────────────────

  const cacheKey = `${selectedMap}:${includeBots}`;

  // Build the ordered array of active heatmap layers for MapCanvas
  const heatmapLayers = LAYER_Z_ORDER
    .filter((type) => activeLayers[type] && heatmapCache[cacheKey]?.[type])
    .map((type) => heatmapCache[cacheKey][type]);

  const trafficData = heatmapCache[cacheKey]?.traffic ?? null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleLayerToggle(type) {
    setActiveLayers((prev) => ({ ...prev, [type]: !prev[type] }));
  }

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
          activeLayers={activeLayers}
          onLayerToggle={handleLayerToggle}
          includeBots={includeBots}
          onIncludeBots={() => setIncludeBots((v) => !v)}
          showDeadZones={showDeadZones}
          onDeadZones={() => setShowDeadZones((v) => !v)}
          selectedMap={selectedMap}
          mapStats={mapStats}
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
              heatmapLayers={heatmapLayers}
              trafficData={trafficData}
              showDeadZones={showDeadZones}
              loading={loading && !heatmapCache[cacheKey]}
            />
          </div>

          {/* Colour scale legend — one row per active layer */}
          <Legend activeLayers={activeLayers} />

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
