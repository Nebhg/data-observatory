"use client";

import { useEffect, useState, useCallback, useRef } from "react";

export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number = 30_000
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // loading = true only on the very first fetch (no data yet)
  const [loading, setLoading] = useState(true);
  // isRefreshing = true on any subsequent manual or interval refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const initialFetch = useRef(true);

  const _fetch = useCallback(async (manual: boolean) => {
    if (manual) setIsRefreshing(true);
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
      if (manual) setIsRefreshing(false);
      initialFetch.current = false;
    }
  }, [fetcher]);

  // Manual refresh exposed to callers
  const refresh = useCallback(() => _fetch(true), [_fetch]);

  useEffect(() => {
    _fetch(false);
    const id = setInterval(() => _fetch(false), intervalMs);
    return () => clearInterval(id);
  }, [_fetch, intervalMs]);

  return { data, error, loading, isRefreshing, refresh };
}
