import React from 'react';

const HEATMAP_TYPES = [
  { value: 'kills',   label: 'Kill zones' },
  { value: 'deaths',  label: 'Death zones' },
  { value: 'storm',   label: 'Storm deaths' },
  { value: 'loot',    label: 'Loot density' },
  { value: 'traffic', label: 'Player traffic' },
];

/**
 * ControlPanel — left sidebar for the Map Overview screen.
 *
 * Props:
 *   heatmapType        string         currently selected heatmap type
 *   onHeatmapType      fn(type)       callback when type changes
 *   showDeadZones      bool           dead-zone overlay toggle state
 *   onDeadZones        fn()           toggle callback
 *   summary            object         { match_count, player_count, map_count }
 *   loading            bool           true while fetching heatmap data
 */
export default function ControlPanel({
  heatmapType,
  onHeatmapType,
  showDeadZones,
  onDeadZones,
  summary,
  loading,
}) {
  return (
    <aside className="flex w-44 shrink-0 flex-col gap-6 py-6 pl-5 pr-4">

      {/* Heatmap type selector */}
      <div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Heatmap
        </p>
        <div className="flex flex-col gap-2">
          {HEATMAP_TYPES.map(({ value, label }) => (
            <label
              key={value}
              className={[
                'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition',
                heatmapType === value
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-zinc-200',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                  heatmapType === value
                    ? 'border-red-500 bg-red-500'
                    : 'border-zinc-600',
                ].join(' ')}
              >
                {heatmapType === value && (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </span>
              <input
                type="radio"
                className="sr-only"
                name="heatmapType"
                value={value}
                checked={heatmapType === value}
                onChange={() => onHeatmapType(value)}
              />
              {label}
            </label>
          ))}
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

      {/* Stats */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
        ) : (
          <>
            <Stat value={summary?.match_count ?? '—'} label="matches" />
            <Stat value={summary?.player_count ?? '—'} label="players" />
            <Stat value={summary?.map_count ?? '—'} label="maps" />
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
