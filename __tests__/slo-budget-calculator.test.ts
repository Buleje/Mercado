/**
 * lib/slo/__tests__/budget-calculator.test.ts
 *
 * Unit tests for the SLO budget calculator.
 * Ref: ADR-034 (SLOs Operational Contract)
 */

import { describe, it, expect } from "vitest";
import {
  calculateBudgetBurn,
  shouldBlockDeploy,
  formatStatusTable,
  loadSLOs,
  type BudgetStatus,
} from "../budget-calculator";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a mock BudgetStatus with a specific burn rate for testing.
 */
function makeBudgetStatus(
  sloName: string,
  burnRatePercent: number,
): BudgetStatus {
  const target = 0.995;
  const budgetTotal = 1 - target;
  const budgetBurned = (burnRatePercent / 100) * budgetTotal;
  let status: BudgetStatus["status"];
  if (burnRatePercent >= 100) status = "exhausted";
  else if (burnRatePercent >= 90) status = "critical";
  else if (burnRatePercent >= 50) status = "warning";
  else status = "healthy";

  return {
    sloName,
    target,
    current: target - budgetBurned,
    budgetTotal,
    budgetBurned,
    budgetRemaining: Math.max(0, budgetTotal - budgetBurned),
    burnRatePercent,
    daysRemaining: Math.max(0, Math.floor(30 * (1 - burnRatePercent / 100))),
    status,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("lib/slo/budget-calculator", () => {
  // ── Test 1: healthy SLO (10% burned) returns status "healthy" ──────────
  it("returns status 'healthy' when burn rate is 10%", () => {
    const result = calculateBudgetBurn("checkout_success_rate", undefined, 10);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("healthy");
    expect(result!.burnRatePercent).toBe(10);
    expect(result!.budgetRemaining).toBeGreaterThan(0);
  });

  // ── Test 2: warning SLO (60% burned) returns status "warning" ──────────
  it("returns status 'warning' when burn rate is 60%", () => {
    const result = calculateBudgetBurn("api_p99_latency", undefined, 60);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("warning");
    expect(result!.burnRatePercent).toBe(60);
  });

  // ── Test 3: critical SLO (92% burned) returns status "critical" ────────
  it("returns status 'critical' when burn rate is 92%", () => {
    const result = calculateBudgetBurn("boleta_sunat_success", undefined, 92);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("critical");
    expect(result!.burnRatePercent).toBe(92);
    expect(result!.daysRemaining).toBeLessThanOrEqual(3);
  });

  // ── Test 4: exhausted SLO (105% burned) returns status "exhausted" ─────
  it("returns status 'exhausted' when burn rate is 105%", () => {
    const result = calculateBudgetBurn("whatsapp_delivery", undefined, 105);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("exhausted");
    expect(result!.burnRatePercent).toBe(105);
    expect(result!.daysRemaining).toBe(0);
  });

  // ── Test 5: shouldBlockDeploy returns false when all healthy ────────────
  it("shouldBlockDeploy returns false when all SLOs are healthy", () => {
    const statuses: BudgetStatus[] = [
      makeBudgetStatus("checkout_success_rate", 10),
      makeBudgetStatus("api_p99_latency", 20),
      makeBudgetStatus("boleta_sunat_success", 30),
      makeBudgetStatus("whatsapp_delivery", 40),
    ];

    const result = shouldBlockDeploy(statuses);
    expect(result.blocked).toBe(false);
    expect(result.reason).toContain("within safe range");
    expect(result.slos).toHaveLength(4);
  });

  // ── Test 6: shouldBlockDeploy returns true when one critical ───────────
  it("shouldBlockDeploy returns true when one SLO is critical (>90% burned)", () => {
    const statuses: BudgetStatus[] = [
      makeBudgetStatus("checkout_success_rate", 10),
      makeBudgetStatus("api_p99_latency", 95), // critical
      makeBudgetStatus("boleta_sunat_success", 30),
      makeBudgetStatus("whatsapp_delivery", 40),
    ];

    const result = shouldBlockDeploy(statuses);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain("api_p99_latency");
    expect(result.reason).toContain("95.0% burned");
  });

  // ── Test 7: formatStatusTable returns valid markdown ────────────────────
  it("formatStatusTable returns a valid markdown table", () => {
    const statuses: BudgetStatus[] = [
      makeBudgetStatus("checkout_success_rate", 10),
      makeBudgetStatus("api_p99_latency", 60),
    ];

    const table = formatStatusTable(statuses);

    // Must contain header row
    expect(table).toContain("| SLO |");
    expect(table).toContain("|-----|");

    // Must contain data rows
    expect(table).toContain("checkout_success_rate");
    expect(table).toContain("api_p99_latency");

    // Must contain status emojis
    expect(table).toContain("healthy");
    expect(table).toContain("warning");

    // Verify it's properly formatted markdown (pipes on each line)
    const lines = table.split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(4); // header + separator + 2 rows
    for (const line of lines) {
      expect(line.startsWith("|")).toBe(true);
      expect(line.endsWith("|")).toBe(true);
    }
  });

  // ── Test 8: calculateBudgetBurn handles missing SLO name gracefully ────
  it("calculateBudgetBurn returns null for unknown SLO name", () => {
    const result = calculateBudgetBurn("nonexistent_slo");
    expect(result).toBeNull();
  });

  // ── Bonus: loadSLOs returns all 4 defined SLOs ─────────────────────────
  it("loadSLOs returns all 4 SLO definitions", () => {
    const slos = loadSLOs();
    expect(slos).toHaveLength(4);
    const names = slos.map((s) => s.name);
    expect(names).toContain("checkout_success_rate");
    expect(names).toContain("api_p99_latency");
    expect(names).toContain("boleta_sunat_success");
    expect(names).toContain("whatsapp_delivery");
  });
});
