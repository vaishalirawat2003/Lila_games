import React from 'react';

/**
 * Legend — heatmap colour scale shown below the map canvas.
 */
export default function Legend() {
  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <span className="text-[10px] uppercase tracking-widest text-zinc-600">Low</span>
      {/* Gradient bar: blue → yellow → red */}
      <div
        className="h-2 flex-1 rounded-full"
        style={{
          background:
            'linear-gradient(to right, #0000ff, #ffff00, #ff0000)',
          opacity: 0.7,
        }}
      />
      <span className="text-[10px] uppercase tracking-widest text-zinc-600">High</span>
    </div>
  );
}
