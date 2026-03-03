import React from 'react';

/**
 * Each layer's display label and accent colour.
 * The accent colour is used for the swatch and border on the toggle button.
 * Traffic uses steel blue (#4682B4) rather than the near-white peak colour
 * (#E0F0FF) so the swatch is legible on the dark sidebar background.
 */
const LAYER_CONFIG = [
  { value: 'kills',   label: 'Kill zones',    color: '#FF4500' },
  { value: 'deaths',  label: 'Death zones',   color: '#CC00FF' },
  { value: 'storm',   label: 'Storm deaths',  color: '#00FFFF' },
  { value: 'loot',    label: 'Loot density',  color: '#00FF88' },
  { value: 'traffic', label: 'Player traffic', color: '#4682B4' },
];

/**
 * ControlPanel — left sidebar for the Map Overview screen.
 *
 * Props:
 *   activeLayers       object   { kills, deaths, storm, loot, traffic } — boolean per layer
 *   onLayerToggle      fn(type) toggle a single layer on/off
 *   includeBots        bool     whether bot rows are included in heatmaps
 *   onIncludeBots      fn()     toggle callback
 *   showDeadZones      bool     dead-zone overlay toggle state
 *   onDeadZones        fn()     toggle callback
 *   selectedMap        string   currently viewed map (for scoped stats)
 *   mapStats           object   { [mapId]: { match_count, player_count } }
 *   loading            bool     true while fetching heatmap data
 */
export default function ControlPanel({
  activeLayers,
  onLayerToggle,
  includeBots,
  onIncludeBots,
  showDeadZones,
  onDeadZones,
  selectedMap,
  mapStats,
  loading,
}) {
  const stats = mapStats?.[selectedMap];

  return (
    <aside className="flex w-44 shrink-0 flex-col gap-6 py-6 pl-5 pr-4">

      {/* Include bots toggle — positioned first; default OFF */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Data
        </p>
        <label className="flex cursor-pointer items-center justify-between gap-2">
          <span className={['text-sm transition', includeBots ? 'text-zinc-200' : 'text-zinc-500'].join(' ')}>
            Include bots
          </span>
          {/* Pill switch */}
          <span
            className={[
              'relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
              includeBots ? 'bg-indigo-600' : 'bg-zinc-700',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200',
                includeBots ? 'translate-x-[1.125rem]' : 'translate-x-0.5',
              ].join(' ')}
            />
          </span>
          <input type="checkbox" className="sr-only" checked={includeBots} onChange={onIncludeBots} />
        </label>
      </div>

      {/* Heatmap layer toggles — each layer independently on/off */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Heatmap
        </p>
        <div className="flex flex-col gap-1.5">
          {LAYER_CONFIG.map(({ value, label, color }) => {
            const active = activeLayers[value];
            return (
              <button
                key={value}
                onClick={() => onLayerToggle(value)}
                className={[
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition text-left',
                  active
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-zinc-200',
                ].join(' ')}
              >
                {/* Colour swatch — filled when active, outline-only when inactive */}
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{
                    background: active ? color : 'transparent',
                    border: `1.5px solid ${color}`,
                    opacity: active ? 1 : 0.6,
                  }}
                />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dead Zones toggle */}
      <div>
        <button
          onClick={onDeadZones}
          className={[
            'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition',
            showDeadZones
              ? 'border-zinc-500 bg-zinc-800 text-white'
              : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          <span
            className={[
              'h-2 w-2 shrink-0 rounded-sm',
              showDeadZones ? 'bg-zinc-400' : 'bg-zinc-600',
            ].join(' ')}
          />
          Dead zones
        </button>
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* Stats — scoped to the currently selected map */}
      <div className="flex flex-col gap-3">
        {loading && !stats ? (
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
        ) : (
          <>
            <Stat value={stats?.match_count ?? '—'} label="matches" />
            <Stat value={stats?.player_count ?? '—'} label="players" />
          </>
        )}
      </div>

    </aside>
  );
}

function Stat({ value, label }) {
  return (
    <div className="leading-tight">
      <div className="text-base font-semibold text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
    </div>
  );
}
