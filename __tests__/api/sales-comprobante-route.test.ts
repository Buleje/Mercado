/**
 * PATCH /api/sales/[id] — anotar el comprobante que SUNAT emitió (30-10-2026).
 * Ruta: sin sesión 401 (nunca 404), roles explícitos, validación de serie/RUC,
 * el tenant de la sesión es el que llega a la DB, 404 y 409 bien mapeados.
 * DB class: aislamiento por tenant en el WHERE, 409 por número distinto,
 * mismo número = sin escribir, carrera = 409, quitar. Revisión 30-10: 403 al
 * reemplazar/quitar sin ser admin/dueño, otro tipo/RUC, duplicado en otra
 * venta, cotización intocable, quitar sin número = nada.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  anotar: vi.fn(),
  filas: new Map<string, { id: string; tenantId: string; comprobanteTipo: string | null; comprobanteNumero: string | null; comprobanteRuc: string | null }>(),
  updates: 0,
  carrera: false,
  audit: vi.fn(async () => ({})),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: (...a: unknown[]) => H.requireAdmin(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/jsondb", () => ({ SalesDB: { anotarComprobante: (...a: unknown[]) => H.anotar(...a), getById: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/db/activity-log.db", () => ({ ActivityLogDB: { create: H.audit } }));
vi.mock("@/lib/caja/invalidar-ventas-overview", () => ({ invalidarVentasOverview: vi.fn(), tagVentasOverview: (t: string) => `ventas-overview-${t}` }));
vi.mock("@/lib/prisma-rls", () => {
  type Fila = { id: string; tenantId: string; comprobanteTipo: string | null; comprobanteNumero: string | null; comprobanteRuc: string | null };
  const coincide = (f: Fila, w: Record<string, unknown>) =>
    Object.entries(w).every(([k, v]) => {
      const x = (f as Record<string, unknown>)[k];
      if (v && typeof v === "object" && "not" in v) return x !== (v as { not: unknown }).not;
      if (v && typeof v === "object" && "in" in v) return (v as { in: unknown[] }).in.includes(x);
      return x === v;
    });
  const tx = {
    sale: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const f = [...H.filas.values()].find((x) => coincide(x, where));
        return f ? { ...f, items: [], createdAt: new Date("2026-10-30T15:00:00Z"), total: 10, payment: "efectivo", amountPaid: 10, change: 0 } : null;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Fila> }) => {
        if (H.carrera) {
          const f = H.filas.get(String(where.id));
          if (f) f.comprobanteNumero = "B001-99";
        }
        const f = [...H.filas.values()].find((x) => coincide(x, where));
        if (!f) return { count: 0 };
        Object.assign(f, data);
        H.updates += 1;
        return { count: 1 };
      },
    },
  };
  return { withRlsTx: async (_t: string, fn: (t: typeof tx) => unknown) => fn(tx) };
});

import { PATCH } from "@/app/api/sales/[id]/route";
import { SalesDB } from "@/lib/db/sales.db";
import { anotarComprobanteSchema, comprobanteAGuardar, leerNumeroSunat, mismoNumeroSunat } from "@/lib/ventas/comprobante-sunat";

const RUC_OK = "20601234565";
const ctx = (id = "v1") => ({ params: Promise.resolve({ id }) });
const req = (body: unknown) =>
  new NextRequest("http://localhost/api/sales/v1", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  H.requireAdmin.mockReset();
  H.anotar.mockReset();
  H.requireAdmin.mockResolvedValue({ tenantId: "t-propio", username: "cajera", role: "cajero" });
});

describe("validación del número y el documento", () => {
  it("acepta factura E001 con RUC válido y boleta EB01 sin DNI", () => {
    expect(anotarComprobanteSchema.safeParse({ tipo: "factura", numero: "E001-318", ruc: RUC_OK }).success).toBe(true);
    expect(anotarComprobanteSchema.safeParse({ tipo: "boleta", numero: "EB01-12" }).success).toBe(true);
    expect(anotarComprobanteSchema.safeParse({ tipo: "boleta", numero: "B001-5", ruc: "12345678" }).success).toBe(true);
  });
  it("rechaza serie de otro tipo, número sin forma, RUC con dígito verificador malo y DNI corto", () => {
    expect(anotarComprobanteSchema.safeParse({ tipo: "boleta", numero: "F001-12" }).success).toBe(false);
    expect(anotarComprobanteSchema.safeParse({ tipo: "factura", numero: "EB01-12", ruc: RUC_OK }).success).toBe(false);
    expect(anotarComprobanteSchema.safeParse({ tipo: "factura", numero: "E001318", ruc: RUC_OK }).success).toBe(false);
    expect(anotarComprobanteSchema.safeParse({ tipo: "factura", numero: "E001-0", ruc: RUC_OK }).success).toBe(false);
    expect(anotarComprobanteSchema.safeParse({ tipo: "factura", numero: "E001-318", ruc: "20601234564" }).success).toBe(false);
    expect(anotarComprobanteSchema.safeParse({ tipo: "factura", numero: "E001-318" }).success).toBe(false);
    expect(anotarComprobanteSchema.safeParse({ tipo: "boleta", numero: "EB01-1", ruc: "1234567" }).success).toBe(false);
  });
  it("normaliza: mayúsculas, sin ceros a la izquierda; mismo comprobante con o sin ceros", () => {
    expect(leerNumeroSunat(" eb01-00000012 ")?.canonico).toBe("EB01-12");
    expect(mismoNumeroSunat("B001-00000005", "B001-5")).toBe(true);
    expect(mismoNumeroSunat("B001-5", "B001-6")).toBe(false);
    expect(comprobanteAGuardar({ quitar: true })).toEqual({ tipo: "ticket", numero: null, ruc: null });
  });
});

describe("PATCH /api/sales/[id] — puerta", () => {
  it("sin sesión responde 401 y no toca la DB; los roles van explícitos", async () => {
    H.requireAdmin.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    const r = await PATCH(req({ tipo: "boleta", numero: "EB01-12" }), ctx());
    expect(r.status).toBe(401);
    expect(H.anotar).not.toHaveBeenCalled();
    expect(H.requireAdmin.mock.calls[0][1]).toEqual(["admin", "cajero"]);
  });
  it("número mal formado = 400 con el motivo", async () => {
    const r = await PATCH(req({ tipo: "boleta", numero: "F001-12" }), ctx());
    expect(r.status).toBe(400);
    expect((await r.json()).message).toMatch(/no es de boleta/);
    expect(H.anotar).not.toHaveBeenCalled();
  });
  it("manda el tenant de la sesión y el número normalizado; venta ajena = 404", async () => {
    H.anotar.mockResolvedValue({ ok: false, reason: "no_existe" });
    const r = await PATCH(req({ tipo: "factura", numero: "e001-00000318", ruc: RUC_OK, tenantId: "t-ajeno" }), ctx("v-ajena"));
    expect(r.status).toBe(404);
    expect(H.anotar).toHaveBeenCalledWith("t-propio", "v-ajena", { tipo: "factura", numero: "E001-318", ruc: RUC_OK }, { reemplazar: false, user: "cajera" });
  });
  it("reemplazar o quitar: el cajero y el encargado 403 sin tocar la DB; admin y dueño pasan", async () => {
    for (const role of ["cajero", "manager"]) {
      H.requireAdmin.mockResolvedValue({ tenantId: "t-propio", username: "u", role });
      expect((await PATCH(req({ tipo: "boleta", numero: "EB01-12", reemplazar: true }), ctx())).status).toBe(403);
      expect((await PATCH(req({ quitar: true }), ctx())).status).toBe(403);
    }
    expect(H.anotar).not.toHaveBeenCalled();
    H.anotar.mockResolvedValue({ ok: true, cambio: true, venta: {} });
    for (const role of ["admin", "owner"]) {
      H.requireAdmin.mockResolvedValue({ tenantId: "t-propio", username: "u", role });
      expect((await PATCH(req({ tipo: "boleta", numero: "EB01-12", reemplazar: true }), ctx())).status).toBe(200);
    }
  });
  it("cotización y número de otra venta = 409 con el motivo", async () => {
    H.anotar.mockResolvedValueOnce({ ok: false, reason: "no_es_venta", tipo: "cotizacion" });
    const r = await PATCH(req({ tipo: "boleta", numero: "EB01-12" }), ctx());
    expect(r.status).toBe(409);
    expect((await r.json()).message).toMatch(/cotización: primero conviértela en venta/);
    H.anotar.mockResolvedValueOnce({ ok: false, reason: "duplicado", otraVentaId: "v9" });
    const r2 = await PATCH(req({ tipo: "boleta", numero: "EB01-12" }), ctx());
    expect(r2.status).toBe(409);
    expect(await r2.json()).toMatchObject({ error: "duplicado", otraVentaId: "v9" });
  });
  it("otro número ya anotado = 409 con el actual", async () => {
    H.anotar.mockResolvedValue({ ok: false, reason: "ya_tiene", actual: { tipo: "boleta", numero: "EB01-3" } });
    const r = await PATCH(req({ tipo: "boleta", numero: "EB01-12" }), ctx());
    expect(r.status).toBe(409);
    expect((await r.json()).actual.numero).toBe("EB01-3");
  });
});

describe("SalesDB.anotarComprobante — reglas en la DB class", () => {
  const nuevo = { tipo: "boleta", numero: "EB01-12", ruc: null };
  beforeEach(() => {
    H.filas.clear();
    H.updates = 0;
    H.carrera = false;
    H.filas.set("v1", { id: "v1", tenantId: "t-propio", comprobanteTipo: "ticket", comprobanteNumero: null, comprobanteRuc: null });
    H.filas.set("v2", { id: "v2", tenantId: "t-propio", comprobanteTipo: "boleta", comprobanteNumero: "EB01-00000003", comprobanteRuc: null });
  });

  it("venta de otro tenant = no_existe y no escribe", async () => {
    const r = await SalesDB.anotarComprobante("t-ajeno", "v1", nuevo, { reemplazar: false, user: "x" });
    expect(r).toEqual({ ok: false, reason: "no_existe" });
    expect(H.updates).toBe(0);
  });
  it("anota en una venta sin número y deja auditoría", async () => {
    const r = await SalesDB.anotarComprobante("t-propio", "v1", nuevo, { reemplazar: false, user: "cajera" });
    expect(r.ok && r.cambio).toBe(true);
    expect(H.filas.get("v1")?.comprobanteNumero).toBe("EB01-12");
    expect(H.audit).toHaveBeenCalledWith("t-propio", expect.objectContaining({ action: "sale_comprobante_anotado", entityId: "v1", user: "cajera" }));
  });
  it("otro número = ya_tiene (409) salvo reemplazar", async () => {
    const r = await SalesDB.anotarComprobante("t-propio", "v2", nuevo, { reemplazar: false, user: "x" });
    expect(r).toEqual({ ok: false, reason: "ya_tiene", actual: { tipo: "boleta", numero: "EB01-00000003", ruc: null } });
    expect(H.updates).toBe(0);
    const r2 = await SalesDB.anotarComprobante("t-propio", "v2", nuevo, { reemplazar: true, user: "x" });
    expect(r2.ok).toBe(true);
    expect(H.filas.get("v2")?.comprobanteNumero).toBe("EB01-12");
  });
  it("el mismo número con ceros no escribe (reintento)", async () => {
    const r = await SalesDB.anotarComprobante("t-propio", "v2", { tipo: "boleta", numero: "EB01-3", ruc: null }, { reemplazar: false, user: "x" });
    expect(r.ok && r.cambio).toBe(false);
    expect(H.updates).toBe(0);
  });
  it("si otro lo anotó entre la lectura y la escritura, vuelve ya_tiene", async () => {
    H.carrera = true;
    const r = await SalesDB.anotarComprobante("t-propio", "v1", nuevo, { reemplazar: false, user: "x" });
    expect(r).toEqual({ ok: false, reason: "ya_tiene", actual: { tipo: "ticket", numero: "B001-99", ruc: null } });
  });
  it("mismo número con otro tipo, o con otro RUC cuando ya había uno = ya_tiene; el RUC que faltaba se completa", async () => {
    H.filas.set("v3", { id: "v3", tenantId: "t-propio", comprobanteTipo: "factura", comprobanteNumero: "E001-318", comprobanteRuc: "20601234565" });
    H.filas.set("v4", { id: "v4", tenantId: "t-propio", comprobanteTipo: "boleta", comprobanteNumero: "EB01-7", comprobanteRuc: null });
    const otroTipo = await SalesDB.anotarComprobante("t-propio", "v4", { tipo: "factura", numero: "EB01-7", ruc: "20601234565" }, { reemplazar: false, user: "x" });
    expect(otroTipo).toMatchObject({ ok: false, reason: "ya_tiene" });
    const otroRuc = await SalesDB.anotarComprobante("t-propio", "v3", { tipo: "factura", numero: "E001-318", ruc: "10123456786" }, { reemplazar: false, user: "x" });
    expect(otroRuc).toMatchObject({ ok: false, reason: "ya_tiene", actual: { ruc: "20601234565" } });
    expect(H.updates).toBe(0);
    const completa = await SalesDB.anotarComprobante("t-propio", "v4", { tipo: "boleta", numero: "EB01-7", ruc: "12345678" }, { reemplazar: false, user: "x" });
    expect(completa.ok && completa.cambio).toBe(true);
    expect(H.filas.get("v4")?.comprobanteRuc).toBe("12345678");
  });
  it("el mismo número en OTRA venta del negocio = duplicado (con o sin ceros); en otro tenant no cuenta", async () => {
    const r = await SalesDB.anotarComprobante("t-propio", "v1", { tipo: "boleta", numero: "EB01-3", ruc: null }, { reemplazar: false, user: "x" });
    expect(r).toEqual({ ok: false, reason: "duplicado", otraVentaId: "v2" });
    expect(H.updates).toBe(0);
    H.filas.set("w1", { id: "w1", tenantId: "t-ajeno", comprobanteTipo: "boleta", comprobanteNumero: "EB01-12", comprobanteRuc: null });
    const r2 = await SalesDB.anotarComprobante("t-propio", "v1", nuevo, { reemplazar: false, user: "x" });
    expect(r2.ok).toBe(true);
  });
  it("cotización/proforma = no_es_venta y no se pisa (ni al quitar); quitar sin número = nada", async () => {
    H.filas.set("c1", { id: "c1", tenantId: "t-propio", comprobanteTipo: "cotizacion", comprobanteNumero: null, comprobanteRuc: null });
    expect(await SalesDB.anotarComprobante("t-propio", "c1", nuevo, { reemplazar: true, user: "x" })).toEqual({ ok: false, reason: "no_es_venta", tipo: "cotizacion" });
    expect(await SalesDB.anotarComprobante("t-propio", "c1", { tipo: "ticket", numero: null, ruc: null }, { reemplazar: false, user: "x" })).toMatchObject({ reason: "no_es_venta" });
    const v1 = H.filas.get("v1");
    if (v1) v1.comprobanteTipo = "boleta";
    const q = await SalesDB.anotarComprobante("t-propio", "v1", { tipo: "ticket", numero: null, ruc: null }, { reemplazar: false, user: "x" });
    expect(q.ok && q.cambio).toBe(false);
    expect(H.filas.get("v1")?.comprobanteTipo).toBe("boleta");
    expect(H.updates).toBe(0);
  });
  it("quitar deja la venta en ticket sin número", async () => {
    const r = await SalesDB.anotarComprobante("t-propio", "v2", { tipo: "ticket", numero: null, ruc: null }, { reemplazar: false, user: "x" });
    expect(r.ok && r.cambio).toBe(true);
    expect(H.filas.get("v2")).toMatchObject({ comprobanteTipo: "ticket", comprobanteNumero: null });
  });
});
