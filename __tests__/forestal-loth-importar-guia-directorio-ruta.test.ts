// @vitest-environment node
/**
 * ADR-461 (02-10 noche) — las RUTAS con el directorio, con el `requireAdmin`
 * REAL (sólo se finge la sesión):
 *
 *  - importar: lo del directorio se guarda SÓLO si la guía entró, con el plan
 *    al que fue y el usuario de la sesión; si el directorio falla, la guía
 *    sigue importada (no se reporta «error del servidor, no quedó nada»);
 *  - un encargado no importa (403) y no llega a escribir el directorio;
 *  - vista previa: sale con la sección de directorio que arma el servidor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  importar: vi.fn(),
  vista: vi.fn(),
  resolver: vi.fn(),
  guardar: vi.fn(),
  anotar: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/session", async (real) => ({ ...(await real<typeof import("@/lib/session")>()), getSessionPayload: async () => H.payload }));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/db/forest-loth-importar.db", () => ({
  ImportacionEnCursoError: class extends Error {},
  ForestLothImportarDB: { importarGuia: H.importar, vistaPrevia: H.vista },
}));
vi.mock("@/lib/db/forest-loth-importar-directorio.db", () => ({
  ForestLothImportarDirectorioDB: { guardar: H.guardar, anotarVistaPrevia: H.anotar },
}));
vi.mock("@/lib/forestal/loth-importar-guia-fuentes", () => ({ resolverFuentes: H.resolver, cobrarConsultasSerfor: () => null }));

import { POST as postImportar } from "@/app/api/admin/forestal/loth/importar-guia/route";
import { POST as postVista } from "@/app/api/admin/forestal/loth/importar-guia/vista-previa/route";

let ip = 0;
const pedido = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { cookie: "buleje-admin-sess=token-falso", "content-type": "application/json", "x-forwarded-for": `10.1.0.${++ip}` },
    body: JSON.stringify(body),
  });

const FICHA = (n: string) => ({ numeroRegistro: `1-10-000000${n}`, gtfNumber: `010-001-000000${n}`, fechaExpedicion: `0${n}/09/2026`, trozas: [] });
const resuelta = (n: string) => ({ clave: `ctp:w${n}`, fuente: { tipo: "ctp", woodEntryId: `w${n}` }, ficha: FICHA(n), verificada: true, falla: null, planElegido: null });
const IMPORTADA = { estado: "importada", mensaje: "ok", codigo: null, gtfId: "g1", gtfNumber: "010-001-0000001", planId: "plan-1", planCreado: true, lineas: null, volumenM3: 1 };
const RECHAZADA = { ...IMPORTADA, estado: "rechazada", codigo: "conflicto_troza", gtfId: null, planId: null, planCreado: false };
const DIRECTORIO = { partes: [{ clave: "titular", accion: "agregar" }], permiso: { accion: "agregar" } };
const item = (n: string) => ({ fuente: { tipo: "ctp", woodEntryId: `w${n}` }, planDestino: { tipo: "existente", planId: "plan-1" }, crearTala: true, directorio: DIRECTORIO });

beforeEach(() => {
  H.payload = { username: "qa-admin", role: "admin", tenantId: "t1" };
  for (const f of [H.importar, H.vista, H.resolver, H.guardar, H.anotar]) f.mockReset();
});

describe("POST …/importar-guia con directorio", () => {
  it("guarda el directorio sólo de la guía que ENTRÓ, con su plan y el usuario de la sesión", async () => {
    H.resolver.mockResolvedValue([resuelta("1"), resuelta("2")]);
    H.importar.mockImplementation(async (_t: string, x: { ficha: { gtfNumber: string } }) => (x.ficha.gtfNumber.endsWith("1") ? IMPORTADA : RECHAZADA));
    H.guardar.mockResolvedValue([{ clave: "titular", nombre: "X", estado: "agregado", mensaje: "Agregado al directorio.", id: "p1" }]);
    const r = await postImportar(pedido("/api/admin/forestal/loth/importar-guia", { items: [item("1"), item("2")] }));
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(H.guardar).toHaveBeenCalledTimes(1);
    expect(H.guardar).toHaveBeenCalledWith("t1", expect.objectContaining({ planId: "plan-1", createdBy: "qa-admin", gtfNumber: "010-001-0000001", pedido: expect.objectContaining(DIRECTORIO) }));
    expect(j.resultados[0].directorio[0].estado).toBe("agregado");
    expect(j.resultados[1].directorio).toBeUndefined();
  });

  it("si el directorio falla, la guía sigue importada", async () => {
    H.resolver.mockResolvedValue([resuelta("1")]);
    H.importar.mockResolvedValue(IMPORTADA);
    H.guardar.mockRejectedValue(new Error("se cayó"));
    const r = await postImportar(pedido("/api/admin/forestal/loth/importar-guia", { items: [item("1")] }));
    expect(r.status).toBe(201);
    expect((await r.json()).resultados[0].estado).toBe("importada");
  });

  it("un encargado no importa ni escribe el directorio (403)", async () => {
    H.payload = { username: "enc", role: "manager", tenantId: "t1" };
    const r = await postImportar(pedido("/api/admin/forestal/loth/importar-guia", { items: [item("1")] }));
    expect(r.status).toBe(403);
    expect(H.importar).not.toHaveBeenCalled();
    expect(H.guardar).not.toHaveBeenCalled();
  });

  it("un pedido de directorio mal formado → 400 sin tocar nada", async () => {
    const malo = { ...item("1"), directorio: { partes: [{ clave: "cualquiera", accion: "agregar" }] } };
    const r = await postImportar(pedido("/api/admin/forestal/loth/importar-guia", { items: [malo] }));
    expect(r.status).toBe(400);
    expect(H.importar).not.toHaveBeenCalled();
  });
});

describe("POST …/importar-guia/vista-previa", () => {
  it("sale con la sección de directorio que arma el servidor sobre la vista previa", async () => {
    const guias = [resuelta("1")];
    const vista = [{ clave: "ctp:w1", directorio: null }];
    H.resolver.mockResolvedValue(guias);
    H.vista.mockResolvedValue(vista);
    H.anotar.mockResolvedValue([{ clave: "ctp:w1", directorio: { partes: [], vehiculo: null, permiso: null } }]);
    const r = await postVista(pedido("/api/admin/forestal/loth/importar-guia/vista-previa", { fuentes: [{ tipo: "ctp", woodEntryId: "w1" }] }));
    expect(r.status).toBe(200);
    expect(H.anotar).toHaveBeenCalledWith("t1", guias, vista);
    expect((await r.json()).guias[0].directorio).toEqual({ partes: [], vehiculo: null, permiso: null });
  });
});
