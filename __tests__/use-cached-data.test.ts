import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useCachedData, clearCache, getCacheInfo, prefetchData } from "../hooks/use-cached-data";

describe("useCachedData", () => {
  beforeEach(() => {
    clearCache();
  });

  afterEach(() => {
    clearCache();
    vi.restoreAllMocks();
  });

  it("should fetch and cache data successfully", async () => {
    const mockFetcher = vi.fn(async () => ({ id: 1, name: "Test Product" }));

    const { result } = renderHook(() =>
      useCachedData("test-key", mockFetcher)
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({ id: 1, name: "Test Product" });
    expect(result.current.isError).toBe(false);
    expect(mockFetcher).toHaveBeenCalledTimes(1);
  });

  it("should use cached data on subsequent renders", async () => {
    const mockFetcher = vi.fn(async () => ({ id: 1, name: "Test Product" }));

    const { result: result1 } = renderHook(() =>
      useCachedData("test-key", mockFetcher)
    );

    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false);
    });

    // Second hook with same key
    const { result: result2 } = renderHook(() =>
      useCachedData("test-key", mockFetcher)
    );

    // Should not trigger loading and should use cached data
    expect(result2.current.isLoading).toBe(false);
    expect(result2.current.data).toEqual({ id: 1, name: "Test Product" });
    expect(mockFetcher).toHaveBeenCalledTimes(1); // Only called once
  });

  it("should handle errors correctly", async () => {
    const mockError = new Error("Fetch failed");
    const mockFetcher = vi.fn(async () => {
      throw mockError;
    });

    const { result } = renderHook(() =>
      useCachedData("error-key", mockFetcher)
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isError).toBe(true);
    expect(result.current.error).toEqual(mockError);
    expect(result.current.data).toBeUndefined();
  });

  it("should refetch when manually triggered", async () => {
    let callCount = 0;
    const mockFetcher = vi.fn(async () => ({ id: callCount++, name: "Product" }));

    const { result } = renderHook(() =>
      useCachedData("refetch-key", mockFetcher)
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({ id: 0, name: "Product" });

    // Trigger refetch
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.data).toEqual({ id: 1, name: "Product" });
    expect(mockFetcher).toHaveBeenCalledTimes(2);
  });

  it("should mutate cached data without refetching", async () => {
    const mockFetcher = vi.fn(async () => ({ id: 1, name: "Original" }));

    const { result } = renderHook(() =>
      useCachedData("mutate-key", mockFetcher)
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({ id: 1, name: "Original" });

    // Mutate data
    act(() => {
      result.current.mutate({ id: 1, name: "Updated" });
    });

    expect(result.current.data).toEqual({ id: 1, name: "Updated" });
    expect(mockFetcher).toHaveBeenCalledTimes(1); // No refetch
  });

  it("should respect staleTime option", async () => {
    const mockFetcher = vi.fn(async () => ({ id: 1, name: "Product" }));

    const { result: result1 } = renderHook(() =>
      useCachedData("stale-key", mockFetcher, { staleTime: 500 })
    );

    await waitFor(() => {
      expect(result1.current.isLoading).toBe(false);
    });

    const callsAfterFirst = mockFetcher.mock.calls.length;
    expect(callsAfterFirst).toBe(1);

    // Immediately render again -- data is fresh, so no refetch
    const { result: result2 } = renderHook(() =>
      useCachedData("stale-key", mockFetcher, { staleTime: 500 })
    );

    await waitFor(() => {
      expect(result2.current.isLoading).toBe(false);
    });
    // Should still be 1 call — data is within staleTime
    expect(mockFetcher).toHaveBeenCalledTimes(1);

    // Wait for staleTime to pass (use generous margin for CI/parallel runs)
    await new Promise(resolve => setTimeout(resolve, 700));

    renderHook(() =>
      useCachedData("stale-key", mockFetcher, { staleTime: 500 })
    );

    // Should trigger background revalidation
    await waitFor(() => {
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    }, { timeout: 3000 });
  });

  it("should use initialData when provided", () => {
    const mockFetcher = vi.fn(async () => ({ id: 1, name: "Fetched" }));
    const initialData = { id: 0, name: "Initial" };

    const { result } = renderHook(() =>
      useCachedData("initial-key", mockFetcher, { initialData })
    );

    // Initial data should be available immediately
    expect(result.current.data).toEqual(initialData);
    expect(result.current.isLoading).toBe(true); // Still fetching
  });

  it("should not fetch when enabled is false", async () => {
    const mockFetcher = vi.fn(async () => ({ id: 1, name: "Product" }));

    const { result } = renderHook(() =>
      useCachedData("disabled-key", mockFetcher, { enabled: false })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetcher).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it("should call onSuccess callback", async () => {
    const mockFetcher = vi.fn(async () => ({ id: 1, name: "Product" }));
    const onSuccess = vi.fn();

    renderHook(() =>
      useCachedData("success-key", mockFetcher, { onSuccess })
    );

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith({ id: 1, name: "Product" });
    });
  });

  it("should call onError callback", async () => {
    const mockError = new Error("Fetch failed");
    const mockFetcher = vi.fn(async () => {
      throw mockError;
    });
    const onError = vi.fn();

    renderHook(() =>
      useCachedData("error-callback-key", mockFetcher, { onError })
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(mockError);
    });
  });
});

describe("clearCache", () => {
  beforeEach(() => {
    clearCache();
  });

  it("should clear specific cache entry", async () => {
    const mockFetcher = vi.fn(async () => ({ id: 1, name: "Product" }));

    await prefetchData("clear-test", mockFetcher);

    expect(getCacheInfo().size).toBe(1);
    expect(getCacheInfo().keys).toContain("clear-test");

    clearCache("clear-test");

    expect(getCacheInfo().size).toBe(0);
  });

  it("should clear all cache when no key provided", async () => {
    await prefetchData("key1", async () => ({ id: 1 }));
    await prefetchData("key2", async () => ({ id: 2 }));

    expect(getCacheInfo().size).toBe(2);

    clearCache();

    expect(getCacheInfo().size).toBe(0);
  });
});

describe("getCacheInfo", () => {
  beforeEach(() => {
    clearCache();
  });

  it("should return cache size and keys", async () => {
    await prefetchData("key1", async () => ({ id: 1 }));
    await prefetchData("key2", async () => ({ id: 2 }));
    await prefetchData("key3", async () => ({ id: 3 }));

    const info = getCacheInfo();

    expect(info.size).toBe(3);
    expect(info.keys).toEqual(["key1", "key2", "key3"]);
  });

  it("should return empty info when cache is empty", () => {
    const info = getCacheInfo();

    expect(info.size).toBe(0);
    expect(info.keys).toEqual([]);
  });
});

describe("prefetchData", () => {
  beforeEach(() => {
    clearCache();
  });

  it("should prefetch and cache data", async () => {
    const mockFetcher = vi.fn(async () => ({ id: 1, name: "Prefetched" }));

    await prefetchData("prefetch-key", mockFetcher);

    expect(mockFetcher).toHaveBeenCalledTimes(1);
    expect(getCacheInfo().keys).toContain("prefetch-key");

    // Hook should use prefetched data
    const { result } = renderHook(() =>
      useCachedData("prefetch-key", mockFetcher)
    );

    expect(result.current.data).toEqual({ id: 1, name: "Prefetched" });
    expect(mockFetcher).toHaveBeenCalledTimes(1); // No additional fetch
  });

  it("should handle prefetch errors gracefully", async () => {
    const mockFetcher = vi.fn(async () => {
      throw new Error("Prefetch failed");
    });

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await prefetchData("prefetch-error", mockFetcher);

    expect(getCacheInfo().keys).not.toContain("prefetch-error");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
