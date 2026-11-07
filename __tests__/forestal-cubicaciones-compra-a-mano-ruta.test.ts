/**
 * El precio de compra anotado a mano por la ruta (revisión 24-10 del margen).
 *
 * Lo que se protege: el precio es un número de verdad desde 0,01 (sin coerce:
 * `true` guardaba S/ 1,00 y 0,004 daba 500); el mismo precio otra vez no
 * escribe ni audita («de 1,80 a 1,80»); y el almacenero no lo recibe ni en el
 * GET ni al re-guardar la guardada (POST), con la misma lista de roles que la
 * pantalla (`veElMargen`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  escrituras: 0,
  audit: vi.fn(),
  auth: null as null | { tenantId: string; username: string; role: string },
}));

const lector = vi.hoisted(() => ({ forestCtpEntry: { findMany: async () => [] } }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit }));
vi.mock("@/lib/prisma", () => ({ prisma: lector }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: async (k: string) => JSON.parse(JSON.stringify(H.kv.get(k) ?? null)),
    actualizar: async (
      k: string,
      cambio: (actual: unknown, t: typeof lector) => Promise<{ valor?: unknown; resultado: unknown }>,
    ) => {
      const r = await cambio(JSON.parse(JSON.stringify(H.kv.get(k) ?? null)), lector);
      if (r.valor !== undefined) {
        H.escrituras += 1;
        H.kv.set(k, JSON.parse(JSON.stringify(r.valor)));
      }
      return r.resultado;
    },
  },
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => H.auth ?? NextResponse.json({ error: "unauthorized" }, { status: 401 })),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/db/forest-ctp-despacho.db", () => ({ ForestCtpDespachoDB: { listByDespacho: async () => [] } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { GET, PATCH, POST } from "@/app/api/admin/forestal/cubicaciones/route";

const T = "tenant-a";
const KEY = `ctp-cubicaciones:${T}`;
const PIEZA = { id: "p1", cantidad: 1, espesor: 2, ancho: 6, largo: 10 };

const anotar = (precioPt: unknown) =>
  PATCH(new NextRequest("http://localhost/api/admin/forestal/cubicaciones?id=L1", {
    method: "PATCH",
    body: JSON.stringify({ compraAMano: precioPt === null ? null : { precioPt } }),
  }));
const guardado = () => (H.kv.get(KEY) as { id: string; compraAMano?: { precioPt: number } }[]).find((c) => c.id === "L1");

beforeEach(() => {
  H.kv.clear();
  H.escrituras = 0;
  H.audit.mockClear();
  H.auth = { tenantId: T, username: "qa", role: "admin" };
  H.kv.set(KEY, [{
    id: "L1", nombre: "Lote 1", fecha: "2026-10-24", precioPt: 2, valor: 20,
    totales: { piezas: 1, pieTablar: 10, m3: 0.0236 }, piezas: [PIEZA],
    createdAt: "2026-10-24T15:00:00.000Z", updatedAt: "2026-10-24T15:00:00.000Z",
  }]);
});

describe("PATCH ?id= · el precio de compra a mano", () => {
  it("0,004, true, «1.8» en texto o 0: 400 y no se guarda nada", async () => {
    for (const malo of [0.004, true, "1.8", 0, 100_000]) {
      expect((await anotar(malo)).status, String(malo)).toBe(400);
    }
    expect(H.escrituras).toBe(0);
    expect(guardado()?.compraAMano).toBeUndefined();
  });

  it("0,01 es el mínimo y se guarda redondeado a 2 decimales", async () => {
    expect((await anotar(0.01)).status).toBe(200);
    expect(guardado()?.compraAMano?.precioPt).toBe(0.01);
    expect((await anotar(1.805)).status).toBe(200);
    expect(guardado()?.compraAMano?.precioPt).toBe(1.81);
  });

  it("el mismo precio otra vez (o borrar lo que no hay) no escribe ni audita", async () => {
    await anotar(1.8);
    expect(H.escrituras).toBe(1);
    expect(H.audit).toHaveBeenCalledTimes(1);
    const r = await anotar(1.8);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { cubicacion: { compraAMano?: { precioPt: number } } }).cubicacion.compraAMano?.precioPt).toBe(1.8);
    expect(H.escrituras).toBe(1);
    expect(H.audit).toHaveBeenCalledTimes(1);
    await anotar(null);
    await anotar(null);
    expect(H.escrituras).toBe(2);
    expect(H.audit).toHaveBeenCalledTimes(2);
  });

  it("el almacenero no anota: 403", async () => {
    H.auth = { tenantId: T, username: "alm", role: "almacenero" };
    expect((await anotar(1.8)).status).toBe(403);
  });
});

describe("el almacenero no recibe el precio de compra", () => {
  beforeEach(async () => {
    await anotar(1.8);
    H.auth = { tenantId: T, username: "alm", role: "almacenero" };
  });

  it("GET: la lista sin compraAMano; el dueño sí la ve", async () => {
    const lista = ((await (await GET(new NextRequest("http://localhost/api/admin/forestal/cubicaciones"))).json()) as { cubicaciones: Record<string, unknown>[] }).cubicaciones;
    expect(lista[0]).not.toHaveProperty("compraAMano");
    H.auth = { tenantId: T, username: "dueno", role: "owner" };
    const delDueno = ((await (await GET(new NextRequest("http://localhost/api/admin/forestal/cubicaciones"))).json()) as { cubicaciones: Record<string, unknown>[] }).cubicaciones;
    expect(delDueno[0]).toHaveProperty("compraAMano");
  });

  it("POST: re-guardar la guardada no se lo devuelve (y lo conserva guardado)", async () => {
    const r = await POST(new NextRequest("http://localhost/api/admin/forestal/cubicaciones", {
      method: "POST",
      body: JSON.stringify({ id: "L1", nombre: "Lote 1", fecha: "2026-10-24", precioPt: 2, piezas: [PIEZA] }),
    }));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { cubicacion: Record<string, unknown> }).cubicacion).not.toHaveProperty("compraAMano");
    expect(guardado()?.compraAMano?.precioPt).toBe(1.8);
  });
});
