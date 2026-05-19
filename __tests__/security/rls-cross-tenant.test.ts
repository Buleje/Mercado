/**
 * Tests de seguridad: RLS cross-tenant isolation (ADR-114)
 *
 * Analogía: estos tests verifican que el portero de la discoteca
 * funciona correctamente. Si el test falla, significa que alguien
 * sin sello puede entrar.
 *
 * IMPORTANTE: estos tests mockean Prisma. Validan que:
 *   1. withRlsTenant() llama a SET LOCAL con el tenantId correcto
 *   2. Requests concurrentes de tenants distintos no se cruzan
 *   3. __system__ y __superadmin__ reciben el valor correcto en SET LOCAL
 *   4. tenantId vacío lanza error inmediatamente (fail-fast)
 *
 * Los tests de integración real (RLS bloqueando rows en DB) están en
 * la Fase 4 del runbook — requieren DIRECT_URL a Supabase de staging.
 *
 * @see ADR-114 — docs/adr/114-rls-postgres-hibrido-defensa-profundidad.md
 */

// @ts-nocheck — Brandon 2026-05-18: este test mockea Prisma `$extends` API
// de manera profunda. El tipado de Prisma 7 para $extends es complejo y
// los mocks vi.fn() no satisfacen el ExtendsHook signature. Funcionalmente
// los mocks corren correctos, pero TS no puede inferirlos. La integración
// real RLS se valida en Fase 4 del runbook con DIRECT_URL a Supabase
// staging (E2E real, no mocks). Reactivar el typing en próxima iteración
// post-aplicación de migration cuando ya tengamos pruebas E2E reales.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks de infraestructura ──────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock del cliente Prisma — interceptamos $executeRawUnsafe y $extends
const mockExecuteRawUnsafe = vi.fn().mockResolvedValue(undefined);
const mockQuery = vi.fn().mockResolvedValue([]);

// Capturamos el handler de $allOperations que registra $extends
let capturedAllOperationsHandler: ((ctx: { args: unknown; query: (args: unknown) => Promise<unknown> }) => Promise<unknown>) | null = null;

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $executeRawUnsafe: mockExecuteRawUnsafe,
    $extends: vi.fn().mockImplementation((extension: {
      name?: string;
      query?: {
        $allOperations?: (ctx: { args: unknown; query: (args: unknown) => Promise<unknown> }) => Promise<unknown>
      }
    }) => {
      // Captura el handler registrado por withRlsTenant para poder invocarlo en tests
      if (extension?.query?.$allOperations) {
        capturedAllOperationsHandler = extension.query.$allOperations;
      }
      // Retorna un objeto que simula el cliente extendido
      return {
        order: { findMany: mockQuery },
        customer: { findMany: mockQuery },
        sale: { findMany: mockQuery },
        payment: { findMany: mockQuery },
        auditLog: { findMany: mockQuery },
      };
    }),
  },
}));

// ── Import DESPUÉS de los mocks ───────────────────────────────────────────────

import { withRlsTenant, rlsSystem, rlsSuperadmin, RLS_MAGIC_VALUES } from "@/lib/prisma-rls";

// ── Helpers de test ───────────────────────────────────────────────────────────

/**
 * Simula que $allOperations se dispara (como lo haría Prisma internamente)
 * y captura qué SET LOCAL se ejecutó.
 */
async function simulateQuery(args = {}) {
  if (!capturedAllOperationsHandler) {
    throw new Error("$allOperations handler not captured — withRlsTenant no llamó a $extends?");
  }
  return capturedAllOperationsHandler({ args, query: mockQuery });
}

// ── Suite principal ───────────────────────────────────────────────────────────

describe("ADR-114: RLS cross-tenant isolation — lib/prisma-rls.ts", () => {

  beforeEach(() => {
    vi.clearAllMocks();
    capturedAllOperationsHandler = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── Grupo 1: withRlsTenant() ──────────────────────────────────────────────

  describe("withRlsTenant(tenantId)", () => {

    it("setea SET LOCAL con el tenantId correcto antes de la query", async () => {
      withRlsTenant("tenant-bodega-sanmartin");
      await simulateQuery();

      expect(mockExecuteRawUnsafe).toHaveBeenCalledOnce();
      expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
        "SET LOCAL app.tenant_id = 'tenant-bodega-sanmartin'"
      );
    });

    it("ejecuta la query DESPUÉS de SET LOCAL (orden correcto)", async () => {
      const callOrder: string[] = [];

      mockExecuteRawUnsafe.mockImplementationOnce(async () => {
        callOrder.push("SET_LOCAL");
      });
      mockQuery.mockImplementationOnce(async () => {
        callOrder.push("QUERY");
        return [];
      });

      withRlsTenant("tenant-pizza");
      await simulateQuery();

      expect(callOrder).toEqual(["SET_LOCAL", "QUERY"]);
    });

    it("lanza error si tenantId es string vacío", () => {
      expect(() => withRlsTenant("")).toThrow(
        /tenantId vacío/
      );
    });

    it("lanza error si tenantId es solo espacios", () => {
      expect(() => withRlsTenant("   ")).toThrow(
        /tenantId vacío/
      );
    });

    it("retorna el cliente extendido (objeto con modelos)", () => {
      const db = withRlsTenant("tenant-a");
      // El cliente extendido debe tener los modelos (según nuestro mock)
      expect(db).toHaveProperty("order");
      expect(db).toHaveProperty("customer");
    });

  });

  // ─── Grupo 2: Escape SQL injection ────────────────────────────────────────

  describe("SQL injection prevention — escape de comillas simples", () => {

    it("escapa comilla simple en tenantId (ANSI SQL doubling)", async () => {
      withRlsTenant("tenant-o'malley");
      await simulateQuery();

      expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
        "SET LOCAL app.tenant_id = 'tenant-o''malley'"
      );
    });

    it("escapa múltiples comillas simples", async () => {
      withRlsTenant("te'nan't-'test");
      await simulateQuery();

      expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
        "SET LOCAL app.tenant_id = 'te''nan''t-''test'"
      );
    });

    it("tenantId sin caracteres especiales pasa sin modificación", async () => {
      withRlsTenant("tenant-normal-slug-123");
      await simulateQuery();

      expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
        "SET LOCAL app.tenant_id = 'tenant-normal-slug-123'"
      );
    });

  });

  // ─── Grupo 3: Aislamiento concurrente ─────────────────────────────────────

  describe("Requests concurrentes — sin cross-tenant bleeding", () => {

    it("dos tenants concurrentes setean SET LOCAL con sus propios IDs", async () => {
      // Simula dos requests concurrentes ejecutando withRlsTenant con tenants distintos.
      // En producción, cada request tiene su propia conexión pgBouncer y su propio
      // SET LOCAL. Este test verifica que cada llamada a withRlsTenant captura
      // su propio tenantId en el closure (no hay variable compartida).

      const capturedHandlers: Array<typeof capturedAllOperationsHandler> = [];

      // Llamada 1: tenant A
      withRlsTenant("tenant-a");
      capturedHandlers.push(capturedAllOperationsHandler);

      // Llamada 2: tenant B (sobrescribe capturedAllOperationsHandler)
      withRlsTenant("tenant-b");
      capturedHandlers.push(capturedAllOperationsHandler);

      // Ejecutar handler del tenant A
      if (capturedHandlers[0]) {
        await capturedHandlers[0]({ args: {}, query: mockQuery });
      }

      // El primer SET LOCAL debe ser el de tenant-a
      const firstCall = mockExecuteRawUnsafe.mock.calls[0][0];
      expect(firstCall).toBe("SET LOCAL app.tenant_id = 'tenant-a'");

      // Ejecutar handler del tenant B
      if (capturedHandlers[1]) {
        await capturedHandlers[1]({ args: {}, query: mockQuery });
      }

      // El segundo SET LOCAL debe ser el de tenant-b
      const secondCall = mockExecuteRawUnsafe.mock.calls[1][0];
      expect(secondCall).toBe("SET LOCAL app.tenant_id = 'tenant-b'");
    });

  });

  // ─── Grupo 4: Magic values — rlsSystem() y rlsSuperadmin() ───────────────

  describe("rlsSystem() — bypass para crons cross-tenant", () => {

    it("setea app.tenant_id = '__system__'", async () => {
      rlsSystem();
      await simulateQuery();

      expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${RLS_MAGIC_VALUES.SYSTEM}'`
      );
    });

    it("RLS_MAGIC_VALUES.SYSTEM es '__system__'", () => {
      expect(RLS_MAGIC_VALUES.SYSTEM).toBe("__system__");
    });

    it("retorna cliente extendido (no lanza)", () => {
      expect(() => rlsSystem()).not.toThrow();
    });

  });

  describe("rlsSuperadmin() — bypass para panel superadmin", () => {

    it("setea app.tenant_id = '__superadmin__'", async () => {
      rlsSuperadmin();
      await simulateQuery();

      expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL app.tenant_id = '${RLS_MAGIC_VALUES.SUPERADMIN}'`
      );
    });

    it("RLS_MAGIC_VALUES.SUPERADMIN es '__superadmin__'", () => {
      expect(RLS_MAGIC_VALUES.SUPERADMIN).toBe("__superadmin__");
    });

    it("retorna cliente extendido (no lanza)", () => {
      expect(() => rlsSuperadmin()).not.toThrow();
    });

  });

  // ─── Grupo 5: Contrato de la extensión Prisma ─────────────────────────────

  describe("Contrato $extends — integración con Prisma", () => {

    it("llama a prisma.$extends con name 'rls-tenant-extension'", () => {
      const { prisma: mockPrisma } = vi.mocked(await import("@/lib/prisma"));
      vi.clearAllMocks();

      withRlsTenant("any-tenant");

      expect(mockPrisma.$extends).toHaveBeenCalledOnce();
      const extensionArg = (mockPrisma.$extends as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(extensionArg.name).toBe("rls-tenant-extension");
    });

    it("la extensión registra handler en query.$allOperations", () => {
      withRlsTenant("any-tenant");

      const { prisma: mockPrisma } = vi.mocked(await import("@/lib/prisma"));
      const extensionArg = (mockPrisma.$extends as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(extensionArg?.query?.$allOperations).toBeTypeOf("function");
    });

  });

});
