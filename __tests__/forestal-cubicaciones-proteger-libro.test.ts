/**
 * Una cubicación que está EN el Libro no se borra (Brandon 23-10, «Proteger del Libro»).
 *
 * La línea del Libro guarda especie y volumen, no las medidas pieza por pieza:
 * esas viven sólo en la cubicación (Anexo 04, cuadre contra el asiento —
 * ADR-368/369/405—). Borrarla dejaba la línea huérfana de su detalle.
 *
 *  · DELETE de una ligada a una línea VIVA → 409 `en_libro` con la línea y el
 *    camino («anula esa línea en el Libro › Producción»), y el KV queda igual;
 *  · ligada a una línea anulada o purgada → se borra (se mira el estado, no el
 *    id pelado, regla forestal-serfor);
 *  · otro negocio → 404 y no toca la lista ajena (tenantId en el WHERE y en la clave);
 *  · GET `?enLibro=1` → las que no se borran, con su motivo, para apagar «Borrar».
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

type Corrida = { id: string; tenantId: string; lineNo: number; entryDate: Date; status: string; deletedAt: Date | null };
type Where = { tenantId: string; id: { in: string[] }; deletedAt: null; status: { not: string } };

const H = vi.hoisted(() => ({
  kv: new Map<string, unknown>(),
  corridas: [] as Corrida[],
  wheres: [] as unknown[],
  audit: vi.fn(),
  auth: null as null | { tenantId: string; username: string },
}));

/** El lector de líneas del Libro: el mismo para la tx del borrado y para el GET. */
const lector = vi.hoisted(() => ({
  forestCtpEntry: {
    findMany: async ({ where }: { where: Where }) => {
      H.wheres.push(where);
      return H.corridas
        .filter(
          (c) =>
            c.tenantId === where.tenantId &&
            where.id.in.includes(c.id) &&
            c.deletedAt === null &&
            c.status !== where.status.not,
        )
        .map((c) => ({ id: c.id, lineNo: c.lineNo, entryDate: c.entryDate }));
    },
  },
}));

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
      if (r.valor !== undefined) H.kv.set(k, JSON.parse(JSON.stringify(r.valor)));
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

import { DELETE, GET } from "@/app/api/admin/forestal/cubicaciones/route";
import { motivoEnLibro } from "@/lib/db/forest-cubicaciones.db";

const T = "tenant-a";
const OTRO = "tenant-b";
const KEY = `ctp-cubicaciones:${T}`;

const reg = (id: string, ctpEntryIds?: string[]) => ({
  id,
  nombre: `Lote ${id}`,
  fecha: "2026-10-21",
  precioPt: 0,
  valor: 0,
  totales: { piezas: 1, pieTablar: 10, m3: 0.0236 },
  piezas: [],
  ...(ctpEntryIds ? { ctpEntryId: ctpEntryIds[0], ctpEntryIds } : {}),
  createdAt: "2026-10-21T15:00:00.000Z",
  updatedAt: "2026-10-21T15:00:00.000Z",
});

const borrar = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/admin/forestal/cubicaciones?id=${id}`, { method: "DELETE" }));
const ids = () => ((H.kv.get(KEY) as { id: string }[]) ?? []).map((c) => c.id);

beforeEach(() => {
  H.kv.clear();
  H.wheres.length = 0;
  H.audit.mockClear();
  H.auth = { tenantId: T, username: "qa" };
  H.corridas = [
    { id: "c-viva", tenantId: T, lineNo: 12, entryDate: new Date("2026-10-21T00:00:00Z"), status: "registrado", deletedAt: null },
    { id: "c-viva2", tenantId: T, lineNo: 13, entryDate: new Date("2026-10-21T00:00:00Z"), status: "registrado", deletedAt: null },
    { id: "c-anulada", tenantId: T, lineNo: 9, entryDate: new Date("2026-10-20T00:00:00Z"), status: "anulado", deletedAt: null },
    { id: "c-borrada", tenantId: T, lineNo: 8, entryDate: new Date("2026-10-20T00:00:00Z"), status: "registrado", deletedAt: new Date() },
    { id: "c-ajena", tenantId: OTRO, lineNo: 1, entryDate: new Date("2026-10-20T00:00:00Z"), status: "registrado", deletedAt: null },
  ];
  H.kv.set(KEY, [
    reg("en-libro", ["c-viva"]),
    reg("suelta"),
    reg("anulada", ["c-anulada"]),
    reg("purgada", ["c-no-existe", "c-borrada"]),
    reg("con-ajena", ["c-ajena"]),
  ]);
});

describe("DELETE /api/admin/forestal/cubicaciones — no se borra lo que está en el Libro", () => {
  it("ligada a una línea viva: 409 con la línea y el camino, y no borra", async () => {
    const r = await borrar("en-libro");
    expect(r.status).toBe(409);
    const j = (await r.json()) as { error: string; message: string; lineas: { lineNo: number }[] };
    expect(j.error).toBe("en_libro");
    expect(j.message).toContain("línea N° 12 del 21/10/2026");
    expect(j.message).toContain("anula esa línea en el Libro › Producción");
    expect(j.lineas.map((l) => l.lineNo)).toEqual([12]);
    expect(ids()).toContain("en-libro");
    expect(H.audit).not.toHaveBeenCalled();
    /* Ownership en el WHERE: la consulta va con el tenant de la sesión. */
    expect(H.wheres).toEqual([{ tenantId: T, id: { in: ["c-viva"] }, deletedAt: null, status: { not: "anulado" } }]);
  });

  it("suelta (sin enviar al Libro): se borra y se audita", async () => {
    const r = await borrar("suelta");
    expect(r.status).toBe(200);
    expect(ids()).not.toContain("suelta");
    expect(ids()).toHaveLength(4);
    expect(H.audit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: T, action: "ctp_cubicacion_delete", entityId: "suelta" }));
  });

  it("su línea se anuló o se purgó: ya no está en el Libro y se borra", async () => {
    expect((await borrar("anulada")).status).toBe(200);
    expect((await borrar("purgada")).status).toBe(200);
    expect(ids()).toEqual(["en-libro", "suelta", "con-ajena"]);
  });

  it("un id de línea de OTRO negocio no la ata: no es una línea de este Libro", async () => {
    expect((await borrar("con-ajena")).status).toBe(200);
  });

  it("otro negocio: 404 y la lista ajena queda intacta", async () => {
    H.auth = { tenantId: OTRO, username: "intruso" };
    const r = await borrar("suelta");
    expect(r.status).toBe(404);
    expect(ids()).toHaveLength(5);
    expect(H.audit).not.toHaveBeenCalled();
  });

  it("sin sesión: 401", async () => {
    H.auth = null;
    expect((await borrar("suelta")).status).toBe(401);
  });
});

describe("GET ?enLibro=1 — las que no se borran, con su motivo", () => {
  it("sólo las ligadas a líneas vivas del propio negocio", async () => {
    H.kv.set(KEY, [...(H.kv.get(KEY) as unknown[]), reg("camion", ["c-viva", "c-viva2", "c-anulada"])]);
    const r = await GET(new NextRequest("http://localhost/api/admin/forestal/cubicaciones?enLibro=1"));
    const j = (await r.json()) as { cubicaciones: unknown[]; enLibro: Record<string, { lineas: { lineNo: number }[]; motivo: string }> };
    expect(j.cubicaciones).toHaveLength(6);
    expect(Object.keys(j.enLibro).sort()).toEqual(["camion", "en-libro"]);
    expect(j.enLibro.camion?.lineas.map((l) => l.lineNo)).toEqual([12, 13]);
    expect(j.enLibro.camion?.motivo).toContain("las líneas N° 12 y N° 13");
    expect(H.wheres).toHaveLength(1);
  });

  it("sin ?enLibro=1 la respuesta sigue igual (los otros lectores no pagan la consulta)", async () => {
    const r = await GET(new NextRequest("http://localhost/api/admin/forestal/cubicaciones"));
    const j = (await r.json()) as Record<string, unknown>;
    expect(j.enLibro).toBeUndefined();
    expect(H.wheres).toHaveLength(0);
  });
});

describe("motivoEnLibro", () => {
  it("una línea: número y día; varias: en orden", () => {
    expect(motivoEnLibro([{ id: "a", lineNo: 4, fecha: "2026-09-02" }])).toMatch(/^Está en el Libro \(Producción, la línea N° 4 del 02\/09\/2026\)/);
    expect(
      motivoEnLibro([
        { id: "b", lineNo: 7, fecha: "2026-09-02" },
        { id: "a", lineNo: 3, fecha: "2026-09-02" },
        { id: "c", lineNo: 5, fecha: "2026-09-02" },
      ]),
    ).toContain("las líneas N° 3, N° 5 y N° 7");
  });
});
