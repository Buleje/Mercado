/**
 * El «vence» que se anota al recibir mercadería (09-10).
 *
 * Antes la recepción no pedía fecha: las alertas de vencimiento y los
 * descuentos por vencer leían `Batch`, y `Batch` solo lo llenaba el alta
 * manual (main: 0 filas). Acá: la fecha se valida, el lote nace con lo que
 * entró a stock (no la merma) en la misma transacción, no se duplica si la
 * recepción se reprocesa, y `Product.expiresAt` queda en el más próximo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  ocFindFirst: vi.fn(),
  receiptCreate: vi.fn(),
  tx: null as null | ReturnType<typeof nuevoTx>,
  batchFindMany: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/db/goods-receipts.db", () => ({ GoodsReceiptsDB: { create: h.receiptCreate, list: vi.fn() } }));
vi.mock("@/lib/compras/recibido-acumulado", () => ({
  getRecibidoAcumulado: vi.fn().mockResolvedValue(new Map()),
  estaCompleta: vi.fn().mockReturnValue(true),
}));
vi.mock("@/lib/compras/aplicar-credito-recepcion", () => ({
  SIN_CREDITO: { total: 0, descontado: 0, aFavor: 0, payableId: null, detalle: "" },
  aplicarCreditoRecepcion: vi.fn().mockResolvedValue({ total: 20, descontado: 20, aFavor: 0, payableId: "cxp-1", detalle: "4 dañado" }),
  anotarCreditoEnItems: vi.fn((items: unknown) => items),
  getFaltantesAcreditados: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseOrder: { findFirst: h.ocFindFirst },
    batch: { findMany: h.batchFindMany },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown, _opts?: unknown) => fn(h.tx)),
  },
}));

import { POST } from "@/app/api/compras/recepciones/route";
import { prisma } from "@/lib/prisma";
import { BatchesDB, idDeLoteDeRecepcion } from "@/lib/db/batches.db";
import {
  armarLoteDeRecepcion, cantidadQueSaleDeLotes, errorDeVencimiento, limitesDeVence, sumarDiasIso, textoVence, venceEnDias,
} from "@/lib/compras/lotes-recepcion";
import { limaDateKey } from "@/lib/utils";

const HOY = limaDateKey();
const EN_UN_MES = sumarDiasIso(HOY, 30);

/** Lo que el endpoint le pasa a `tx.batch.createMany`, en lo que se mira. */
type FilaLote = { id: string; tenantId: string; quantity: number; expiryDate: Date; [campo: string]: unknown };

function nuevoTx() {
  return {
    product: {
      findFirst: vi.fn().mockResolvedValue({ id: 7, name: "Yogurt fresa 1 L", category: "Lácteos", unit: "unidad", stock: 4, costPrice: 5 }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    inventoryMovement: { create: vi.fn().mockResolvedValue({}) },
    batch: {
      createMany: vi.fn(async ({ data }: { data: FilaLote[]; skipDuplicates?: boolean }) => ({ count: data.length })),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
    purchaseOrder: { update: vi.fn().mockResolvedValue({}) },
    goodsReceipt: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

const OC = {
  id: "oc-1", tenantId: "t-a", supplierId: "sup-1", supplierName: "Gloria", total: 120, flete: 0, otrosCostos: 0, notes: "",
  items: [{ productId: 7, name: "Yogurt fresa 1 L", quantity: 24, unitCost: 5, unit: "unidad" }],
};

function req(items: unknown[]) {
  return new NextRequest("http://localhost/api/compras/recepciones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderRef: "oc-1", supplier: "Gloria", items }),
  });
}

const linea = (extra: Record<string, unknown> = {}) => ({
  product: "Yogurt fresa 1 L", productId: 7, expectedQty: 24, receivedQty: 24, condition: "ok", notes: "", ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.tx = nuevoTx();
  h.requireAdmin.mockResolvedValue({ tenantId: "t-a", username: "almacen", role: "admin" });
  h.ocFindFirst.mockResolvedValue(OC);
  h.receiptCreate.mockImplementation(async (_t: string, d: Record<string, unknown>) => ({
    id: "rec-1", ref: d.ref, purchaseOrderId: "oc-1", supplierName: "Gloria", scheduledDate: null,
    receivedDate: new Date(), status: "aceptada", inspector: null, itemsJson: d.items, photos: 0,
    nonConformities: 0, invoiceUrl: null,
  }));
});

describe("fecha de vencimiento", () => {
  it("hoy sirve, ayer no, 2026-02-30 no existe, y 2062 por 2026 se avisa", () => {
    expect(errorDeVencimiento(HOY, HOY)).toBeNull();
    expect(errorDeVencimiento(sumarDiasIso(HOY, -1), HOY)).toMatch(/ya pasó/);
    expect(errorDeVencimiento("2026-02-30", HOY)).toMatch(/no es válida/);
    expect(errorDeVencimiento(sumarDiasIso(HOY, 11 * 366), HOY)).toMatch(/10 años/);
  });

  it("los atajos cuentan desde hoy en Pucallpa, sin correrse por el huso", () => {
    expect(venceEnDias(30, "2026-10-09")).toBe("2026-11-08");
    expect(venceEnDias(90, "2026-12-15")).toBe("2027-03-15");
    expect(textoVence("2026-11-08")).toBe("08/11/2026");
  });
});

describe("armarLoteDeRecepcion", () => {
  const base = {
    indice: 0, ref: "REC-ABC123", productId: 7, productName: "Yogurt", productCategory: "Lácteos",
    unit: "unidad", costUnit: 5.333, supplierId: "sup-1", supplierName: "Gloria",
  };

  it("lo que entró a stock nace como lote; sin número de lote usa la recepción", () => {
    const l = armarLoteDeRecepcion({ ...base, item: { receivedQty: 24, condition: "ok", expiryDate: EN_UN_MES } });
    expect(l).toMatchObject({ lote: "REC-ABC123", quantity: 24, expiryDate: EN_UN_MES, costUnit: 5.33, notes: "Recepción REC-ABC123" });
  });

  it("dañado, vencido, faltante, sin fecha o sin unidades: no hay lote", () => {
    for (const condition of ["dañado", "vencido", "faltante"] as const) {
      expect(armarLoteDeRecepcion({ ...base, item: { receivedQty: 5, condition, expiryDate: EN_UN_MES } })).toBeNull();
    }
    expect(armarLoteDeRecepcion({ ...base, item: { receivedQty: 5, condition: "ok" } })).toBeNull();
    expect(armarLoteDeRecepcion({ ...base, item: { receivedQty: 0, condition: "ok", expiryDate: EN_UN_MES } })).toBeNull();
  });
});

describe("BatchesDB: lotes de una recepción", () => {
  it("id fijo por tenant + recepción + línea: reprocesar no duplica, otro tenant no choca", async () => {
    expect(idDeLoteDeRecepcion("t-a", "rec-1", 0)).toBe(idDeLoteDeRecepcion("t-a", "rec-1", 0));
    expect(idDeLoteDeRecepcion("t-a", "rec-1", 0)).not.toBe(idDeLoteDeRecepcion("t-b", "rec-1", 0));
    expect(idDeLoteDeRecepcion("t-a", "rec-1", 0)).not.toBe(idDeLoteDeRecepcion("t-a", "rec-1", 1));

    const tx = nuevoTx();
    const lote = armarLoteDeRecepcion({
      indice: 2, ref: "REC-X", productId: 7, productName: "Y", productCategory: "L", unit: "u", costUnit: 1,
      supplierId: null, supplierName: "G", item: { receivedQty: 3, condition: "ok", expiryDate: EN_UN_MES },
    })!;
    await BatchesDB.crearDesdeRecepcionTx(tx as never, "t-a", "rec-1", [lote]);
    const arg = tx.batch.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data[0]).toMatchObject({ id: idDeLoteDeRecepcion("t-a", "rec-1", 2), tenantId: "t-a", quantity: 3 });
    expect(arg.data[0].expiryDate.toISOString()).toBe(`${EN_UN_MES}T00:00:00.000Z`);
  });

  it("Product.expiresAt = el más próximo con stock: UNA consulta para todos, con el tenant en el WHERE", async () => {
    const tx = nuevoTx();
    await BatchesDB.propagarVenceTx(tx as never, "t-a", [7, 7, 9]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [partes, ...valores] = tx.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = partes.join("?");
    expect(sql).toMatch(/MIN\(b\."expiryDate"\)/);
    expect(sql).toMatch(/b\."quantity" > 0/);
    // El tenant va en el lote Y en el producto; los ids, sin repetir.
    expect(valores.filter((v) => v === "t-a")).toHaveLength(2);
    expect((valores.at(-1) as { values: unknown[] }).values).toEqual([7, 9]);
    await BatchesDB.propagarVenceTx(tx as never, "t-a", []);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/compras/recepciones con «vence»", () => {
  it("la línea que entra a stock crea su lote en la misma tx y deja el vencimiento en el producto", async () => {
    const res = await POST(req([linea({ expiryDate: EN_UN_MES, lote: "L-2210" })]));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ stockUpdated: 1, lotes: 1 });
    const data = h.tx!.batch.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ tenantId: "t-a", productId: 7, lote: "L-2210", quantity: 24, supplierId: "sup-1" });
    // El stock se sumó una sola vez (por el producto), no también por el lote.
    expect(h.tx!.product.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stock: 28 }) }));
    expect(h.tx!.$executeRaw).toHaveBeenCalledTimes(1);
    // Con margen sobre el corte de 5 s de Prisma.
    const opts = vi.mocked(prisma.$transaction).mock.calls[0][1] as { timeout?: number } | undefined;
    expect(opts?.timeout).toBeGreaterThanOrEqual(15_000);
  });

  it("si la tx se revierte, la respuesta no dice que entró stock ni lotes", async () => {
    h.tx!.batch.createMany.mockRejectedValueOnce(new Error("Transaction already closed"));
    const res = await POST(req([linea({ expiryDate: EN_UN_MES })]));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ stockUpdated: 0, lotes: 0 });
  });

  it("lo dañado no hace lote aunque traiga fecha (la merma no vence)", async () => {
    const res = await POST(req([linea({ condition: "dañado", receivedQty: 4, expiryDate: sumarDiasIso(HOY, -3) })]));
    expect(res.status).toBe(201);
    expect((await res.json()).lotes).toBe(0);
    expect(h.tx!.batch.createMany).not.toHaveBeenCalled();
  });

  it("sin fecha todo sigue como antes: entra el stock y no hay lote", async () => {
    const res = await POST(req([linea()]));
    expect((await res.json())).toMatchObject({ stockUpdated: 1, lotes: 0 });
    expect(h.tx!.batch.createMany).not.toHaveBeenCalled();
  });

  it("una fecha que ya pasó se rechaza ANTES de guardar nada, con la línea en el mensaje", async () => {
    const res = await POST(req([linea({ expiryDate: sumarDiasIso(HOY, -1) })]));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Yogurt fresa 1 L: Esa fecha ya pasó/);
    expect(h.receiptCreate).not.toHaveBeenCalled();
  });

  it("OC de otro tenant: la busca con el tenant de la sesión, no la encuentra y no crea lotes", async () => {
    h.requireAdmin.mockResolvedValue({ tenantId: "t-b", username: "otro", role: "admin" });
    h.ocFindFirst.mockResolvedValue(null);
    const res = await POST(req([linea({ expiryDate: EN_UN_MES })]));
    expect(h.ocFindFirst.mock.calls[0][0].where).toEqual({ id: "oc-1", tenantId: "t-b" });
    expect((await res.json())).toMatchObject({ stockUpdated: 0, lotes: 0 });
    expect(h.tx!.batch.createMany).not.toHaveBeenCalled();
  });

  it("sin sesión: 401 y nada se escribe", async () => {
    h.requireAdmin.mockResolvedValue(NextResponse.json({ error: "No autorizado" }, { status: 401 }));
    const res = await POST(req([linea({ expiryDate: EN_UN_MES })]));
    expect(res.status).toBe(401);
    expect(h.receiptCreate).not.toHaveBeenCalled();
  });
});

describe("«vence hoy» se compara por el día de Pucallpa", () => {
  // 09-10 a las 20:00 en Lima = 10-10 01:00 UTC.
  const NOCHE_LIMA = new Date("2026-10-10T01:00:00.000Z");
  const loteDeHoy = new Date("2026-10-09T00:00:00.000Z");

  it("el lote que vence hoy sigue vigente a las 20:00; el de ayer ya venció", () => {
    const { hoy, hasta } = limitesDeVence(7, "2026-10-09");
    expect(loteDeHoy >= hoy).toBe(true);
    expect(new Date("2026-10-08T00:00:00.000Z") < hoy).toBe(true);
    // El día 7 entra entero en «por vencer»; el 8, no.
    expect(new Date("2026-10-16T00:00:00.000Z") <= hasta).toBe(true);
    expect(new Date("2026-10-17T00:00:00.000Z") <= hasta).toBe(false);
    // Antes: `lt: new Date()` a las 20:00 daba vencido al lote de hoy.
    expect(loteDeHoy < NOCHE_LIMA).toBe(true);
  });

  it("la lista de vencidos corta en hoy de Lima, no en la hora del servidor", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOCHE_LIMA);
    try {
      h.batchFindMany.mockResolvedValue([]);
      await BatchesDB.getExpiredWithStock("t-a");
      expect(h.batchFindMany.mock.calls[0][0].where).toMatchObject({
        tenantId: "t-a", expiryDate: { lt: new Date("2026-10-09T00:00:00.000Z") }, quantity: { gt: 0 },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("venta sobre stock que ya existía sin lote", () => {
  it("solo sale del lote lo que el stock que queda no cubre", () => {
    // Arroz: 108 sin lote + lote de 2; se venden 2 → quedan 108: el lote sigue.
    expect(cantidadQueSaleDeLotes({ vendido: 2, sumaLotes: 2, stockDespues: 108 })).toBe(0);
    // Se venden 107 más → quedan 1: del lote sale 1.
    expect(cantidadQueSaleDeLotes({ vendido: 107, sumaLotes: 2, stockDespues: 1 })).toBe(1);
    // Todo con lote: 10 en lotes, se venden 3 → quedan 7: salen 3.
    expect(cantidadQueSaleDeLotes({ vendido: 3, sumaLotes: 10, stockDespues: 7 })).toBe(3);
    // Nunca más que lo vendido, aunque el stock esté desfasado.
    expect(cantidadQueSaleDeLotes({ vendido: 1, sumaLotes: 10, stockDespues: 0 })).toBe(1);
    // Producto sin control de stock: como antes, todo sale del lote.
    expect(cantidadQueSaleDeLotes({ vendido: 2, sumaLotes: 5, stockDespues: null })).toBe(2);
    expect(cantidadQueSaleDeLotes({ vendido: 0.75, sumaLotes: 1.5, stockDespues: 0.75 })).toBe(0.75);
  });

  it("descontarVentaTx: el lote del Arroz sigue en 2 tras vender 2 con stock 110", async () => {
    const tx = nuevoTx();
    tx.batch.findMany.mockResolvedValue([{ id: "b-1", quantity: 2, expiryDate: new Date("2026-10-20T00:00:00.000Z") }]);
    tx.product.findFirst.mockResolvedValue({ stock: 108 } as never);
    const r = await BatchesDB.descontarVentaTx(tx as never, "t-a", 7, 2);
    expect(r).toEqual({ lotes: [], desdeLotes: 0 });
    expect(tx.batch.updateMany).not.toHaveBeenCalled();
    expect(tx.product.findFirst.mock.calls[0][0].where).toEqual({ id: 7, tenantId: "t-a" });
  });

  it("descontarVentaTx: FEFO con decrement y el tenant en el WHERE de cada lote", async () => {
    const tx = nuevoTx();
    tx.batch.findMany.mockResolvedValue([
      { id: "b-1", quantity: 2, expiryDate: new Date("2026-10-12T00:00:00.000Z") },
      { id: "b-2", quantity: 5, expiryDate: new Date("2026-11-01T00:00:00.000Z") },
    ]);
    tx.product.findFirst.mockResolvedValue({ stock: 3 } as never); // 7 en lotes, quedan 3 → salen 4
    const r = await BatchesDB.descontarVentaTx(tx as never, "t-a", 7, 4);
    expect(r.desdeLotes).toBe(4);
    expect(r.lotes.map((l) => [l.batchId, l.qty])).toEqual([["b-1", 2], ["b-2", 2]]);
    expect(tx.batch.findMany.mock.calls[0][0]).toMatchObject({ where: { tenantId: "t-a", productId: 7 }, orderBy: { expiryDate: "asc" } });
    expect(tx.batch.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "b-1", tenantId: "t-a", quantity: { gte: 2 } }, data: { quantity: { decrement: 2 } },
    });
  });

  it("descontarVentaTx: si otra venta ya vació el lote, no lo cuenta", async () => {
    const tx = nuevoTx();
    tx.batch.findMany.mockResolvedValue([{ id: "b-1", quantity: 2, expiryDate: new Date("2026-10-12T00:00:00.000Z") }]);
    tx.product.findFirst.mockResolvedValue({ stock: 0 } as never);
    tx.batch.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await BatchesDB.descontarVentaTx(tx as never, "t-a", 7, 2)).toEqual({ lotes: [], desdeLotes: 0 });
  });
});
