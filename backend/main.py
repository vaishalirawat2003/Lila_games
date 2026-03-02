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
_ALLOWED_ORIGINS: List[str] = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "*").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory store — populated on /upload, read by all GET endpoints
# ---------------------------------------------------------------------------

_store: Dict[str, Any] = {
    "df": None,          # pd.DataFrame — all processed events
    "heatmaps": {},      # heatmaps[map_id][heatmap_type] = heatmap dict
    "summary": {},       # result of get_summary()
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

    # Pre-compute heatmaps once; serve from cache on subsequent requests
    heatmaps = compute_all_heatmaps(df)
    summary = get_summary(df)

    _store["df"] = df
    _store["heatmaps"] = heatmaps
    _store["summary"] = summary

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

@app.get("/maps", summary="List maps with match counts")
def maps() -> List[Dict[str, Any]]:
    """
    Returns one entry per map present in the loaded data.

    Response shape:
      [{"map_id": "AmbroseValley", "match_count": 200}, ...]
    """
    df = _require_data()
    return get_maps_info(df)


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
) -> Dict[str, Any]:
    """
    Returns a pre-computed 64×64 heatmap grid for the given map and event type.

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

    heatmaps = _store["heatmaps"]
    if map not in heatmaps:
        raise HTTPException(
            status_code=404,
            detail=f"No heatmap data for map '{map}'.",
        )

    return heatmaps[map][type]
