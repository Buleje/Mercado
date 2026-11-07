/**
 * ADR-478 · las rutas de /api/admin/forestal/cubicaciones-trozas: quién puede
 * qué (el almacenero guarda pero no aplica; el bypass de `manager` se corta en
 * la plata), sin sesión 401, Zod y los códigos de error de negocio.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "brandon", role: "admin" } as { tenantId: string; username: string; role: string } | null,
  db: {
    list: vi.fn(async () => []),
    guardar: vi.fn(async () => ({ id: "c1", codigo: "CUB-2026-0001" })),
    detalle: vi.fn(async () => null as unknown),
    editar: vi.fn(),
    borrar: vi.fn(async () => {}),
    aplicar: vi.fn(async () => ({ cubicacion: { id: "c1" }, imputacion: [], repetido: false })),
    anular: vi.fn(async () => ({ cubicacion: { id: "c1" }, repetido: false })),
  },
  /* ADR-483: la cubicación comercial (aserrada y prellenado del origen). */
  comercial: {
    guardarAserrada: vi.fn(async () => ({ id: "c2", codigo: "CUB-2026-0002", material: "aserrada" })),
    editarAserrada: vi.fn(async () => ({ id: "c2" })),
    prefillLoth: vi.fn(async () => ({ tipo: "loth", gtfId: "g1", trozas: [] })),
    prefillDespacho: vi.fn(async () => ({ tipo: "despacho", despachoId: "d1", lineas: [] })),
  },
  specs: new Set(["spec:forestal:herramientas", "spec:forestal:loth-libro", "spec:forestal:ctp-libro"]),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => H.auth ?? NextResponse.json({ error: "unauthorized" }, { status: 401 })),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async (_t: string, spec: string) => H.specs.has(spec) }));
vi.mock("@/lib/db/forest-cubicacion-comercial.db", () => ({ CubicacionComercialDB: H.comercial }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/db/forest-cubicacion-trozas.db", async () => {
  class CubicacionTrozasError extends Error {
    constructor(readonly code: string, message: string, readonly extra: Record<string, unknown> = {}, readonly status = 409) {
      super(message);
    }
  }
  return { ForestCubicacionTrozasDB: H.db, CubicacionTrozasError };
});
vi.mock("@/lib/db/adelantos.db", () => ({
  AdelantosDB: {
    listBeneficiarios: vi.fn(async () => [
      { id: "b1", nombre: "Wasaco", documento: "45678912", telefono: "987654321", forestPartyId: null },
      { id: "b2", nombre: "Sin nada abierto", documento: null, telefono: null, forestPartyId: null },
    ]),
    saldosPorPersona: vi.fn(async () => [
      { beneficiarioId: "b1", status: "ABIERTO", saldoPendiente: 450, moneda: "PEN", cantidad: 1, direccion: "DADO" },
    ]),
  },
}));
vi.mock("@/lib/db/forest-directorio.db", () => ({
  ForestDirectorioDB: { listarPartes: vi.fn(async () => [{ id: "p1", nombre: "Aserradero Sur", docNumero: "20123456789", telefono: "912345678" }]) },
}));
vi.mock("@/lib/db/forest-cuenta.db", () => ({ ForestCuentaDB: { listar: vi.fn(async () => []) } }));

import { GET as LISTAR, POST as GUARDAR } from "@/app/api/admin/forestal/cubicaciones-trozas/route";
import { GET as VER, DELETE as BORRAR } from "@/app/api/admin/forestal/cubicaciones-trozas/[id]/route";
import { POST as APLICAR } from "@/app/api/admin/forestal/cubicaciones-trozas/[id]/aplicar/route";
import { POST as ANULAR } from "@/app/api/admin/forestal/cubicaciones-trozas/[id]/anular/route";
import { GET as PERSONAS } from "@/app/api/admin/forestal/cubicaciones-trozas/personas/route";
import { GET as ORIGEN } from "@/app/api/admin/forestal/cubicaciones-trozas/origen/route";
import { PATCH as EDITAR } from "@/app/api/admin/forestal/cubicaciones-trozas/[id]/route";
import { CubicacionTrozasError } from "@/lib/db/forest-cubicacion-trozas.db";

const URL_BASE = "http://localhost/api/admin/forestal/cubicaciones-trozas";
const req = (metodo: string, ruta = "", body?: unknown) =>
  new NextRequest(`${URL_BASE}${ruta}`, { method: metodo, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const ctx = { params: Promise.resolve({ id: "c1" }) };
const cubicacion = { fecha: "2026-10-08", formula: "oxapampina", diametros: 1, beneficiarioId: "b1", trozas: [{ especie: "Tornillo", d1: 20, largo: 12 }] };
const aplicar = { precios: [{ clave: "tornillo", precio: 1.2 }], montoVisto: 235.1, idempotencyKey: "clave-123456", version: 1 };

beforeEach(() => {
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  H.specs = new Set(["spec:forestal:herramientas", "spec:forestal:loth-libro", "spec:forestal:ctp-libro"]);
  vi.clearAllMocks();
});

describe("cubicaciones-trozas · roles", () => {
  it("sin sesión → 401 (también en escrituras)", async () => {
    H.auth = null;
    expect((await LISTAR(req("GET"))).status).toBe(401);
    expect((await APLICAR(req("POST", "/c1/aplicar", aplicar), ctx)).status).toBe(401);
  });

  it("el almacenero guarda (201) pero NO aplica ni anula ni borra (403)", async () => {
    H.auth = { tenantId: "t1", username: "patio", role: "almacenero" };
    expect((await GUARDAR(req("POST", "", cubicacion))).status).toBe(201);
    expect(H.db.guardar).toHaveBeenCalledWith("t1", expect.objectContaining({ sentido: "compra" }), { usuario: "patio", ip: "127.0.0.1" });
    expect((await APLICAR(req("POST", "/c1/aplicar", aplicar), ctx)).status).toBe(403);
    expect((await ANULAR(req("POST", "/c1/anular", { motivo: "medí mal" }), ctx)).status).toBe(403);
    expect((await BORRAR(req("DELETE", "/c1"), ctx)).status).toBe(403);
    expect(H.db.aplicar).not.toHaveBeenCalled();
  });

  it("manager (bypass de gestión de requireAdmin) → 403 en aplicar y anular", async () => {
    H.auth = { tenantId: "t1", username: "gerente", role: "manager" };
    expect((await APLICAR(req("POST", "/c1/aplicar", aplicar), ctx)).status).toBe(403);
    expect((await ANULAR(req("POST", "/c1/anular", { motivo: "medí mal" }), ctx)).status).toBe(403);
    expect(H.db.anular).not.toHaveBeenCalled();
  });

  it("el almacenero elige la persona sin ver la plata: nombres sin documento ni teléfono; el detalle sin saldos", async () => {
    H.auth = { tenantId: "t1", username: "patio", role: "almacenero" };
    const r = await PERSONAS(req("GET", "/personas"));
    expect(r.status).toBe(200);
    const texto = await r.text();
    /* Las mismas filas que «Cuenta por persona» (sólo quien tiene algo abierto), sin plata ni datos personales. */
    expect(JSON.parse(texto).personas).toEqual([{ clave: "benef:b1", nombre: "Wasaco", beneficiarioId: "b1", parteId: null }]);
    for (const dato of ["45678912", "987654321", "20123456789", "912345678", "450", "saldo", "teDebe"]) expect(texto).not.toContain(dato);

    /* Quien lee Adelantos recibe además los saldos de cada fila (para «te debe S/ 450»). */
    H.auth = { tenantId: "t1", username: "dueno", role: "admin" };
    const conPlata = await (await PERSONAS(req("GET", "/personas"))).json();
    expect(conPlata.conSaldos).toBe(true);
    expect(conPlata.personas[0]).toMatchObject({ clave: "benef:b1", adelantos: { teDebe: 450, abiertos: 1 } });
    expect(JSON.stringify(conPlata)).not.toContain("987654321");

    H.auth = { tenantId: "t1", username: "patio", role: "almacenero" };
    const detalle = { cubicacion: { id: "c1" }, adelantosAbiertos: [{ id: "a1", saldo: 450 }], ultimosPrecios: { tornillo: 1 } };
    H.db.detalle.mockResolvedValueOnce(detalle);
    expect(await (await VER(req("GET", "/c1"), ctx)).json()).toEqual({ cubicacion: { id: "c1" } });
    H.auth = { tenantId: "t1", username: "dueno", role: "admin" };
    H.db.detalle.mockResolvedValueOnce(detalle);
    expect(await (await VER(req("GET", "/c1"), ctx)).json()).toEqual(detalle);
  });

  it("dueño aplica con el tenant del JWT", async () => {
    H.auth = { tenantId: "t1", username: "dueno", role: "owner" };
    expect((await APLICAR(req("POST", "/c1/aplicar", aplicar), ctx)).status).toBe(200);
    expect(H.db.aplicar).toHaveBeenCalledWith("t1", "c1", expect.objectContaining({ montoVisto: 235.1 }), expect.objectContaining({ usuario: "dueno" }));
  });
});

describe("cubicaciones-trozas · Zod y errores", () => {
  it("rechaza trozas vacías, fecha mal y precio 0 (422 validation_error)", async () => {
    expect((await GUARDAR(req("POST", "", { ...cubicacion, trozas: [] }))).status).toBe(422);
    expect((await GUARDAR(req("POST", "", { ...cubicacion, fecha: "8-10-2026" }))).status).toBe(422);
    const r = await APLICAR(req("POST", "/c1/aplicar", { ...aplicar, precios: [{ clave: "tornillo", precio: 0 }] }), ctx);
    expect(r.status).toBe(422);
    expect((await r.json()).error).toBe("validation_error");
    expect(H.db.guardar).not.toHaveBeenCalled();
  });

  it("de otro negocio → 404; el error de negocio sale con su código y sus datos", async () => {
    expect((await VER(req("GET", "/c1"), ctx)).status).toBe(404);
    H.db.aplicar.mockRejectedValueOnce(new (CubicacionTrozasError as unknown as new (...a: unknown[]) => Error)("MONTO_CAMBIO", "El monto es S/ 240,00", { monto: 240 }, 409));
    const r = await APLICAR(req("POST", "/c1/aplicar", aplicar), ctx);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ error: "MONTO_CAMBIO", monto: 240 });
  });
});

describe("cubicaciones-trozas · comercial (ADR-483)", () => {
  const aserrada = { material: "aserrada", modo: "total", fecha: "2026-10-08", beneficiarioId: "b1", lineas: [{ especie: "General", pt: 1250 }] };

  it("POST con material aserrada va a la DB comercial; sin material, a la de trozas", async () => {
    expect((await GUARDAR(req("POST", "", aserrada))).status).toBe(201);
    expect(H.comercial.guardarAserrada).toHaveBeenCalledWith("t1", expect.objectContaining({ modo: "total", sentido: "venta" }), expect.objectContaining({ usuario: "brandon" }));
    expect(H.db.guardar).not.toHaveBeenCalled();
    expect((await GUARDAR(req("POST", "", { ...aserrada, lineas: [] }))).status).toBe(422);
    expect((await GUARDAR(req("POST", "", { ...cubicacion, origen: "loth" }))).status).toBe(422);
    expect((await GUARDAR(req("POST", "", { ...cubicacion, origen: "loth", origenId: "g1", trozas: [{ especie: "Tornillo", d1: 20, largo: 12, descuento: { hueco: 4 } }] }))).status).toBe(201);
    expect(H.db.guardar).toHaveBeenCalledWith("t1", expect.objectContaining({ origen: "loth", origenId: "g1" }), expect.anything());
  });

  it("PATCH con material aserrada → editarAserrada; GET de la lista valida material y origen", async () => {
    expect((await EDITAR(req("PATCH", "/c2", { ...aserrada, version: 1 }), ctx)).status).toBe(200);
    expect(H.comercial.editarAserrada).toHaveBeenCalledWith("t1", "c1", expect.objectContaining({ version: 1 }), expect.anything());
    expect((await LISTAR(req("GET", "?material=madera"))).status).toBe(422);
    expect((await LISTAR(req("GET", "?origen=otro"))).status).toBe(422);
    expect((await LISTAR(req("GET", "?material=todas&origen=despacho&origenId=d1"))).status).toBe(200);
    expect(H.db.list).toHaveBeenCalledWith("t1", expect.objectContaining({ material: "todas", origen: "despacho", origenId: "d1" }));
  });

  it("origen: sin sesión 401, tipo mal 422, libro apagado 403, con el tenant del JWT", async () => {
    H.auth = null;
    expect((await ORIGEN(req("GET", "/origen?tipo=loth&id=g1"))).status).toBe(401);
    H.auth = { tenantId: "t1", username: "patio", role: "almacenero" };
    expect((await ORIGEN(req("GET", "/origen?tipo=otro&id=g1"))).status).toBe(422);
    expect((await ORIGEN(req("GET", "/origen?tipo=loth"))).status).toBe(422);
    const r = await ORIGEN(req("GET", "/origen?tipo=loth&id=g1"));
    expect(r.status).toBe(200);
    expect((await r.json()).prefill).toMatchObject({ tipo: "loth", gtfId: "g1" });
    expect(H.comercial.prefillLoth).toHaveBeenCalledWith("t1", "g1");
    H.specs.delete("spec:forestal:ctp-libro");
    expect((await ORIGEN(req("GET", "/origen?tipo=despacho&id=d1"))).status).toBe(403);
    expect(H.comercial.prefillDespacho).not.toHaveBeenCalled();
    H.comercial.prefillLoth.mockRejectedValueOnce(new (CubicacionTrozasError as unknown as new (...a: unknown[]) => Error)("ORIGEN_NO_ENCONTRADO", "Esa guía no está", {}, 404));
    expect((await ORIGEN(req("GET", "/origen?tipo=loth&id=ajena"))).status).toBe(404);
  });

  it("POST y PATCH con origen de un libro apagado → 403 sin tocar la base (como el prellenado)", async () => {
    H.specs.delete("spec:forestal:ctp-libro");
    H.specs.delete("spec:forestal:loth-libro");
    const deDespacho = { ...aserrada, origen: "despacho", origenId: "d1" };
    const deLaGuia = { ...cubicacion, origen: "loth", origenId: "g1" };
    expect((await GUARDAR(req("POST", "", deDespacho))).status).toBe(403);
    expect((await GUARDAR(req("POST", "", deLaGuia))).status).toBe(403);
    expect((await EDITAR(req("PATCH", "/c1", { ...deDespacho, version: 1 }), ctx)).status).toBe(403);
    expect((await EDITAR(req("PATCH", "/c1", { ...deLaGuia, version: 1 }), ctx)).status).toBe(403);
    expect([H.comercial.guardarAserrada, H.comercial.editarAserrada, H.db.guardar, H.db.editar].every((f) => f.mock.calls.length === 0)).toBe(true);
    /* Libre o sin origen no pide el libro. */
    expect((await GUARDAR(req("POST", "", aserrada))).status).toBe(201);
    expect((await GUARDAR(req("POST", "", cubicacion))).status).toBe(201);
  });
});
