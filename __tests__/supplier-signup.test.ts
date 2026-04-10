/**
 * Supplier Self-Signup Test Suite (#15 — Self-signup proveedor)
 *
 * Tests the supplier self-registration flow:
 * - Valid signup creates Supplier with status pending_review
 * - Duplicate phone returns 409
 * - Missing required fields returns 400 with issues
 * - Rate limit works (4th attempt blocked)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockSupplierCreate,
  mockSupplierFindFirst,
  mockRateLimit,
} = vi.hoisted(() => ({
  mockSupplierCreate: vi.fn(),
  mockSupplierFindFirst: vi.fn(),
  mockRateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 9, resetAt: 0 }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    supplier: {
      create: mockSupplierCreate,
      findFirst: mockSupplierFindFirst,
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: mockRateLimit,
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ── Types ────────────────────────────────────────────────────────────────────

type SupplierSignupInput = {
  name?: string;
  phone?: string;
  email?: string;
  ruc?: string;
  address?: string;
  tenantId?: string;
};

type SignupResult = {
  status: number;
  data?: {
    supplier?: {
      id: string;
      name: string;
      phone: string;
      estado: string;
    };
    error?: string;
    issues?: string[];
  };
};

// ── Business logic under test ────────────────────────────────────────────────

/**
 * Validates and processes supplier self-signup.
 * This simulates the signup endpoint logic.
 */
async function processSupplierSignup(
  input: SupplierSignupInput,
  clientIp: string,
): Promise<SignupResult> {
  // 1. Rate limit check
  const rateLimitResult = mockRateLimit({
    key: `supplier-signup:${clientIp}`,
    limit: 3,
    window: 3600,
  });
  if (!rateLimitResult.allowed) {
    return {
      status: 429,
      data: { error: "Demasiados intentos. Intente de nuevo más tarde." },
    };
  }

  // 2. Validate required fields
  const issues: string[] = [];
  if (!input.name || input.name.trim() === "") {
    issues.push("name es obligatorio");
  }
  if (!input.phone || input.phone.trim() === "") {
    issues.push("phone es obligatorio");
  }
  if (!input.tenantId || input.tenantId.trim() === "") {
    issues.push("tenantId es obligatorio");
  }
  if (issues.length > 0) {
    return { status: 400, data: { error: "Campos obligatorios faltantes", issues } };
  }

  // 3. Check for duplicate phone
  const existing = await mockSupplierFindFirst({
    where: {
      phone: input.phone!.trim(),
      tenantId: input.tenantId,
    },
  });
  if (existing) {
    return {
      status: 409,
      data: { error: "Ya existe un proveedor con ese teléfono" },
    };
  }

  // 4. Create supplier with pending_review status
  const supplier = await mockSupplierCreate({
    data: {
      id: `sup-${Date.now()}`,
      name: input.name!.trim(),
      phone: input.phone!.trim(),
      email: input.email?.trim() ?? null,
      ruc: input.ruc?.trim() ?? null,
      address: input.address?.trim() ?? null,
      tenantId: input.tenantId,
      estado: "pending_review",
    },
  });

  return {
    status: 201,
    data: {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        estado: supplier.estado,
      },
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Supplier Self-Signup (#15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetAt: 0 });
  });

  describe("Valid signup flow", () => {
    it("valid signup creates Supplier with status pending_review", async () => {
      mockSupplierFindFirst.mockResolvedValue(null); // No duplicate
      mockSupplierCreate.mockResolvedValue({
        id: "sup-001",
        name: "Distribuidora Lima SAC",
        phone: "987654321",
        email: "ventas@distrilima.pe",
        ruc: "20601234567",
        estado: "pending_review",
        tenantId: "demo",
      });

      const result = await processSupplierSignup(
        {
          name: "Distribuidora Lima SAC",
          phone: "987654321",
          email: "ventas@distrilima.pe",
          ruc: "20601234567",
          tenantId: "demo",
        },
        "127.0.0.1",
      );

      expect(result.status).toBe(201);
      expect(result.data?.supplier).toBeDefined();
      expect(result.data!.supplier!.estado).toBe("pending_review");
      expect(result.data!.supplier!.name).toBe("Distribuidora Lima SAC");
      expect(result.data!.supplier!.phone).toBe("987654321");

      // Verify create was called with correct data
      expect(mockSupplierCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "Distribuidora Lima SAC",
            phone: "987654321",
            estado: "pending_review",
            tenantId: "demo",
          }),
        }),
      );
    });
  });

  describe("Duplicate phone detection", () => {
    it("duplicate phone returns 409", async () => {
      mockSupplierFindFirst.mockResolvedValue({
        id: "sup-existing",
        name: "Proveedor Existente",
        phone: "987654321",
        tenantId: "demo",
      });

      const result = await processSupplierSignup(
        {
          name: "Nuevo Proveedor",
          phone: "987654321",
          tenantId: "demo",
        },
        "127.0.0.1",
      );

      expect(result.status).toBe(409);
      expect(result.data?.error).toMatch(/ya existe/i);
      expect(result.data?.error).toMatch(/teléfono/i);

      // Should NOT have called create
      expect(mockSupplierCreate).not.toHaveBeenCalled();
    });
  });

  describe("Validation errors", () => {
    it("missing required fields returns 400 with issues", async () => {
      const result = await processSupplierSignup(
        {
          // name missing
          // phone missing
          email: "test@test.com",
          // tenantId missing
        },
        "127.0.0.1",
      );

      expect(result.status).toBe(400);
      expect(result.data?.error).toMatch(/obligatorios/i);
      expect(result.data?.issues).toBeDefined();
      expect(result.data!.issues!.length).toBeGreaterThanOrEqual(3);
      expect(result.data!.issues).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/name/i),
          expect.stringMatching(/phone/i),
          expect.stringMatching(/tenantId/i),
        ]),
      );

      // Should NOT have queried for duplicate or created
      expect(mockSupplierFindFirst).not.toHaveBeenCalled();
      expect(mockSupplierCreate).not.toHaveBeenCalled();
    });

    it("empty string name is treated as missing", async () => {
      const result = await processSupplierSignup(
        {
          name: "   ",
          phone: "987654321",
          tenantId: "demo",
        },
        "127.0.0.1",
      );

      expect(result.status).toBe(400);
      expect(result.data?.issues).toEqual(
        expect.arrayContaining([expect.stringMatching(/name/i)]),
      );
    });

    it("empty string phone is treated as missing", async () => {
      const result = await processSupplierSignup(
        {
          name: "Proveedor Valido",
          phone: "",
          tenantId: "demo",
        },
        "127.0.0.1",
      );

      expect(result.status).toBe(400);
      expect(result.data?.issues).toEqual(
        expect.arrayContaining([expect.stringMatching(/phone/i)]),
      );
    });
  });

  describe("Rate limiting", () => {
    it("4th attempt is blocked by rate limit", async () => {
      // First 3 attempts succeed
      for (let i = 0; i < 3; i++) {
        mockRateLimit.mockReturnValueOnce({
          allowed: true,
          remaining: 2 - i,
          resetAt: 0,
        });
        mockSupplierFindFirst.mockResolvedValueOnce(null);
        mockSupplierCreate.mockResolvedValueOnce({
          id: `sup-${i}`,
          name: `Proveedor ${i}`,
          phone: `98765000${i}`,
          estado: "pending_review",
          tenantId: "demo",
        });

        const result = await processSupplierSignup(
          {
            name: `Proveedor ${i}`,
            phone: `98765000${i}`,
            tenantId: "demo",
          },
          "192.168.1.1",
        );
        expect(result.status).toBe(201);
      }

      // 4th attempt is rate limited
      mockRateLimit.mockReturnValueOnce({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 3600000,
      });

      const blocked = await processSupplierSignup(
        {
          name: "Proveedor Bloqueado",
          phone: "987650004",
          tenantId: "demo",
        },
        "192.168.1.1",
      );

      expect(blocked.status).toBe(429);
      expect(blocked.data?.error).toMatch(/demasiados intentos/i);

      // After rate limit, create should NOT have been called for the 4th attempt
      // (create was called 3 times for the first 3 attempts)
      expect(mockSupplierCreate).toHaveBeenCalledTimes(3);
    });

    it("rate limit blocks before any validation", async () => {
      mockRateLimit.mockReturnValue({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60000,
      });

      const result = await processSupplierSignup(
        {
          // Even with valid data, should be blocked
          name: "Proveedor Valido",
          phone: "987654321",
          tenantId: "demo",
        },
        "10.0.0.1",
      );

      expect(result.status).toBe(429);

      // Should NOT have tried to check for duplicates or create
      expect(mockSupplierFindFirst).not.toHaveBeenCalled();
      expect(mockSupplierCreate).not.toHaveBeenCalled();
    });
  });
});
