import { useEffect, useState } from 'react';
import { fetchMatch, fetchMatches } from '../utils/api';

/**
 * useMatchList — fetch and cache the match list for a given map.
 *
 * Returns { matches, loading, error }
 * matches: [{ match_id, map_id, date, player_count, bot_count, duration_ms }]
 */
export function useMatchList(mapId) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!mapId) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchMatches(mapId)
      .then((data) => { if (!cancelled) setMatches(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [mapId]);

  return { matches, loading, error };
}

/**
 * useSingleMatch — fetch full event data for one match.
 *
 * Returns { match, loading, error }
 * match: { match_id, map_id, duration_ms, player_count, bot_count, players }
 */
export function useSingleMatch(matchId) {
  const [match, setMatch]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    setMatch(null);
    setLoading(true);
    setError('');

    fetchMatch(matchId)
      .then((data) => { if (!cancelled) setMatch(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [matchId]);

  return { match, loading, error };
}
