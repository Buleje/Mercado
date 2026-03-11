import { useState, useEffect, useCallback, useRef } from "react";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  error?: Error;
}

interface UseCachedDataOptions<T> {
  /**
   * Time in milliseconds before cache becomes stale
   * @default 300000 (5 minutes)
   */
  staleTime?: number;

  /**
   * Time in milliseconds before cache is garbage collected
   * @default 600000 (10 minutes)
   */
  cacheTime?: number;

  /**
   * Whether to refetch on window focus
   * @default true
   */
  refetchOnFocus?: boolean;

  /**
   * Whether to refetch on reconnect
   * @default true
   */
  refetchOnReconnect?: boolean;

  /**
   * Initial data to use before fetching
   */
  initialData?: T;

  /**
   * Function to determine if data is valid
   */
  isDataValid?: (data: T) => boolean;

  /**
   * Callback when data is successfully fetched
   */
  onSuccess?: (data: T) => void;

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void;

  /**
   * Whether to enable the query
   * @default true
   */
  enabled?: boolean;
}

interface UseCachedDataReturn<T> {
  /**
   * The cached or freshly fetched data
   */
  data: T | undefined;

  /**
   * Whether data is currently being fetched
   */
  isLoading: boolean;

  /**
   * Whether an error occurred
   */
  isError: boolean;

  /**
   * The error object if one occurred
   */
  error: Error | null;

  /**
   * Whether data is stale and being revalidated
   */
  isValidating: boolean;

  /**
   * Manually trigger a refetch
   */
  refetch: () => Promise<void>;

  /**
   * Manually update the cached data
   */
  mutate: (data: T | ((prev: T | undefined) => T)) => void;
}

// Global cache storage
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalCache = new Map<string, CacheEntry<any>>();
const subscribers = new Map<string, Set<() => void>>();

/**
 * Custom hook for fetching and caching data with automatic revalidation
 * Similar to SWR but lightweight and tailored for this project
 *
 * @param key Unique key for this cache entry
 * @param fetcher Async function that returns the data
 * @param options Configuration options
 *
 * @example
 * ```tsx
 * const { data, isLoading, refetch } = useCachedData(
 *   'products',
 *   async () => {
 *     const res = await fetch('/api/products');
 *     return res.json();
 *   },
 *   { staleTime: 5 * 60 * 1000 }
 * );
 * ```
 */
export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCachedDataOptions<T> = {}
): UseCachedDataReturn<T> {
  const {
    staleTime = 5 * 60 * 1000, // 5 minutes
    cacheTime = 10 * 60 * 1000, // 10 minutes
    refetchOnFocus = true,
    refetchOnReconnect = true,
    initialData,
    isDataValid,
    onSuccess,
    onError,
    enabled = true,
  } = options;

  const [data, setData] = useState<T | undefined>(() => {
    const cached = globalCache.get(key);
    return cached?.data ?? initialData;
  });

  const [isLoading, setIsLoading] = useState(!data && enabled);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const isMounted = useRef(true);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const fetchData = useCallback(
    async (isBackground = false) => {
      if (!enabled) return;

      try {
        if (!isBackground) {
          setIsLoading(true);
        } else {
          setIsValidating(true);
        }
        setIsError(false);
        setError(null);

        const result = await fetcher();

        if (!isMounted.current) return;

        // Validate data if validator provided
        if (isDataValid && !isDataValid(result)) {
          throw new Error("Invalid data received");
        }

        // Update cache
        globalCache.set(key, {
          data: result,
          timestamp: Date.now(),
        });

        setData(result);
        onSuccess?.(result);

        // Notify subscribers
        const subs = subscribers.get(key);
        if (subs) {
          subs.forEach((cb) => cb());
        }

        // Schedule cache cleanup
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current);
        }
        fetchTimeoutRef.current = setTimeout(() => {
          globalCache.delete(key);
        }, cacheTime);
      } catch (err) {
        if (!isMounted.current) return;

        const errorObj = err instanceof Error ? err : new Error(String(err));
        setIsError(true);
        setError(errorObj);
        onError?.(errorObj);

        globalCache.set(key, {
          data: data as T,
          timestamp: Date.now(),
          error: errorObj,
        });
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
          setIsValidating(false);
        }
      }
    },
    [key, fetcher, enabled, isDataValid, onSuccess, onError, data, cacheTime]
  );

  const refetch = useCallback(async () => {
    await fetchData(false);
  }, [fetchData]);

  const mutate = useCallback(
    (newData: T | ((prev: T | undefined) => T)) => {
      const updatedData = typeof newData === "function" ? (newData as (prev: T | undefined) => T)(data) : newData;

      setData(updatedData);
      globalCache.set(key, {
        data: updatedData,
        timestamp: Date.now(),
      });

      // Notify subscribers
      const subs = subscribers.get(key);
      if (subs) {
        subs.forEach((cb) => cb());
      }
    },
    [key, data]
  );

  // Initial fetch or when cache is stale
  useEffect(() => {
    if (!enabled) return;

    const cached = globalCache.get(key);
    const isStale =
      !cached || Date.now() - cached.timestamp > staleTime || cached.error;

    if (!cached || isStale) {
      fetchData(!!cached);
    } else {
      setData(cached.data);
    }

    // Subscribe to cache updates
    if (!subscribers.has(key)) {
      subscribers.set(key, new Set());
    }
    const subs = subscribers.get(key)!;
    const updateData = () => {
      const latest = globalCache.get(key);
      if (latest && isMounted.current) {
        setData(latest.data);
      }
    };
    subs.add(updateData);

    return () => {
      subs.delete(updateData);
      if (subs.size === 0) {
        subscribers.delete(key);
      }
    };
  }, [key, enabled, staleTime, fetchData]);

  // Refetch on window focus
  useEffect(() => {
    if (!refetchOnFocus || !enabled) return;

    const handleFocus = () => {
      const cached = globalCache.get(key);
      if (cached && Date.now() - cached.timestamp > staleTime) {
        fetchData(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [key, refetchOnFocus, enabled, staleTime, fetchData]);

  // Refetch on reconnect
  useEffect(() => {
    if (!refetchOnReconnect || !enabled) return;

    const handleOnline = () => {
      fetchData(true);
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [refetchOnReconnect, enabled, fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  return {
    data,
    isLoading,
    isError,
    error,
    isValidating,
    refetch,
    mutate,
  };
}

/**
 * Clear a specific cache entry or all cache
 * @param key Optional key to clear. If not provided, clears all cache.
 */
export function clearCache(key?: string): void {
  if (key) {
    globalCache.delete(key);
    // Notify subscribers that data is now invalid
    const subs = subscribers.get(key);
    if (subs) {
      subs.forEach((cb) => cb());
    }
  } else {
    globalCache.clear();
    // Notify all subscribers
    subscribers.forEach((subs) => {
      subs.forEach((cb) => cb());
    });
  }
}

/**
 * Get current cache size and keys
 */
export function getCacheInfo(): { size: number; keys: string[] } {
  return {
    size: globalCache.size,
    keys: Array.from(globalCache.keys()),
  };
}

/**
 * Prefetch data and store in cache
 * Useful for optimistic UI updates
 */
export async function prefetchData<T>(
  key: string,
  fetcher: () => Promise<T>
): Promise<void> {
  try {
    const data = await fetcher();
    globalCache.set(key, {
      data,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error(`Prefetch failed for key: ${key}`, err);
  }
}
