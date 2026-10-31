import { describe, it, expect } from "vitest";
import { monthPeriod } from "@/hooks/use-finance-aggregates";

describe("monthPeriod", () => {
  it("junio (month0=5) → 01 al 30", () => {
    expect(monthPeriod(2026, 5)).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });
  it("enero → 31 días", () => {
    expect(monthPeriod(2026, 0)).toEqual({ from: "2026-01-01", to: "2026-01-31" });
  });
  it("febrero no bisiesto → 28", () => {
    expect(monthPeriod(2026, 1)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("febrero bisiesto (2028) → 29", () => {
    expect(monthPeriod(2028, 1)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});
