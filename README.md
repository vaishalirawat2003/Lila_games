# LILA BLACK — Player Journey Visualization Tool

A web-based game telemetry tool for Level Designers at LILA Games to explore how players navigate the three maps in LILA BLACK, an extraction shooter battle royale. Upload parquet telemetry files and instantly see aggregate heatmaps, individual match replays, and player path animations.
---

## Live Demo

| Service | URL |
|---------|-----|
| Frontend | https://lila-games.vercel.app |
| Backend API | https://lila-games-production.up.railway.app |

---

## Features

- **Aggregate heatmaps** — kill zones, death zones, storm deaths, loot hotspots, and traffic density across all matches for a selected map
- **Dead zones** — inverted traffic overlay that highlights areas players never visit
- **Match Explorer** — replay any individual match with a scrubable timeline and play/pause/speed controls
- **Two playback modes** — God View (paths + events) or Events Only (markers only, no path noise)
- **Human vs bot distinction** — solid coloured paths for humans, dashed yellow for bots; independent toggles
- **Event markers** — kills (✕), deaths (●), storm deaths (◆), loot (★) materialise in real time
- **Zoom and pan** — scroll-wheel zoom up to 8× on heatmap canvas, click-drag to pan, navigator thumbnail
- **Multi-file upload** — drag an entire folder (or multiple folders) onto the upload screen

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.10+, FastAPI, pandas, pyarrow, numpy |
| Frontend | React 18, HTML5 Canvas, Tailwind CSS |
| Backend hosting | Railway (no cold-start on free tier) |
| Frontend hosting | Vercel |

---

## Local Development

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm or yarn

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend
cp .env.example .env.local      # points REACT_APP_API_URL to localhost:8000
npm install
npm start
```

The app will open at `http://localhost:3000`.

---

## Usage

### 1. Upload telemetry files

On the Upload screen you have two options:

- **Upload Files** — click to open a file picker and select individual parquet files, or drag and drop files directly onto the card
- **Upload Folder** — click to select a single date folder (e.g. `February_10/`), or drag and drop multiple folders at once to load all dates in one go

Files are the raw `.nakama-0` parquet files from the `player_data/` directory. No file extension is needed — the tool reads them as-is.

After selecting files, click **Upload** to send them to the backend. A summary shows how many matches and players were loaded.

> Tip: Drag all five date folders onto the Folder card at once to load the full dataset in a single upload.

### 2. Map Overview (heatmaps)

The default screen after upload. Select a map using the tabs at the top (AmbroseValley, GrandRift, Lockdown).

**Heatmap layers** (left panel) — toggle any combination on simultaneously:

| Layer | What it shows |
|-------|--------------|
| Kills | Where players are killing |
| Deaths | Where players are dying |
| Storm | Where the storm is eliminating players |
| Loot | Where players are picking up items |
| Traffic | Overall movement density |

**Dead Zones** — grey overlay on cells with near-zero traffic; reveals areas designers intended players to visit but don't.

**Include Bots** — when off (default), all layers and counts reflect human players only. Toggle on to include bot telemetry.

**Zoom and pan** — scroll to zoom up to 8×, click-drag to pan. Use the +/−/⊡ buttons or the navigator thumbnail in the bottom-right corner.

Click **Explore individual matches →** to drill into specific matches.

### 3. Match Explorer (replay)

Select a match using the Date and Match droppers in the left sidebar. The match loads onto the canvas.

**Playback controls** (bottom bar):

| Control | Action |
|---------|--------|
| ◀ | Rewind to start |
| ▶ / ⏸ | Play / Pause |
| Speed | 0.5×, 1×, 2×, 4× |
| Scrubber | Click or drag to jump to any point |
| Mode toggle | Switch between **Paths + Events** and **Events Only** |

**Filters** (left sidebar):

- Show/hide **Humans** and **Bots** independently
- Toggle event types: **Kills**, **Deaths**, **Loot**, **Storm**
- Click a player name in the roster to focus on that player (others dim)

**Legend overlay** (top-right of canvas) — shows path style and event marker symbols.

---

## API Reference

All endpoints are relative to `REACT_APP_API_URL`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/upload` | Upload parquet files; returns summary stats |
| `GET` | `/health` | Health check; shows whether data is loaded |
| `GET` | `/maps?include_bots=false` | Per-map match and player counts |
| `GET` | `/matches?map=AmbroseValley&date=February_10` | Match list for a map, optional date filter |
| `GET` | `/match/{match_id}` | Full event data for one match with pixel coordinates |
| `GET` | `/heatmap?map=AmbroseValley&type=kills&include_bots=false` | 64×64 aggregate heatmap grid |

---

## Project Structure

```
lila-black-viz/
├── backend/
│   ├── main.py              # FastAPI app and all endpoints
│   ├── pipeline.py          # Parquet processing, coordinate transform, heatmap computation
│   ├── Procfile             # Railway start command
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Screen state machine (upload → overview → explorer)
│   │   ├── screens/
│   │   │   ├── UploadScreen.jsx
│   │   │   ├── MapOverview.jsx
│   │   │   └── MatchExplorer.jsx
│   │   ├── components/
│   │   │   ├── MapCanvas.jsx     # Heatmap canvas with zoom/pan/navigator
│   │   │   ├── MatchCanvas.jsx   # Match replay canvas
│   │   │   ├── Timeline.jsx      # Playback bar
│   │   │   ├── ControlPanel.jsx  # Left sidebar for map overview
│   │   │   └── Legend.jsx        # Heatmap colour scale legend
│   │   ├── hooks/
│   │   │   └── usePlayback.js    # requestAnimationFrame playback loop
│   │   └── utils/
│   │       ├── api.js            # fetch wrappers for all endpoints
│   │       └── canvas.js         # heatmap/dead zone drawing primitives, image cache
│   ├── public/minimaps/          # 1024×1024 minimap images
│   └── .env.example
├── ARCHITECTURE.md          # Engineering architecture document
├── CLAUDE.md                # Spec and build reference
└── README.md
```

---

## Deployment

### Backend — Railway

1. Connect your GitHub repo in the Railway dashboard
2. Set the root directory to `backend/`
3. Railway auto-detects the `Procfile` and runs `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. No environment variables required (CORS is open)

### Frontend — Vercel

1. Connect your GitHub repo in Vercel
2. Set the root directory to `frontend/`
3. Add environment variable: `REACT_APP_API_URL=https://your-app.up.railway.app`
4. Vercel auto-deploys on every push to `main`

---

## Data Notes

- **Files** — raw `.nakama-0` parquet files; no extension needed
- **Maps** — AmbroseValley, GrandRift, Lockdown; each has its own world-space origin and scale
- **Coordinate system** — `x` and `z` are the 2D world coordinates; `y` is elevation and is ignored
- **Timestamps** — `ts` values are Unix epoch seconds stored in a millisecond-typed field (game engine quirk); the frontend converts them to `MM:SS` elapsed time
- **Humans vs bots** — UUID `user_id` = human; short integer `user_id` = bot
- **Session scope** — all uploaded data lives in server memory; a backend restart clears it
