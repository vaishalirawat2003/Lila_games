/**
 * api.js — All backend calls in one place.
 *
 * Set REACT_APP_API_URL in .env.local for local dev.
 * Vercel deployment reads it from the environment at build time.
 */

const API_BASE = process.env.REACT_APP_API_URL || 'https://lilagames-production.up.railway.app';

const BATCH_SIZE = 50;

/**
 * Send a single batch to /upload. Builds a fresh FormData so it can be
 * safely retried without body-stream issues.
 */
async function sendBatch(files, params) {
  const formData = new FormData();
  for (const file of files) {
    const name = file.webkitRelativePath || file.name;
    formData.append('files', file, name);
  }
  const res = await fetch(`${API_BASE}/upload?${params}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Batch upload failed');
  }
  return res.json();
}

/**
 * Upload parquet files to the backend using chunked batch requests.
 *
 * Files are split into batches of 50 and sent sequentially. Each failed
 * batch is retried once before throwing. The last batch triggers heatmap
 * computation on the backend.
 *
 * @param {File[]} files
 * @param {(batchNum: number, totalBatches: number) => void} [onProgress]
 * @returns {Promise<{status, match_count, player_count, map_count, maps}>}
 */
export async function uploadFiles(files, onProgress) {
  // Split into batches
  const batches = [];
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push(files.slice(i, i + BATCH_SIZE));
  }

  let lastResult = null;

  for (let i = 0; i < batches.length; i++) {
    const isFirst = i === 0;
    const isLast  = i === batches.length - 1;
    const batch   = batches[i];

    onProgress?.(i + 1, batches.length);

    const params = new URLSearchParams();
    if (isFirst) params.set('reset', 'true');
    if (isLast)  params.set('finalize', 'true');

    try {
      lastResult = await sendBatch(batch, params);
    } catch (firstErr) {
      // Retry once
      try {
        lastResult = await sendBatch(batch, params);
      } catch (retryErr) {
        throw new Error(`Batch ${i + 1} of ${batches.length} failed: ${retryErr.message}`);
      }
    }
  }

  return lastResult;
}

/**
 * Fetch the list of available date labels in the loaded dataset.
 * @returns {Promise<string[]>}  e.g. ["February_10", "February_11"]
 */
export async function fetchDates() {
  const res = await fetch(`${API_BASE}/dates`);
  if (!res.ok) throw new Error('Failed to fetch dates');
  return res.json();
}

/**
 * Fetch per-map match and player counts.
 * @param {boolean} includeBots  include bot user_ids in player_count (default false)
 * @param {string|null} date     e.g. "February_10" — filter to one date
 * @returns {Promise<{map_id, match_count, player_count}[]>}
 */
export async function fetchMaps(includeBots = false, date = null) {
  const params = new URLSearchParams({ include_bots: includeBots });
  if (date) params.append('date', date);
  const res = await fetch(`${API_BASE}/maps?${params}`);
  if (!res.ok) throw new Error('Failed to fetch maps');
  return res.json();
}

/**
 * Fetch matches for a map, optionally filtered by date.
 * @param {string} mapId
 * @param {string|null} date  e.g. "February_10"
 * @returns {Promise<{match_id, map_id, player_count, bot_count, duration_ms}[]>}
 */
export async function fetchMatches(mapId, date = null) {
  const params = new URLSearchParams({ map: mapId });
  if (date) params.append('date', date);
  const res = await fetch(`${API_BASE}/matches?${params}`);
  if (!res.ok) throw new Error('Failed to fetch matches');
  return res.json();
}

/**
 * Fetch full event data for one match.
 * @param {string} matchId
 * @returns {Promise<{match_id, map_id, duration_ms, player_count, bot_count, players}>}
 */
export async function fetchMatch(matchId) {
  const res = await fetch(`${API_BASE}/match/${encodeURIComponent(matchId)}`);
  if (!res.ok) throw new Error(`Match not found: ${matchId}`);
  return res.json();
}

/**
 * Fetch a heatmap grid (pre-computed for all-time, on-the-fly for a specific date).
 * @param {string} mapId
 * @param {'kills'|'deaths'|'storm'|'loot'|'traffic'} type
 * @param {boolean} includeBots  include bot rows in computation (default false)
 * @param {string|null} date     e.g. "February_10" — filter to one date
 * @returns {Promise<{map_id, type, grid_size, cells, max_value}>}
 */
export async function fetchHeatmap(mapId, type, includeBots = false, date = null) {
  const params = new URLSearchParams({ map: mapId, type, include_bots: includeBots });
  if (date) params.append('date', date);
  const res = await fetch(`${API_BASE}/heatmap?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch heatmap: ${mapId}/${type}`);
  return res.json();
}

/**
 * Health check — used to verify the backend is reachable.
 * @returns {Promise<{status, data_loaded, row_count}>}
 */
export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Backend unreachable');
  return res.json();
}
