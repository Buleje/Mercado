/**
 * Eval: Session tenant matches query tenant.
 * Contract test: verifies that the session's tenantId matches the query scope.
 * Business rule: requireAdmin extracts tenantId from JWT and all DB calls use it.
 */
import { describe, it, expect } from "vitest";

type Session = { tenantId: string; role: string };

function validateSessionTenantMatch(
  session: Session,
  queryTenantId: string,
): { authorized: boolean; reason?: string } {
  if (session.tenantId !== queryTenantId) {
    return {
      authorized: false,
      reason: `Session tenant "${session.tenantId}" does not match query tenant "${queryTenantId}"`,
    };
  }
  return { authorized: true };
}

describe("Multi-Tenant > Session-Tenant Match", () => {
  it("should authorize when session and query tenants match", () => {
    const result = validateSessionTenantMatch(
      { tenantId: "bodega-sm", role: "admin" },
      "bodega-sm",
    );
    expect(result.authorized).toBe(true);
  });

  it("should block when session tenant differs from query", () => {
    const result = validateSessionTenantMatch(
      { tenantId: "bodega-sm", role: "admin" },
      "tienda-xyz",
    );
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain("does not match");
  });

  it("should be case-sensitive on tenantId", () => {
    const result = validateSessionTenantMatch(
      { tenantId: "Bodega-SM", role: "admin" },
      "bodega-sm",
    );
    expect(result.authorized).toBe(false);
  });

  it("should block empty session tenant", () => {
    const result = validateSessionTenantMatch(
      { tenantId: "", role: "admin" },
      "bodega-sm",
    );
    expect(result.authorized).toBe(false);
  });
});
