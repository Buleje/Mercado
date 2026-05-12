/**
 * __tests__/whatsapp/payment-approval.db.test.ts
 *
 * Unit tests para lib/db/payment-approval.db.ts
 * Mockea prisma para no tocar base de datos real.
 * Cada test verifica la lógica de negocio del módulo (delta, status, CRUD).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Prisma raw unsafe — usamos un mock compartido para $executeRawUnsafe y
// $queryRawUnsafe (ambas son las únicas que usa payment-approval.db.ts).
const mockExecuteRaw = vi.fn().mockResolvedValue(1);
const mockQueryRaw = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRaw(...args),
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { PaymentApprovalDb } from "@/lib/db/payment-approval.db";

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeApprovalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pap_test_001",
    conversationId: "conv-abc-123",
    customerPhone: "51987654321",
    expectedAmount: "100.00",
    detectedAmount: null,
    imageUrl: "https://cdn.example.com/yape.jpg",
    visionResponse: null,
    yapeOpCode: null,
    yapeLast4: null,
    yapeDate: null,
    status: "pending",
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date("2026-05-02T10:00:00.000Z"),
    updatedAt: new Date("2026-05-02T10:00:00.000Z"),
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe("PaymentApprovalDb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Bootstrap siempre OK
    mockExecuteRaw.mockResolvedValue(1);
  });

  // ── getById ─────────────────────────────────────────────────────────────────

  describe("getById", () => {
    it("retorna null cuando no existe el registro", async () => {
      mockQueryRaw.mockResolvedValue([]);
      const result = await PaymentApprovalDb.getById("pap_nonexistent");
      expect(result).toBeNull();
    });

    it("retorna PaymentApproval mapeado cuando existe", async () => {
      const row = makeApprovalRow({ status: "pending" });
      mockQueryRaw.mockResolvedValue([row]);

      const result = await PaymentApprovalDb.getById("pap_test_001");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("pap_test_001");
      expect(result!.expectedAmount).toBe(100.0);
      expect(result!.status).toBe("pending");
      expect(result!.detectedAmount).toBeNull();
    });
  });

  // ── findByPhonePending ───────────────────────────────────────────────────────

  describe("findByPhonePending", () => {
    it("retorna null cuando no hay approval pending para el phone", async () => {
      mockQueryRaw.mockResolvedValue([]);
      const result = await PaymentApprovalDb.findByPhonePending("51999000111", "tenant-test");
      expect(result).toBeNull();
    });

    it("retorna la approval pending más reciente del phone", async () => {
      const row = makeApprovalRow({ customerPhone: "51987654321", status: "pending" });
      mockQueryRaw.mockResolvedValue([row]);

      const result = await PaymentApprovalDb.findByPhonePending("51987654321", "tenant-test");

      expect(result).not.toBeNull();
      expect(result!.customerPhone).toBe("51987654321");
      expect(result!.status).toBe("pending");
    });
  });

  // ── setVisionResult ──────────────────────────────────────────────────────────

  describe("setVisionResult", () => {
    it("detectedAmount=null → status pasa a review_required con razón de IA", async () => {
      const row = makeApprovalRow({ expectedAmount: "50.00" });
      // Primera llamada: bootstrap (executeRaw)
      // queryRaw: getById en setVisionResult
      mockQueryRaw.mockResolvedValue([row]);

      await PaymentApprovalDb.setVisionResult("pap_test_001", {
        detectedAmount: null,
        yapeOpCode: null,
        yapeLast4: null,
        yapeDate: null,
        visionResponse: { ok: false, reason: "ilegible" },
      });

      // Debe llamar UPDATE con status = 'review_required'
      const updateCall = mockExecuteRaw.mock.calls.find(
        (call) =>
          typeof call[0] === "string" && call[0].includes("UPDATE"),
      );
      expect(updateCall).toBeDefined();
      // Arg $7 es el status (índice 7: id, detectedAmount, opCode, last4, date, response, status, reason)
      const statusArg = updateCall![7];
      expect(statusArg).toBe("review_required");
    });

    it("delta <5% (exacto) → status permanece pending", async () => {
      // expectedAmount=100, detectedAmount=104 → delta=4 → 4% < 5% → pending
      const row = makeApprovalRow({ expectedAmount: "100.00" });
      mockQueryRaw.mockResolvedValue([row]);

      await PaymentApprovalDb.setVisionResult("pap_test_001", {
        detectedAmount: 104.0,
        yapeOpCode: "123456",
        yapeLast4: "5678",
        yapeDate: new Date(),
        visionResponse: { ok: true },
      });

      const updateCall = mockExecuteRaw.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("UPDATE"),
      );
      expect(updateCall).toBeDefined();
      const statusArg = updateCall![7];
      expect(statusArg).toBe("pending");
    });

    it("delta >5% → status review_required con razón de diferencia", async () => {
      // expectedAmount=100, detectedAmount=110 → delta=10 → 10% > 5% → review_required
      const row = makeApprovalRow({ expectedAmount: "100.00" });
      mockQueryRaw.mockResolvedValue([row]);

      await PaymentApprovalDb.setVisionResult("pap_test_001", {
        detectedAmount: 110.0,
        yapeOpCode: "123456",
        yapeLast4: "5678",
        yapeDate: new Date(),
        visionResponse: { ok: true },
      });

      const updateCall = mockExecuteRaw.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("UPDATE"),
      );
      const statusArg = updateCall![7];
      const reasonArg = updateCall![8];
      expect(statusArg).toBe("review_required");
      expect(reasonArg).toContain("S/100.00");
      expect(reasonArg).toContain("S/110.00");
    });

    it("delta exactamente 5% → permanece pending (boundary — no supera)", async () => {
      // expectedAmount=100, detectedAmount=105 → delta=5 → pct=0.05 → NOT > 0.05 → pending
      const row = makeApprovalRow({ expectedAmount: "100.00" });
      mockQueryRaw.mockResolvedValue([row]);

      await PaymentApprovalDb.setVisionResult("pap_test_001", {
        detectedAmount: 105.0,
        yapeOpCode: "123456",
        yapeLast4: "1234",
        yapeDate: null,
        visionResponse: { ok: true },
      });

      const updateCall = mockExecuteRaw.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("UPDATE"),
      );
      const statusArg = updateCall![7];
      // pct = 0.05, condición es pct > 0.05 → false → pending
      expect(statusArg).toBe("pending");
    });

    it("si el id no existe → no ejecuta UPDATE (early return)", async () => {
      mockQueryRaw.mockResolvedValue([]); // getById devuelve null

      await PaymentApprovalDb.setVisionResult("pap_nonexistent", {
        detectedAmount: 50.0,
        yapeOpCode: null,
        yapeLast4: null,
        yapeDate: null,
        visionResponse: {},
      });

      const updateCalls = mockExecuteRaw.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("UPDATE"),
      );
      expect(updateCalls).toHaveLength(0);
    });
  });

  // ── approve ──────────────────────────────────────────────────────────────────

  describe("approve", () => {
    it("ejecuta UPDATE con status='approved' y el reviewer", async () => {
      await PaymentApprovalDb.approve("pap_test_001", "superadmin_julio");

      const updateCall = mockExecuteRaw.mock.calls.find(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("approved"),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![2]).toBe("superadmin_julio");
    });
  });

  // ── reject ───────────────────────────────────────────────────────────────────

  describe("reject", () => {
    it("ejecuta UPDATE con status='rejected', reviewer y reason", async () => {
      await PaymentApprovalDb.reject("pap_test_001", "superadmin_julio", "Imagen de Plin, no Yape");

      const updateCall = mockExecuteRaw.mock.calls.find(
        (call) =>
          typeof call[0] === "string" &&
          call[0].includes("rejected"),
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![2]).toBe("superadmin_julio");
      expect(updateCall![3]).toBe("Imagen de Plin, no Yape");
    });
  });

  // ── create ───────────────────────────────────────────────────────────────────

  describe("create", () => {
    it("inserta y retorna el approval creado", async () => {
      const row = makeApprovalRow({
        customerPhone: "51987654321",
        expectedAmount: "75.00",
        conversationId: "conv-xyz",
      });
      // Primera queryRaw: getById (para retornar el row recién creado)
      mockQueryRaw.mockResolvedValue([row]);

      const result = await PaymentApprovalDb.create({
        tenantId: "tenant-test",
        customerPhone: "51987654321",
        expectedAmount: 75.0,
        imageUrl: "https://cdn.example.com/img.jpg",
        conversationId: "conv-xyz",
      });

      expect(result).not.toBeNull();
      expect(result.customerPhone).toBe("51987654321");
      expect(result.status).toBe("pending");

      // Verifica que se ejecutó el INSERT
      const insertCall = mockExecuteRaw.mock.calls.find(
        (call) =>
          typeof call[0] === "string" && call[0].includes("INSERT"),
      );
      expect(insertCall).toBeDefined();
    });

    it("lanza si el INSERT no produce un row recuperable", async () => {
      mockQueryRaw.mockResolvedValue([]); // getById devuelve null después de insertar

      await expect(
        PaymentApprovalDb.create({
          tenantId: "tenant-test",
          customerPhone: "51000000000",
          expectedAmount: 50.0,
          imageUrl: "https://example.com/img.jpg",
        }),
      ).rejects.toThrow("PaymentApproval creado pero no recuperable");
    });
  });

  // ── listPending ──────────────────────────────────────────────────────────────

  describe("listPending", () => {
    it("retorna lista vacía cuando no hay pendientes", async () => {
      mockQueryRaw.mockResolvedValue([]);
      const result = await PaymentApprovalDb.listPending();
      expect(result).toEqual([]);
    });

    it("retorna approvals pending y review_required", async () => {
      const rows = [
        makeApprovalRow({ id: "pap_001", status: "pending" }),
        makeApprovalRow({ id: "pap_002", status: "review_required" }),
      ];
      mockQueryRaw.mockResolvedValue(rows);

      const result = await PaymentApprovalDb.listPending();

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe("pending");
      expect(result[1].status).toBe("review_required");
    });

    it("respeta el límite máximo (500) aun si se pide más", async () => {
      mockQueryRaw.mockResolvedValue([]);
      await PaymentApprovalDb.listPending({ limit: 9999 });
      const queryCall = mockQueryRaw.mock.calls.find(
        (call) => typeof call[0] === "string" && call[0].includes("LIMIT"),
      );
      // El último arg de la query es el limit clampado
      const limitArg = queryCall![queryCall!.length - 1];
      expect(limitArg).toBe(500);
    });
  });
});
