/**
 * Devoluciones a proveedor — anular en vez de borrar (auditoría Compras C55,
 * 17-10). El borrado definitivo se llevaba el registro y devolvía al inventario
 * mercadería que quizá seguía en el proveedor. Ahora:
 *
 * - anular conserva la fila con el motivo; el stock vuelve SÓLO si la persona
 *   dice que la mercadería volvió al almacén, y una sola vez (compara-y-cambia
 *   sobre `stockAplicadoAt`);
 * - ANULADA es final: ningún cambio de estado la revive (volver a ENVIADA
 *   sacaría el stock otra vez);
 * - poner costo (C51) sólo llena los ítems que no lo tenían.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  productFindFirst: vi.fn(),
  productUpdate: vi.fn(),
  movementCreate: vi.fn(),
  itemUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));
const tx = {
  supplierReturn: { findFirst: m.findFirst, updateMany: m.updateMany },
  product: { findFirst: m.productFindFirst, update: m.productUpdate },
  inventoryMovement: { create: m.movementCreate },
  supplierReturnItem: { updateMany: m.itemUpdateMany },
};
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: m.transaction } }));

import {
  anularSupplierReturn, reingresarSupplierReturn, valorarItemsSupplierReturn,
  DevolucionAnuladaError, NadaQueReingresarError,
} from "@/lib/db/supplier-returns-anular.db";
import { updateSupplierReturnEstado } from "@/lib/db/supplier-returns-by-id.db";

const TENANT = "t-qa";

function devolucion(over: Record<string, unknown> = {}) {
  return {
    id: "ret-1",
    tenantId: TENANT,
    proveedorNombre: "Distribuidora QA",
    motivo: "Vencido",
    notas: "Llamar a Juan",
    estado: "ENVIADA",
    stockAplicadoAt: new Date("2026-10-10"),
    items: [
      { id: 1, nombre: "Arroz 5kg", cantidad: 4, unidad: "und", productId: 77, precioUnitario: null },
      { id: 2, nombre: "Envase", cantidad: 1, unidad: "und", productId: null, precioUnitario: 2 },
    ],
    ...over,
  };
}

/** La fila vive en memoria: cada `updateMany` condicionado la cambia sólo si el WHERE calza. */
function filaEnMemoria(inicial: ReturnType<typeof devolucion>) {
  let fila = { ...inicial };
  m.findFirst.mockImplementation(async () => ({ ...fila }));
  m.updateMany.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const calza = Object.entries(where).every(([k, v]) => {
      if (k === "id" || k === "tenantId") return true;
      const actual = (fila as Record<string, unknown>)[k];
      if (v && typeof v === "object" && "not" in v) return actual !== (v as { not: unknown }).not;
      return actual === v;
    });
    if (!calza) return { count: 0 };
    fila = { ...fila, ...data };
    return { count: 1 };
  });
  return () => fila;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.transaction.mockImplementation(async (cb: (t: typeof tx) => unknown) => cb(tx));
  m.productFindFirst.mockResolvedValue({ id: 77, name: "Arroz 5kg", stock: 6 });
  m.productUpdate.mockImplementation(async ({ data }: { data: { stock: { increment: number } } }) => ({ stock: 6 + data.stock.increment }));
});

describe("anular", () => {
  it("una pendiente (no salió nada) se anula sin tocar el stock y guarda el motivo", async () => {
    const fila = filaEnMemoria(devolucion({ estado: "PENDIENTE", stockAplicadoAt: null }));
    const r = await anularSupplierReturn(TENANT, "ret-1", { motivo: "Me equivoqué de proveedor", volvioAlAlmacen: false, usuario: "qaadmin" });
    expect(r).not.toBeNull();
    expect(fila().estado).toBe("ANULADA");
    expect(fila().notas).toMatch(/^Llamar a Juan\nAnulada el .+ por qaadmin: Me equivoqué de proveedor\.$/);
    expect(m.productUpdate).not.toHaveBeenCalled();
    expect(m.movementCreate).not.toHaveBeenCalled();
  });

  it("enviada que sigue en el proveedor: anula sin mover stock y la marca queda puesta", async () => {
    const fila = filaEnMemoria(devolucion());
    await anularSupplierReturn(TENANT, "ret-1", { motivo: "El proveedor no la acepta", volvioAlAlmacen: false, usuario: "qaadmin" });
    expect(fila().estado).toBe("ANULADA");
    expect(fila().stockAplicadoAt).not.toBeNull();
    expect(fila().notas).toMatch(/sigue fuera del almacén/);
    expect(m.productUpdate).not.toHaveBeenCalled();
  });

  it("enviada que volvió al almacén: el stock vuelve una vez, con su movimiento", async () => {
    const fila = filaEnMemoria(devolucion());
    await anularSupplierReturn(TENANT, "ret-1", { motivo: "Nos la devolvieron", volvioAlAlmacen: true, usuario: "qaadmin" });
    expect(fila().stockAplicadoAt).toBeNull();
    // Sólo el ítem con producto: el escrito a mano nunca salió del inventario.
    expect(m.productUpdate).toHaveBeenCalledTimes(1);
    expect(m.productUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { stock: { increment: 4 } } }));
    expect(m.movementCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "ajuste_positivo", quantity: 4, previousStock: 6, newStock: 10, reference: "ret-1", tenantId: TENANT }),
    });
  });

  it("si otra anulación ganó la marca antes, no devuelve el stock dos veces", async () => {
    filaEnMemoria(devolucion());
    m.updateMany.mockResolvedValueOnce({ count: 1 }); // el estado: lo toma esta anulación
    m.updateMany.mockResolvedValueOnce({ count: 0 }); // el compara-y-cambia de stockAplicadoAt lo perdió
    await anularSupplierReturn(TENANT, "ret-1", { motivo: "Doble clic", volvioAlAlmacen: true, usuario: "qaadmin" });
    expect(m.productUpdate).not.toHaveBeenCalled();
  });

  it("«Enviada» entre la lectura y la anulación: se relee la marca y la nota dice la verdad (revisión 17-10)", async () => {
    // La 1.ª lectura vio PENDIENTE sin stock afuera; el update del estado esperó a «Enviada»
    // y, con la fila tomada, la relectura ya la ve marcada.
    const fila = filaEnMemoria(devolucion({ estado: "PENDIENTE", stockAplicadoAt: null }));
    m.findFirst.mockResolvedValueOnce({ ...fila() });
    Object.assign(fila(), { estado: "ENVIADA", stockAplicadoAt: new Date("2026-10-17T03:00:00Z") });

    await anularSupplierReturn(TENANT, "ret-1", { motivo: "Ya no va", volvioAlAlmacen: false, usuario: "qaadmin" });
    // El estado va PRIMERO: es lo que serializa con «Enviada».
    expect(m.updateMany.mock.calls[0][0]).toEqual({ where: { id: "ret-1", tenantId: TENANT, estado: { not: "ANULADA" } }, data: { estado: "ANULADA" } });
    expect(fila().estado).toBe("ANULADA");
    expect(fila().notas).toMatch(/sigue fuera del almacén/);
    expect(m.productUpdate).not.toHaveBeenCalled();
  });

  it("…y si la mercadería volvió, el stock que sacó «Enviada» vuelve una vez", async () => {
    const fila = filaEnMemoria(devolucion({ estado: "PENDIENTE", stockAplicadoAt: null }));
    m.findFirst.mockResolvedValueOnce({ ...fila() });
    Object.assign(fila(), { estado: "ENVIADA", stockAplicadoAt: new Date("2026-10-17T03:00:00Z") });

    await anularSupplierReturn(TENANT, "ret-1", { motivo: "Volvió", volvioAlAlmacen: true, usuario: "qaadmin" });
    expect(fila().stockAplicadoAt).toBeNull();
    expect(m.productUpdate).toHaveBeenCalledTimes(1);
  });

  it("anular una ya anulada se rechaza", async () => {
    filaEnMemoria(devolucion({ estado: "ANULADA" }));
    await expect(
      anularSupplierReturn(TENANT, "ret-1", { motivo: "Otra vez", volvioAlAlmacen: true, usuario: "qaadmin" }),
    ).rejects.toBeInstanceOf(DevolucionAnuladaError);
    expect(m.productUpdate).not.toHaveBeenCalled();
  });

  it("de otro negocio (no la encuentra) devuelve null", async () => {
    m.findFirst.mockResolvedValue(null);
    expect(await anularSupplierReturn(TENANT, "ajena", { motivo: "x x x", volvioAlAlmacen: true, usuario: "qaadmin" })).toBeNull();
    expect(m.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "ajena", tenantId: TENANT } }));
  });
});

describe("volvió al almacén después de anular", () => {
  it("reingresa una vez; el segundo clic no suma de nuevo", async () => {
    const fila = filaEnMemoria(devolucion({ estado: "ANULADA" }));
    await reingresarSupplierReturn(TENANT, "ret-1", "qaadmin");
    expect(fila().stockAplicadoAt).toBeNull();
    expect(fila().notas).toMatch(/volvió al almacén el .+ \(lo marcó qaadmin\)/);
    await expect(reingresarSupplierReturn(TENANT, "ret-1", "qaadmin")).rejects.toBeInstanceOf(NadaQueReingresarError);
    expect(m.productUpdate).toHaveBeenCalledTimes(1);
  });

  it("una devolución viva no se reingresa por esta vía", async () => {
    filaEnMemoria(devolucion());
    await expect(reingresarSupplierReturn(TENANT, "ret-1", "qaadmin")).rejects.toBeInstanceOf(NadaQueReingresarError);
    expect(m.productUpdate).not.toHaveBeenCalled();
  });
});

describe("ANULADA es final", () => {
  it("«Enviada» que pierde contra una anulación: no descuenta y avisa (revisión 17-10)", async () => {
    // Leyó ENVIADA-able (PENDIENTE); la anulación tomó la fila antes y ya está ANULADA.
    const fila = filaEnMemoria(devolucion({ estado: "PENDIENTE", stockAplicadoAt: null }));
    m.findFirst.mockResolvedValueOnce({ ...fila() });
    Object.assign(fila(), { estado: "ANULADA" });
    await expect(updateSupplierReturnEstado(TENANT, "ret-1", "ENVIADA")).rejects.toBeInstanceOf(DevolucionAnuladaError);
    // El compara-y-cambia del stock exige `estado ≠ ANULADA`: no ganó la marca.
    expect(m.updateMany.mock.calls[0][0].where).toEqual({ id: "ret-1", tenantId: TENANT, stockAplicadoAt: null, estado: { not: "ANULADA" } });
    expect(fila().stockAplicadoAt).toBeNull();
    expect(m.productUpdate).not.toHaveBeenCalled();
  });

  it("cambiarle el estado se rechaza y no saca stock", async () => {
    filaEnMemoria(devolucion({ estado: "ANULADA", stockAplicadoAt: null }));
    await expect(updateSupplierReturnEstado(TENANT, "ret-1", "ENVIADA")).rejects.toBeInstanceOf(DevolucionAnuladaError);
    expect(m.productUpdate).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});

describe("poner costo (C51)", () => {
  it("sólo llena los ítems sin costo de ESA devolución", async () => {
    filaEnMemoria(devolucion({ estado: "PENDIENTE", stockAplicadoAt: null }));
    m.itemUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const r = await valorarItemsSupplierReturn(TENANT, "ret-1", [
      { itemId: 1, precioUnitario: 18 },
      { itemId: 2, precioUnitario: 99 }, // ya tenía costo: no se pisa
    ]);
    expect(r?.valorados).toBe(1);
    expect(m.itemUpdateMany).toHaveBeenNthCalledWith(1, { where: { id: 1, returnId: "ret-1", precioUnitario: null }, data: { precioUnitario: 18 } });
    expect(m.itemUpdateMany).toHaveBeenNthCalledWith(2, { where: { id: 2, returnId: "ret-1", precioUnitario: null }, data: { precioUnitario: 99 } });
  });

  it("una anulada no se valora", async () => {
    filaEnMemoria(devolucion({ estado: "ANULADA" }));
    await expect(valorarItemsSupplierReturn(TENANT, "ret-1", [{ itemId: 1, precioUnitario: 18 }])).rejects.toBeInstanceOf(DevolucionAnuladaError);
    expect(m.itemUpdateMany).not.toHaveBeenCalled();
  });

  it("de otro negocio devuelve null sin tocar ítems", async () => {
    m.findFirst.mockResolvedValue(null);
    expect(await valorarItemsSupplierReturn(TENANT, "ajena", [{ itemId: 1, precioUnitario: 18 }])).toBeNull();
    expect(m.itemUpdateMany).not.toHaveBeenCalled();
  });
});
