/**
 * GET /api/admin/forestal/gtf/resumen-interno (08-10): R1-R4 del «Resumen
 * interno» se calculan en el servidor. Corre el `requireAdmin` REAL. Se fija:
 *   · sin sesión 401; un rol que no ve guías, 403;
 *   · el tenant sale del JWT (una guía de otro negocio = 404);
 *   · id mal formado = 400 sin tocar la base;
 *   · la respuesta trae R1-R4 calculados, no las líneas crudas.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { EntradaResumenInterno } from "@/lib/forestal/gtf-resumen-interno";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  leer: vi.fn(),
  specs: new Set<string>(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async (_t: string, s: string) => H.specs.has(s) }));
vi.mock("@/lib/db/gtf-resumen-interno.db", () => ({ GtfResumenInternoDB: { leer: (...a: unknown[]) => H.leer(...a) } }));

import { GET } from "@/app/api/admin/forestal/gtf/resumen-interno/route";

const COOKIE = { cookie: "buleje-admin-sess=token-falso" };
const como = (role: string, tenantId = "t-blas") => {
  H.payload = { username: "qa", role, tenantId };
};
const pedir = (id = "gtf1") => GET(new NextRequest(`http://localhost/api/admin/forestal/gtf/resumen-interno?id=${encodeURIComponent(id)}`, { headers: COOKIE }));

const entrada: EntradaResumenInterno = {
  guia: { gtfNumber: "019-001-0000001", gtfDate: "2026-10-01", declaradoM3: 1, declaradoTrozas: 1, fuenteDeclarado: "registro" },
  piezas: [{ codigo: "1-0001", codigoGuia: "1", arbol: "1", especie: "TORNILLO", d1M: 0.5, d2M: 0.5, largoM: 4, m3: 1 }],
  lineasDeLaGuia: [{ gtfNumber: "019-001-0000001", dia: "2026-10-01", trozaCode: "1-0001", m3: 1, arbol: "1", trozadoId: "tz1" }],
  lineasDelPermiso: null,
  autorizadoM3: null,
  ctp: new Map(),
};

beforeEach(() => {
  H.payload = null;
  H.specs = new Set(["spec:forestal:loth-libro"]);
  H.leer.mockReset().mockResolvedValue({ entrada, lineaDespachoId: "l1", planId: null, avisos: [] });
});

describe("GET /gtf/resumen-interno", () => {
  it("sin sesión → 401 sin leer la base", async () => {
    expect((await pedir()).status).toBe(401);
    expect(H.leer).not.toHaveBeenCalled();
  });

  it("un cajero no ve guías → 403", async () => {
    como("cajero");
    expect((await pedir()).status).toBe(403);
    expect(H.leer).not.toHaveBeenCalled();
  });

  it("sin el Libro TH → 403", async () => {
    como("admin");
    H.specs = new Set();
    expect((await pedir()).status).toBe(403);
  });

  it("id mal formado → 400 sin leer la base", async () => {
    como("admin");
    expect((await pedir("x'; drop")).status).toBe(400);
    expect(H.leer).not.toHaveBeenCalled();
  });

  it("la guía de otro negocio → 404: el tenant va del JWT a la lectura", async () => {
    como("almacenero", "t-otro");
    H.leer.mockResolvedValue(null);
    expect((await pedir()).status).toBe(404);
    expect(H.leer).toHaveBeenCalledWith("t-otro", "gtf1", { ctp: false });
  });

  it("devuelve R1-R4 calculados en el servidor (con el CTP si el negocio lo lleva)", async () => {
    como("almacenero");
    H.specs.add("spec:forestal:ctp-libro");
    const r = await pedir();
    expect(r.status).toBe(200);
    const j = (await r.json()) as { resumen: { cuadre: { libro: { trozas: number } }; donde: { despachadas: number } }; lineaDespachoId: string };
    expect(H.leer).toHaveBeenCalledWith("t-blas", "gtf1", { ctp: true });
    expect(j.resumen.cuadre.libro.trozas).toBe(1);
    expect(j.resumen.donde.despachadas).toBe(1);
    expect(j.lineaDespachoId).toBe("l1");
    expect(j).not.toHaveProperty("entrada");
  });
});
