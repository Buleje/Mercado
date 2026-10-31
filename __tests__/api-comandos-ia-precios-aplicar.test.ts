// @vitest-environment node
/**
 * POST /api/admin/comandos-ia/precios/aplicar — el piso del negocio (costo + X %,
 * Ajustes › Cobros) se mide en el servidor, dentro de la transacción y con el
 * precio y el costo de la base: llamar directo a /aplicar ya no vende bajo costo.
 *
 * `ProductsDB.aplicarPreciosEnLote` corre de verdad; sólo la base es un doble
 * (`$queryRaw` devuelve los productos «bajo candado»).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Fila = { id: number; name: string; price: number; costPrice: number | null };

const H = vi.hoisted(() => {
  const H = {
    filas: [] as Fila[],
    piso: 5,
    tx: {
      $queryRaw: vi.fn(async (..._a: unknown[]) => H.filas),
      $executeRaw: vi.fn(async (..._a: unknown[]) => 1),
      priceHistory: { createMany: vi.fn(async () => ({ count: 1 })) },
      activityLog: { create: vi.fn(async () => ({ id: 77 })) },
    },
  };
  return H;
});

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn(H.tx) } }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => ({ tenantId: "tenant-main", role: "admin", username: "qaadmin" })),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/cache", () => ({ invalidate: vi.fn() }));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterProduct: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/precios/rebajas-servidor", () => ({
  leerMargenesDelNegocio: vi.fn(async () => ({ pisoSobreCosto: H.piso, margenMinimoSugerido: 15 })),
}));

import { POST } from "@/app/api/admin/comandos-ia/precios/aplicar/route";

const ACEITE: Fila = { id: 1, name: "Aceite Primor Premium 1L", price: 11.9, costPrice: 9 };

const aplicar = (filas: Array<Record<string, unknown>>) =>
  POST(
    new NextRequest("http://localhost/api/admin/comandos-ia/precios/aplicar", {
      method: "POST",
      body: JSON.stringify({ filas, resumen: "Rebaja lo que no se vende" }),
      headers: { "content-type": "application/json" },
    }),
  );

const fila = (p: Fila, precioNuevo: number, extra: Record<string, unknown> = {}) => ({
  productId: p.id,
  precioEsperado: p.price,
  costoEsperado: p.costPrice,
  precioNuevo,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  H.piso = 5;
  H.filas = [ACEITE];
});

describe("aplicar precios en bloque — piso del negocio en el servidor", () => {
  it("rebaja bajo costo + 5 % → 400 con el producto y su piso, y no escribe nada", async () => {
    const res = await aplicar([fila(ACEITE, 9.4)]);
    expect(res.status).toBe(400);
    const d = await res.json();
    expect(d.error).toBe("bajo-piso");
    expect(d.mensaje).toContain("Aceite Primor Premium 1L: no se puede rebajar por debajo de S/ 9.45 (costo + 5 %)");
    expect(d.rechazadas).toEqual([expect.objectContaining({ productId: 1, motivo: "bajo-piso", piso: 9.45 })]);
    expect(H.tx.$executeRaw).not.toHaveBeenCalled();
    expect(H.tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("rebaja justo en el piso → se aplica", async () => {
    const res = await aplicar([fila(ACEITE, 9.45)]);
    expect(res.status).toBe(200);
    expect(H.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("el piso es el del negocio: con 10 % la misma rebaja a 9,45 ya no entra (piso 9,90)", async () => {
    H.piso = 10;
    const d = await (await aplicar([fila(ACEITE, 9.45)])).json();
    expect(d.mensaje).toContain("S/ 9.90 (costo + 10 %)");
    expect(H.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("una fila bajo el piso frena todo el lote (no hay aplicado a medias)", async () => {
    const leche: Fila = { id: 2, name: "Leche Gloria", price: 4.9, costPrice: 3.8 };
    H.filas = [ACEITE, leche];
    const res = await aplicar([fila(ACEITE, 10.2), fila(leche, 3.9)]);
    expect(res.status).toBe(400);
    expect((await res.json()).rechazadas.map((x: { productId: number }) => x.productId)).toEqual([2]);
    expect(H.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("subir un precio que ya estaba bajo el costo pasa, y sin costo conocido no hay piso", async () => {
    const bajo: Fila = { id: 3, name: "Arroz", price: 5, costPrice: 8 };
    const sinCosto: Fila = { id: 4, name: "Pan", price: 10, costPrice: null };
    H.filas = [bajo, sinCosto];
    const res = await aplicar([fila(bajo, 6), fila(sinCosto, 1.5)]);
    expect(res.status).toBe(200);
    expect(H.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("mentir el costo en el cuerpo no salta el piso: la base manda (409, nada escrito)", async () => {
    const res = await aplicar([fila(ACEITE, 2, { costoEsperado: null })]);
    expect(res.status).toBe(409);
    expect(H.tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("si la fila también baja el costo (lista del proveedor), el piso es sobre el costo nuevo", async () => {
    const res = await aplicar([fila(ACEITE, 7.4, { costoNuevo: 7 })]);
    expect(res.status).toBe(200);
  });
});
