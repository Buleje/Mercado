/**
 * GET /api/admin/forestal/loth/geografia y /loth/planificador (29-09-2026).
 *
 * Corre el `requireAdmin` REAL (sólo se simula el JWT): sin sesión 401, el
 * cajero 403, y el negocio es el de la sesión aunque el header diga otro. El
 * servidor de la geografía se simula; el planificador corre de verdad.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  contexto: vi.fn(),
  geografia: vi.fn(),
  seleccion: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/forestal/loth-geografia-servidor", () => ({
  contextoDelPlan: (...a: unknown[]) => H.contexto(...a),
  obtenerGeografia: (...a: unknown[]) => H.geografia(...a),
  arbolesParaPlanificar: (...a: unknown[]) => H.seleccion(...a),
}));

import { GET as geografiaGET } from "@/app/api/admin/forestal/loth/geografia/route";
import { GET as planificadorGET } from "@/app/api/admin/forestal/loth/planificador/route";
import { emptyCartografia } from "@/lib/forestal/loth-cartografia";

const pedir = (ruta: string, conSesion = true, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/api/admin/forestal/loth/${ruta}`, {
    headers: { ...(conSesion ? { cookie: "buleje-admin-sess=token-falso" } : {}), ...headers },
  });
const como = (role: string, tenantId = "t1") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};

const bbox = { sur: -9.81, oeste: -74.81, norte: -9.79, este: -74.79 };
const ctx = { planId: "plan-1", arboles: [], sinCoordenadas: 0, contorno: [], contornoEs: "parcela", carto: emptyCartografia() };
const geo = { bbox, base: "arboles", rios: [], caminos: [], elevacion: null, fuentes: { osm: null, elevacion: null }, avisos: ["OpenStreetMap no respondió"], desdeCache: false };

beforeEach(() => {
  H.payload = null;
  H.contexto.mockReset().mockResolvedValue(ctx);
  H.geografia.mockReset().mockResolvedValue({ ok: true, geografia: geo });
  H.seleccion.mockReset().mockResolvedValue({
    arboles: [
      { id: "a1", codigo: "1", lat: -9.8, lng: -74.8, m3: 5, etapa: "en_pie" },
      { id: "a2", codigo: "2", lat: -9.801, lng: -74.801, m3: 3, etapa: "en_pie" },
    ],
    excluidos: [{ motivo: "Semillero: no se tala", n: 1, codigos: ["9"] }],
    avisos: [],
  });
});

describe("GET /loth/geografia", () => {
  it("sin sesión → 401, sin tocar nada", async () => {
    const r = await geografiaGET(pedir("geografia", false));
    expect(r.status).toBe(401);
    expect(H.contexto).not.toHaveBeenCalled();
  });

  it("cajero → 403", async () => {
    como("cajero");
    expect((await geografiaGET(pedir("geografia"))).status).toBe(403);
    expect(H.contexto).not.toHaveBeenCalled();
  });

  it("usa el negocio de la SESIÓN aunque el header y la query digan otro", async () => {
    como("admin", "tenant-de-la-sesion");
    const r = await geografiaGET(pedir("geografia?planId=plan-1&tenantId=otro", true, { "x-tenant-id": "otro-negocio" }));
    expect(r.status).toBe(200);
    expect(H.contexto).toHaveBeenCalledWith("tenant-de-la-sesion", "plan-1");
    expect(H.geografia.mock.calls[0][0]).toBe("tenant-de-la-sesion");
    expect(H.geografia.mock.calls[0][2]).toMatchObject({ refrescar: false });
    const j = await r.json();
    expect(j).toMatchObject({ planId: "plan-1", bbox, avisos: ["OpenStreetMap no respondió"] });
  });

  it("?refrescar=1 lo pasa al servidor", async () => {
    como("almacenero");
    await geografiaGET(pedir("geografia?refrescar=1"));
    expect(H.geografia.mock.calls[0][2]).toMatchObject({ refrescar: true });
  });

  it("?soloCache=1 (la pendiente de las rutas del mapa) no sale a internet; sin él, sí puede", async () => {
    como("admin");
    await geografiaGET(pedir("geografia?planId=plan-1&soloCache=1"));
    expect(H.geografia.mock.calls[0][2]).toMatchObject({ soloCache: true, refrescar: false });
    await geografiaGET(pedir("geografia?planId=plan-1"));
    expect(H.geografia.mock.calls[1][2]).toMatchObject({ soloCache: false });
    expect((await geografiaGET(pedir("geografia?soloCache=quizas"))).status).toBe(400);
  });

  it("zona imposible → 422 con el motivo, no 500", async () => {
    como("owner");
    H.geografia.mockResolvedValue({ ok: false, motivo: "El área es demasiado grande (30.0 × 28.0 km)" });
    const r = await geografiaGET(pedir("geografia"));
    expect(r.status).toBe(422);
    expect((await r.json()).message).toMatch(/demasiado grande/);
  });
});

describe("GET /loth/planificador", () => {
  it("sin sesión → 401", async () => {
    expect((await planificadorGET(pedir("planificador", false))).status).toBe(401);
    expect(H.contexto).not.toHaveBeenCalled();
  });

  it("planifica con el negocio de la sesión y junta los avisos de la geografía con los del plan", async () => {
    como("admin", "tenant-de-la-sesion");
    const r = await planificadorGET(pedir("planificador", true, { "x-tenant-id": "otro-negocio" }));
    expect(r.status).toBe(200);
    expect(H.contexto).toHaveBeenCalledWith("tenant-de-la-sesion", null);
    expect(H.seleccion.mock.calls[0][0]).toBe("tenant-de-la-sesion");
    // El planificador nunca sale a internet: sólo la caché.
    expect(H.geografia.mock.calls[0][2]).toMatchObject({ soloCache: true });
    const j = await r.json();
    expect(j.puedeGuardar).toBe(true);
    expect(j.propuesta.vacia).toBe(false);
    expect(j.propuesta.ordenTala).toHaveLength(2);
    expect(j.propuesta.avisos[0]).toBe("OpenStreetMap no respondió");
    expect(j.arboles).toEqual({ considerados: 2, sinCoordenadas: 0, excluidos: [{ motivo: "Semillero: no se tala", n: 1, codigos: ["9"] }] });
    expect(j.geografia).toMatchObject({ bbox, rios: 0, caminos: 0, dibujados: { rios: 0, caminos: 0 } });
  });

  it("el patio fijado y los parámetros llegan al cálculo", async () => {
    como("admin");
    const r = await planificadorGET(pedir("planificador?patioLat=-9.8005&patioLng=-74.8005&pendienteMax=25&fajaRio=60&soloEnPie=1"));
    const j = await r.json();
    expect(j.propuesta.patios[0]).toMatchObject({ lat: -9.8005, lng: -74.8005, fijadoPorUsuario: true });
    expect(j.propuesta.parametros).toMatchObject({ pendienteMaxArrastrePct: 25, fajaRioM: 60 });
    expect(H.seleccion.mock.calls[0][2]).toEqual({ soloEnPie: true });
  });

  it("el almacenero propone, pero no puede guardar en el plano (la regla del PUT de la cartografía)", async () => {
    como("almacenero");
    const r = await planificadorGET(pedir("planificador"));
    expect(r.status).toBe(200);
    expect((await r.json()).puedeGuardar).toBe(false);
  });

  it("patio con una sola coordenada o un número fuera de rango → 400", async () => {
    como("admin");
    expect((await planificadorGET(pedir("planificador?patioLat=-9.8"))).status).toBe(400);
    expect((await planificadorGET(pedir("planificador?pendienteMax=500"))).status).toBe(400);
    expect(H.contexto).not.toHaveBeenCalled();
  });

  it("parámetro vacío en la URL = sin parámetro (no 0)", async () => {
    como("admin");
    const r = await planificadorGET(pedir("planificador?fajaRio="));
    expect(r.status).toBe(200);
    expect((await r.json()).propuesta.parametros.fajaRioM).toBe(50);
  });

  it("sin geografía (zona imposible) planifica igual con lo dibujado y lo dice", async () => {
    como("admin");
    H.geografia.mockResolvedValue({ ok: false, motivo: "El área es demasiado grande" });
    const j = await (await planificadorGET(pedir("planificador"))).json();
    expect(j.geografia).toBeNull();
    expect(j.propuesta.vacia).toBe(false);
    expect(j.propuesta.avisos[0]).toBe("El área es demasiado grande");
  });
});
