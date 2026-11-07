/**
 * Bug 18-10: `POST /api/cotizaciones` cobraba `subtotal × 0,18` para todo y
 * un negocio de la Amazonía (Ley 27037, productos exonerados) cotizaba un IGV
 * que no correspondía. Ahora el IGV va por línea según `Product.taxType` y la
 * tasa sale de `lib/tax.ts` / `Settings.taxRate`. Y una línea con
 * `precioDelCatalogo` (elegida de la lista o leída de una foto) guarda el
 * precio de HOY del producto, no el que mandó el navegador.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  sesion: { tenantId: "t-amazonia", username: "qaadmin", role: "admin" } as Record<string, string> | null,
  roles: [] as unknown[],
  productos: vi.fn(),
  create: vi.fn(),
  ajustes: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: async (_req: unknown, roles: unknown) => {
    h.roles.push(roles);
    return h.sesion ?? NextResponse.json({ error: "No autorizado" }, { status: 401 });
  },
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterDocument: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  CotizacionesDB: {
    siguienteNumero: vi.fn(async () => "COT-0001"),
    clienteDelNegocio: vi.fn(async () => null),
    productosParaCotizar: (...a: unknown[]) => h.productos(...a),
    create: (...a: unknown[]) => h.create(...a),
  },
  SettingsDB: { get: (...a: unknown[]) => h.ajustes(...a) },
}));

import { POST } from "@/app/api/cotizaciones/route";
import { totalesDeCotizacion } from "@/lib/cotizaciones/totales";
import { extractIgv, IGV_RATE } from "@/lib/tax";
import { tasaDelProducto } from "@/lib/precio-igv";

/* Del catálogo del negocio: el arroz exonerado (Amazonía), la gaseosa gravada. */
const ARROZ = { id: 11, nombre: "Arroz Costeño 5kg", unidad: "bolsa", tipo: "producto", stock: 50, stockMin: 0, active: true, precio: 24.9, taxType: "exonerado" };
const GASEOSA = { id: 12, nombre: "Inca Kola 1.5L", unidad: "botella", tipo: "producto", stock: 50, stockMin: 0, active: true, precio: 8.5, taxType: "gravado" };

const manana = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
const item = (extra: Record<string, unknown>) => ({ descripcion: "x", cantidad: 1, precioUnit: 10, ...extra });

async function crear(items: unknown[]) {
  const req = new NextRequest("http://localhost/api/cotizaciones", {
    method: "POST",
    body: JSON.stringify({ clienteNombre: "Bodega QA", validoHasta: manana, items }),
  });
  const res = await POST(req);
  const guardado = h.create.mock.calls[0]?.[1] as { subtotal: number; igv: number; total: number; items: Array<Record<string, unknown>> } | undefined;
  return { res, guardado };
}

beforeEach(() => {
  h.sesion = { tenantId: "t-amazonia", username: "qaadmin", role: "admin" };
  h.roles.length = 0;
  h.productos.mockReset().mockImplementation(async (_t: string, ids: number[]) => [ARROZ, GASEOSA].filter((p) => ids.includes(p.id)));
  h.create.mockReset().mockImplementation(async (_t: string, d: Record<string, unknown>) => ({ id: "cot-1", ...d }));
  h.ajustes.mockReset().mockResolvedValue({ taxRate: 18 });
});

describe("POST /api/cotizaciones — IGV según la afectación del producto", () => {
  it("exonerado: su total ES su base, IGV 0 (antes: 18 % fijo)", async () => {
    const { res, guardado } = await crear([item({ descripcion: "Arroz", cantidad: 2, precioUnit: 24.9, productoId: "11" })]);
    expect(res.status).toBe(201);
    expect(guardado).toMatchObject({ subtotal: 49.8, igv: 0, total: 49.8 });
  });

  it("gravado: el precio YA incluye IGV, se DESGLOSA (no se suma 18 % encima)", async () => {
    const { guardado } = await crear([item({ descripcion: "Inca Kola", cantidad: 3, precioUnit: 8.5, productoId: "12" })]);
    // 25,50 es el total con IGV (lo que cobra la caja): base 21,61 + IGV 3,89.
    expect(guardado).toMatchObject({ subtotal: 21.61, igv: 3.89, total: 25.5 });
  });

  it("gravado + exonerado: total = la suma de los precios (no 18 % encima)", async () => {
    const { guardado } = await crear([
      item({ descripcion: "Arroz", cantidad: 2, precioUnit: 24.9, productoId: "11" }),
      item({ descripcion: "Inca Kola", cantidad: 3, precioUnit: 8.5, productoId: "12" }),
    ]);
    // 49,80 exonerado + 25,50 gravado = 75,30 (NO 79,89). IGV sólo de lo gravado.
    expect(guardado).toMatchObject({ subtotal: 71.41, igv: 3.89, total: 75.3 });
  });

  it("la tasa es la del negocio: Settings.taxRate 0 = no desglosa IGV", async () => {
    h.ajustes.mockResolvedValue({ taxRate: 0 });
    const { guardado } = await crear([item({ descripcion: "Inca Kola", cantidad: 1, precioUnit: 8.5, productoId: "12" })]);
    expect(guardado).toMatchObject({ subtotal: 8.5, igv: 0, total: 8.5 });
  });

  it("línea a mano: el precio es con IGV, igual que la caja (se desglosa, no se suma)", async () => {
    h.ajustes.mockRejectedValue(new Error("caída")); // sin ajustes → IGV_RATE
    const { res, guardado } = await crear([item({ descripcion: "a mano", cantidad: 1, precioUnit: 118 })]);
    expect(res.status).toBe(201);
    expect(guardado).toMatchObject({ subtotal: 100, igv: 18, total: 118 });
  });

  it("precioDelCatalogo: guarda el precio del catálogo, no el que mandó el navegador", async () => {
    const { guardado } = await crear([item({ descripcion: "Arroz", cantidad: 1, precioUnit: 1, productoId: "11", precioDelCatalogo: true })]);
    expect(guardado?.items[0]).toMatchObject({ precioUnit: 24.9, subtotal: 24.9 });
    expect(guardado).toMatchObject({ total: 24.9 });
  });

  it("sin precioDelCatalogo, el precio escrito a mano se respeta", async () => {
    const { guardado } = await crear([item({ descripcion: "Arroz", cantidad: 1, precioUnit: 20, productoId: "11" })]);
    expect(guardado?.items[0]).toMatchObject({ precioUnit: 20 });
  });

  it("un producto de OTRO negocio: no se enlaza, no presta su precio y paga IGV como línea a mano", async () => {
    const { guardado } = await crear([item({ descripcion: "ajeno", cantidad: 1, precioUnit: 10, productoId: "999", precioDelCatalogo: true })]);
    expect(h.productos).toHaveBeenCalledWith("t-amazonia", [999]);
    expect(guardado?.items[0]).toMatchObject({ precioUnit: 10, productoId: undefined });
    // Línea a mano gravada: 10 es con IGV → base 8,47 + IGV 1,53, total 10.
    expect(guardado).toMatchObject({ subtotal: 8.47, igv: 1.53, total: 10 });
  });

  it("sin sesión → 401; con sesión pide los roles de crear cotización", async () => {
    h.sesion = null;
    const { res } = await crear([item({})]);
    expect(res.status).toBe(401);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.roles[0]).toEqual(["admin", "owner", "manager"]);
  });
});

describe("totalesDeCotizacion — desglosa el IGV ya incluido en el precio", () => {
  it("tasaDelProducto: exonerado e inafecto = 0 (y por MAYÚSCULAS también); sin producto = gravado", () => {
    expect([tasaDelProducto("exonerado"), tasaDelProducto("inafecto"), tasaDelProducto("EXONERADO"), tasaDelProducto(null), tasaDelProducto("gravado")]).toEqual([0, 0, 0, IGV_RATE, IGV_RATE]);
  });

  it("gravado 118 + exonerado 100 = total 218 (NO 336,24); coincide con extractIgv", () => {
    const t = totalesDeCotizacion([{ subtotal: 118, taxType: "gravado" }, { subtotal: 100, taxType: "exonerado" }]);
    const base = extractIgv(118, IGV_RATE).base + 100;
    expect(t).toEqual({ subtotal: Math.round(base * 100) / 100, igv: 18, total: 218 });
    expect(t).toEqual({ subtotal: 200, igv: 18, total: 218 });
  });
});
