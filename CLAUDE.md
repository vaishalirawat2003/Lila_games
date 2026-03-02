# CLAUDE.md — Lila Black Player Journey Visualization Tool
## Spec & Build Reference Document (v2)

---

## 1. Project Overview

This is a web-based game telemetry visualization tool built for the **Lila APM Written Test** assignment. The tool allows Level Designers at LILA Games to explore how players navigate the 3 maps in LILA BLACK — an extraction shooter battle royale game.

The tool must be hosted at a publicly accessible URL and submitted alongside a Git repository and a 1-page architecture document.

**Primary user:** Level Designers (not data scientists). The UX must be intuitive, visual, and require no technical knowledge to operate.

**Deadline:** 5 days from assignment receipt.

---

## 2. Assignment Requirements Checklist

These are the exact "must have" requirements from the brief. Every item must be satisfied.

| Requirement | Status |
|---|---|
| Load and parse parquet data (via file upload) | ✅ In scope |
| Display player journeys on correct minimap with proper coordinate mapping | ✅ In scope |
| Distinguish humans vs bots visually | ✅ In scope |
| Show event types (kills, deaths, loot, storm deaths) as distinct markers | ✅ In scope |
| Filter by map, date, and/or match | ✅ In scope |
| Timeline/playback to watch a match unfold | ✅ In scope |
| Heatmap overlays: kill zones, death zones, high-traffic areas | ✅ In scope |
| Hosted and accessible via shareable link | ✅ In scope |

---

## 3. Dataset Summary

- **Source:** 1,243 parquet files across 5 folders (February 10–14, 2026)
- **Total rows:** ~89,000 events
- **Location in repo:** `player_data/` with subfolders `February_10/` through `February_14/`
- **File naming:** `{user_id}_{match_id}.nakama-0`
  - Human players: UUID user_id (e.g. `f4e072fa-b7af-4761-b567-...`)
  - Bots: Numeric user_id (e.g. `1440`, `382`)
- **No `.parquet` extension** on files — but they are valid parquet files

### Schema

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | string | UUID = human, numeric = bot |
| `match_id` | string | Includes `.nakama-0` suffix — strip for display |
| `map_id` | string | AmbroseValley, GrandRift, or Lockdown |
| `x` | float32 | World X coordinate |
| `y` | float32 | Elevation — NOT used for 2D mapping |
| `z` | float32 | World Z coordinate |
| `ts` | timestamp (ms) | Time elapsed within match, not wall clock — display as MM:SS |
| `event` | binary (bytes) | Must decode: `.decode('utf-8')` |

### Event Types

| Event | Category | Who |
|-------|----------|-----|
| `Position` | Movement | Human |
| `BotPosition` | Movement | Bot |
| `Kill` | Combat | Human kills human |
| `Killed` | Combat | Human killed by human |
| `BotKill` | Combat | Human kills bot |
| `BotKilled` | Combat | Human killed by bot |
| `KilledByStorm` | Environment | Human dies to storm |
| `Loot` | Item | Human picks up item |

---

## 4. Map Configuration

All minimap images are **1024×1024 pixels** and located in `minimaps/`.

| Map | Scale | Origin X | Origin Z | Image file |
|-----|-------|----------|----------|------------|
| AmbroseValley | 900 | -370 | -473 | `AmbroseValley_Minimap.png` |
| GrandRift | 581 | -290 | -290 | `GrandRift_Minimap.png` |
| Lockdown | 1000 | -500 | -500 | `Lockdown_Minimap.jpg` |

### World → Pixel Coordinate Formula

```
u = (x - origin_x) / scale
v = (z - origin_z) / scale

pixel_x = u * 1024
pixel_y = (1 - v) * 1024   ← Y is flipped (image origin = top-left)
```

**Critical:** Only `x` and `z` are used for 2D mapping. The `y` column is elevation and must be ignored for minimap plotting.

---

## 5. Tech Stack

### Backend
- **Language:** Python 3.10+
- **Framework:** FastAPI
- **Data processing:** pandas, pyarrow
- **Server:** Uvicorn
- **Hosting:** Railway (free tier — no sleep/cold start issues unlike Render)

### Frontend
- **Framework:** React
- **Rendering:** HTML5 Canvas (for paths, markers, heatmaps)
- **HTTP client:** fetch API
- **Styling:** Tailwind CSS
- **Hosting:** Vercel (free tier)

### Dev Environment
- **Current:** GitHub Codespaces (browser-based VS Code)
- **Soon:** Local VS Code on new laptop (seamless via `git clone`)

---

## 6. Architecture

```
[User uploads parquet files via browser]
           ↓
FastAPI /upload endpoint
  - Receives one or more parquet files
  - Decodes event bytes
  - Detects human vs bot from user_id
  - Applies world → pixel coordinate transform
  - Pre-computes heatmap grids per map × event type
  - Stores all processed data in server memory
           ↓
FastAPI REST endpoints
  - Serve processed match data, heatmaps, map/match lists
  - Hosted on Railway
           ↓
React Frontend
  - Upload Screen (entry point)
  - Map Overview Screen (DEFAULT — aggregate heatmaps)
  - Match Explorer Screen (drill-down — individual match replay)
  - Hosted on Vercel
```

### Key Architecture Decision: File Upload
The assignment explicitly requires the tool to "load and parse the provided parquet data." The tool accepts parquet files uploaded by the user — it does not ship with pre-processed data. The backend processes files on upload and holds results in memory for the session. Raw parquet files are NOT committed to git.

---

## 7. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Accept parquet file(s), process and store in memory |
| GET | `/maps` | List available maps with match counts |
| GET | `/matches?map={map_id}&date={date}` | List matches for a map |
| GET | `/match/{match_id}` | Full event data for one match with pixel coordinates |
| GET | `/heatmap?map={map_id}&type={type}` | Aggregate heatmap grid for a map |
| GET | `/health` | Health check |

### Heatmap Types
- `kills` — density of Kill + BotKill events
- `deaths` — density of Killed + BotKilled events
- `storm` — density of KilledByStorm events
- `loot` — density of Loot events
- `traffic` — density of Position + BotPosition events (movement density)

### Match Response Shape
```json
{
  "match_id": "abc123",
  "map_id": "AmbroseValley",
  "duration_ms": 480000,
  "player_count": 12,
  "bot_count": 38,
  "players": [
    {
      "user_id": "f4e072fa-...",
      "is_bot": false,
      "color": "#FF6B6B",
      "events": [
        { "event": "Position", "px": 312, "py": 756, "ts": 12500 },
        { "event": "Kill", "px": 401, "py": 623, "ts": 94300 }
      ]
    }
  ]
}
```

### Heatmap Response Shape
```json
{
  "map_id": "AmbroseValley",
  "type": "kills",
  "grid_size": 64,
  "cells": [[0, 1, 3, 0], ...],
  "max_value": 47
}
```

---

## 8. UI Structure & Flow — CRITICAL PRODUCT DECISION

### The Right Mental Model: Diagnostic Funnel

Level Designers come to this tool with specific hypotheses to validate, not to browse randomly. The tool is structured as a funnel — broad pattern recognition first, individual investigation second.

```
STEP 1: UPLOAD
  User uploads parquet files (individual files or full folder)
  Backend processes, returns summary stats
  → "796 matches loaded across 3 maps"
           ↓
STEP 2: MAP OVERVIEW  ← DEFAULT LANDING (primary workflow)
  "What patterns exist across all matches on this map?"
  Aggregate heatmaps across ALL matches for selected map.
  This is where Level Designers spend most of their time.
           ↓  user spots anomaly → wants to investigate
STEP 3: MATCH EXPLORER  ← DRILL-DOWN (secondary workflow)
  "Let me look at specific matches to understand why"
  Individual match replay with timeline playback.
```

### Why the Map Overview Must Be Default
If the match explorer were default, the designer would have to pick a random match before seeing any meaningful pattern — the wrong starting point. The aggregate view immediately answers the high-value questions: "Is the north side ignored? Where does the storm kill people? Are loot hotspots creating intended traffic?" The match explorer answers *why*, once you know *what* to look for.

---

## 9. Screen-by-Screen Layout

### Upload Screen
```
┌─────────────────────────────────────────────────────┐
│  LILA BLACK — Player Journey Visualizer              │
│                                                      │
│       [ ↑ Drop parquet files here ]                  │
│         or click to select files                     │
│                                                      │
│  Tip: Select all files from all date folders at once │
│                                                      │
│  [ Loading... 843 / 1243 files processed ]           │
└─────────────────────────────────────────────────────┘
```

### Map Overview Screen (default after upload)
```
┌─────────────────────────────────────────────────────┐
│  LILA BLACK  [AmbroseValley] [GrandRift] [Lockdown]  │
├──────────────┬──────────────────────────────────────┤
│              │                                       │
│  Heatmap:    │                                       │
│  ● Kills     │                                       │
│  ○ Deaths    │      Map Canvas (1024×1024)           │
│  ○ Storm     │      Minimap + heatmap overlay        │
│  ○ Loot      │                                       │
│  ○ Traffic   │                                       │
│              │                                       │
│  [Dead Zones]│                                       │
│              │                                       │
│  ─────────── │                                       │
│  796 matches ├──────────────────────────────────────┤
│  339 players │     [ → Explore Individual Matches ]  │
│  5 days      │                                       │
└──────────────┴──────────────────────────────────────┘
```

### Match Explorer Screen
```
┌─────────────────────────────────────────────────────┐
│  ← Map Overview    AmbroseValley                     │
│  Date [All ▾]   Match [b71aaad8... ▾]               │
├──────────────┬──────────────────────────────────────┤
│              │                                       │
│  Show:       │                                       │
│  ☑ Humans   │      Map Canvas (1024×1024)           │
│  ☑ Bots     │      Minimap + paths + markers        │
│              │                                       │
│  Events:     │                                       │
│  ☑ Kills    │                                       │
│  ☑ Deaths   │                                       │
│  ☑ Loot     │                                       │
│  ☑ Storm    │                                       │
│              ├──────────────────────────────────────┤
│  Legend      │  [◀] [▶⏸] [1× ▾]  ───●──────────  │
│  ── Human   │  02:14 / 08:15                        │
│  -- Bot     │                                       │
└──────────────┴──────────────────────────────────────┘
```

---

## 10. Visual Design Decisions

### Player Paths
- **Human players:** Solid white or light-coloured lines (consistent, not unique per player)
- **Bots:** Dashed grey lines (present but visually subordinate)
- Opacity: 70% to handle overlap

### Event Markers
| Event | Marker | Color |
|-------|--------|-------|
| Kill (human kills human) | ✕ | Red |
| Killed (human killed by human) | ● | Dark red |
| BotKill | small ✕ | Orange |
| BotKilled | small ● | Orange |
| KilledByStorm | ◆ | Purple |
| Loot | ★ | Gold |

### Heatmap
- Semi-transparent overlay at 60% opacity
- Color scale: Blue → Yellow → Red
- 64×64 grid resolution
- One type visible at a time (radio buttons)
- Dead Zones: grey overlay on near-zero traffic cells (inverted traffic map)

---

## 11. Timeline / Playback

- **Controls:** Rewind ◀, Play/Pause ▶⏸, Speed (0.5×, 1×, 2×, 4×), scrubber
- **Time display:** `MM:SS / MM:SS` elapsed
- **Only available in:** Match Explorer screen

### Two Playback Modes (toggle between them)

**Mode D — God View (default)**
All players shown simultaneously. Human paths draw progressively as time advances — you see the full movement history up to `currentTs`. Bot paths render as faint dashed lines (or can be hidden via the bot toggle). Event markers (kills, deaths, loot, storm) materialise at their exact timestamp. Gives a spatial picture of the whole match unfolding — where does early traffic concentrate, when does scatter happen, where does the endgame cluster.

**Mode C — Events Only**
Paths are hidden entirely. Only event markers appear, materialising on the map in chronological order as the timeline advances. Much cleaner for reading the *rhythm* of a match — when does combat spike, is there a quiet phase before a frantic endgame, does the storm consistently force people into the same kill zone. Good for Level Designers who want to read event density without path noise.

Toggle between modes with a single button in the playback bar: **[ Paths + Events | Events Only ]**

### Implementation
- `requestAnimationFrame` loop in React
- `currentTs` state variable advances each frame based on speed multiplier
- In God View: canvas redraws each player's path segment from start up to `currentTs`
- In Events Only: canvas renders only event markers with `ts <= currentTs`, paths layer hidden
- Scrubber allows jumping to any point — canvas redraws from scratch at that timestamp

### Future Scope (not in this build)
**Mode E — Animated Heatmap:** The heatmap itself animates over time, density building progressively as the match advances. Hot zones emerge and shift across the map, showing how contested areas evolve during a match. High design value but complex to build — deferred to future iteration.

---

## 12. Data Pipeline Implementation

```python
# 1. Process uploaded files
def process_uploaded_files(files):
    frames = []
    for file in files:
        try:
            df = pd.read_parquet(file)
            df['event'] = df['event'].apply(
                lambda x: x.decode('utf-8') if isinstance(x, bytes) else x
            )
            frames.append(df)
        except Exception:
            continue  # skip malformed files
    return pd.concat(frames, ignore_index=True)

# 2. Detect humans vs bots
UUID_PATTERN = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
df['is_bot'] = ~df['user_id'].str.match(UUID_PATTERN)

# 3. Coordinate transform
MAP_CONFIG = {
    "AmbroseValley": {"scale": 900,  "origin_x": -370, "origin_z": -473},
    "GrandRift":     {"scale": 581,  "origin_x": -290, "origin_z": -290},
    "Lockdown":      {"scale": 1000, "origin_x": -500, "origin_z": -500},
}

def world_to_pixel(x, z, map_id):
    cfg = MAP_CONFIG[map_id]
    u = (x - cfg["origin_x"]) / cfg["scale"]
    v = (z - cfg["origin_z"]) / cfg["scale"]
    return round(u * 1024), round((1 - v) * 1024)

# 4. Heatmap grid computation
HEATMAP_EVENTS = {
    "kills":   ["Kill", "BotKill"],
    "deaths":  ["Killed", "BotKilled"],
    "storm":   ["KilledByStorm"],
    "loot":    ["Loot"],
    "traffic": ["Position", "BotPosition"],
}

def compute_heatmap(df, map_id, heatmap_type, grid_size=64):
    events = HEATMAP_EVENTS[heatmap_type]
    filtered = df[(df['map_id'] == map_id) & (df['event'].isin(events))]
    grid = np.zeros((grid_size, grid_size), dtype=int)
    for _, row in filtered.iterrows():
        px, py = world_to_pixel(row['x'], row['z'], map_id)
        gx = min(int(px / 1024 * grid_size), grid_size - 1)
        gy = min(int(py / 1024 * grid_size), grid_size - 1)
        grid[gy][gx] += 1
    return grid.tolist()

# 5. Clean match_id for display
df['match_id_clean'] = df['match_id'].str.replace('.nakama-0', '', regex=False)
```

---

## 13. Folder Structure

```
lila-black-viz/
├── backend/
│   ├── main.py              # FastAPI app + endpoints
│   ├── pipeline.py          # Upload processing + transforms
│   ├── heatmap.py           # Heatmap grid computation
│   ├── models.py            # Pydantic response models
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── screens/
│   │   │   ├── UploadScreen.jsx
│   │   │   ├── MapOverview.jsx      ← DEFAULT after upload
│   │   │   └── MatchExplorer.jsx    ← drill-down
│   │   ├── components/
│   │   │   ├── MapCanvas.jsx
│   │   │   ├── HeatmapLayer.jsx
│   │   │   ├── Timeline.jsx
│   │   │   ├── ControlPanel.jsx
│   │   │   └── Legend.jsx
│   │   ├── hooks/
│   │   │   ├── useMatchData.js
│   │   │   └── usePlayback.js
│   │   └── utils/
│   │       └── canvas.js
│   ├── public/
│   │   └── minimaps/
│   └── package.json
├── player_data/             # NOT committed to git
├── .gitignore
├── CLAUDE.md                # This file
└── README.md                # Architecture doc (final deliverable)
```

---

## 14. Performance Notes

- All 1,243 parquet files (~8MB) should process in under 10 seconds on upload
- Heatmaps pre-computed once on upload — served as flat JSON arrays
- Canvas renders only events up to `currentTs` during playback
- Bot layer on separate canvas layer for instant show/hide
- FastAPI module-level dict caches all processed data between requests
- Upload endpoint should accept up to 50MB

---

## 15. Deployment

### Backend — Railway
```
Start command: uvicorn main:app --host 0.0.0.0 --port $PORT
```
- Add CORSMiddleware allowing requests from Vercel domain
- No persistent storage needed — in-memory per session

### Frontend — Vercel
```
Env variable: REACT_APP_API_URL=https://your-app.railway.app
```
- Auto-deploys on push to main

---

## 16. Data Nuances — Attention to Detail

- `match_id` has `.nakama-0` suffix — strip for display, keep internally
- `ts` is ms elapsed within match — display as `MM:SS`, never as wall-clock
- `y` is elevation — never use for 2D coordinate mapping
- `event` is bytes — decode before any use
- February 14 is a partial day — label it as such in date filter
- Malformed files exist — wrap all reads in try/except, skip silently
- Same human `user_id` appears in multiple matches — expected
- Bot user_ids are short integers — distinct from UUID human IDs

---

## 17. Out of Scope

- Authentication / login
- Real-time data ingestion
- 3D / elevation visualization
- Mobile responsiveness
- Persistent storage between sessions

---

## 18. Build Order

1. `pipeline.py` — processes parquets, transforms coords, computes heatmaps → verify with print output
2. FastAPI `/upload` endpoint → verify with curl
3. Remaining API endpoints → verify in browser
4. React upload screen → file picker, calls `/upload`, shows confirmation
5. Map Overview screen → minimap + aggregate heatmap overlay + type toggle
6. Dead Zones toggle → inverted traffic layer
7. Match Explorer screen → match selector, player paths, event markers
8. Human/Bot toggles → instant layer show/hide
9. Timeline playback → animation loop, progressive paths, play/pause/speed/scrub
10. Polish → legend, loading states, error handling, labels
11. Deploy → Railway + Vercel, test from public URL
12. README.md → architecture doc (final deliverable)

---

## 19. Architecture Doc Outline (README.md)

1. **Tech stack and why** — FastAPI for Python data processing, React + Canvas for interactive visualization, Railway + Vercel for hosting
2. **Data flow** — from uploaded parquet files through pipeline to rendered canvas
3. **Trade-offs** — in-memory vs persistent storage, 64×64 grid resolution, pre-computed vs on-demand heatmaps, aggregate-first UI vs match-first UI
4. **What I'd do differently with more time** — Mode E animated heatmap playback, storm corridor analysis, player archetype clustering, side-by-side map comparison, heatmap image export, date range comparison
