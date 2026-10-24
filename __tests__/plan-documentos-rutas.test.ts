/**
 * Rutas de «Documentos del plan» (ADR-467) con el `requireAdmin` REAL (sólo se
 * simula el JWT): sin sesión 401, el cajero no lee, el almacenero lee pero no
 * escribe, el negocio es el de la sesión aunque el header diga otro, y un
 * cuerpo mal armado es 400 antes de tocar la base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  spec: true,
  vista: vi.fn(),
  preparar: vi.fn(),
  crearCarpeta: vi.fn(),
  editarCarpeta: vi.fn(),
  adoptarCarpeta: vi.fn(),
  editarPlantillaCarpeta: vi.fn(),
  vincularArchivo: vi.fn(),
}));

vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => H.spec }));
vi.mock("@/lib/db/forest-plan-documentos.db", async (real) => ({
  ...(await real<typeof import("@/lib/db/forest-plan-documentos.db")>()),
  ForestPlanDocumentosDB: {
    vista: H.vista,
    preparar: H.preparar,
    crearCarpeta: H.crearCarpeta,
    editarCarpeta: H.editarCarpeta,
    adoptarCarpeta: H.adoptarCarpeta,
    editarPlantillaCarpeta: H.editarPlantillaCarpeta,
    vincularArchivo: H.vincularArchivo,
  },
}));

import { PlanDocumentosError } from "@/lib/db/forest-plan-documentos.db";
import { GET } from "@/app/api/admin/forestal/plan/documentos/route";
import { POST as PREPARAR } from "@/app/api/admin/forestal/plan/documentos/preparar/route";
import { POST as CREAR, PATCH as EDITAR } from "@/app/api/admin/forestal/plan/documentos/carpetas/route";
import { POST as ADOPTAR } from "@/app/api/admin/forestal/plan/documentos/carpetas/adoptar/route";
import { PATCH as PLANTILLA } from "@/app/api/admin/forestal/plan/documentos/plantilla/route";
import { POST as VINCULAR } from "@/app/api/admin/forestal/plan/documentos/vincular/route";

const BASE = "http://localhost/api/admin/forestal/plan/documentos";
const VISTA = { planId: "p1", carpetas: [], resumen: { esperados: 0, cargados: 0, faltan: 0, vencenPronto: 0, vencidos: 0 } };

function pedir(url: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; sinCookie?: boolean } = {}) {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (!init.sinCookie) headers.cookie = "buleje-admin-sess=token-falso";
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

const como = (role: string, tenantId = "t1") => {
  H.payload = { username: `qa-${role}`, role, tenantId };
};

beforeEach(() => {
  H.spec = true;
  como("admin");
  for (const f of [H.vista, H.preparar, H.crearCarpeta, H.editarCarpeta, H.adoptarCarpeta, H.editarPlantillaCarpeta, H.vincularArchivo]) {
    f.mockReset();
    f.mockResolvedValue(VISTA);
  }
});

describe("quién entra", () => {
  it("sin sesión → 401 (nunca 404: un 404 saca del panel)", async () => {
    const res = await GET(pedir(`${BASE}?planId=p1`, { sinCookie: true }));
    expect(res.status).toBe(401);
    expect(H.vista).not.toHaveBeenCalled();
  });

  it("cajero no lee los papeles del plan → 403", async () => {
    como("cajero");
    const res = await GET(pedir(`${BASE}?planId=p1`));
    expect(res.status).toBe(403);
    expect(H.vista).not.toHaveBeenCalled();
  });

  it("almacenero lee (200) pero no escribe (403)", async () => {
    como("almacenero");
    const lee = await GET(pedir(`${BASE}?planId=p1`));
    expect(lee.status).toBe(200);
    expect(await lee.json()).toEqual({ vista: VISTA });

    for (const [ruta, url, method, body] of [
      [PREPARAR, `${BASE}/preparar`, "POST", { planId: "p1" }],
      [CREAR, `${BASE}/carpetas`, "POST", { planId: "p1", nombre: "Fotos" }],
      [EDITAR, `${BASE}/carpetas`, "PATCH", { planId: "p1", clave: "jefe", nombre: "Jefe" }],
      [ADOPTAR, `${BASE}/carpetas/adoptar`, "POST", { planId: "p1", folderId: "f1" }],
      [PLANTILLA, `${BASE}/plantilla?planId=p1`, "PATCH", { id: "c1", activo: false }],
      [VINCULAR, `${BASE}/vincular`, "POST", { planId: "p1", documentId: "d1", campoId: null }],
    ] as const) {
      const res = await ruta(pedir(url, { method, body }));
      expect(res.status, `${method} ${url}`).toBe(403);
    }
    expect(H.preparar).not.toHaveBeenCalled();
    expect(H.vincularArchivo).not.toHaveBeenCalled();
  });

  it("el negocio es el del JWT aunque el header diga otro", async () => {
    como("admin", "t1");
    await GET(pedir(`${BASE}?planId=p1`, { headers: { "x-tenant-id": "otro-negocio" } }));
    expect(H.vista).toHaveBeenCalledWith("t1", "p1");
  });

  it("un almacenero con el header de OTRO negocio → 403 (no lee el ajeno)", async () => {
    como("almacenero", "t1");
    const res = await GET(pedir(`${BASE}?planId=p1`, { headers: { "x-tenant-id": "otro-negocio" } }));
    expect(res.status).toBe(403);
    expect(H.vista).not.toHaveBeenCalled();
  });

  it("sin el Libro TH habilitado → 403 specialization_disabled", async () => {
    H.spec = false;
    const res = await GET(pedir(`${BASE}?planId=p1`));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "specialization_disabled" });
  });
});

describe("qué se valida antes de tocar la base", () => {
  it("GET sin planId → 400", async () => {
    expect((await GET(pedir(BASE))).status).toBe(400);
  });

  it("cuerpos mal armados → 400 (JSON roto, falta planId, clave con mayúsculas, campoId ausente)", async () => {
    const casos = [
      [PREPARAR, `${BASE}/preparar`, "POST", "{no es json"],
      [PREPARAR, `${BASE}/preparar`, "POST", {}],
      [EDITAR, `${BASE}/carpetas`, "PATCH", { planId: "p1", clave: "Jefe Nuevo" }],
      [CREAR, `${BASE}/carpetas`, "POST", { planId: "p1", nombre: "" }],
      [VINCULAR, `${BASE}/vincular`, "POST", { planId: "p1", documentId: "d1" }],
    ] as const;
    for (const [ruta, url, method, body] of casos) {
      const res = await ruta(pedir(url, { method, body }));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(H.preparar).not.toHaveBeenCalled();
    expect(H.crearCarpeta).not.toHaveBeenCalled();
  });
});

describe("qué responde", () => {
  it("plan de otro negocio → 404 con código (la vista es null)", async () => {
    H.vista.mockResolvedValue(null);
    const res = await GET(pedir(`${BASE}?planId=ajeno`));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "plan_no_encontrado" });
  });

  it("un rechazo del dominio sale con su status y su mensaje", async () => {
    H.preparar.mockRejectedValue(new PlanDocumentosError("plan_no_encontrado", 404, "Ese plan de manejo no existe en este negocio."));
    const res = await PREPARAR(pedir(`${BASE}/preparar`, { method: "POST", body: { planId: "ajeno" } }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "plan_no_encontrado", message: "Ese plan de manejo no existe en este negocio." });

    H.crearCarpeta.mockRejectedValue(new PlanDocumentosError("carpeta_repetida", 409, "Ya hay una carpeta «Otros»."));
    const rep = await CREAR(pedir(`${BASE}/carpetas`, { method: "POST", body: { planId: "p1", nombre: "Otros" } }));
    expect(rep.status).toBe(409);
  });

  it("un error inesperado es 500 sin detalles", async () => {
    H.vincularArchivo.mockRejectedValue(new Error("boom con datos internos"));
    const res = await VINCULAR(pedir(`${BASE}/vincular`, { method: "POST", body: { planId: "p1", documentId: "d1", campoId: "c1" } }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("boom");
  });

  it("crear carpeta → 201 con la vista; el usuario de la sesión va a la auditoría", async () => {
    const res = await CREAR(pedir(`${BASE}/carpetas`, { method: "POST", body: { planId: "p1", nombre: "Fotos del predio" } }));
    expect(res.status).toBe(201);
    expect(H.crearCarpeta).toHaveBeenCalledWith("t1", { planId: "p1", nombre: "Fotos del predio", paraTodosLosPlanes: false }, "qa-admin");
  });

  it("plantilla: con ?planId devuelve la vista; sin él, la fila; id ajeno → 404", async () => {
    const fila = { id: "c1", clave: "otros", nombre: "Otros", orden: 4, activo: false, renombradas: 0 };
    H.editarPlantillaCarpeta.mockResolvedValue(fila);
    const conPlan = await PLANTILLA(pedir(`${BASE}/plantilla?planId=p1`, { method: "PATCH", body: { id: "c1", activo: false } }));
    expect(await conPlan.json()).toEqual({ vista: VISTA });
    expect(H.vista).toHaveBeenCalledWith("t1", "p1");

    const sinPlan = await PLANTILLA(pedir(`${BASE}/plantilla`, { method: "PATCH", body: { id: "c1", activo: false } }));
    expect(await sinPlan.json()).toEqual({ plantilla: fila });

    H.editarPlantillaCarpeta.mockResolvedValue(null);
    const ajena = await PLANTILLA(pedir(`${BASE}/plantilla?planId=p1`, { method: "PATCH", body: { id: "ajeno" } }));
    expect(ajena.status).toBe(404);
  });
});
