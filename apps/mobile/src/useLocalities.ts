import { useCallback, useEffect, useState } from "react";

import { fetchSummaries, type LocalitySummary } from "@/src/api";

/**
 * A tiny module-level cache so Home, Search and any other screen share one fetch
 * of the locality list rather than each hitting the API. The list is large and
 * rarely changes within a session, so this keeps tab switches instant.
 */
let cache: LocalitySummary[] | null = null;
let inflight: Promise<LocalitySummary[]> | null = null;

function load(force = false): Promise<LocalitySummary[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight && !force) return inflight;
  inflight = fetchSummaries()
    .then((data) => {
      cache = data;
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export interface LocalitiesState {
  data: LocalitySummary[] | null;
  error: boolean;
  loading: boolean;
  reload: () => void;
}

export function useLocalities(): LocalitiesState {
  const [data, setData] = useState<LocalitySummary[] | null>(cache);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(!cache);

  const run = useCallback((force: boolean) => {
    setError(false);
    setLoading(true);
    load(force)
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!cache) run(false);
  }, [run]);

  const reload = useCallback(() => run(true), [run]);

  return { data, error, loading, reload };
}

/** Localities grouped and counted by city, most-documented cities first. */
export function cityCounts(list: LocalitySummary[]): Array<{ city: string; count: number }> {
  const counts = new Map<string, number>();
  for (const l of list) counts.set(l.city, (counts.get(l.city) ?? 0) + 1);
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count);
}
