import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  trackQuery,
  getDetectedPatterns,
  resetQueryMonitor,
} from "@/lib/query-monitor";

// Mock the logger module
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from "@/lib/logger";
const mockWarn = logger.warn as ReturnType<typeof vi.fn>;

describe("N+1 Query Monitor", () => {
  beforeEach(() => {
    resetQueryMonitor();
    mockWarn.mockClear();
    vi.stubEnv("NODE_ENV", "development");
    // El monitor es opt-in (Brandon 2026-05-31): por defecto OFF para no leer
    // Date.now() durante el render de Server Components (Next 16 cacheComponents).
    vi.stubEnv("QUERY_MONITOR", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("tracks a query without warning when called once", () => {
    trackQuery("Product", "findMany", ["tenantId"]);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("does not warn at 2 calls (below threshold)", () => {
    trackQuery("Product", "findMany", ["tenantId"]);
    trackQuery("Product", "findMany", ["tenantId"]);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("warns at 3 calls (threshold reached)", () => {
    trackQuery("Order", "findUnique", ["id"]);
    trackQuery("Order", "findUnique", ["id"]);
    trackQuery("Order", "findUnique", ["id"]);

    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0][0]).toContain("N+1");
    expect(mockWarn.mock.calls[0][0]).toContain("Order");
  });

  it("detects multiple patterns independently", () => {
    for (let i = 0; i < 3; i++) trackQuery("Product", "findMany", ["tenantId"]);
    for (let i = 0; i < 3; i++) trackQuery("Customer", "findFirst", ["email"]);

    expect(mockWarn).toHaveBeenCalledTimes(2);
  });

  it("getDetectedPatterns returns all warned patterns", () => {
    for (let i = 0; i < 3; i++) trackQuery("Batch", "findMany", ["productId"]);

    const patterns = getDetectedPatterns();
    expect(patterns.length).toBe(1);
    expect(patterns[0].pattern).toContain("Batch");
    expect(patterns[0].reported).toBe(true);
  });

  it("resetQueryMonitor clears all tracking data", () => {
    for (let i = 0; i < 3; i++) trackQuery("Order", "findMany", ["status"]);
    resetQueryMonitor();

    const patterns = getDetectedPatterns();
    expect(patterns).toHaveLength(0);
  });

  it("skips tracking in production mode", () => {
    vi.stubEnv("NODE_ENV", "production");

    for (let i = 0; i < 5; i++) trackQuery("Product", "findMany", ["tenantId"]);

    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("skips tracking unless QUERY_MONITOR=1 (opt-in, default off)", () => {
    // Default OFF: evita Date.now() en el render de Server Components, que con
    // Next 16 cacheComponents dispara next-prerender-current-time (lo destapó
    // /tiendas). Ver lib/query-monitor.ts.
    vi.stubEnv("QUERY_MONITOR", "");

    for (let i = 0; i < 5; i++) trackQuery("Product", "findMany", ["tenantId"]);

    expect(mockWarn).not.toHaveBeenCalled();
    expect(getDetectedPatterns()).toHaveLength(0);
  });

  it("differentiates queries by operation type", () => {
    trackQuery("Product", "findMany", ["tenantId"]);
    trackQuery("Product", "findMany", ["tenantId"]);
    trackQuery("Product", "findUnique", ["id"]); // different op
    trackQuery("Product", "findMany", ["tenantId"]); // 3rd findMany → warn

    expect(mockWarn).toHaveBeenCalledTimes(1);
  });
});
