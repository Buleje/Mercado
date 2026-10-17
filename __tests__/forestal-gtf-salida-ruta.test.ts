// @vitest-environment node
/**
 * Rutas de la salida del talonario (16-10): `…/gtf-matricial/salida` (PDF o
 * ESC/P de UNA guía) y `…/gtf-matricial/perfiles` (las impresoras calibradas).
 * La DB de la matricial es la real; abajo, el almacén clave→valor en memoria
 * (por tenant), así el test recorre alta → salida con el perfil guardado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import fichasJson from "./forestal-loth-importar-guia.fichas-blas.json";
import type { GtfSerfor } from "@/lib/forestal/serfor-gtf";
import { gtfDatosConFicha } from "@/lib/forestal/loth-importar-guia";

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
  return {
    requireAdmin: vi.fn(async () => estado.sesion ?? NextResponse.json({ error: "unauthorized" }, { status: 401 })),
  };
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
  ForestGtfDB: { getById: vi.fn(async (tenantId: string, id: string) => estado.guias.get(`${tenantId}:${id}`) ?? null) },
}));
vi.mock("@/lib/db/forest-loth.db", () => ({ ForestLothDB: { getActiveCaratula: vi.fn(async () => null) } }));

const T = "t-qa-salida";
const AJENO = "t-otro-negocio";
const FICHA = (fichasJson as unknown as Record<string, GtfSerfor>)["1-10-0473187"];
const guia = (extra: Record<string, unknown> = {}) => ({
  id: "gtf-1", tenantId: T, gtfNumber: "019-001-0000482", gtfDate: new Date("2026-09-02T00:00:00.000Z"), tipo: "trozas",
  titularName: "PEREZ MUÑOZ JUAN CARLOS", tituloHabilitante: null, planId: null, status: "emitida", annulledReason: null,
  parcelaCorta: null, transportista: null, transportistaDoc: null, conductor: null, conductorLicencia: null, placaVehiculo: null,
  origen: null, destino: null, observations: null, volumenTotalM3: null,
  items: Array.from({ length: 27 }, (_, i) => ({ code: `T-${i + 1}`, species: "Tornillo", diamMayorM: 0.6, diamMenorM: 0.5, lengthM: 4, volumeM3: 0.95 })),
  gtfDatos: JSON.parse(JSON.stringify(gtfDatosConFicha(FICHA, true))) as unknown,
  ...extra,
});

const BASE = "http://localhost/api/admin/forestal/loth/gtf-matricial";
async function salida(qs: string) {
  const { GET } = await import("@/app/api/admin/forestal/loth/gtf-matricial/salida/route");
  return GET(new NextRequest(`${BASE}/salida?${qs}`));
}
async function perfiles(method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown, qs = "") {
  const ruta = await import("@/app/api/admin/forestal/loth/gtf-matricial/perfiles/route");
  const req = new NextRequest(`${BASE}/perfiles${qs}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const res = await ruta[method](req);
  return { res, j: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  vi.resetModules();
  estado.sesion = { tenantId: T, role: "admin", username: "qa" };
  estado.kv.clear();
  estado.guias.clear();
  estado.guias.set(`${T}:gtf-1`, guia());
  estado.guias.set(`${T}:gtf-anulada`, guia({ id: "gtf-anulada", status: "anulada" }));
  logger.error.mockClear();
});

describe("GET …/gtf-matricial/salida", () => {
  it("sin sesión → 401 (nunca 404: un 404 saca del panel)", async () => {
    estado.sesion = null;
    expect((await salida("gtfId=gtf-1&formato=pdf")).status).toBe(401);
  });

  it("la guía de OTRO negocio no existe para este: 404, buscada con el tenant de la sesión", async () => {
    estado.sesion = { tenantId: AJENO, role: "admin", username: "intruso" };
    const res = await salida("gtfId=gtf-1&formato=pdf");
    expect(res.status).toBe(404);
    const { ForestGtfDB } = await import("@/lib/db/forest-gtf.db");
    expect(ForestGtfDB.getById).toHaveBeenLastCalledWith(AJENO, "gtf-1");
  });

  it("anulada → 409 (la prueba sí sale: sirve para calibrar con una guía cualquiera)", async () => {
    expect((await salida("gtfId=gtf-anulada&formato=escp")).status).toBe(409);
    expect((await salida("gtfId=gtf-anulada&formato=escp&prueba=1")).status).toBe(200);
  });

  it("formato o perfil inválido → 400; perfil que no existe → 404 con el mensaje para la persona", async () => {
    expect((await salida("gtfId=gtf-1&formato=docx")).status).toBe(400);
    expect((await salida("formato=pdf")).status).toBe(400);
    const res = await salida("gtfId=gtf-1&formato=pdf&perfil=nada");
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "perfil_no_existe", message: "Esa impresora ya no está: elige otra." });
  });

  it("PDF: descarga «GTF-<n°>-guia.pdf» del tamaño del talonario, con el título que dice cómo imprimirlo", async () => {
    const res = await salida("gtfId=gtf-1&formato=pdf");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="GTF-019-001-0000482-guia.pdf"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    const pdf = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()), { updateMetadata: false });
    expect(pdf.getTitle()).toBe("GTF 019-001-0000482 — imprimir a tamaño real");
    expect(pdf.getPage(0).getWidth()).toBeCloseTo((210 * 72) / 25.4, 1);
  });

  it("ESC/P: «.prn» que arranca con ESC @ y termina en FF; la lista sale aparte", async () => {
    const res = await salida("gtfId=gtf-1&formato=escp&hoja=lista");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="GTF-019-001-0000482-lista.prn"');
    const b = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(b.subarray(0, 2)).toString("hex")).toBe("1b40");
    expect(b[b.length - 1]).toBe(0x0c);
    expect(Number(res.headers.get("x-hojas"))).toBeGreaterThanOrEqual(1);
  });
});

describe("…/gtf-matricial/perfiles", () => {
  it("sin sesión → 401 en los cuatro verbos", async () => {
    estado.sesion = null;
    for (const m of ["GET", "POST", "PATCH", "DELETE"] as const) expect((await perfiles(m, m === "GET" || m === "DELETE" ? undefined : {})).res.status).toBe(401);
  });

  it("alta «Monte – Epson LX-350», la salida la usa, y el otro negocio no la ve", async () => {
    const alta = await perfiles("POST", { nombre: "Monte – Epson LX-350", corrimientoXmm: 2.5 });
    expect(alta.res.status).toBe(200);
    expect(alta.j.perfil).toMatchObject({ id: "monte-epson-lx-350", corrimientoXmm: 2.5 });
    expect((alta.j.perfiles as { id: string }[]).map((p) => p.id)).toEqual(["oficina", "monte", "monte-epson-lx-350"]);

    const prueba = await salida("gtfId=gtf-1&formato=pdf&perfil=monte-epson-lx-350&prueba=1");
    expect(prueba.status).toBe(200);
    expect(prueba.headers.get("content-disposition")).toContain("GTF-019-001-0000482-guia-prueba-monte-epson-lx-350.pdf");

    estado.sesion = { tenantId: AJENO, role: "admin", username: "otro" };
    const ajeno = await perfiles("GET");
    expect((ajeno.j.perfiles as { id: string }[]).map((p) => p.id)).toEqual(["oficina", "monte"]);
    expect((await salida("gtfId=gtf-1&formato=pdf&perfil=monte-epson-lx-350")).status).toBe(404);
  });

  it("repetido → 409; Oficina no se borra (422) ni toma corrimiento; fuera de rango → 400; no existe → 404", async () => {
    expect((await perfiles("POST", { nombre: "monte" })).res.status).toBe(409);
    expect((await perfiles("DELETE", undefined, "?id=oficina")).res.status).toBe(422);
    expect((await perfiles("PATCH", { id: "oficina", corrimientoXmm: 1 })).res.status).toBe(422);
    expect((await perfiles("PATCH", { id: "monte", escalaX: 2 })).res.status).toBe(400);
    expect((await perfiles("POST", { nombre: "X", extra: 1 })).res.status).toBe(400);
    expect((await perfiles("DELETE", undefined, "?id=nada")).res.status).toBe(404);
    const borra = await perfiles("DELETE", undefined, "?id=monte");
    expect(borra.res.status).toBe(200);
    expect((borra.j.perfiles as { id: string }[]).map((p) => p.id)).toEqual(["oficina"]);
  });
});
