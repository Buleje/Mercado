import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("ai-usage-tracker", () => {
  let checkTokenBudget: typeof import("@/lib/ai-usage-tracker").checkTokenBudget;
  let recordTokenUsage: typeof import("@/lib/ai-usage-tracker").recordTokenUsage;
  let getUsageSummary: typeof import("@/lib/ai-usage-tracker").getUsageSummary;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("@/lib/ai-usage-tracker");
    checkTokenBudget = mod.checkTokenBudget;
    recordTokenUsage = mod.recordTokenUsage;
    getUsageSummary = mod.getUsageSummary;
  });

  it("allows requests when no tokens used", () => {
    const result = checkTokenBudget("tenant-1");
    expect(result.allowed).toBe(true);
    expect(result.currentTokens).toBe(0);
    expect(result.percentUsed).toBe(0);
    expect(result.remainingTokens).toBe(500_000);
  });

  it("records token usage and tracks cumulative total", () => {
    recordTokenUsage("tenant-1", 1000);
    recordTokenUsage("tenant-1", 2000);

    const summary = getUsageSummary("tenant-1");
    expect(summary.tokensUsed).toBe(3000);
    expect(summary.requestCount).toBe(2);
  });

  it("warns at 80% usage (warning threshold)", () => {
    recordTokenUsage("tenant-1", 400_000); // 80% of 500K

    const result = checkTokenBudget("tenant-1");
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeDefined();
    expect(result.percentUsed).toBe(80);
  });

  it("blocks at 100% usage", () => {
    recordTokenUsage("tenant-1", 500_000);

    const result = checkTokenBudget("tenant-1");
    expect(result.allowed).toBe(false);
    expect(result.warning).toBeDefined();
    expect(result.remainingTokens).toBe(0);
    expect(result.percentUsed).toBe(100);
  });

  it("supports custom limits", () => {
    recordTokenUsage("tenant-1", 900);
    const result = checkTokenBudget("tenant-1", 1000);
    expect(result.allowed).toBe(true);
    expect(result.percentUsed).toBe(90);
    expect(result.warning).toBeDefined(); // > 80%
  });

  it("isolates tenants (different limits per tenant)", () => {
    recordTokenUsage("tenant-a", 10_000);
    recordTokenUsage("tenant-b", 200_000);

    const resultA = checkTokenBudget("tenant-a");
    const resultB = checkTokenBudget("tenant-b");

    expect(resultA.currentTokens).toBe(10_000);
    expect(resultB.currentTokens).toBe(200_000);
    expect(resultA.allowed).toBe(true);
    expect(resultB.allowed).toBe(true);
  });

  it("does not warn below 80% threshold", () => {
    recordTokenUsage("tenant-1", 300_000); // 60%

    const result = checkTokenBudget("tenant-1");
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("summary includes month key and limit", () => {
    recordTokenUsage("tenant-1", 5000);

    const summary = getUsageSummary("tenant-1");
    const now = new Date();
    const expectedKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    expect(summary.monthKey).toBe(expectedKey);
    expect(summary.limit).toBe(500_000);
    expect(summary.remaining).toBe(495_000);
    expect(summary.percentUsed).toBe(1);
  });
});
