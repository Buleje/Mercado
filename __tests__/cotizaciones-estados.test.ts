/**
 * Seguridad 17-10 — cotizaciones:
 *  - punto 2: el PATCH aceptaba cualquier estado (una CONVERTIDA volvía a
 *    ACEPTADA y se convertía otra vez = dos pedidos). Ahora sigue la tabla
 *    de `lib/cotizaciones/estados.ts`, CONVERTIDA es final (409) y el cambio
 *    se escribe sólo si el estado sigue como se leyó.
 *  - punto 1: convertir mandaba `customerPhone: ""` (el FK sólo admite null)
 *    y toda conversión caía en 503.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
  clienteDelNegocio: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  orderCreate: vi.fn(),
  txUpdateMany: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterDocument: vi.fn() } }));
vi.mock("@/lib/caja/invalidar-ventas-overview", () => ({ invalidarVentasOverview: vi.fn() }));
vi.mock("@/lib/inventario/stock-minimo.server", () => ({ minimoGlobalDelNegocio: vi.fn(async () => null) }));
vi.mock("@/lib/db", () => ({
  CotizacionesDB: {
    getById: h.getById,
    update: h.update,
    clienteDelNegocio: h.clienteDelNegocio,
    productosParaCotizar: vi.fn(async () => []),
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    cotizacion: { findFirst: h.findFirst, updateMany: h.updateMany },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ cotizacion: { updateMany: h.txUpdateMany }, order: { create: h.orderCreate } }),
  },
}));

import { PATCH } from "@/app/api/cotizaciones/[id]/route";
import { POST as CONVERTIR } from "@/app/api/cotizaciones/[id]/convertir/route";
import { CotizacionesDB as CotizacionesReal } from "@/lib/db/cotizaciones.db";
import {
  CotizacionCambioDeEstadoError,
  ESTADOS_COTIZACION,
  revisarTransicionCotizacion,
} from "@/lib/cotizaciones/estados";

const ID = "cot-1";
const params = { params: Promise.resolve({ id: ID }) };
const manana = new Date(Date.now() + 3 * 86_400_000).toISOString();
const cotizacion = (status: string, extra: Record<string, unknown> = {}) => ({
  id: ID,
  tenantId: "t-a",
  numero: "DOC-COT-0007",
  clienteNombre: "Cliente QA",
  validoHasta: manana,
  status,
  subtotal: 10,
  igv: 1.8,
  total: 11.8,
  createdBy: "qa",
  createdAt: manana,
  updatedAt: manana,
  items: [{ id: "i1", descripcion: "Arroz", cantidad: 2, precioUnit: 5.9, descuento: 0, subtotal: 11.8 }],
  ...extra,
});
const patch = (body?: string) =>
  new NextRequest(`http://localhost/api/cotizaciones/${ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
const convertir = () =>
  new NextRequest(`http://localhost/api/cotizaciones/${ID}/convertir`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ aceptarFaltantes: true }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAdmin.mockResolvedValue({ role: "admin", username: "qa", tenantId: "t-a" });
  h.update.mockImplementation(async (_id: string, _t: string, data: { status?: string }) =>
    cotizacion(data.status ?? "ENVIADA"),
  );
});

describe("tabla de transiciones", () => {
  it("CONVERTIDA no sale a ningún lado (409)", () => {
    for (const hasta of ESTADOS_COTIZACION.filter((e) => e !== "CONVERTIDA")) {
      expect(revisarTransicionCotizacion("CONVERTIDA", hasta)).toMatchObject({ ok: false, status: 409 });
    }
  });

  it("a CONVERTIDA sólo se llega convirtiendo (422 a mano)", () => {
    for (const desde of ["BORRADOR", "ENVIADA", "ACEPTADA"]) {
      expect(revisarTransicionCotizacion(desde, "CONVERTIDA")).toMatchObject({ ok: false, status: 422 });
    }
  });

  it("el camino de la pantalla pasa: borrador → enviada → aceptada; enviada → vencida; reabrir", () => {
    for (const [d, a] of [
      ["BORRADOR", "ENVIADA"],
      ["ENVIADA", "ACEPTADA"],
      ["ENVIADA", "RECHAZADA"],
      ["ENVIADA", "VENCIDA"],
      ["VENCIDA", "ENVIADA"],
      ["RECHAZADA", "BORRADOR"],
    ]) {
      expect(revisarTransicionCotizacion(d, a)).toEqual({ ok: true });
    }
    expect(revisarTransicionCotizacion("VENCIDA", "ACEPTADA")).toMatchObject({ ok: false, status: 422 });
  });
});

describe("PATCH /api/cotizaciones/[id]", () => {
  it.each([undefined, "", "no-es-json"])("cuerpo «%s» → 400 sin tocar nada", async (body) => {
    const res = await PATCH(patch(body), params);
    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("sacar una CONVERTIDA → 409 y no se escribe", async () => {
    h.getById.mockResolvedValue(cotizacion("CONVERTIDA"));
    const res = await PATCH(patch(JSON.stringify({ status: "ACEPTADA" })), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/ya se convirtió/);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("poner CONVERTIDA a mano → 422", async () => {
    h.getById.mockResolvedValue(cotizacion("ACEPTADA"));
    const res = await PATCH(patch(JSON.stringify({ status: "CONVERTIDA" })), params);
    expect(res.status).toBe(422);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("cambio válido: escribe con el estado leído como condición", async () => {
    h.getById.mockResolvedValue(cotizacion("ENVIADA"));
    const res = await PATCH(patch(JSON.stringify({ status: "ACEPTADA" })), params);
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledWith(ID, "t-a", expect.objectContaining({ status: "ACEPTADA" }), {
      siEstadoEs: "ENVIADA",
    });
  });

  it("perdió la carrera (otro la convirtió entre lectura y escritura) → 409", async () => {
    h.getById.mockResolvedValue(cotizacion("ACEPTADA"));
    h.update.mockRejectedValue(new CotizacionCambioDeEstadoError("CONVERTIDA"));
    const res = await PATCH(patch(JSON.stringify({ status: "ENVIADA" })), params);
    expect(res.status).toBe(409);
    expect((await res.json()).estado).toBe("CONVERTIDA");
  });

  it("sólo notas: no lee el estado ni pone condición", async () => {
    const res = await PATCH(patch(JSON.stringify({ notas: "llamar el lunes" })), params);
    expect(res.status).toBe(200);
    expect(h.getById).not.toHaveBeenCalled();
    expect(h.update).toHaveBeenCalledWith(ID, "t-a", expect.objectContaining({ notas: "llamar el lunes" }), undefined);
  });

  it("de otro negocio → 404", async () => {
    h.getById.mockResolvedValue(null);
    const res = await PATCH(patch(JSON.stringify({ status: "ENVIADA" })), params);
    expect(res.status).toBe(404);
    expect(h.getById).toHaveBeenCalledWith(ID, "t-a");
  });
});

describe("CotizacionesDB.update con siEstadoEs", () => {
  it("la condición va en el WHERE y si no escribió nada avisa con el estado de ahora", async () => {
    h.findFirst.mockResolvedValue({ ...cotizacion("CONVERTIDA"), validoHasta: new Date(), createdAt: new Date(), updatedAt: new Date() });
    h.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      CotizacionesReal.update(ID, "t-a", { status: "ENVIADA" }, { siEstadoEs: "ACEPTADA" }),
    ).rejects.toMatchObject({ name: "CotizacionCambioDeEstadoError", estado: "CONVERTIDA" });
    expect(h.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ID, tenantId: "t-a", status: "ACEPTADA" } }),
    );
  });
});

describe("POST /api/cotizaciones/[id]/convertir — customerPhone", () => {
  beforeEach(() => {
    h.txUpdateMany.mockResolvedValue({ count: 1 });
    h.orderCreate.mockImplementation(async ({ data }: { data: { id: string } }) => ({ id: data.id, items: [] }));
  });

  it("sin cliente → null (antes \"\" rompía el FK y daba 503)", async () => {
    h.getById.mockResolvedValue(cotizacion("ACEPTADA"));
    const res = await CONVERTIR(convertir(), params);
    expect(res.status).toBe(201);
    expect(h.orderCreate.mock.calls[0][0].data.customerPhone).toBeNull();
  });

  it("con cliente del negocio → su celular", async () => {
    h.getById.mockResolvedValue(cotizacion("ACEPTADA", { customerId: "51987654321" }));
    h.clienteDelNegocio.mockResolvedValue({ phone: "51987654321", nombre: "Cliente QA" });
    const res = await CONVERTIR(convertir(), params);
    expect(res.status).toBe(201);
    expect(h.clienteDelNegocio).toHaveBeenCalledWith("t-a", "51987654321");
    expect(h.orderCreate.mock.calls[0][0].data.customerPhone).toBe("51987654321");
  });

  it("cliente que no es de este negocio → null, no se cuelga del ajeno", async () => {
    h.getById.mockResolvedValue(cotizacion("ACEPTADA", { customerId: "51900000000" }));
    h.clienteDelNegocio.mockResolvedValue(null);
    const res = await CONVERTIR(convertir(), params);
    expect(res.status).toBe(201);
    expect(h.orderCreate.mock.calls[0][0].data.customerPhone).toBeNull();
  });
});
