"""
test_pipeline.py — Integration test against real parquet files.

Simulates exactly what FastAPI does on /upload:
  - reads each file in binary mode with open()
  - builds (filename, bytes) tuples — the same shape process_uploaded_files expects
  - passes the list to process_uploaded_files()

Run from the backend/ directory:
    python3 test_pipeline.py
"""

import os
import sys
import time

# Allow import from same directory when run directly
sys.path.insert(0, os.path.dirname(__file__))

from pipeline import (
    process_uploaded_files,
    compute_all_heatmaps,
    get_summary,
    get_maps_info,
    get_matches_for_map,
    get_match_data,
    HEATMAP_TYPES,
)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Resolve data directory — checks repo-relative path first, then Downloads
_CANDIDATE_DIRS = [
    os.path.join(os.path.dirname(__file__), "..", "player_data", "February_10"),
    os.path.expanduser("~/Downloads/player_data/February_10"),
]
DATA_DIR = next((d for d in _CANDIDATE_DIRS if os.path.isdir(d)), _CANDIDATE_DIRS[0])

MAX_FILES = None  # set to e.g. 50 to cap during quick dev runs


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_files(directory: str, limit=None):
    """
    Read all files in directory in binary mode, exactly as FastAPI would.
    Returns list of (relative_path, bytes) tuples.
    """
    entries = []
    for fname in sorted(os.listdir(directory)):
        fpath = os.path.join(directory, fname)
        if not os.path.isfile(fpath):
            continue
        # Construct a path that includes the date folder so pipeline can
        # extract the date — mirrors the webkitRelativePath the browser sends
        rel_path = os.path.join("February_10", fname)
        with open(fpath, "rb") as f:
            entries.append((rel_path, f.read()))
        if limit and len(entries) >= limit:
            break
    return entries


def section(title: str):
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # ── 1. Load files ────────────────────────────────────────────────────────
    section("1. Loading files from disk")

    if not os.path.isdir(DATA_DIR):
        print(f"ERROR: data directory not found: {DATA_DIR}")
        sys.exit(1)

    t0 = time.perf_counter()
    files = load_files(DATA_DIR, limit=MAX_FILES)
    load_time = time.perf_counter() - t0

    print(f"  Files found      : {len(files)}")
    print(f"  Sample filenames : {[f for f, _ in files[:3]]}")
    print(f"  Disk read time   : {load_time:.2f}s")

    # ── 2. Process ───────────────────────────────────────────────────────────
    section("2. process_uploaded_files()")

    t0 = time.perf_counter()
    df = process_uploaded_files(files)
    proc_time = time.perf_counter() - t0

    if df.empty:
        print("ERROR: DataFrame is empty — all files failed to parse.")
        sys.exit(1)

    print(f"  Total rows       : {len(df):,}")
    print(f"  Columns          : {df.columns.tolist()}")
    print(f"  Process time     : {proc_time:.2f}s")
    print(f"  Maps found       : {sorted(df['map_id'].unique().tolist())}")
    print(f"  Date values      : {sorted(df['date'].dropna().unique().tolist())}")
    print(f"  Human rows       : {(~df['is_bot']).sum():,}")
    print(f"  Bot rows         : {df['is_bot'].sum():,}")
    print(f"  Unique matches   : {df['match_id_display'].nunique()}")
    print(f"  Unique users     : {df['user_id'].nunique()}")

    # ── 3. Event decode check ────────────────────────────────────────────────
    section("3. Event decode check")

    event_counts = df["event"].value_counts()
    print("  Event counts:")
    for evt, count in event_counts.items():
        print(f"    {evt:<20} {count:>8,}")

    # Verify no raw bytes leaked through
    raw_bytes_count = df["event"].apply(lambda e: isinstance(e, bytes)).sum()
    print(f"\n  Rows with undecoded bytes: {raw_bytes_count}  {'✓' if raw_bytes_count == 0 else '✗ FAIL'}")

    # ── 4. Coordinate sanity ─────────────────────────────────────────────────
    section("4. Coordinate range check (px, py should be near 0–1024)")

    for col in ("px", "py"):
        print(f"  {col}: min={df[col].min()}, max={df[col].max()}, "
              f"in-range={(df[col].between(-100, 1124)).mean()*100:.1f}%")

    # ── 5. Summary ───────────────────────────────────────────────────────────
    section("5. get_summary()")

    summary = get_summary(df)
    for k, v in summary.items():
        print(f"  {k:<15} : {v}")

    # ── 6. Maps info ─────────────────────────────────────────────────────────
    section("6. get_maps_info()")

    for m in get_maps_info(df):
        print(f"  {m['map_id']:<20} — {m['match_count']} matches")

    # ── 7. Matches for first map ─────────────────────────────────────────────
    section("7. get_matches_for_map()")

    first_map = df["map_id"].iloc[0]
    matches = get_matches_for_map(df, first_map)
    print(f"  Map: {first_map}  ({len(matches)} matches)")
    for m in matches[:5]:
        print(f"    match_id={m['match_id'][:16]}...  "
              f"players={m['player_count']}  bots={m['bot_count']}  "
              f"duration={m['duration_ms']//1000}s")
    if len(matches) > 5:
        print(f"    ... and {len(matches)-5} more")

    # ── 8. Single match data ─────────────────────────────────────────────────
    section("8. get_match_data()")

    sample_match_id = matches[0]["match_id"]
    t0 = time.perf_counter()
    match = get_match_data(df, sample_match_id)
    match_time = time.perf_counter() - t0

    print(f"  match_id     : {match['match_id']}")
    print(f"  map_id       : {match['map_id']}")
    print(f"  duration     : {match['duration_ms'] // 1000}s")
    print(f"  player_count : {match['player_count']}")
    print(f"  bot_count    : {match['bot_count']}")
    print(f"  total players in response: {len(match['players'])}")
    print(f"  fetch time   : {match_time*1000:.1f}ms")

    # Spot-check first human player
    humans = [p for p in match["players"] if not p["is_bot"]]
    if humans:
        h = humans[0]
        print(f"\n  First human player:")
        print(f"    user_id    : {h['user_id']}")
        print(f"    color      : {h['color']}")
        print(f"    event count: {len(h['events'])}")
        print(f"    first event: {h['events'][0]}")
        print(f"    last event : {h['events'][-1]}")

    # ── 9. Heatmaps ──────────────────────────────────────────────────────────
    section("9. compute_all_heatmaps()")

    t0 = time.perf_counter()
    heatmaps = compute_all_heatmaps(df)
    hm_time = time.perf_counter() - t0

    print(f"  Computed in {hm_time:.2f}s")
    for map_id, types in heatmaps.items():
        print(f"\n  {map_id}:")
        for htype in HEATMAP_TYPES:
            hm = types.get(htype, {})
            print(f"    {htype:<10} max_value={hm.get('max_value', 'N/A'):>5}  "
                  f"grid={hm.get('grid_size', 'N/A')}×{hm.get('grid_size', 'N/A')}")

    # ── 10. Done ─────────────────────────────────────────────────────────────
    section("Result")
    total_time = load_time + proc_time + hm_time
    print(f"  ✅ Pipeline OK")
    print(f"  Total time (load + process + heatmaps): {total_time:.2f}s")
    print()


if __name__ == "__main__":
    main()
