/**
 * Display metadata for each layer type used to build the legend gradient row.
 * `mid` is the mid-point colour for the gradient bar (gives a 2-stop ramp
 * from transparent through mid to the peak colour).
 */
const LAYER_META = {
  kills:   { label: 'Kill zones',    mid: '#FF8C00', peak: '#FF4500' },
  deaths:  { label: 'Death zones',   mid: '#A000C8', peak: '#CC00FF' },
  storm:   { label: 'Storm deaths',  mid: '#00B4B4', peak: '#00FFFF' },
  loot:    { label: 'Loot density',  mid: '#CCCC00', peak: '#00FF88' },
  traffic: { label: 'Player traffic', mid: '#a3a46a', peak: '#decb1e' },
};

const LAYER_ORDER = ['kills', 'deaths', 'storm', 'loot', 'traffic'];

/**
 * Legend — shows one gradient bar per active heatmap layer.
 *
 * Props:
 *   activeLayers  object  { kills, deaths, storm, loot, traffic } — boolean per type
 */
export default function Legend({ activeLayers }) {
  const activeTypes = LAYER_ORDER.filter((t) => activeLayers?.[t]);

  if (activeTypes.length === 0) {
    return (
      <div className="px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-widest text-zinc-700">
          No layers active
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5">
      {activeTypes.map((type) => {
        const { label, mid, peak } = LAYER_META[type];
        return (
          <div key={type} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-right text-[10px] uppercase tracking-widest text-zinc-500">
              {label}
            </span>
            <span className="text-[10px] text-zinc-600">Lo</span>
            <div
              className="h-1.5 flex-1 rounded-full"
              style={{
                background: `linear-gradient(to right, transparent, ${mid}, ${peak})`,
                opacity: 0.85,
              }}
            />
            <span className="text-[10px] text-zinc-600">Hi</span>
          </div>
        );
      })}
    </div>
  );
}
