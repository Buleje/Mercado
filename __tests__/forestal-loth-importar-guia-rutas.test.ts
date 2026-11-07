// @vitest-environment node
/**
 * ADR-461 (revisión del 02-10) — las RUTAS, con el `requireAdmin` REAL
 * (sólo se finge la sesión, memoria `requireadmin-real-en-test-de-ruta`):
 *
 *  - «Deshacer la importación»: sin sesión 401, encargado 403, guía de otro
 *    negocio 404 (el tenant sale del JWT, no del header), motivo vacío 400.
 *  - Alta de ingreso: una `serforGtf` mandada por el navegador se IGNORA; la
 *    ficha la pone el servidor con la consulta a SERFOR, y sólo si es de esa GTF.
 *  - Lector de guías: acepta un PDF de hasta 5 hojas (y lo cuenta antes de gastar).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => ({
  payload: null as null | { username: string; role: string; tenantId: string },
  deshacer: vi.fn(),
  crear: vi.fn(),
  consultar: vi.fn(),
  vision: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: async () => true }));
vi.mock("@/lib/session", async (real) => ({ ...(await real<typeof import("@/lib/session")>()), getSessionPayload: async () => H.payload }));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/db/forest-loth-importar-deshacer.db", () => ({
  DeshacerRechazadoError: class extends Error {
    constructor(
      message: string,
      readonly codigo: string,
    ) {
      super(message);
    }
  },
  ForestLothDeshacerImportacionDB: { deshacer: H.deshacer },
}));
vi.mock("@/lib/db/forest-loth-importar.db", () => ({ ImportacionEnCursoError: class extends Error {}, ForestLothImportarDB: {} }));
vi.mock("@/lib/db/wood-entries.db", () => ({ WoodEntriesDB: { create: H.crear }, WOOD_ENTRY_SORT_FIELDS: ["libroNro"] }));
vi.mock("@/lib/db/guias-guardadas.db", () => ({ GuiasGuardadasDB: { alRegistrarIngreso: async () => undefined } }));
vi.mock("@/lib/forestal/serfor-gtf-fetch", () => ({ consultarGtfEnSerfor: H.consultar }));
vi.mock("@/lib/ai/cost-control", () => ({ aiCostGuard: { canSpend: async () => true, recordSpend: async () => undefined } }));
vi.mock("@/lib/ai/detalle-clave-ia", () => ({ veDetalleDeClaveIA: async () => false }));
vi.mock("@/lib/ai/vision-extract", async (real) => ({
  ...(await real<typeof import("@/lib/ai/vision-extract")>()),
  proveedorVision: () => "claude",
  visionExtractJSON: H.vision,
}));

import { GET as getDeshacer, POST as postDeshacer } from "@/app/api/admin/forestal/loth/importar-guia/deshacer/route";
import { POST as postIngreso } from "@/app/api/admin/forestal/wood-entries/route";
import { POST as postOcr } from "@/app/api/admin/forestal/gtf-ocr/route";

let ip = 0;
/** Cada pedido desde otra IP: el rate limit real no se mezcla entre casos. */
const pedido = (url: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; sinSesion?: boolean } = {}) =>
  new NextRequest(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.sinSesion ? {} : { cookie: "buleje-admin-sess=token-falso" }),
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${++ip}`,
      ...init.headers,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

const RESUMEN = {
  gtfId: "g1", gtfNumber: "019-0000003", registro: "1-19-0313629", volumenM3: 13.94, despachos: 4, trozados: 4,
  trozadosQueQuedan: 0, talas: [], plan: null, bloqueo: null, hecho: false,
};

beforeEach(() => {
  H.payload = { username: "qa-admin", role: "admin", tenantId: "t1" };
  H.deshacer.mockReset();
  H.crear.mockReset();
  H.consultar.mockReset();
  H.vision.mockReset();
});

describe("GET|POST /api/admin/forestal/loth/importar-guia/deshacer", () => {
  it("sin sesión → 401 (no 404: un 404 sacaba del panel)", async () => {
    H.payload = null;
    const r = await getDeshacer(pedido("/api/admin/forestal/loth/importar-guia/deshacer?gtfId=g1", { sinSesion: true }));
    expect(r.status).toBe(401);
    expect(H.deshacer).not.toHaveBeenCalled();
  });

  it("un encargado (pasa requireAdmin) no deshace: 403 de soloAdminODueno", async () => {
    H.payload = { username: "enc", role: "manager", tenantId: "t1" };
    const r = await postDeshacer(pedido("/api/admin/forestal/loth/importar-guia/deshacer", { method: "POST", body: { gtfId: "g1", motivo: "error de carga" } }));
    expect(r.status).toBe(403);
    expect(H.deshacer).not.toHaveBeenCalled();
  });

  it("la guía de OTRO negocio → 404, y la DB recibe el tenant del JWT aunque el header diga otro", async () => {
    H.deshacer.mockResolvedValue(null);
    const r = await getDeshacer(pedido("/api/admin/forestal/loth/importar-guia/deshacer?gtfId=de-blas", { headers: { "x-tenant-id": "cmpxiv6p4000bohvzwl6bnfpv" } }));
    expect(r.status).toBe(404);
    expect(H.deshacer).toHaveBeenCalledWith("t1", "de-blas", null);
  });

  it("motivo sin letras → 400 sin tocar la base; con motivo, deshace con el usuario de la sesión", async () => {
    const malo = await postDeshacer(pedido("/api/admin/forestal/loth/importar-guia/deshacer", { method: "POST", body: { gtfId: "g1", motivo: "  " } }));
    expect(malo.status).toBe(400);
    expect(H.deshacer).not.toHaveBeenCalled();
    H.deshacer.mockResolvedValue({ ...RESUMEN, hecho: true });
    const ok = await postDeshacer(pedido("/api/admin/forestal/loth/importar-guia/deshacer", { method: "POST", body: { gtfId: "g1", motivo: "prueba en el permiso equivocado" } }));
    expect(ok.status).toBe(200);
    expect(H.deshacer).toHaveBeenCalledWith("t1", "g1", { motivo: "prueba en el permiso equivocado", user: "qa-admin" });
    expect((await ok.json()).deshacer.hecho).toBe(true);
  });
});

describe("POST /api/admin/forestal/wood-entries — la ficha de SERFOR la pone el servidor", () => {
  const ingreso = { gtfNumber: "019-0000003", providerName: "COMUNIDAD NATIVA SAN LUIS", speciesCommonName: "Tornillo", volumeM3: 4.9 };
  const FALSA = { numeroRegistro: "1-19-9999999", gtfNumber: "019-0000003", titular: "INVENTADO SAC", trozas: [{ codificacion: "1A", volumen: 99 }] };

  it("una serforGtf del navegador se ignora (sin N° de registro, el ingreso queda sin ficha)", async () => {
    H.crear.mockResolvedValue({ id: "w1" });
    const r = await postIngreso(pedido("/api/admin/forestal/wood-entries", { method: "POST", body: { ...ingreso, serforGtf: FALSA } }));
    expect(r.status).toBe(201);
    expect(H.consultar).not.toHaveBeenCalled();
    expect(H.crear.mock.calls[0][1].serforGtf).toBeNull();
  });

  it("con N° de registro: guarda la ficha que trajo el SERVIDOR, nunca la del navegador", async () => {
    H.crear.mockResolvedValue({ id: "w2" });
    const oficial = { numeroRegistro: "1-19-0313629", gtfNumber: "019-0000003", titular: "COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI", trozas: [] };
    H.consultar.mockResolvedValue({ ok: true, cache: false, resultado: { estado: "encontrada", mensaje: null, gtf: oficial } });
    const r = await postIngreso(
      pedido("/api/admin/forestal/wood-entries", { method: "POST", body: { ...ingreso, serforNumeroRegistro: "1-19-0313629", serforGtf: FALSA } }),
    );
    expect(r.status).toBe(201);
    expect(H.consultar).toHaveBeenCalledWith("1-19-0313629");
    expect(H.crear.mock.calls[0][1].serforGtf).toEqual(oficial);
  });

  it("SERFOR no responde, o la ficha es de OTRA GTF: se guarda sin ficha y se dice", async () => {
    H.crear.mockResolvedValue({ id: "w3" });
    H.consultar.mockResolvedValueOnce({ ok: false, estado: "sin_respuesta", mensaje: "timeout" });
    const a = await postIngreso(pedido("/api/admin/forestal/wood-entries", { method: "POST", body: { ...ingreso, serforNumeroRegistro: "1-19-0313629" } }));
    expect(a.status).toBe(201);
    expect(H.crear.mock.calls[0][1].serforGtf).toBeNull();
    expect((await a.json()).avisoSerfor).toContain("SERFOR no respondió");

    H.consultar.mockResolvedValueOnce({ ok: true, cache: true, resultado: { estado: "encontrada", mensaje: null, gtf: { ...FALSA, gtfNumber: "019-0000999" } } });
    const b = await postIngreso(pedido("/api/admin/forestal/wood-entries", { method: "POST", body: { ...ingreso, serforNumeroRegistro: "1-19-0313629" } }));
    expect(H.crear.mock.calls[1][1].serforGtf).toBeNull();
    expect((await b.json()).avisoSerfor).toContain("es de la GTF 019-0000999");
  });
});

describe("POST /api/admin/forestal/gtf-ocr — «Foto o PDF»", () => {
  const pdf = async (hojas: number) => {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    for (let i = 0; i < hojas; i++) doc.addPage([300, 400]);
    return `data:application/pdf;base64,${Buffer.from(await doc.save()).toString("base64")}`;
  };

  it("un PDF de 2 hojas se lee con el lector común, que acepta PDF", async () => {
    H.vision.mockResolvedValue({
      ok: true,
      proveedor: "claude",
      costoUsd: 0.03,
      data: { gtfNumber: "019-0000003", gtfSeries: "", especie: "", especieCientifica: "", volumenM3: 0, proveedor: "", ruc: "", fecha: "", origen: "", numeroRegistro: "1-19-0313629" },
    });
    const r = await postOcr(pedido("/api/admin/forestal/gtf-ocr", { method: "POST", body: { image: await pdf(2) } }));
    expect(r.status).toBe(200);
    expect(H.vision.mock.calls[0][0].formatos).toContain("application/pdf");
    expect((await r.json()).numeroRegistro).toBe("1-19-0313629");
  });

  it("más de 5 hojas → 400 con el porqué, sin llamar a la IA", async () => {
    const r = await postOcr(pedido("/api/admin/forestal/gtf-ocr", { method: "POST", body: { image: await pdf(6) } }));
    expect(r.status).toBe(400);
    expect((await r.json()).codigo).toBe("demasiadas_paginas");
    expect(H.vision).not.toHaveBeenCalled();
  });
});
