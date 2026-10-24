// @vitest-environment node
/**
 * Kits que descuentan stock (`lib/db/kits.db.ts`, Musa 11-10): vender un kit
 * sin stock propio resta cada componente `cantidad × unidades` en la misma
 * transacción de la venta del POS, con su kardex; nunca en negativo; la
 * devolución repone los componentes; otro negocio no ve la composición.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Where = { id?: { in?: number[] } | number; tenantId?: string };

const h = vi.hoisted(() => {
  /** Stock vivo por producto del negocio `tenant-1` (null = sin control). */
  const stock = new Map<number, number | null>();
  const nombres = new Map<number, string>();
  const recetas: {
    tenantId: string; productoId: number; nombre: string; categoria: string; activa: boolean;
    ingredientes: { productoId: number; cantidad: number }[];
  }[] = [];
  /** Filas de kardex escritas (createMany) y orden de los UPDATE de stock. */
  const kardex: { productId: number; type: string; quantity: number; previousStock: number; newStock: number; reference: string; notes: string }[] = [];
  const orden: number[] = [];
  const tx = {
    $executeRaw: vi.fn(() => Promise.resolve(1)),
    product: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    receta: { findMany: vi.fn() },
    recetaIngrediente: { findFirst: vi.fn() },
    sale: { create: vi.fn(), findFirst: vi.fn() },
    return: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    inventoryMovement: { createMany: vi.fn(), findMany: vi.fn() },
    customer: { updateMany: vi.fn() },
  };
  return { stock, nombres, recetas, kardex, orden, tx, preciosFindMany: vi.fn(), getById: vi.fn(), updateReceta: vi.fn() };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ...h.tx,
    product: { ...h.tx.product, findMany: h.preciosFindMany },
    $transaction: vi.fn((fn: (t: typeof h.tx) => unknown) => fn(h.tx)),
  },
}));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(() => Promise.resolve({ role: "admin", username: "qa", tenantId: "tenant-1" })),
}));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null, rateLimit: () => null, getClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/db-retry", () => ({ withDbRetry: <T,>(fn: () => Promise<T>) => fn() }));
vi.mock("@/lib/cache", () => ({
  revalidateTenantTag: vi.fn(),
  getOrSet: <T,>(_k: string, _ttl: number, fn: () => Promise<T>) => fn(),
  invalidate: vi.fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/audit-logger", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/audit/audit-context", () => ({
  runWithAuditContext: <T,>(_req: unknown, _user: unknown, fn: () => Promise<T>) => fn(),
  getAuditContext: () => null,
}));
vi.mock("@/lib/inventory/fefo-deduct", () => ({
  deductStockFEFO: vi.fn(),
  hasBatchesWithStock: vi.fn(() => Promise.resolve(false)),
}));
vi.mock("@/lib/jsondb", () => ({
  SalesDB: { getAll: vi.fn() },
  InventoryMovementsDB: { record: vi.fn(() => Promise.resolve()) },
  LoyaltyDB: { accruePoints: vi.fn(() => Promise.resolve()) },
}));
vi.mock("@/app/api/inventory/conteo/route", () => ({ conteoLockKey: vi.fn() }));
vi.mock("@/lib/caja/anotar-venta", () => ({
  anotarVentaEnCaja: vi.fn(() => Promise.resolve({ sinAnotar: [], motivo: null })),
}));
vi.mock("@/lib/caja/invalidar-ventas-overview", () => ({
  invalidarVentasOverview: vi.fn(),
  tagVentasOverview: (t: string) => `ventas-overview-${t}`,
}));

vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/db/recetas.db", () => ({ RecetasDB: { getById: h.getById, calcularCosto: vi.fn(), create: vi.fn() } }));
vi.mock("@/lib/db/recetas-detail.db", () => ({
  RecetasDetailDB: {
    countOwnedProducts: vi.fn((_t: string, ids: number[]) => Promise.resolve(new Set(ids).size)),
    updateRecetaInTenant: h.updateReceta,
    findRecetaWithIngredientes: vi.fn(() => Promise.resolve({ nombre: "x" })),
    replaceIngredientes: vi.fn(),
  },
}));

import { POST as venderPOS } from "@/app/api/sales/route";
import { PATCH as editarReceta } from "@/app/api/recetas/[id]/route";
import { DevolucionesPosDB } from "@/lib/db/devoluciones-pos.db";
import { KitError, KitsDB, salidasDeKits, type Kit } from "@/lib/db/kits.db";

/** Costo de compra de cada producto (el kit, 64, sólo cuenta si tiene stock propio). */
const COSTO = new Map<number, number>([[900, 64], [1, 24], [2, 30]]);

const KIT = 900;
const SHAMPOO = 1;
const PROTECTOR = 2;

function ids(where: Where): number[] {
  const id = where.id;
  if (typeof id === "number") return [id];
  return id?.in ?? [];
}

/** El kit de 2 componentes: 1 shampoo + 2 protectores. */
function armarNegocio(stockShampoo: number | null, stockProtector: number | null) {
  h.stock.clear();
  h.stock.set(KIT, null);
  h.stock.set(SHAMPOO, stockShampoo);
  h.stock.set(PROTECTOR, stockProtector);
  h.nombres.set(KIT, "Kit Cabello de salón");
  h.nombres.set(SHAMPOO, "Shampoo sin sal");
  h.nombres.set(PROTECTOR, "Protector solar");
  h.recetas.length = 0;
  h.recetas.push({
    tenantId: "tenant-1", productoId: KIT, nombre: "Kit Cabello de salón", categoria: "kit", activa: true,
    ingredientes: [{ productoId: SHAMPOO, cantidad: 1 }, { productoId: PROTECTOR, cantidad: 2 }],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  armarNegocio(10, 10);
  h.kardex.length = 0;
  h.orden.length = 0;
  h.preciosFindMany.mockImplementation(({ where }: { where: Where }) =>
    Promise.resolve(where.tenantId === "tenant-1" ? ids(where).map((id) => ({ id, price: id === KIT ? 149 : 59, costPrice: COSTO.get(id) ?? 20 })) : []),
  );
  h.tx.product.findMany.mockImplementation(({ where }: { where: Where }) =>
    Promise.resolve(
      where.tenantId === "tenant-1"
        ? ids(where).filter((id) => h.stock.has(id)).map((id) => ({ id, stock: h.stock.get(id) ?? null, name: h.nombres.get(id) }))
        : [],
    ),
  );
  h.tx.product.updateMany.mockImplementation(({ where, data }: { where: { id: number }; data: { stock: { decrement: number } } }) => {
    h.orden.push(where.id);
    const s = h.stock.get(where.id);
    if (s != null) h.stock.set(where.id, s - data.stock.decrement);
    return Promise.resolve({ count: 1 });
  });
  h.tx.product.update.mockImplementation(
    ({ where, data }: { where: { id: number; tenantId: string; OR?: unknown }; data: { stock: { decrement?: number; increment?: number } } }) => {
      h.orden.push(where.id);
      const s = h.stock.get(where.id);
      if (where.tenantId !== "tenant-1" || s === undefined) return Promise.reject(Object.assign(new Error("no"), { code: "P2025" }));
      if (s == null) return Promise.resolve({ stock: null });
      const baja = data.stock.decrement ?? 0;
      if (where.OR && s < baja) return Promise.reject(Object.assign(new Error("no"), { code: "P2025" }));
      const nuevo = s - baja + (data.stock.increment ?? 0);
      h.stock.set(where.id, nuevo);
      return Promise.resolve({ stock: nuevo });
    },
  );
  h.tx.receta.findMany.mockImplementation(
    ({ where }: { where: { tenantId: string; productoId: { in: number[] }; producto: { is: { tenantId: string } } } }) =>
      Promise.resolve(
        h.recetas
          .filter((r) => r.tenantId === where.tenantId && where.producto.is.tenantId === where.tenantId)
          .filter((r) => r.activa && r.categoria === "kit" && where.productoId.in.includes(r.productoId))
          .map((r) => ({
            productoId: r.productoId,
            nombre: r.nombre,
            producto: { name: h.nombres.get(r.productoId) },
            ingredientes: r.ingredientes.map((i) => ({ ...i, producto: { costPrice: COSTO.get(i.productoId) ?? null, price: 59 } })),
          })),
      ),
  );
  h.tx.sale.create.mockImplementation(({ data }: { data: { id: string; total: number; items?: { create: unknown[] } } }) =>
    Promise.resolve({
      id: data.id, total: data.total, totalCogs: null, payment: "efectivo", amountPaid: data.total, change: 0,
      customerPhone: null, cashierId: "qa", createdAt: new Date(), comprobanteTipo: "ticket", comprobanteRuc: null,
      descuentoMonto: null, descuentoPorcentaje: null, paymentDetails: null, items: data.items?.create ?? [],
    }),
  );
  h.tx.inventoryMovement.createMany.mockImplementation(({ data }: { data: typeof h.kardex }) => {
    h.kardex.push(...data);
    return Promise.resolve({ count: data.length });
  });
  h.tx.inventoryMovement.findMany.mockImplementation(({ where }: { where: { tenantId: string; reference: string; type: string; notes: { contains: string } } }) =>
    Promise.resolve(
      where.tenantId === "tenant-1"
        ? h.kardex.filter((k) => k.reference === where.reference && k.type === where.type && k.notes.includes(where.notes.contains))
        : [],
    ),
  );
  h.tx.recetaIngrediente.findFirst.mockImplementation(
    ({ where }: { where: { productoId: number; receta: { tenantId: string; id?: { not: string } } } }) => {
      const r = h.recetas.find(
        (x) => x.tenantId === where.receta.tenantId && x.activa && x.categoria === "kit" && h.stock.get(x.productoId) === null
          && x.ingredientes.some((i) => i.productoId === where.productoId),
      );
      return Promise.resolve(r ? { receta: { nombre: r.nombre } } : null);
    },
  );
});

const vender = (items: { productId: number; quantity: number }[]) =>
  venderPOS(
    new NextRequest("http://localhost/api/sales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: items.map((i) => ({ ...i, price: 1, name: h.nombres.get(i.productId), unit: "und" })), payment: "efectivo" }),
    }),
  );

describe("salidasDeKits (puro)", () => {
  const kits = new Map<number, Kit>([[KIT, { productId: KIT, nombre: "Kit", componentes: [{ productId: SHAMPOO, cantidad: 1 }, { productId: PROTECTOR, cantidad: 2 }], costoUnitario: 84 }]]);

  it("3 kits de 2 componentes → 3 shampoo y 6 protectores; lo suelto no genera nada", () => {
    const salidas = salidasDeKits([{ productId: KIT, quantity: 3 }, { productId: 77, quantity: 5 }], kits);
    expect(salidas.map((s) => [s.productId, s.quantity])).toEqual([[SHAMPOO, 3], [PROTECTOR, 6]]);
  });

  it("una cantidad no entera es error de composición, no se redondea", () => {
    const roto = new Map<number, Kit>([[KIT, { productId: KIT, nombre: "Kit", componentes: [{ productId: SHAMPOO, cantidad: 0.5 }], costoUnitario: 12 }]]);
    expect(() => salidasDeKits([{ productId: KIT, quantity: 3 }], roto)).toThrow(KitError);
  });
});

describe("POST /api/sales con un kit", () => {
  it("vender 3 kits resta 3 shampoo y 6 protectores en la transacción, con kardex por componente", async () => {
    const res = await vender([{ productId: KIT, quantity: 3 }]);
    expect(res.status).toBe(201);
    const venta = await res.json();
    expect(h.stock.get(SHAMPOO)).toBe(7);
    expect(h.stock.get(PROTECTOR)).toBe(4);
    const kardex = h.tx.inventoryMovement.createMany.mock.calls[0][0].data;
    expect(kardex).toEqual([
      expect.objectContaining({ productId: SHAMPOO, type: "venta", quantity: 3, previousStock: 10, newStock: 7, reference: venta.id, tenantId: "tenant-1" }),
      expect.objectContaining({ productId: PROTECTOR, type: "venta", quantity: 6, previousStock: 10, newStock: 4, reference: venta.id }),
    ]);
    // La guarda contra el negativo va en el WHERE, con el negocio.
    expect(h.tx.product.update.mock.calls[0][0].where).toMatchObject({ id: SHAMPOO, tenantId: "tenant-1", OR: [{ stock: null }, { stock: { gte: 3 } }] });
  });

  it("si un componente no alcanza, 400 con su nombre y no se descuenta nada", async () => {
    armarNegocio(10, 5); // 3 kits piden 6 protectores
    const res = await vender([{ productId: KIT, quantity: 3 }]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Stock insuficiente para "Protector solar".*disponible 5, solicitado 6/);
    expect(h.tx.product.update).not.toHaveBeenCalled();
    expect(h.tx.inventoryMovement.createMany).not.toHaveBeenCalled();
  });

  it("el kit y su componente suelto en la misma venta suman contra el mismo stock", async () => {
    armarNegocio(3, 10); // 3 kits = 3 shampoo + 1 shampoo suelto = 4 > 3
    const res = await vender([{ productId: SHAMPOO, quantity: 1 }, { productId: KIT, quantity: 3 }]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Shampoo sin sal.*disponible 3, solicitado 4/);
  });

  it("otra caja vendió el último entre la lectura y el UPDATE → 400 «concurrencia»", async () => {
    h.tx.product.update.mockRejectedValueOnce(Object.assign(new Error("no"), { code: "P2025" }));
    const res = await vender([{ productId: KIT, quantity: 1 }]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/concurrencia/);
  });

  it("componente sin control de stock: sin tope, igual que una venta normal, y queda en el kardex", async () => {
    armarNegocio(null, null);
    const res = await vender([{ productId: KIT, quantity: 2 }]);
    expect(res.status).toBe(201);
    expect(h.tx.inventoryMovement.createMany.mock.calls[0][0].data[1]).toMatchObject({ productId: PROTECTOR, quantity: 4, previousStock: 0, newStock: 0 });
  });

  it("un kit con stock propio (cajas armadas) se vende de su stock, sin tocar componentes", async () => {
    h.stock.set(KIT, 5);
    const res = await vender([{ productId: KIT, quantity: 2 }]);
    expect(res.status).toBe(201);
    expect(h.stock.get(KIT)).toBe(3);
    expect(h.tx.receta.findMany).not.toHaveBeenCalled();
    expect(h.stock.get(SHAMPOO)).toBe(10);
  });

  it("la composición de otro negocio no se aplica (tenant en el WHERE)", async () => {
    h.recetas[0].tenantId = "tenant-ajeno";
    const res = await vender([{ productId: KIT, quantity: 1 }]);
    expect(res.status).toBe(201);
    expect(h.tx.receta.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: "tenant-1", producto: { is: { tenantId: "tenant-1", stock: null } } });
    expect(h.stock.get(SHAMPOO)).toBe(10);
    expect(h.tx.product.update).not.toHaveBeenCalled();
  });
});

describe("devolución de un kit (DevolucionesPosDB): vuelve lo que salió según el kardex", () => {
  let lineaVendida = { productId: KIT, quantity: 3 };

  beforeEach(() => {
    lineaVendida = { productId: KIT, quantity: 3 };
    h.tx.sale.findFirst.mockImplementation(({ where }: { where: { id: string; tenantId: string } }) =>
      Promise.resolve(
        where.tenantId === "tenant-1"
          ? { id: where.id, total: String(149 * lineaVendida.quantity), customerPhone: null, items: [{ ...lineaVendida, name: "Kit", price: "149.00" }] }
          : null,
      ),
    );
    h.tx.return.findFirst.mockResolvedValue(null);
    h.tx.return.findMany.mockResolvedValue([]);
    h.tx.return.create.mockResolvedValue({});
  });

  const venderKits = async (n: number) => {
    lineaVendida = { productId: KIT, quantity: n };
    const res = await vender([{ productId: KIT, quantity: n }]);
    expect(res.status).toBe(201);
    return (await res.json()).id as string;
  };
  const devolver = (saleId: string, qty: number) =>
    DevolucionesPosDB.registrar("tenant-1", { saleId, items: [{ productId: KIT, qty }], refundType: "efectivo", usuario: "qa" });

  it("vender 3 y devolver 2 repone 2 shampoo y 4 protectores con kardex «devolucion»", async () => {
    const id = await venderKits(3);
    expect([h.stock.get(SHAMPOO), h.stock.get(PROTECTOR)]).toEqual([7, 4]);
    const r = await devolver(id, 2);
    expect(r.totalRefund).toBe(298);
    expect([h.stock.get(SHAMPOO), h.stock.get(PROTECTOR)]).toEqual([9, 8]);
    expect(h.kardex.filter((k) => k.type === "devolucion")).toEqual([
      expect.objectContaining({ productId: SHAMPOO, quantity: 2, previousStock: 7, newStock: 9, reference: id }),
      expect.objectContaining({ productId: PROTECTOR, quantity: 4, previousStock: 4, newStock: 8 }),
    ]);
  });

  it("vender 3 y devolver los 3 deja el stock como estaba", async () => {
    const id = await venderKits(3);
    await devolver(id, 3);
    expect([h.stock.get(SHAMPOO), h.stock.get(PROTECTOR)]).toEqual([10, 10]);
  });

  it("la composición cambió después (2 → 3 protectores): repone los 2 que salieron, no 3", async () => {
    h.recetas[0].ingredientes = [{ productoId: PROTECTOR, cantidad: 2 }]; // «2 × Protector»
    const id = await venderKits(1);
    expect(h.stock.get(PROTECTOR)).toBe(8);
    h.recetas[0].ingredientes = [{ productoId: PROTECTOR, cantidad: 3 }];
    await devolver(id, 1);
    expect(h.stock.get(PROTECTOR)).toBe(10);
  });

  it("la receta se desactivó después: igual repone lo que salió", async () => {
    const id = await venderKits(1);
    h.recetas[0].activa = false;
    await devolver(id, 1);
    expect([h.stock.get(SHAMPOO), h.stock.get(PROTECTOR)]).toEqual([10, 10]);
  });

  it("componente que no llevaba control de stock al vender: no se repone nada de él", async () => {
    armarNegocio(10, null);
    const id = await venderKits(1);
    h.stock.set(PROTECTOR, 0); // después empezó a contarse
    await devolver(id, 1);
    expect([h.stock.get(SHAMPOO), h.stock.get(PROTECTOR)]).toEqual([10, 0]);
  });
});

describe("costo y orden de la venta con kits", () => {
  it("un kit sin stock propio cuesta la suma de sus componentes (24 + 2 × 30 = 84), no su costPrice", async () => {
    const res = await vender([{ productId: KIT, quantity: 2 }]);
    expect(res.status).toBe(201);
    const data = h.tx.sale.create.mock.calls[0][0].data;
    expect(data.items.create[0].costPrice).toBe(84);
    expect(data.totalCogs).toBe(168);
  });

  it("un kit con stock propio usa su costPrice (64)", async () => {
    h.stock.set(KIT, 5);
    await vender([{ productId: KIT, quantity: 2 }]);
    const data = h.tx.sale.create.mock.calls[0][0].data;
    expect(data.items.create[0].costPrice).toBe(64);
    expect(data.totalCogs).toBe(128);
  });

  it("los UPDATE de stock van en orden de productId (sueltos y componentes juntos)", async () => {
    await vender([{ productId: KIT, quantity: 1 }, { productId: PROTECTOR, quantity: 1 }]);
    expect(h.orden).toEqual([SHAMPOO, PROTECTOR, PROTECTOR, KIT]);
  });
});

describe("validar la composición de un kit", () => {
  it("rechaza un kit sin stock propio como componente de otro, y este producto si ya va dentro de un kit", async () => {
    const OTRO_KIT = 901;
    h.stock.set(OTRO_KIT, null);
    expect(await KitsDB.problemaDeKit("tenant-1", { productoId: OTRO_KIT, ingredientes: [{ productoId: KIT, cantidad: 1 }] }))
      .toMatch(/ya es un kit/);
    // SHAMPOO va dentro del kit 900: no puede volverse kit.
    expect(await KitsDB.problemaDeKit("tenant-1", { productoId: SHAMPOO, ingredientes: [{ productoId: PROTECTOR, cantidad: 1 }] }))
      .toMatch(/va dentro del kit/);
    expect(await KitsDB.problemaDeKit("tenant-1", { productoId: OTRO_KIT, ingredientes: [{ productoId: SHAMPOO, cantidad: 0.5 }] }))
      .toMatch(/unidades enteras/);
    expect(await KitsDB.problemaDeKit("tenant-1", { productoId: OTRO_KIT, ingredientes: [{ productoId: SHAMPOO, cantidad: 2 }] })).toBeNull();
  });

  it("PATCH /api/recetas/[id] de un kit con 0,5 → 400 sin escribir", async () => {
    h.getById.mockResolvedValue({ id: "r1", nombre: "Kit", categoria: "kit", productoId: KIT, ingredientes: [{ productoId: SHAMPOO, cantidad: 1 }] });
    const res = await editarReceta(
      new NextRequest("http://localhost/api/recetas/r1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ingredientes: [{ productoId: SHAMPOO, cantidad: 0.5 }] }),
      }),
      { params: Promise.resolve({ id: "r1" }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unidades enteras/);
    expect(h.updateReceta).not.toHaveBeenCalled();
  });
});

describe("KitsDB.kitsDeProductosEnTx", () => {
  it("sin productos sin stock no consulta; ignora un componente que es el mismo kit", async () => {
    expect((await KitsDB.kitsDeProductosEnTx(h.tx as never, "tenant-1", [])).size).toBe(0);
    expect(h.tx.receta.findMany).not.toHaveBeenCalled();
    h.recetas[0].ingredientes.push({ productoId: KIT, cantidad: 1 });
    const kits = await KitsDB.kitsDeProductosEnTx(h.tx as never, "tenant-1", [KIT]);
    expect(kits.get(KIT)?.componentes.map((c) => c.productId)).toEqual([SHAMPOO, PROTECTOR]);
  });
});
