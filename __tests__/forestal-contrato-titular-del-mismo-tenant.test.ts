/**
 * Un permiso no se ata a una ficha del Directorio de otro negocio (revisión
 * ADR-518, 26-10). `ForestContrato.titularId` es una ref app-level sin clave
 * foránea, igual que `planId`: sin el guard, un POST o PATCH a mano colgaba el
 * permiso de la ficha de otro tenant y la ficha ajena lo listaba como suyo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  /** La ficha que encuentra la consulta; `null` = no es de este tenant. */
  parte: null as Record<string, unknown> | null,
  wheresParte: [] as Record<string, unknown>[],
  creados: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestParty: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        H.wheresParte.push(where);
        return H.parte;
      },
    },
    forestPlan: { findFirst: async () => null },
    forestContrato: {
      // Sin código repetido ni ocupante: lo único que puede frenar es la ficha.
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        where.id ? { id: "ctr-1", codigo: "CON-25-UCA-0207" } : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        H.creados.push(data);
        return { id: "ctr-nuevo", createdAt: new Date(), estado: "vigente", isActive: true, ...data };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        H.updates.push(data);
        return { id: "ctr-1", codigo: "CON-25-UCA-0207", createdAt: new Date(), estado: "vigente", isActive: true, ...data };
      },
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: async () => {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {} }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => ({ tenantId: "t-main", username: "qa" })) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));

const { ForestContratoDB, TitularAjenoError } = await import("@/lib/db/forest-contrato.db");
const { POST } = await import("@/app/api/admin/forestal/contratos/route");

beforeEach(() => {
  H.parte = null;
  H.wheresParte.length = 0;
  H.creados.length = 0;
  H.updates.length = 0;
});

const alta = (extra: Record<string, unknown>) =>
  new NextRequest("http://localhost/api/admin/forestal/contratos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo: "QA-DIRECTORIO-2026-001", titularNombre: "CN San Luis", ...extra }),
  });

describe("titularId del permiso", () => {
  it("la ruta responde 400 si la ficha es de otro negocio, sin crear nada", async () => {
    H.parte = null;
    const r = await POST(alta({ titularId: "parte-de-otro-tenant" }));
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({ error: "titular_ajeno" });
    expect(H.creados).toHaveLength(0);
    expect(H.wheresParte[0]).toMatchObject({ tenantId: "t-main", id: "parte-de-otro-tenant" });
  });

  it("con la ficha de este negocio, el alta pasa", async () => {
    H.parte = { id: "parte-1" };
    const r = await POST(alta({ titularId: "parte-1" }));
    expect(r.status).toBe(201);
    expect(H.creados[0]).toMatchObject({ titularId: "parte-1" });
  });

  it("sin titularId no se consulta ninguna ficha", async () => {
    const r = await POST(alta({}));
    expect(r.status).toBe(201);
    expect(H.wheresParte).toHaveLength(0);
  });

  it("al editar, una ficha ajena rompe antes de escribir", async () => {
    await expect(ForestContratoDB.actualizar("t-main", "ctr-1", { titularId: "parte-ajena" }, "qa")).rejects.toBeInstanceOf(
      TitularAjenoError,
    );
    expect(H.updates).toHaveLength(0);
  });

  it("al editar sin tocar el titular no se consulta la ficha", async () => {
    await ForestContratoDB.actualizar("t-main", "ctr-1", { alias: "Lote norte" }, "qa");
    expect(H.wheresParte).toHaveLength(0);
    expect(H.updates).toHaveLength(1);
  });
});
