/**
 * GET /api/admin/forestal/placa (29-09-2026) — «Buscar placa» de la guía.
 *
 * Corre el `requireAdmin` REAL (sólo se simula el JWT): sin sesión 401, el
 * cajero 403, y el tenant es el de la sesión aunque el header diga otro. Una
 * placa que no puede existir no se busca (422 con el motivo).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  registros: vi.fn(),
  externo: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/db/placa-historial.db", () => ({
  PlacaHistorialDB: { registros: (...a: unknown[]) => H.registros(...a) },
}));
vi.mock("@/lib/integrations/placa-peru", () => ({
  consultarPlacaExterna: (...a: unknown[]) => H.externo(...a),
  placaExternaDisponible: () => false,
}));

import { GET } from "@/app/api/admin/forestal/placa/route";

const pedir = (placa: string, conSesion = true, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost/api/admin/forestal/placa?placa=${encodeURIComponent(placa)}`, {
    headers: { ...(conSesion ? { cookie: "buleje-admin-sess=token-falso" } : {}), ...headers },
  });

const como = (role: string, tenantId = "t1") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};

beforeEach(() => {
  H.payload = null;
  H.registros.mockReset().mockResolvedValue([
    {
      fuente: "despacho_ctp",
      referencia: "QA-LOTE-SALIDA-3",
      fecha: "2026-08-08",
      placa: "AXQ-871",
      tipo: "Camión",
      conductor: "JULIO PAREDES",
      conductorDni: "44120987",
      licencia: "Q44120987",
    },
  ]);
  H.externo.mockReset().mockResolvedValue({ estado: "sin_clave" });
});

describe("GET /api/admin/forestal/placa", () => {
  it("sin sesión → 401", async () => {
    const r = await GET(pedir("AXQ871", false));
    expect(r.status).toBe(401);
    expect(H.registros).not.toHaveBeenCalled();
  });

  it("cajero → 403 (sólo admin, almacenero y dueño)", async () => {
    como("cajero");
    const r = await GET(pedir("AXQ871"));
    expect(r.status).toBe(403);
    expect(H.registros).not.toHaveBeenCalled();
  });

  it("admin busca con el tenant de SU sesión aunque el header diga otro", async () => {
    como("admin", "tenant-de-la-sesion");
    const r = await GET(pedir("AXQ-871", true, { "x-tenant-id": "otro-negocio" }));
    expect(r.status).toBe(200);
    expect(H.registros).toHaveBeenCalledWith("tenant-de-la-sesion", "AXQ871");
  });

  it("almacenero con el header de OTRO negocio → 403, sin buscar", async () => {
    como("almacenero", "tenant-de-la-sesion");
    const r = await GET(pedir("AXQ-871", true, { "x-tenant-id": "otro-negocio" }));
    expect(r.status).toBe(403);
    expect(H.registros).not.toHaveBeenCalled();
  });

  it("almacenero de su negocio: busca, normaliza y trae lo del sistema", async () => {
    como("almacenero", "tenant-de-la-sesion");
    const r = await GET(pedir("axq 871"));
    expect(r.status).toBe(200);
    expect(H.registros).toHaveBeenCalledWith("tenant-de-la-sesion", "AXQ871");
    expect(H.externo).toHaveBeenCalledWith("tenant-de-la-sesion", "AXQ871", expect.any(Number), { soloCache: false });
    const j = await r.json();
    expect(j.placa).toMatchObject({ formateada: "AXQ-871", zona: "Lima y Callao" });
    expect(j.sistema.datos).toMatchObject({ tipo: "Camión", conductor: "JULIO PAREDES", conductorDni: "44120987" });
    expect(j.externo).toBeNull();
    expect(j.externoDisponible).toBe(false);
    expect(j.externoEstado).toBe("sin_clave");
  });

  it.each([
    ["QA-450", /faltan/i],
    ["WRFWR242", /sobran/i],
    ["-", /falta la placa/i],
  ])("%s → 422 con el motivo, sin buscar", async (placa, motivo) => {
    como("admin");
    const r = await GET(pedir(placa));
    expect(r.status).toBe(422);
    expect((await r.json()).message).toMatch(motivo);
    expect(H.registros).not.toHaveBeenCalled();
    expect(H.externo).not.toHaveBeenCalled();
  });

  it("tope de consultas pagas: la búsqueda sigue con lo del sistema y trae la línea", async () => {
    como("admin");
    H.externo.mockResolvedValueOnce({
      estado: "tope",
      alcanzado: "dia",
      tope: 10,
      motivo: "Ya se usaron las 10 consultas a SUNARP de hoy: se buscó sólo en tus guías y el Directorio.",
    });
    const r = await GET(pedir("AXQ-871"));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.sistema.datos.conductor).toBe("JULIO PAREDES");
    expect(j.externo).toBeNull();
    expect(j.externoEstado).toBe("tope");
    expect(j.externoMotivo).toMatch(/10 consultas a SUNARP de hoy/);
  });

  it("el negocio ya sabe la marca (Directorio o guía): SUNARP sólo por caché → «omitida»", async () => {
    como("admin");
    H.registros.mockResolvedValueOnce([
      { fuente: "directorio", referencia: null, fecha: null, placa: "AXQ871", marca: "Volvo", tipo: "Camión" },
    ]);
    H.externo.mockResolvedValueOnce({ estado: "omitida", motivo: "Tus guías ya traen la marca de esta placa: no se gastó una consulta a SUNARP." });
    const j = await (await GET(pedir("AXQ-871"))).json();
    expect(H.externo).toHaveBeenCalledWith(expect.any(String), "AXQ871", expect.any(Number), { soloCache: true });
    expect(j.externoEstado).toBe("omitida");
    expect(j.externoMotivo).toMatch(/no se gastó una consulta/);
  });

  it("con SUNARP: devuelve marca y modelo", async () => {
    como("owner");
    H.externo.mockResolvedValueOnce({
      estado: "encontrada",
      fuente: "json.pe",
      consultadoEn: "2026-09-29T15:00:00.000Z",
      desdeCache: false,
      datos: { placa: "AXQ871", marca: "VOLVO", modelo: "FH", color: "BLANCO", serie: null, motor: null, vin: null },
    });
    const j = await (await GET(pedir("AXQ-871"))).json();
    expect(j.externo).toMatchObject({ marca: "VOLVO", modelo: "FH", consultadoEn: "2026-09-29T15:00:00.000Z" });
    expect(j.externoEstado).toBe("encontrada");
  });
});
