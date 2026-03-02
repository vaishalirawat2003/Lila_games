"""
pipeline.py — Data processing for Lila Black Player Journey Visualizer

Responsibilities:
- Read and parse uploaded parquet files (no extension, bytes event column)
- Decode event bytes to strings
- Detect human vs bot from user_id format
- Apply world → pixel coordinate transform per map
- Pre-compute 64×64 heatmap grids per map × heatmap type
- Clean match_id for display (strip .nakama-0)
"""

import re
import numpy as np
import pandas as pd
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Map configuration
# ---------------------------------------------------------------------------

MAP_CONFIG: Dict[str, Dict[str, float]] = {
    "AmbroseValley": {"scale": 900,  "origin_x": -370, "origin_z": -473},
    "GrandRift":     {"scale": 581,  "origin_x": -290, "origin_z": -290},
    "Lockdown":      {"scale": 1000, "origin_x": -500, "origin_z": -500},
}

KNOWN_MAPS = set(MAP_CONFIG.keys())

# ---------------------------------------------------------------------------
# Event groupings for heatmaps
# ---------------------------------------------------------------------------

HEATMAP_EVENTS: Dict[str, List[str]] = {
    "kills":   ["Kill", "BotKill"],
    "deaths":  ["Killed", "BotKilled"],
    "storm":   ["KilledByStorm"],
    "loot":    ["Loot"],
    "traffic": ["Position", "BotPosition"],
}

HEATMAP_TYPES = list(HEATMAP_EVENTS.keys())

# UUID pattern — presence means human player
_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)

GRID_SIZE = 64
IMAGE_SIZE = 1024

# Matches folder names like "February_10", "February_14" in the uploaded path
_DATE_RE = re.compile(r'(February_\d{1,2})', re.IGNORECASE)

# ---------------------------------------------------------------------------
# Coordinate transform
# ---------------------------------------------------------------------------

def world_to_pixel(x: float, z: float, map_id: str) -> Tuple[int, int]:
    """Convert world (x, z) coordinates to minimap pixel (px, py)."""
    cfg = MAP_CONFIG[map_id]
    u = (x - cfg["origin_x"]) / cfg["scale"]
    v = (z - cfg["origin_z"]) / cfg["scale"]
    px = round(u * IMAGE_SIZE)
    py = round((1 - v) * IMAGE_SIZE)  # Y flipped — image origin is top-left
    return px, py


# ---------------------------------------------------------------------------
# Single-file parsing
# ---------------------------------------------------------------------------

def _extract_date(filename: str) -> Optional[str]:
    """Extract 'February_10' style date from an upload path, or None."""
    m = _DATE_RE.search(filename)
    return m.group(1) if m else None


def _parse_file(file_bytes: bytes, filename: str = "") -> Optional[pd.DataFrame]:
    """Parse one parquet file from raw bytes. Returns None on failure."""
    try:
        buf = BytesIO(file_bytes)
        df = pd.read_parquet(buf)

        # Decode event bytes → str
        df["event"] = df["event"].apply(
            lambda e: e.decode("utf-8") if isinstance(e, bytes) else str(e)
        )

        # Strip .nakama-0 suffix from match_id for display; keep raw internally
        df["match_id_display"] = df["match_id"].str.replace(
            ".nakama-0", "", regex=False
        )

        # Attach date extracted from the upload path (e.g. "February_10")
        df["date"] = _extract_date(filename)

        # Normalise ts to integer milliseconds.
        # Parquet stores ts as timestamp[ms] which pyarrow/pandas reads as
        # datetime64 — recover the raw integer ms by going through int64 ns.
        if pd.api.types.is_datetime64_any_dtype(df["ts"]):
            df["ts"] = df["ts"].astype("datetime64[ns]").astype("int64") // 1_000_000
        else:
            df["ts"] = pd.to_numeric(df["ts"], errors="coerce").fillna(0).astype("int64")

        # Detect human vs bot
        df["is_bot"] = ~df["user_id"].astype(str).str.match(_UUID_RE)

        # Drop rows with unknown map_id so coord transform never fails
        df = df[df["map_id"].isin(KNOWN_MAPS)].copy()

        if df.empty:
            return None

        # Apply coordinate transform (vectorised)
        configs = df["map_id"].map(MAP_CONFIG)
        scale = configs.map(lambda c: c["scale"])
        origin_x = configs.map(lambda c: c["origin_x"])
        origin_z = configs.map(lambda c: c["origin_z"])

        u = (df["x"].astype(float) - origin_x) / scale
        v = (df["z"].astype(float) - origin_z) / scale
        df["px"] = (u * IMAGE_SIZE).round().astype(int)
        df["py"] = ((1 - v) * IMAGE_SIZE).round().astype(int)

        return df

    except Exception:
        return None  # skip malformed files silently


# ---------------------------------------------------------------------------
# Batch processing
# ---------------------------------------------------------------------------

def process_uploaded_files(files: List[Tuple[str, bytes]]) -> pd.DataFrame:
    """
    Process a list of (filename, raw_bytes) tuples.
    Returns a single concatenated DataFrame with all valid events.
    """
    frames: List[pd.DataFrame] = []
    for filename, file_bytes in files:
        df = _parse_file(file_bytes, filename)
        if df is not None:
            frames.append(df)

    if not frames:
        return pd.DataFrame()

    combined = pd.concat(frames, ignore_index=True)
    return combined


# ---------------------------------------------------------------------------
# Heatmap computation
# ---------------------------------------------------------------------------

def compute_heatmap(
    df: pd.DataFrame,
    map_id: str,
    heatmap_type: str,
    grid_size: int = GRID_SIZE,
) -> Dict[str, Any]:
    """
    Compute a grid_size × grid_size heatmap for the given map and event type.

    Returns a dict with:
      - map_id
      - type
      - grid_size
      - cells: list[list[int]]  (row-major, top-to-bottom)
      - max_value: int
    """
    events = HEATMAP_EVENTS[heatmap_type]
    mask = (df["map_id"] == map_id) & (df["event"].isin(events))
    filtered = df[mask]

    grid = np.zeros((grid_size, grid_size), dtype=np.int32)

    if not filtered.empty:
        # Map pixel coords → grid cell indices (fully vectorised)
        gx = (filtered["px"].to_numpy() / IMAGE_SIZE * grid_size).astype(int).clip(0, grid_size - 1)
        gy = (filtered["py"].to_numpy() / IMAGE_SIZE * grid_size).astype(int).clip(0, grid_size - 1)
        np.add.at(grid, (gy, gx), 1)

    return {
        "map_id": map_id,
        "type": heatmap_type,
        "grid_size": grid_size,
        "cells": grid.tolist(),
        "max_value": int(grid.max()),
    }


def compute_all_heatmaps(df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
    """
    Pre-compute all heatmaps for every map × heatmap type combination.
    Returns a nested dict: heatmaps[map_id][heatmap_type] = heatmap_dict
    """
    maps_present = [m for m in KNOWN_MAPS if m in df["map_id"].values]
    result: Dict[str, Dict[str, Any]] = {}
    for map_id in maps_present:
        result[map_id] = {}
        for htype in HEATMAP_TYPES:
            result[map_id][htype] = compute_heatmap(df, map_id, htype)
    return result


# ---------------------------------------------------------------------------
# Match data extraction
# ---------------------------------------------------------------------------

def get_match_data(df: pd.DataFrame, match_id_display: str) -> Optional[Dict[str, Any]]:
    """
    Build the full match response for a single match.
    match_id_display is the cleaned ID (without .nakama-0).
    """
    match_df = df[df["match_id_display"] == match_id_display]
    if match_df.empty:
        return None

    map_id = match_df["map_id"].iloc[0]
    duration_ms = int(match_df["ts"].max()) if "ts" in match_df.columns else 0

    # Assign a stable display colour per player
    human_df = match_df[~match_df["is_bot"]]
    bot_df = match_df[match_df["is_bot"]]

    human_ids = human_df["user_id"].unique().tolist()
    bot_ids = bot_df["user_id"].unique().tolist()

    # Colour palette for humans (cycles if > palette length)
    _HUMAN_COLOURS = [
        "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
        "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
        "#F0B27A", "#82E0AA", "#F1948A", "#85C1E9", "#D7DBDD",
    ]

    players: List[dict] = []

    for i, uid in enumerate(human_ids):
        user_events = (
            match_df[match_df["user_id"] == uid]
            .sort_values("ts")[["event", "px", "py", "ts"]]
            .astype({"px": int, "py": int, "ts": int})
            .to_dict("records")
        )
        players.append({
            "user_id": uid,
            "is_bot": False,
            "color": _HUMAN_COLOURS[i % len(_HUMAN_COLOURS)],
            "events": user_events,
        })

    for uid in bot_ids:
        user_events = (
            match_df[match_df["user_id"] == uid]
            .sort_values("ts")[["event", "px", "py", "ts"]]
            .astype({"px": int, "py": int, "ts": int})
            .to_dict("records")
        )
        players.append({
            "user_id": uid,
            "is_bot": True,
            "color": "#888888",
            "events": user_events,
        })

    return {
        "match_id": match_id_display,
        "map_id": map_id,
        "duration_ms": duration_ms,
        "player_count": len(human_ids),
        "bot_count": len(bot_ids),
        "players": players,
    }


# ---------------------------------------------------------------------------
# Summary helpers
# ---------------------------------------------------------------------------

def get_summary(df: pd.DataFrame) -> Dict[str, Any]:
    """Return top-level upload summary stats."""
    if df.empty:
        return {"match_count": 0, "player_count": 0, "map_count": 0, "maps": []}

    match_count = df["match_id_display"].nunique()
    player_count = df[~df["is_bot"]]["user_id"].nunique()
    maps = df["map_id"].unique().tolist()

    return {
        "match_count": match_count,
        "player_count": player_count,
        "map_count": len(maps),
        "maps": maps,
    }


def get_maps_info(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Return per-map match counts and date ranges."""
    if df.empty:
        return []

    result: List[Dict[str, Any]] = []
    for map_id in df["map_id"].unique():
        map_df = df[df["map_id"] == map_id]
        result.append({
            "map_id": map_id,
            "match_count": map_df["match_id_display"].nunique(),
        })
    return result


def get_matches_for_map(
    df: pd.DataFrame,
    map_id: str,
    date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return list of matches for a given map, optionally filtered by date."""
    filtered = df[df["map_id"] == map_id]

    # date filter: match filenames were named with date folders; we don't store
    # date in the df currently — skip date filter for now (handled at upload layer)
    if date:
        if "date" in filtered.columns:
            filtered = filtered[filtered["date"] == date]

    matches = []
    for mid in filtered["match_id_display"].unique():
        m_df = filtered[filtered["match_id_display"] == mid]
        min_ts = int(m_df["ts"].min()) if "ts" in m_df.columns else 0
        max_ts = int(m_df["ts"].max()) if "ts" in m_df.columns else 0
        # date: take first non-null value for this match
        date_val = None
        if "date" in m_df.columns:
            non_null = m_df["date"].dropna()
            date_val = non_null.iloc[0] if not non_null.empty else None
        matches.append({
            "match_id": mid,
            "map_id": map_id,
            "date": date_val,
            "player_count": m_df[~m_df["is_bot"]]["user_id"].nunique(),
            "bot_count": m_df[m_df["is_bot"]]["user_id"].nunique(),
            "duration_ms": max_ts - min_ts,
        })
    return matches
