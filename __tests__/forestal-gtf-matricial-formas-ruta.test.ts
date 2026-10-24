/**
 * Rutas de las «formas» del talonario (16-10): `…/gtf-matricial` (abrir y
 * guardar), `…/gtf-matricial/formas` (nueva, renombrar, borrar) y la salida
 * con `forma=`. Cada negocio ve sólo las suyas; la salida usa la pedida y, si
 * ya no existe, NO cae a otra (gastaría una hoja numerada con otro encaje).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { gtfDatosConFicha } from "@/lib/forestal/loth-importar-guia";
import { hojaDeFabrica } from "@/lib/forestal/gtf-matricial-disposicion";

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
  },
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/require-admin", async () => {
  const { NextResponse } = await import("next/server");
  return { requireAdmin: vi.fn(async () => estado.sesion ?? NextResponse.json({ error: "unauthorized" }, { status: 401 })) };
});
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
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
const bytes = async (res: Response) => Buffer.from(await res.arrayBuffer()).toString("hex");

beforeEach(() => {
  vi.resetModules();
  estado.sesion = { tenantId: T, role: "admin", username: "qa" };
  estado.kv.clear();
  estado.guias.clear();
  estado.guias.set(`${T}:gtf-aguajal`, guia({ id: "gtf-aguajal" }));
  estado.guias.set(`${T}:gtf-santos`, guia({ id: "gtf-santos", gtfNumber: "019-001-0000483", titularName: "SANTOS MUÑOZ ROJAS", tituloHabilitante: "25-UCA-C-PER-009-21" }));
  estado.guias.set(`${AJENO}:gtf-ajena`, guia({ id: "gtf-ajena", tenantId: AJENO }));
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
