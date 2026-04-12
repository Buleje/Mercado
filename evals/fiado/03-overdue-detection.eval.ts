/**
 * Eval: Overdue fiado detection.
 * Contract test based on checkOverdue logic in installment-manager.ts.
 * Business rule: active plans past nextDueDate become overdue.
 * Overdue plans past 60 days become defaulted.
 */
import { describe, it, expect } from "vitest";

type PlanStatus = "active" | "paid" | "overdue" | "defaulted";

type Plan = {
  id: string;
  status: PlanStatus;
  nextDueDate: Date;
};

function detectOverdue(plans: Plan[], now: Date): Plan[] {
  const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
  return plans.map((plan) => {
    if (plan.status === "paid" || plan.status === "defaulted") return plan;
    if (plan.status === "overdue" && now.getTime() - plan.nextDueDate.getTime() > SIXTY_DAYS_MS) {
      return { ...plan, status: "defaulted" as PlanStatus };
    }
    if (plan.status === "active" && now > plan.nextDueDate) {
      return { ...plan, status: "overdue" as PlanStatus };
    }
    return plan;
  });
}

describe("Fiado > Overdue Detection", () => {
  const now = new Date("2026-04-09T12:00:00Z");

  it("should mark active plan past due as overdue", () => {
    const plans: Plan[] = [
      { id: "p1", status: "active", nextDueDate: new Date("2026-04-01") },
    ];
    const result = detectOverdue(plans, now);
    expect(result[0].status).toBe("overdue");
  });

  it("should keep active plan with future due date", () => {
    const plans: Plan[] = [
      { id: "p1", status: "active", nextDueDate: new Date("2026-05-01") },
    ];
    const result = detectOverdue(plans, now);
    expect(result[0].status).toBe("active");
  });

  it("should mark overdue plan past 60 days as defaulted", () => {
    const plans: Plan[] = [
      { id: "p1", status: "overdue", nextDueDate: new Date("2026-01-01") },
    ];
    const result = detectOverdue(plans, now);
    expect(result[0].status).toBe("defaulted");
  });

  it("should not change paid plans", () => {
    const plans: Plan[] = [
      { id: "p1", status: "paid", nextDueDate: new Date("2025-01-01") },
    ];
    const result = detectOverdue(plans, now);
    expect(result[0].status).toBe("paid");
  });
});
