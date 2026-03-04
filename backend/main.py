"""
main.py — FastAPI application for Lila Black Player Journey Visualizer

Endpoints:
  POST /upload              Accept parquet files, process and cache in memory
  GET  /health              Health check + upload status
  GET  /maps                Per-map match counts
  GET  /matches             Matches for a map, optional date filter
  GET  /match/{match_id}    Full event data for one match
  GET  /heatmap             Pre-computed heatmap grid
"""

import os
from typing import Dict, List, Optional, Any

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from pipeline import (
    HEATMAP_TYPES,
    compute_all_heatmaps,
    compute_heatmap,
    get_maps_info,
    get_match_data,
    get_matches_for_map,
    get_summary,
    process_uploaded_files,
)

load_dotenv()

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Lila Black Visualizer API",
    description="Telemetry visualization backend for LILA BLACK",
    version="1.0.0",
)

# CORS — allow configured origin or all origins in dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory store — populated on /upload, read by all GET endpoints
# ---------------------------------------------------------------------------

_store: Dict[str, Any] = {
    "df": None,                # pd.DataFrame — all processed events
    "heatmaps": {},            # heatmaps[map_id][type] — all rows (bots included)
    "heatmaps_no_bots": {},    # same, but bot position rows excluded
    "maps_info": [],           # per-map stats, bots counted in player_count
    "maps_info_no_bots": [],   # per-map stats, only human players counted
    "summary": {},             # result of get_summary()
}


def _require_data() -> pd.DataFrame:
    """Return the cached DataFrame or raise 503 if nothing has been uploaded."""
    df = _store["df"]
    if df is None or df.empty:
        raise HTTPException(
            status_code=503,
            detail="No data loaded. POST parquet files to /upload first.",
        )
    return df


# ---------------------------------------------------------------------------
# POST /upload
# ---------------------------------------------------------------------------

@app.post("/upload", summary="Upload parquet files and process them")
async def upload(files: List[UploadFile] = File(...)) -> Dict[str, Any]:
    """
    Accept one or more parquet files, process and cache them in memory.

    Files should be the raw .nakama-0 parquet files from the player_data
    folders. The filename (including any folder path) is used to extract
    the date label (e.g. 'February_10').

    Returns a summary of what was loaded.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files received.")

    # Read all file bytes concurrently is not needed — FastAPI has already
    # buffered them. Read sequentially and build the (filename, bytes) list
    # that pipeline.process_uploaded_files expects.
    file_payloads: List[tuple] = []
    for upload_file in files:
        content = await upload_file.read()
        # filename may include a relative folder path from webkitRelativePath
        filename = upload_file.filename or ""
        file_payloads.append((filename, content))

    # Process — this is CPU-bound but fast enough for the dataset size
    df = process_uploaded_files(file_payloads)

    if df.empty:
        raise HTTPException(
            status_code=422,
            detail="No valid parquet data found in the uploaded files.",
        )

    # Pre-compute both heatmap variants once at upload time so GET requests
    # are always instant regardless of the include_bots query param.
    human_df = df[~df["is_bot"]]
    heatmaps          = compute_all_heatmaps(df)
    heatmaps_no_bots  = compute_all_heatmaps(human_df)
    summary           = get_summary(df)
    maps_info         = get_maps_info(df, include_bots=True)
    maps_info_no_bots = get_maps_info(df, include_bots=False)

    _store["df"]               = df
    _store["heatmaps"]         = heatmaps
    _store["heatmaps_no_bots"] = heatmaps_no_bots
    _store["maps_info"]        = maps_info
    _store["maps_info_no_bots"]= maps_info_no_bots
    _store["summary"]          = summary

    return {
        "status": "ok",
        "files_received": len(files),
        **summary,
    }


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

@app.get("/health", summary="Health check")
def health() -> Dict[str, Any]:
    """Returns service status and whether data has been loaded."""
    df = _store["df"]
    loaded = df is not None and not df.empty
    return {
        "status": "ok",
        "data_loaded": loaded,
        "row_count": len(df) if loaded else 0,
        **(_store["summary"] if loaded else {}),
    }


# ---------------------------------------------------------------------------
# GET /maps
# ---------------------------------------------------------------------------

@app.get("/dates", summary="List available date labels in the loaded dataset")
def dates() -> List[str]:
    """
    Returns the sorted list of date labels (e.g. ['February_10', 'February_11'])
    extracted from uploaded file paths.  Empty list if no date info was found.
    """
    df = _require_data()
    if "date" not in df.columns:
        return []
    return sorted(df["date"].dropna().unique().tolist())


@app.get("/maps", summary="List maps with match counts")
def maps(
    include_bots: bool = Query(False, description="Include bot users in player_count"),
    date: Optional[str] = Query(None, description="e.g. February_10 — filter to one date"),
) -> List[Dict[str, Any]]:
    """
    Returns one entry per map present in the loaded data.

    Response shape:
      [{"map_id": "AmbroseValley", "match_count": 200, "player_count": 45}, ...]

    include_bots=false (default): player_count counts only human UUID users.
    include_bots=true: player_count counts all unique user_ids (humans + bots).
    date: if provided, restrict counts to that date only.
    """
    _require_data()
    df = _store["df"]
    if date and "date" in df.columns:
        df = df[df["date"] == date]
    return get_maps_info(df, include_bots=include_bots)


# ---------------------------------------------------------------------------
# GET /matches
# ---------------------------------------------------------------------------

@app.get("/matches", summary="List matches for a map")
def matches(
    map: str = Query(..., description="map_id — AmbroseValley | GrandRift | Lockdown"),
    date: Optional[str] = Query(None, description="e.g. February_10"),
) -> List[Dict[str, Any]]:
    """
    Returns all matches for the given map, optionally filtered by date.

    Response shape:
      [{"match_id": "...", "map_id": "...", "player_count": 4,
        "bot_count": 12, "duration_ms": 480000}, ...]
    """
    df = _require_data()
    return get_matches_for_map(df, map_id=map, date=date)


# ---------------------------------------------------------------------------
# GET /match/{match_id}
# ---------------------------------------------------------------------------

@app.get("/match/{match_id}", summary="Full event data for one match")
def match(match_id: str) -> Dict[str, Any]:
    """
    Returns all players and their ordered event list for a single match.

    Response shape:
      {
        "match_id": "...",
        "map_id": "AmbroseValley",
        "duration_ms": 1770754537,
        "player_count": 4,
        "bot_count": 12,
        "players": [
          {
            "user_id": "...",
            "is_bot": false,
            "color": "#FF6B6B",
            "events": [
              {"event": "Position", "px": 312, "py": 756, "ts": 1770123456},
              ...
            ]
          },
          ...
        ]
      }

    Note: ts values are absolute Unix timestamps in ms.
    The frontend computes elapsed time as ts - min(ts) per match.
    """
    df = _require_data()
    data = get_match_data(df, match_id)
    if data is None:
        raise HTTPException(status_code=404, detail=f"Match '{match_id}' not found.")
    return data


# ---------------------------------------------------------------------------
# GET /heatmap
# ---------------------------------------------------------------------------

@app.get("/heatmap", summary="Aggregate heatmap grid for a map")
def heatmap(
    map: str = Query(..., description="map_id — AmbroseValley | GrandRift | Lockdown"),
    type: str = Query(..., description=f"One of: {', '.join(HEATMAP_TYPES)}"),
    include_bots: bool = Query(False, description="Include bot rows in the heatmap computation"),
    date: Optional[str] = Query(None, description="e.g. February_10 — filter to one date"),
) -> Dict[str, Any]:
    """
    Returns a 64×64 heatmap grid for the given map and event type.

    When date is omitted the pre-computed all-time cache is returned instantly.
    When date is provided the grid is computed on-the-fly from the filtered data.

    Response shape:
      {
        "map_id": "AmbroseValley",
        "type": "kills",
        "grid_size": 64,
        "cells": [[0, 1, 3, ...], ...],   // row-major, top-to-bottom
        "max_value": 47
      }
    """
    _require_data()

    if type not in HEATMAP_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid type '{type}'. Must be one of: {HEATMAP_TYPES}",
        )

    if date:
        # On-the-fly computation for a specific date
        df = _store["df"]
        if not include_bots:
            df = df[~df["is_bot"]]
        if "date" in df.columns:
            df = df[df["date"] == date]
        if map not in df["map_id"].values:
            raise HTTPException(
                status_code=404,
                detail=f"No heatmap data for map '{map}' on date '{date}'.",
            )
        return compute_heatmap(df, map, type)

    # All-time path — use pre-computed cache
    heatmaps = _store["heatmaps"] if include_bots else _store["heatmaps_no_bots"]
    if map not in heatmaps:
        raise HTTPException(
            status_code=404,
            detail=f"No heatmap data for map '{map}'.",
        )

    return heatmaps[map][type]
