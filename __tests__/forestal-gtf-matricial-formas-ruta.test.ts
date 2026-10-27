/**
 * Rutas de las «formas» del talonario (16-10): `…/gtf-matricial` (abrir y
 * guardar), `…/gtf-matricial/formas` (nueva, renombrar, borrar) y la salida
 * con `forma=`. Cada negocio ve sólo las suyas; la salida usa la pedida y, si
 * ya no existe, NO cae a otra (gastaría una hoja numerada con otro encaje).
 *
 * Desde el 27-10 el talonario también imprime la GTF de SALIDA de un despacho
 * del Libro CTP (`despacho=` / `despachoId=`): una sola forma para todas las
 * salidas del CTP (su razón social), que nunca pisa la de una guía del Libro TH.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { gtfDatosConFicha } from "@/lib/forestal/loth-importar-guia";
import { hojaDeFabrica } from "@/lib/forestal/gtf-matricial-disposicion";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { entradasGuiaSalida, type GuiaSalidaImprimible } from "@/lib/forestal/guia-salida-imprimible";

interface Sesion {
  tenantId: string;
  role: string;
  username: string;
}

const { estado, logger } = vi.hoisted(() => ({
  estado: {
    sesion: null as Sesion | null,
    kv: new Map<string, unknown>(),
    guias: new Map<string, Record<string, unknown>>(),
    despachos: new Map<string, Record<string, unknown>>(),
    salidas: new Map<string, unknown>(),
    razonSocial: new Map<string, string>(),
    apagadas: new Set<string>(),
  },
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/require-admin", async () => {
  const { NextResponse } = await import("next/server");
  return { requireAdmin: vi.fn(async () => estado.sesion ?? NextResponse.json({ error: "unauthorized" }, { status: 401 })) };
});
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async (_t: string, spec: string) => !estado.apagadas.has(spec) }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/db/platform-settings.db", () => ({
  PlatformSettingsDB: {
    getFresco: vi.fn(async (k: string) => estado.kv.get(k) ?? null),
    actualizar: vi.fn(async (k: string, cambio: (a: unknown) => { valor?: unknown; resultado: unknown }) => {
      const r = cambio(estado.kv.get(k) ?? null);
      if (r.valor !== undefined) estado.kv.set(k, JSON.parse(JSON.stringify(r.valor)));
      return r.resultado;
    }),
  },
}));
/** La guía sólo existe para SU tenant: como el WHERE `{ tenantId, id }` real. */
vi.mock("@/lib/db/forest-gtf.db", () => ({
  ForestGtfDB: {
    getById: vi.fn(async (tenantId: string, id: string) => estado.guias.get(`${tenantId}:${id}`) ?? null),
    estadosPorIds: vi.fn(async (tenantId: string, ids: readonly string[]) =>
      ids.flatMap((id) => {
        const g = estado.guias.get(`${tenantId}:${id}`);
        return g ? [{ id, status: String(g.status) }] : [];
      }),
    ),
  },
}));
vi.mock("@/lib/db/forest-loth.db", () => ({ ForestLothDB: { getActiveCaratula: vi.fn(async () => null) } }));
/** El despacho del Libro CTP, también sólo para SU tenant. */
vi.mock("@/lib/db/forest-ctp.db", () => ({
  ForestCtpDB: { getById: vi.fn(async (tenantId: string, id: string) => estado.despachos.get(`${tenantId}:${id}`) ?? null) },
}));
vi.mock("@/lib/db/forest-ctp-ficha.db", () => ({
  ForestCtpFichaDB: { get: vi.fn(async (tenantId: string) => ({ razonSocial: estado.razonSocial.get(tenantId) ?? "" })) },
}));
vi.mock("@/lib/db/forest-ctp-guia-salida.db", () => ({
  ForestCtpGuiaSalidaDB: {
    guiaSalidaDeDespacho: vi.fn(async (tenantId: string, id: string) => estado.salidas.get(`${tenantId}:${id}`) ?? { ok: false, error: "NO_EXISTE" }),
  },
}));

const T = "t-qa-formas";
const AJENO = "t-otro-negocio";
const FICHA = (fichasJson as unknown as Record<string, GtfSerfor>)["1-10-0473187"];
const guia = (extra: Record<string, unknown>) => ({
  id: "gtf-1", tenantId: T, gtfNumber: "019-001-0000482", gtfDate: new Date("2026-09-02T00:00:00.000Z"), tipo: "trozas",
  titularName: "MADERERA EL AGUAJAL S.A.C.", tituloHabilitante: "17-CPO/C-J-001-02", planId: null, status: "emitida", annulledReason: null,
  parcelaCorta: null, transportista: null, transportistaDoc: null, conductor: null, conductorLicencia: null, placaVehiculo: null,
  origen: null, destino: null, observations: null, volumenTotalM3: null,
  items: Array.from({ length: 3 }, (_, i) => ({ code: `T-${i + 1}`, species: "Tornillo", diamMayorM: 0.6, diamMenorM: 0.5, lengthM: 4, volumeM3: 0.95 })),
  gtfDatos: JSON.parse(JSON.stringify(gtfDatosConFicha(FICHA, true))) as unknown,
  ...extra,
});

const BASE = "http://localhost/api/admin/forestal/loth/gtf-matricial";
type Json = Record<string, unknown> & { forma?: { id: string; nombre: string; coincide: string | null }; nueva?: { nombre: string } | null };

async function talonario(method: "GET" | "PUT", qsOBody: string | Record<string, unknown>) {
  const ruta = await import("@/app/api/admin/forestal/loth/gtf-matricial/route");
  const req =
    method === "GET"
      ? new NextRequest(`${BASE}?${qsOBody as string}`)
      : new NextRequest(BASE, { method, body: JSON.stringify(qsOBody) });
  const res = await ruta[method](req);
  return { res, j: (await res.json()) as Json };
}
async function formas(method: "POST" | "PATCH" | "DELETE", body?: unknown, qs = "") {
  const ruta = await import("@/app/api/admin/forestal/loth/gtf-matricial/formas/route");
  const req = new NextRequest(`${BASE}/formas${qs}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const res = await ruta[method](req);
  return { res, j: (await res.json()) as Json };
}
async function salida(qs: string) {
  const { GET } = await import("@/app/api/admin/forestal/loth/gtf-matricial/salida/route");
  return GET(new NextRequest(`${BASE}/salida?${qs}`));
}
const guiaCorrida = (dx: number) => ({ ...hojaDeFabrica("guia"), offsetXMm: dx });

/** La GTF de salida que devuelve `ForestCtpGuiaSalidaDB` para un despacho emitido (3 productos aserrados). */
const salidaCtp = (extra: Partial<GuiaSalidaImprimible> = {}) => {
  const guia: GuiaSalidaImprimible = {
    despachoId: "desp-77", lineNo: 77, lineIds: ["desp-77"], gtfNumber: "019-002-0000077", fecha: "2026-10-20",
    datos: leerGtfDatos({ destinatario: { nombre: "Maderas Lima" }, vehiculo: { placa: "ABC-123" } }),
    lineas: [{ cientifico: "Cedrelinga cateniformis", comun: "Tornillo", tipoProducto: "Madera aserrada", presentacion: "m³", cantidad: 40, unidad: "m³", total: 12.345 }],
    cadena: { corridas: [{ lineNo: 40, quantity: 12.345, guias: ["019-001-000123"] }] },
    trozas: [], enRollo: false, titular: "MADERERA EL AGUAJAL S.A.C.", faltan: [], anulada: false,
    ...extra,
  };
  return { ok: true, guia, entradas: entradasGuiaSalida(guia, { razonSocial: guia.titular }) };
};
const bytes = async (res: Response) => Buffer.from(await res.arrayBuffer()).toString("hex");

beforeEach(() => {
  vi.resetModules();
  estado.sesion = { tenantId: T, role: "admin", username: "qa" };
  estado.kv.clear();
  estado.guias.clear();
  estado.guias.set(`${T}:gtf-aguajal`, guia({ id: "gtf-aguajal" }));
  estado.guias.set(`${T}:gtf-santos`, guia({ id: "gtf-santos", gtfNumber: "019-001-0000483", titularName: "SANTOS MUÑOZ ROJAS", tituloHabilitante: "25-UCA-C-PER-009-21" }));
  estado.guias.set(`${AJENO}:gtf-ajena`, guia({ id: "gtf-ajena", tenantId: AJENO }));
  estado.despachos.clear();
  estado.salidas.clear();
  estado.razonSocial.clear();
  estado.apagadas.clear();
  /* El CTP se llama igual que el titular de la guía del Libro TH (el aserradero también tiene monte). */
  estado.razonSocial.set(T, "MADERERA EL AGUAJAL S.A.C.");
  for (const id of ["desp-77", "desp-78"]) estado.despachos.set(`${T}:${id}`, { id, tenantId: T, section: "despacho", gtfNumber: null });
  estado.despachos.set(`${T}:prod-5`, { id: "prod-5", tenantId: T, section: "produccion" });
  estado.despachos.set(`${AJENO}:desp-ajeno`, { id: "desp-ajeno", tenantId: AJENO, section: "despacho" });
  logger.error.mockClear();
});

describe("sin sesión", () => {
  it("todas las rutas de formas → 401 (nunca 404: un 404 saca del panel)", async () => {
    estado.sesion = null;
    expect((await talonario("GET", "gtf=gtf-aguajal")).res.status).toBe(401);
    expect((await formas("POST", { guia: {}, lista: {} })).res.status).toBe(401);
    expect((await formas("PATCH", { formaId: "f-1", nombre: "X" })).res.status).toBe(401);
    expect((await formas("DELETE", undefined, "?forma=f-1")).res.status).toBe(401);
  });
});

describe("abrir y guardar por guía", () => {
  it("la guía sin forma abre la nueva con «permiso · titular»; el 1.er Guardar la crea y otra guía (otro permiso) abre otra", async () => {
    const a = await talonario("GET", "gtf=gtf-aguajal");
    expect(a.j).toMatchObject({ forma: null, origen: "fabrica", nueva: { nombre: "17-CPO/C-J-001-02 · MADERERA EL AGUAJAL S.A.C." } });
    const p = await talonario("PUT", { gtfId: "gtf-aguajal", formato: "guia", hoja: guiaCorrida(12) });
    expect(p.res.status).toBe(200);
    expect(p.j).toMatchObject({ creada: true, forma: { nombre: "17-CPO/C-J-001-02 · MADERERA EL AGUAJAL S.A.C.", coincide: "exacta" } });
    expect((await talonario("GET", "gtf=gtf-aguajal")).j).toMatchObject({ forma: { id: p.j.forma?.id }, coincide: "exacta" });
    const s = await talonario("GET", "gtf=gtf-santos");
    expect(s.j).toMatchObject({ forma: null, nueva: { nombre: "25-UCA-C-PER-009-21 · SANTOS MUÑOZ ROJAS" } });
    expect((s.j.formas as unknown[]).length).toBe(1);
  });

  it("la forma de OTRO negocio no existe para éste: abrir, guardar y la salida → 404", async () => {
    estado.sesion = { tenantId: AJENO, role: "admin", username: "intruso" };
    const ajena = await talonario("PUT", { gtfId: "gtf-ajena", formato: "guia", hoja: guiaCorrida(5) });
    const id = ajena.j.forma?.id as string;
    expect(id).toMatch(/^f-/);
    estado.sesion = { tenantId: T, role: "admin", username: "qa" };
    expect((await talonario("GET", `gtf=gtf-aguajal&forma=${id}`)).res.status).toBe(404);
    expect((await talonario("PUT", { gtfId: "gtf-aguajal", formaId: id, formato: "guia", hoja: guiaCorrida(1) })).res.status).toBe(404);
    expect((await salida(`gtfId=gtf-aguajal&formato=escp&forma=${id}`)).status).toBe(404);
    expect((await formas("DELETE", undefined, `?forma=${id}`)).res.status).toBe(404);
    /* La guía de otro negocio tampoco: la busca con el tenant de la sesión. */
    expect((await talonario("GET", "gtf=gtf-ajena")).res.status).toBe(404);
  });

  it("un id con forma rara → 400 (no llega a la base)", async () => {
    expect((await talonario("GET", "gtf=gtf-aguajal&forma=../x")).res.status).toBe(400);
    expect((await salida("gtfId=gtf-aguajal&formato=pdf&forma=__proto__")).status).toBe(400);
  });
});

describe("la salida usa la forma pedida", () => {
  it("con `forma=` sale con ésa; sin ella, con la de la guía; una borrada → 404 forma_no_existe", async () => {
    const a = await talonario("PUT", { gtfId: "gtf-aguajal", formato: "guia", hoja: guiaCorrida(0) });
    const b = await formas("POST", { gtfId: "gtf-aguajal", nombre: "Corrida 20 mm", guia: guiaCorrida(20), lista: hojaDeFabrica("lista") });
    expect(b.res.status).toBe(201);
    const idA = a.j.forma?.id as string;
    const idB = b.j.forma?.id as string;
    const conA = await bytes(await salida(`gtfId=gtf-aguajal&formato=escp&forma=${idA}`));
    const conB = await bytes(await salida(`gtfId=gtf-aguajal&formato=escp&forma=${idB}`));
    expect(conA).not.toBe(conB);
    /* Sin forma: la más reciente de las de la guía (la copia). */
    expect(await bytes(await salida("gtfId=gtf-aguajal&formato=escp"))).toBe(conB);
    expect((await formas("DELETE", undefined, `?forma=${idB}&gtf=gtf-aguajal`)).res.status).toBe(200);
    const res = await salida(`gtfId=gtf-aguajal&formato=escp&forma=${idB}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "forma_no_existe" });
    expect(await bytes(await salida("gtfId=gtf-aguajal&formato=escp"))).toBe(conA);
  });
});

describe("nueva, renombrar y borrar", () => {
  it("nueva sin nombre = automático con «(2)»; renombrar a uno repetido → 409; renombrar → 200", async () => {
    await talonario("PUT", { gtfId: "gtf-aguajal", formato: "guia", hoja: guiaCorrida(0) });
    const c = await formas("POST", { gtfId: "gtf-aguajal", guia: guiaCorrida(3), lista: hojaDeFabrica("lista") });
    expect(c.j.forma?.nombre).toBe("17-CPO/C-J-001-02 · MADERERA EL AGUAJAL S.A.C. (2)");
    const id = c.j.forma?.id as string;
    const rep = await formas("PATCH", { gtfId: "gtf-aguajal", formaId: id, nombre: "17-cpo/c-j-001-02 · maderera el aguajal s.a.c." });
    expect(rep.res.status).toBe(409);
    expect(rep.j).toMatchObject({ error: "nombre_repetido" });
    expect((await formas("PATCH", { gtfId: "gtf-aguajal", formaId: id, nombre: "Aguajal · matricial del monte" })).j.forma?.nombre).toBe("Aguajal · matricial del monte");
    expect((await formas("PATCH", { formaId: id, nombre: "x".repeat(61) })).res.status).toBe(400);
  });

  it("no se borra la que va a salir en el monte (aunque la cola no la nombre: la elige la guía) → 409 en_uso", async () => {
    const a = await talonario("PUT", { gtfId: "gtf-aguajal", formato: "guia", hoja: guiaCorrida(0) });
    const id = a.j.forma?.id as string;
    estado.kv.set(`gtf-cola-monte:${T}`, {
      contacto: null,
      trabajos: [{ id: "t1", gtfId: "gtf-aguajal", numeroGuia: "019-001-0000482", titular: "Aguajal", hojas: ["guia"], perfilId: "monte", estado: "pendiente", creadoEn: "2026-10-16T15:00:00.000Z", creadoPor: "qa" }],
    });
    const r = await formas("DELETE", undefined, `?forma=${id}&gtf=gtf-aguajal`);
    expect(r.res.status).toBe(409);
    expect(r.j).toMatchObject({ error: "en_uso" });
    expect(String(r.j.message)).toContain("019-001-0000482");
    /* Otra guía (Santos) no la usa: la suya es otra. */
    const s = await talonario("PUT", { gtfId: "gtf-santos", formato: "guia", hoja: guiaCorrida(4) });
    expect((await formas("DELETE", undefined, `?forma=${s.j.forma?.id}`)).res.status).toBe(200);
  });
});

describe("la GTF de salida de un despacho del Libro CTP (27-10)", () => {
  it("una forma para todas las salidas del CTP: arranca de la del Libro TH del mismo titular y guardarla NO la pisa", async () => {
    const th = await talonario("PUT", { gtfId: "gtf-aguajal", formato: "guia", hoja: guiaCorrida(12) });
    const idTh = th.j.forma?.id as string;
    /* Primera vez: abre la del monte (mismo titular) como punto de partida; el 1.er Guardar crea la del CTP. */
    const a = await talonario("GET", "despacho=desp-77");
    expect(a.res.status).toBe(200);
    expect(a.j).toMatchObject({ forma: { id: idTh }, coincide: "titular" });
    const p = await talonario("PUT", { despachoId: "desp-77", formato: "guia", hoja: guiaCorrida(30) });
    expect(p.res.status).toBe(200);
    expect(p.j).toMatchObject({ creada: true, forma: { nombre: "MADERERA EL AGUAJAL S.A.C.", coincide: "exacta" } });
    const idCtp = p.j.forma?.id as string;
    expect(idCtp).not.toBe(idTh);
    /* Otra salida del CTP abre la MISMA; la guía del Libro TH sigue con la suya, intacta. */
    expect((await talonario("GET", "despacho=desp-78")).j).toMatchObject({ forma: { id: idCtp }, coincide: "exacta" });
    const delTh = await talonario("GET", "gtf=gtf-aguajal");
    expect(delTh.j).toMatchObject({ forma: { id: idTh }, coincide: "exacta" });
    expect((delTh.j.disposicion as { guia: { offsetXMm: number } }).guia.offsetXMm).toBe(12);
    /* Nueva (copia) y borrar también por despacho. */
    const c = await formas("POST", { despachoId: "desp-77", nombre: "CTP · matricial de oficina", guia: guiaCorrida(5), lista: hojaDeFabrica("lista") });
    expect(c.res.status).toBe(201);
    expect((await formas("DELETE", undefined, `?forma=${c.j.forma?.id}&despacho=desp-77`)).res.status).toBe(200);
  });

  it("el despacho de OTRO negocio, o una línea que no es despacho → 404; los dos parámetros → 400", async () => {
    expect((await talonario("GET", "despacho=desp-ajeno")).res.status).toBe(404);
    expect((await talonario("PUT", { despachoId: "desp-ajeno", formato: "guia", hoja: guiaCorrida(1) })).res.status).toBe(404);
    expect((await talonario("GET", "despacho=prod-5")).res.status).toBe(404);
    expect((await salida("despachoId=desp-ajeno&formato=escp")).status).toBe(404);
    expect((await talonario("GET", "gtf=gtf-aguajal&despacho=desp-77")).res.status).toBe(400);
    const ambos = await talonario("PUT", { gtfId: "gtf-aguajal", despachoId: "desp-77", formato: "guia", hoja: guiaCorrida(1) });
    expect(ambos.res.status).toBe(400);
    expect(String(ambos.j.message)).toContain("no los dos");
    expect((await formas("POST", { gtfId: "gtf-aguajal", despachoId: "desp-77", guia: guiaCorrida(1), lista: hojaDeFabrica("lista") })).res.status).toBe(400);
    expect((await salida("gtfId=gtf-aguajal&despachoId=desp-77&formato=escp")).status).toBe(400);
    expect((await salida("formato=escp")).status).toBe(400);
  });

  it("la salida: sin N° → 409 SIN_GUIA; anulada o a medias → 409; emitida → sale con la forma del CTP", async () => {
    estado.salidas.set(`${T}:desp-77`, { ok: false, error: "SIN_GUIA" });
    const sin = await salida("despachoId=desp-77&formato=escp");
    expect(sin.status).toBe(409);
    expect(await sin.json()).toMatchObject({ error: "SIN_GUIA", message: "Emite la guía primero: botón Guía de la fila." });
    estado.salidas.set(`${T}:desp-77`, salidaCtp({ anulada: true }));
    expect((await salida("despachoId=desp-77&formato=escp")).status).toBe(409);
    /* El original no sale a medias (lo mismo que la hoja SERFOR); la hoja de prueba sí. */
    estado.salidas.set(`${T}:desp-77`, salidaCtp({ faltan: ["Destinatario", "Placa"] }));
    const aMedias = await salida("despachoId=desp-77&formato=escp");
    expect(aMedias.status).toBe(409);
    expect(await aMedias.json()).toMatchObject({ error: "FALTAN_DATOS", message: "Falta completar la guía: Destinatario, Placa. Ábrela con el botón Guía." });
    expect((await salida("despachoId=desp-77&formato=escp&prueba=1&valores=1")).status).toBe(200);
    estado.salidas.set(`${T}:desp-77`, salidaCtp());
    const conFabrica = await salida("despachoId=desp-77&formato=escp");
    expect(conFabrica.status).toBe(200);
    expect(conFabrica.headers.get("Content-Disposition")).toContain("GTF-019-002-0000077-guia.prn");
    /* Guardada la del CTP (corrida 30 mm), la salida la usa: otros bytes. */
    await talonario("PUT", { despachoId: "desp-77", formato: "guia", hoja: guiaCorrida(30) });
    expect(await bytes(await salida("despachoId=desp-77&formato=escp"))).not.toBe(await bytes(conFabrica));
  });

  it("cada guía pide SU libro: el despacho, el Libro CTP; la del monte, el Libro TH; sin guía, cualquiera de los dos", async () => {
    estado.apagadas.add("spec:forestal:ctp-libro");
    expect((await talonario("GET", "despacho=desp-77")).res.status).toBe(403);
    expect((await talonario("GET", "gtf=gtf-aguajal")).res.status).toBe(200);
    expect((await talonario("GET", "")).res.status).toBe(200);
    estado.apagadas.clear();
    estado.apagadas.add("spec:forestal:loth-libro");
    expect((await talonario("GET", "gtf=gtf-aguajal")).res.status).toBe(403);
    expect((await salida("gtfId=gtf-aguajal&formato=escp")).status).toBe(403);
    expect((await talonario("GET", "despacho=desp-77")).res.status).toBe(200);
    estado.apagadas.add("spec:forestal:ctp-libro");
    expect((await talonario("GET", "")).res.status).toBe(403);
  });
});
