/**
 * Unit test for the KPI cache pattern used in AnalyticsBIModule.
 * Tests the module-level cache with TTL logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Replicate cache logic (module-private in AnalyticsBIModule) ──────────────
let _kpiCache: { data: Record<string, unknown>; ts: number } | null = null;
const KPI_CACHE_TTL = 60_000; // 1 minute

async function fetchKpisV2(): Promise<Record<string, unknown>> {
  if (_kpiCache && Date.now() - _kpiCache.ts < KPI_CACHE_TTL) return _kpiCache.data;
  try {
    const res = await fetch("/api/analytics/kpis-v2", { credentials: "include" });
    if (!res.ok) return _kpiCache?.data ?? {};
    const data = await res.json();
    _kpiCache = { data, ts: Date.now() };
    return data;
  } catch {
    return _kpiCache?.data ?? {};
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("fetchKpisV2 cache", () => {
  const mockKpis = { ventasMes: 5000, margenPromedio: 22.5, clientesHoy: 12 };

  beforeEach(() => {
    _kpiCache = null;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should fetch fresh data on first call", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockKpis),
    });

    const result = await fetchKpisV2();

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/analytics/kpis-v2", { credentials: "include" });
    expect(result).toEqual(mockKpis);
  });

  it("should return cached data on second call within TTL", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockKpis),
    });

    await fetchKpisV2();
    const result = await fetchKpisV2();

    expect(fetch).toHaveBeenCalledOnce(); // only 1 fetch, not 2
    expect(result).toEqual(mockKpis);
  });

  it("should refetch after TTL expires", async () => {
    vi.useFakeTimers();

    const freshKpis = { ...mockKpis, ventasMes: 6000 };

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockKpis) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(freshKpis) });

    await fetchKpisV2();
    expect(fetch).toHaveBeenCalledTimes(1);

    // Advance past TTL
    vi.advanceTimersByTime(61_000);

    const result = await fetchKpisV2();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual(freshKpis);
  });

  it("should return stale cache when fetch fails", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockKpis) });

    await fetchKpisV2();

    // Expire cache and make next fetch fail
    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);

    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchKpisV2();
    expect(result).toEqual(mockKpis); // stale cache returned
  });

  it("should return stale cache when response is not ok", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockKpis) });

    await fetchKpisV2();

    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });

    const result = await fetchKpisV2();
    expect(result).toEqual(mockKpis); // stale cache
  });

  it("should return empty object when fetch fails with no cache", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchKpisV2();
    expect(result).toEqual({});
  });
});
