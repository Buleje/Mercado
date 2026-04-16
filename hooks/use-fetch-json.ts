"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseFetchJSONOptions<T> {
  initialData?: T;
  skip?: boolean;
  method?: "GET" | "POST";
  body?: unknown;
  refreshInterval?: number;
}

interface UseFetchJSONResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFetchJSON<T>(
  url: string | null,
  options?: UseFetchJSONOptions<T>,
): UseFetchJSONResult<T> {
  const {
    initialData = null as unknown as T,
    skip = false,
    method = "GET",
    body,
    refreshInterval = 0,
  } = options ?? {};

  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef(body);
  bodyRef.current = body;

  const fetchData = useCallback(async () => {
    if (!url || skip) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(url, {
        method,
        signal: controller.signal,
        ...(bodyRef.current != null
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(bodyRef.current),
            }
          : {}),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      setData(json);
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
    }
  }, [url, skip, method]);

  useEffect(() => {
    fetchData();

    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (refreshInterval > 0) {
      intervalId = setInterval(fetchData, refreshInterval);
    }

    return () => {
      abortRef.current?.abort();
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}
