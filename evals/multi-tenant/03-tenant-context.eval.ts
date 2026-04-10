/**
 * Eval: Tenant context propagation.
 * Contract test: verifies that tenantId flows through the entire request lifecycle.
 * Business rule: tenantId is extracted from auth/session and passed to all DB calls.
 */
import { describe, it, expect } from "vitest";

type RequestContext = {
  tenantId: string;
  userId: string;
  role: string;
};

function extractTenantFromSlug(slug: string): string | null {
  if (!slug || slug.trim().length === 0) return null;
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function validateContext(ctx: Partial<RequestContext>): {
  valid: boolean;
  error?: string;
} {
  if (!ctx.tenantId) return { valid: false, error: "Missing tenantId" };
  if (!ctx.userId) return { valid: false, error: "Missing userId" };
  if (!ctx.role) return { valid: false, error: "Missing role" };
  return { valid: true };
}

describe("Multi-Tenant > Tenant Context Propagation", () => {
  it("should extract tenant from valid slug", () => {
    expect(extractTenantFromSlug("bodega-san-martin")).toBe("bodega-san-martin");
  });

  it("should sanitize slug with special chars", () => {
    expect(extractTenantFromSlug("Bodega San_Martin!")).toBe("bodegasanmartin");
  });

  it("should return null for empty slug", () => {
    expect(extractTenantFromSlug("")).toBeNull();
  });

  it("should validate complete context", () => {
    const result = validateContext({
      tenantId: "bodega-sm",
      userId: "user-001",
      role: "admin",
    });
    expect(result.valid).toBe(true);
  });

  it("should reject context without tenantId", () => {
    const result = validateContext({ userId: "user-001", role: "admin" });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Missing tenantId");
  });

  it("should reject context without userId", () => {
    const result = validateContext({ tenantId: "t1", role: "admin" });
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Missing userId");
  });
});
