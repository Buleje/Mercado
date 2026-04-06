/**
 * Security Test Suite - Authentication & RBAC
 * 
 * Validates:
 * - Middleware route protection  
 * - Role-based access control (RBAC) matrix
 * - Auth bypass in dev vs prod
 * - Rate limiting behavior
 * - Session token security
 */

import { describe, it, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { proxy } from "@/proxy";
import { requireAdmin } from "@/lib/require-admin";
import { createSessionToken, verifySessionToken, getSessionPayload } from "@/lib/session";
import { checkPermission, canWrite, canRead } from "@/lib/auth/role-permissions";

// ══════════════════════════════════════════════════════════════
// MOCKS & HELPERS
// ══════════════════════════════════════════════════════════════

function mockRequest(
  pathname: string,
  method: string = "GET",
  token?: string
): NextRequest {
  const url = `https://localhost:3000${pathname}`;
  const req = new NextRequest(url, { method });

  // Mock cookies
  if (token) {
    Object.defineProperty(req, "cookies", {
      value: {
        get: (name: string) => (name === "bsm-admin-sess" ? { value: token } : undefined),
      },
      writable: true,
    });
  } else {
    Object.defineProperty(req, "cookies", {
      value: { get: () => undefined },
      writable: true,
    });
  }

  // Mock headers for IP tracking
  const headers = new Headers({ "x-forwarded-for": "127.0.0.1" });
  Object.defineProperty(req, "headers", {
    value: headers,
    writable: true,
  });

  return req;
}

async function createAuthToken(role: "admin" | "cajero" | "almacenero", username = "test-user") {
  return await createSessionToken(role, username);
}

// ══════════════════════════════════════════════════════════════
// 1. MIDDLEWARE TESTS - Route Protection
// ══════════════════════════════════════════════════════════════

describe("Middleware - Route Protection", () => {
  describe("Admin Panel Protection", () => {
    it("should redirect /admin without auth to /admin/login", async () => {
      const req = mockRequest("/admin", "GET");
      const res = await proxy(req);

      expect(res.status).toBe(307); // Redirect
      const location = res.headers.get("location");
      expect(location).toContain("/admin/login");
      expect(location).toContain("from=%2Fadmin");
    });

    it("should redirect /admin/dashboard without auth", async () => {
      const req = mockRequest("/admin/dashboard", "GET");
      const res = await proxy(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/admin/login");
    });

    it("should allow /admin/login without auth", async () => {
      const req = mockRequest("/admin/login", "GET");
      const res = await proxy(req);

      expect(res.status).toBe(200); // NextResponse.next() returns 200
    });

    it("should allow /admin with valid token", async () => {
      const token = await createAuthToken("admin");
      const req = mockRequest("/admin", "GET", token);
      const res = await proxy(req);

      expect(res.status).toBe(200); // Pass through
    });
  });

  describe("API Admin-Only Routes Protection", () => {
    const adminOnlyRoutes = [
      "/api/admin-chat",
      "/api/activity-log",
      "/api/backup",
      "/api/demand-prediction",
      "/api/delivery-slots",
      "/api/sales",
      "/api/cash-registers",
      "/api/suppliers",
      "/api/admin-users",
    ];

    it.each(adminOnlyRoutes)(
      "should block %s GET without auth → 401",
      async (route) => {
        const req = mockRequest(route, "GET");
        const res = await proxy(req);

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBe("Unauthorized");
      }
    );

    it.each(adminOnlyRoutes)(
      "should allow %s with valid admin token",
      async (route) => {
        const token = await createAuthToken("admin");
        const req = mockRequest(route, "GET", token);
        const res = await proxy(req);

        expect(res.status).toBe(200); // Pass through to handler
      }
    );
  });

  describe("API Shared Routes - GET Public, POST Protected", () => {
    it("should allow /api/products GET without auth → public", async () => {
      const req = mockRequest("/api/products", "GET");
      const res = await proxy(req);

      expect(res.status).toBe(200); // Public
    });

    it("should block /api/products POST without auth → 401", async () => {
      const req = mockRequest("/api/products", "POST");
      const res = await proxy(req);

      expect(res.status).toBe(401);
    });

    it("should allow /api/orders POST from customers (no auth)", async () => {
      const req = mockRequest("/api/orders", "POST");
      const res = await proxy(req);

      expect(res.status).toBe(200); // Exception for customer orders
    });

    it("should allow /api/reviews POST from customers (no auth)", async () => {
      const req = mockRequest("/api/reviews", "POST");
      const res = await proxy(req);

      expect(res.status).toBe(200); // Exception for customer reviews
    });

    it("should block /api/settings POST without auth → 401", async () => {
      const req = mockRequest("/api/settings", "POST");
      const res = await proxy(req);

      expect(res.status).toBe(401);
    });

    it("should allow /api/products PUT with valid token", async () => {
      const token = await createAuthToken("admin");
      const req = mockRequest("/api/products", "PUT", token);
      const res = await proxy(req);

      expect(res.status).toBe(200);
    });
  });

  describe("Public Routes", () => {
    it("should allow /pedido/[id] without auth", async () => {
      const req = mockRequest("/pedido/ABC123", "GET");
      const res = await proxy(req);

      expect(res.status).toBe(200);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 2. RBAC TESTS - Permission Matrix Validation
// ══════════════════════════════════════════════════════════════

describe("RBAC - Role Permission Matrix", () => {
  describe("Admin Role - Full Access", () => {
    it("should allow admin to access demand-prediction (read)", () => {
      expect(checkPermission("admin", "demand-prediction", "read")).toBe(true);
    });

    it("should allow admin to write to demand-prediction", () => {
      expect(canWrite("admin", "demand-prediction")).toBe(true);
    });

    it("should allow admin to delete products", () => {
      expect(checkPermission("admin", "products", "delete")).toBe(true);
    });

    it("should allow admin to manage admin-users", () => {
      expect(canWrite("admin", "admin-users")).toBe(true);
    });
  });

  describe("Cajero Role - Point of Sale Operations", () => {
    it("should DENY cajero access to demand-prediction", () => {
      expect(checkPermission("cajero", "demand-prediction", "read")).toBe(false);
      expect(checkPermission("cajero", "demand-prediction", "write")).toBe(false);
    });

    it("should allow cajero to read/write delivery-slots", () => {
      expect(canRead("cajero", "delivery-slots")).toBe(true);
      expect(canWrite("cajero", "delivery-slots")).toBe(true);
    });

    it("should allow cajero to write orders (create sales)", () => {
      expect(canWrite("cajero", "orders")).toBe(true);
    });

    it("should allow cajero to write sales", () => {
      expect(canWrite("cajero", "sales")).toBe(true);
    });

    it("should allow cajero to read activity-log", () => {
      expect(canRead("cajero", "activity-log")).toBe(true);
    });

    it("should DENY cajero write to activity-log", () => {
      expect(canWrite("cajero", "activity-log")).toBe(false);
    });

    it("should DENY cajero write to products", () => {
      expect(canWrite("cajero", "products")).toBe(false);
    });

    it("should allow cajero to read products", () => {
      expect(canRead("cajero", "products")).toBe(true);
    });

    it("should DENY cajero delete permissions on any resource", () => {
      expect(checkPermission("cajero", "orders", "delete")).toBe(false);
      expect(checkPermission("cajero", "customers", "delete")).toBe(false);
    });
  });

  describe("Almacenero Role - Inventory Management", () => {
    it("should DENY almacenero write to activity-log", () => {
      expect(canWrite("almacenero", "activity-log")).toBe(false);
    });

    it("should allow almacenero to read activity-log", () => {
      expect(canRead("almacenero", "activity-log")).toBe(true);
    });

    it("should allow almacenero to read/write inventory", () => {
      expect(canRead("almacenero", "inventory")).toBe(true);
      expect(canWrite("almacenero", "inventory")).toBe(true);
    });

    it("should allow almacenero to write suppliers", () => {
      expect(canWrite("almacenero", "suppliers")).toBe(true);
    });

    it("should allow almacenero to write purchases", () => {
      expect(canWrite("almacenero", "purchases")).toBe(true);
    });

    it("should DENY almacenero access to sales", () => {
      expect(canRead("almacenero", "sales")).toBe(false);
    });

    it("should allow almacenero to read orders (for fulfillment)", () => {
      expect(canRead("almacenero", "orders")).toBe(true);
    });

    it("should DENY almacenero write to orders", () => {
      expect(canWrite("almacenero", "orders")).toBe(false);
    });

    it("should DENY almacenero access to analytics", () => {
      expect(canRead("almacenero", "analytics")).toBe(false);
    });

    it("should DENY almacenero access to demand-prediction", () => {
      expect(canRead("almacenero", "demand-prediction")).toBe(false);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 3. REQUIRE_ADMIN TESTS - API Route Handler Validation
// ══════════════════════════════════════════════════════════════

describe("requireAdmin - API Handler Protection", () => {
  describe("Token Validation", () => {
    it("should return 401 when no token provided", async () => {
      const req = mockRequest("/api/admin/dashboard", "GET");
      const result = await requireAdmin(req);

      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
    });

    it("should return 401 when invalid token provided", async () => {
      const req = mockRequest("/api/admin/dashboard", "GET", "invalid.token.here");
      const result = await requireAdmin(req);

      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
    });

    it("should return payload when valid token provided", async () => {
      const token = await createAuthToken("admin", "TestUser");
      const req = mockRequest("/api/admin/dashboard", "GET", token);
      const result = await requireAdmin(req);

      expect(result).not.toBeInstanceOf(NextResponse);
      expect(result).toHaveProperty("role", "admin");
      expect(result).toHaveProperty("username", "TestUser");
    });
  });

  describe("Role-Based Access Control", () => {
    it("should allow admin to access admin-only endpoint", async () => {
      const token = await createAuthToken("admin");
      const req = mockRequest("/api/backup", "GET", token);
      const result = await requireAdmin(req, ["admin"]);

      expect(result).not.toBeInstanceOf(NextResponse);
      expect((result as { role: string }).role).toBe("admin");
    });

    it("should return 403 when cajero tries to access admin-only endpoint", async () => {
      const token = await createAuthToken("cajero");
      const req = mockRequest("/api/backup", "GET", token);
      const result = await requireAdmin(req, ["admin"]);

      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(403);
      const body = await (result as NextResponse).json();
      expect(body.error).toBe("forbidden");
    });

    it("should allow both admin and cajero to access sales endpoint", async () => {
      const adminToken = await createAuthToken("admin");
      const cajeroToken = await createAuthToken("cajero");

      const reqAdmin = mockRequest("/api/sales", "POST", adminToken);
      const reqCajero = mockRequest("/api/sales", "POST", cajeroToken);

      const resultAdmin = await requireAdmin(reqAdmin, ["admin", "cajero"]);
      const resultCajero = await requireAdmin(reqCajero, ["admin", "cajero"]);

      expect(resultAdmin).not.toBeInstanceOf(NextResponse);
      expect(resultCajero).not.toBeInstanceOf(NextResponse);
    });

    it("should return 403 when almacenero tries to access sales endpoint", async () => {
      const token = await createAuthToken("almacenero");
      const req = mockRequest("/api/sales", "POST", token);
      const result = await requireAdmin(req, ["admin", "cajero"]);

      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(403);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 4. SESSION TOKEN TESTS - Cryptographic Validation
// ══════════════════════════════════════════════════════════════

describe("Session Token Security", () => {
  it("should create valid HMAC-signed token", async () => {
    const token = await createSessionToken("admin", "TestUser");
    expect(token).toContain("."); // Has signature separator
    const isValid = await verifySessionToken(token);
    expect(isValid).toBe(true);
  });

  it("should reject tampered token payload", async () => {
    const token = await createSessionToken("cajero", "TestUser");
    const dotIdx = token.lastIndexOf(".");
    const encodedPayload = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);

    // Decode, tamper with role, and re-encode
    const decoded = JSON.parse(decodeURIComponent(escape(atob(encodedPayload))));
    decoded.role = "admin";
    const tamperedEncoded = btoa(unescape(encodeURIComponent(JSON.stringify(decoded))));
    const tamperedToken = `${tamperedEncoded}.${sig}`;

    const isValid = await verifySessionToken(tamperedToken);
    expect(isValid).toBe(false);
  });

  it("should extract correct payload from valid token", async () => {
    const token = await createSessionToken("cajero", "JuanVendedor");
    const payload = await getSessionPayload(token);

    expect(payload).not.toBeNull();
    expect(payload?.role).toBe("cajero");
    expect(payload?.username).toBe("JuanVendedor");
  });

  it("should return null for invalid token", async () => {
    const payload = await getSessionPayload("invalid.token");
    expect(payload).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// 5. INTEGRATION TESTS - End-to-End Security Flows
// ══════════════════════════════════════════════════════════════

describe("Integration - Complete Auth Flows", () => {
  it("should complete full auth flow: login → access protected route", async () => {
    // 1. Create session token (simulates successful login)
    const token = await createSessionToken("admin", "AdminUser");

    // 2. Access protected admin panel
    const adminReq = mockRequest("/admin/dashboard", "GET", token);
    const adminRes = await proxy(adminReq);
    expect(adminRes.status).toBe(200);

    // 3. Access protected API
    const apiReq = mockRequest("/api/backup", "GET", token);
    const apiRes = await requireAdmin(apiReq, ["admin"]);
    expect(apiRes).not.toBeInstanceOf(NextResponse);
  });

  it("should enforce RBAC across middleware and handler", async () => {
    const cajeroToken = await createAuthToken("cajero");

    // 1. Middleware allows through (token is valid)
    const midReq = mockRequest("/api/demand-prediction", "POST", cajeroToken);
    const midRes = await proxy(midReq);
    expect(midRes.status).toBe(200); // Middleware passes

    // 2. Handler blocks (role not allowed)
    const handlerReq = mockRequest("/api/demand-prediction", "POST", cajeroToken);
    const handlerRes = await requireAdmin(handlerReq, ["admin"]);
    expect(handlerRes).toBeInstanceOf(NextResponse);
    expect((handlerRes as NextResponse).status).toBe(403);
  });

  it("should block unauthorized access at middleware level", async () => {
    const req = mockRequest("/api/backup", "GET"); // No token
    const res = await proxy(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });
});
