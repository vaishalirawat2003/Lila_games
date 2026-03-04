# LILA BLACK — Player Journey Visualization Tool
## Architecture Document

---

### 1. Tech Stack and Why

**Backend: FastAPI (Python)**
The dataset is 1,243 parquet files processed with pandas and pyarrow — Python is the natural home for this. FastAPI adds minimal overhead, gives automatic request validation, and runs fast enough for an in-memory data store. Uvicorn on Railway handles concurrent requests without configuration. The choice was speed of development over architectural sophistication: a single `pipeline.py` module processes all files on upload and a module-level dict holds all processed data for the session lifetime.

**Frontend: React + HTML5 Canvas**
React manages the UI state machine (upload → map overview → match explorer) cleanly. Canvas was chosen over a mapping library like Leaflet because the data isn't geospatial in the conventional sense — the minimaps are game assets with a custom world-to-pixel transform, not tile-based maps. Canvas gives full control over heatmap rendering, path blending, event markers, and zoom/pan transforms without fighting a library's abstractions. Tailwind CSS keeps styling fast and consistent.

**Deployment: Railway (backend) + Vercel (frontend)**
Both offer free-tier hosting with automatic deploys from GitHub. Railway has no cold-start penalty on the free tier, which matters for an in-memory backend — a sleeping process would lose all uploaded data.

---

### 2. Data Flow

**Upload → Parse → Store**
The user drags parquet files (or folders) onto the upload screen. The browser sends them as a multipart POST to `/upload`. The backend reads each file with `pd.read_parquet()`, decodes the binary `event` column (`bytes.decode('utf-8')`), detects human vs bot from the `user_id` field (UUID = human, short integer = bot), strips the `.nakama-0` suffix from `match_id`, and applies the world-to-pixel coordinate transform. All processed events are concatenated into a single in-memory DataFrame. Heatmap grids (64×64) are pre-computed for all five types across all three maps and cached in a module-level dict.

**Coordinate Transform**
Each map has a known scale and world-space origin. The transform is:

```
u = (x - origin_x) / scale
v = (z - origin_z) / scale

pixel_x = u × 1024
pixel_y = (1 - v) × 1024      ← Y-axis flipped: image origin is top-left
```

The `y` column is elevation and is ignored entirely for 2D mapping.

**REST API → Canvas Render**
The frontend fetches heatmap grids (`/heatmap?map=&type=`), match lists (`/matches`), and full per-match event data (`/match/{id}`). The match response includes pre-transformed pixel coordinates for every event. The Canvas layer draws the greyscale minimap, then composites heatmap grids as blurred colour overlays, then draws player paths and event markers in a single `requestAnimationFrame` loop driven by a timestamp cursor.

---

### 3. Trade-offs

**In-memory storage.** All data lives in the FastAPI process. A server restart wipes it. This was a deliberate choice — the assignment requires loading and exploring a specific dataset, not persisting it. A production system would use a database and object storage for raw files.

**Session-scoped uploads.** There is no user identity or session token. Multiple simultaneous users would overwrite each other's uploads. Acceptable for a single-user evaluation tool; not for a shared team tool.

**Canvas over Leaflet.** Leaflet expects geographic projections and tile layers. Wiring it to game-world coordinates and custom minimap images would require more adaptation than writing a Canvas renderer from scratch. The trade-off is that Canvas requires manual implementation of zoom, pan, and hit detection — all of which were built for this tool.

**Data nuances discovered in the dataset.** The `ts` column is declared as `timestamp[ms]` in the parquet schema but the underlying integers are Unix epoch **seconds** (values ~1.77 billion), not milliseconds. Pandas interprets them as dates in January 1970; the correct reading is February 2026. Additionally, `BotKill` events appear in both human files (human killed a bot) and bot files (bot killed another bot), contradicting the schema documentation which implies `BotKill` is human-only. Some bot participants in a match have no parquet file at all — kills recorded by a human player have no corresponding `BotKilled` entry in any bot file, suggesting not all participants generate telemetry.

---

### 4. What I'd Do Differently with More Time

**Persistent storage.** Upload parquet files to S3 or equivalent; store processed events in PostgreSQL. Sessions survive restarts, multiple users can work independently, and historical data accumulates rather than being discarded.

**Fix the timestamp interpretation.** The frontend currently uses raw `ts` deltas for playback. With the correct understanding (epoch seconds, not ms), the timeline scrubber and speed multipliers need recalibration so playback speed corresponds to real match time.

**Better bot path reconstruction.** When a bot has no parquet file, its path is invisible even though a human player recorded a `BotKill` at a specific location. Cross-referencing kill coordinates from human files could partially reconstruct bot positions for bots with missing files.

**Streaming upload processing.** Currently all files are held in browser memory before sending. For the full 1,243-file dataset this works, but a chunked upload with server-side streaming would be more robust and would allow a real progress indicator rather than a spinner.

**Comparative views.** Side-by-side heatmap comparison between maps or between date ranges would let designers answer questions like "did the February 14 patch change kill distribution?" without toggling back and forth.
