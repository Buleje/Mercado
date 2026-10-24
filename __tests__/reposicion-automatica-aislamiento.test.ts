// @vitest-environment node
/**
 * Órdenes de compra automáticas sin cruzar negocios (10-10).
 *
 * Medido en la base: 34 órdenes de `main` apuntaban al proveedor `sup-demo-4` y
 * al producto Atún de `demo` (el cron buscaba el proveedor por NOMBRE en toda la
 * base), 33 de las 35 pendientes eran la misma orden repetida a diario, y cada
 * una decía S/ 600 con líneas que sumaban S/ 0.
 *
 * Acá corre la lógica real (`reponerPorNegocio` → `ReorderAlertsDB` →
 * `planearBorradorDeReposicion`, `PurchasesDB.add/pertenencia`) contra una base
 * en memoria que respeta los WHERE: dos negocios con un proveedor del MISMO
 * nombre y una orden cruzada vieja como la de producción.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin-cache", () => ({ invalidateAdminCache: { afterPurchase: vi.fn() } }));
vi.mock("@/lib/inventario/stock-minimo.server", () => ({ minimosGlobalesPorNegocio: vi.fn(async () => new Map()) }));

type Prov = { id: string; tenantId: string; name: string };
type Prod = { id: number; tenantId: string; name: string; unit: string; costPrice: number; deletedAt: null };
type Linea = { id: number; purchaseOrderId: string; productId: number; name: string; quantity: number; unitCost: number; unit: string };
type Orden = { id: string; tenantId: string; supplierId: string; supplierName: string; status: string; total: number; notes: string; createdAt: Date };

const db = vi.hoisted(() => ({
  proveedores: [] as Prov[],
  productos: [] as Prod[],
  ordenes: [] as Orden[],
  lineas: [] as Linea[],
  seq: 1000,
  reloj: 0,
}));

type W = Record<string, unknown>;
const enLista = (v: unknown, f: unknown) =>
  f && typeof f === "object" && "in" in (f as W) ? ((f as { in: unknown[] }).in).includes(v) : f === undefined || v === f;

vi.mock("@/lib/prisma", () => {
  const prov = (id: string) => db.proveedores.find((s) => s.id === id);
  const prod = (id: number) => db.productos.find((p) => p.id === id);
  const orden = (id: string) => db.ordenes.find((o) => o.id === id);
  const itemsDe = (id: string) => db.lineas.filter((l) => l.purchaseOrderId === id);
  const ordenCumple = (o: Orden, w: W) =>
    enLista(o.id, w.id) && enLista(o.tenantId, w.tenantId) && enLista(o.supplierId, w.supplierId) && enLista(o.status, w.status) &&
    (!w.supplier || prov(o.supplierId)?.tenantId === (w.supplier as W).tenantId);
  const client = {
    supplier: {
      findFirst: async ({ where }: { where: W }) => {
        const s = db.proveedores.find((x) => enLista(x.id, where.id) && enLista(x.tenantId, where.tenantId) && enLista(x.name, where.name));
        return s ? { id: s.id, name: s.name } : null;
      },
    },
    product: {
      findMany: async ({ where }: { where: W }) => db.productos.filter((p) => enLista(p.id, where.id) && enLista(p.tenantId, where.tenantId)),
    },
    purchaseItem: {
      findMany: async ({ where }: { where: W }) => {
        const filas = db.lineas.filter((l) => {
          const o = orden(l.purchaseOrderId);
          return o && enLista(l.productId, where.productId) &&
            (!where.product || prod(l.productId)?.tenantId === (where.product as W).tenantId) &&
            (!where.purchaseOrder || ordenCumple(o, where.purchaseOrder as W));
        });
        filas.sort((a, b) => orden(b.purchaseOrderId)!.createdAt.getTime() - orden(a.purchaseOrderId)!.createdAt.getTime());
        return filas.map((l) => {
          const o = orden(l.purchaseOrderId)!;
          return { productId: l.productId, purchaseOrder: { supplierId: o.supplierId, supplier: { name: prov(o.supplierId)!.name } } };
        });
      },
      updateMany: async ({ where, data }: { where: W; data: Partial<Linea> }) => {
        let count = 0;
        for (const l of db.lineas) {
          const o = orden(l.purchaseOrderId)!;
          if (l.id === where.id && l.purchaseOrderId === where.purchaseOrderId && o.tenantId === (where.purchaseOrder as W).tenantId) {
            Object.assign(l, data); count++;
          }
        }
        return { count };
      },
      createMany: async ({ data }: { data: Omit<Linea, "id">[] }) => {
        for (const d of data) db.lineas.push({ ...d, id: db.seq++ });
        return { count: data.length };
      },
    },
    purchaseOrder: {
      findMany: async ({ where }: { where: W }) =>
        db.ordenes.filter((o) => ordenCumple(o, where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((o) => ({ id: o.id, status: o.status, items: itemsDe(o.id).map(({ id, productId, quantity, unitCost }) => ({ id, productId, quantity, unitCost })) })),
      findFirst: async ({ where }: { where: W }) => {
        const o = db.ordenes.find((x) => ordenCumple(x, where));
        return o ? { supplierId: o.supplierId, items: itemsDe(o.id).map((l) => ({ productId: l.productId })) } : null;
      },
      create: async ({ data }: { data: Orden & { items: { create: Omit<Linea, "id" | "purchaseOrderId">[] } } }) => {
        const { items, ...o } = data;
        const creada = new Date(Date.UTC(2026, 9, 10) + db.reloj++ * 1000);
        db.ordenes.push({ ...o, createdAt: creada, updatedAt: creada } as Orden);
        for (const l of items.create) db.lineas.push({ ...l, id: db.seq++, purchaseOrderId: o.id });
        return { ...orden(o.id)!, items: itemsDe(o.id) };
      },
      updateMany: async ({ where, data }: { where: W; data: Partial<Orden> }) => {
        let count = 0;
        for (const o of db.ordenes) if (ordenCumple(o, where)) { Object.assign(o, data); count++; }
        return { count };
      },
    },
    $executeRawUnsafe: vi.fn(async () => 1),
    $transaction: async (fn: (tx: unknown) => unknown) => fn(client),
  };
  return { prisma: client };
});

import { reponerPorNegocio, type ProductoParaReponer } from "@/lib/compras/reposicion-automatica";
import { PurchasesDB, DatosAjenosEnOrdenError } from "@/lib/db/purchases.db";
import { planearBorradorDeReposicion, totalDeLineas } from "@/lib/compras/borrador-reposicion";
import { prisma } from "@/lib/prisma";

const MAIN = "main";
const DEMO = "demo-cuid";
const NOMBRE = "Frigorifico Amazonia EIRL";

function sembrar() {
  db.proveedores = [
    { id: "sup-main-1", tenantId: MAIN, name: NOMBRE },
    { id: "sup-demo-4", tenantId: DEMO, name: NOMBRE },
  ];
  db.productos = [
    { id: 11, tenantId: MAIN, name: "Atun Florida 170g", unit: "lata", costPrice: 2.5, deletedAt: null },
    { id: 1252621, tenantId: DEMO, name: "Atun Florida en Agua 170g", unit: "lata", costPrice: 3.1, deletedAt: null },
  ];
  const vieja = (id: string, tenantId: string, supplierId: string, dia: number): Orden => ({
    id, tenantId, supplierId, supplierName: NOMBRE, status: "recibido", total: 0, notes: "", createdAt: new Date(Date.UTC(2026, 8, dia)),
  });
  db.ordenes = [
    vieja("po-main-hist", MAIN, "sup-main-1", 1),
    vieja("po-demo-hist", DEMO, "sup-demo-4", 2),
    // La basura de producción: orden de `main` con proveedor y producto de `demo`, la MÁS reciente.
    { ...vieja("auto-cruzada", MAIN, "sup-demo-4", 20), status: "pendiente", total: 600 },
  ];
  db.lineas = [
    { id: 1, purchaseOrderId: "po-main-hist", productId: 11, name: "Atun", quantity: 10, unitCost: 2.5, unit: "lata" },
    { id: 2, purchaseOrderId: "po-demo-hist", productId: 1252621, name: "Atun", quantity: 10, unitCost: 3.1, unit: "lata" },
    { id: 3, purchaseOrderId: "auto-cruzada", productId: 1252621, name: "Atun", quantity: 40, unitCost: 0, unit: "lata" },
  ];
}

const bajo = (id: number, tenantId: string, suggestedQty: number): ProductoParaReponer => ({
  id, tenantId, name: "Atun", stock: 5, stockMin: 15, stockMax: 45, category: "Conservas", unit: "lata", suggestedQty,
});

const borradores = () => db.ordenes.filter((o) => o.status === "auto_generated");

beforeEach(() => {
  db.seq = 1000;
  db.reloj = 0;
  sembrar();
});

describe("cron de reposición: cada negocio con lo suyo", () => {
  it("dos negocios con un proveedor del mismo nombre: cada borrador lleva SU proveedor, SUS productos y SU costo", async () => {
    await reponerPorNegocio([bajo(11, MAIN, 40), bajo(1252621, DEMO, 40)], { crearBorradores: true, origen: "test" });

    const nuevas = borradores();
    expect(nuevas).toHaveLength(2);
    for (const o of nuevas) {
      expect(db.proveedores.find((s) => s.id === o.supplierId)?.tenantId).toBe(o.tenantId);
      for (const l of db.lineas.filter((x) => x.purchaseOrderId === o.id)) {
        expect(db.productos.find((p) => p.id === l.productId)?.tenantId).toBe(o.tenantId);
      }
    }
    const deMain = nuevas.find((o) => o.tenantId === MAIN)!;
    expect(deMain.supplierId).toBe("sup-main-1");
    // total = Σ líneas con el costo del producto del MISMO negocio (40 × 2,50), no S/ 600 con líneas en 0.
    const lineasMain = db.lineas.filter((l) => l.purchaseOrderId === deMain.id);
    expect(lineasMain.map((l) => [l.productId, l.unitCost])).toEqual([[11, 2.5]]);
    expect(deMain.total).toBe(100);
    expect(deMain.total).toBe(totalDeLineas(lineasMain));
  });

  it("la orden cruzada vieja no contagia: el historial de main no da el proveedor de demo", async () => {
    const r = await reponerPorNegocio([bajo(11, MAIN, 40)], { crearBorradores: false, origen: "test" });
    expect(r[0].productos[0].supplierId).toBe("sup-main-1");
  });

  it("no duplica: la segunda corrida del día no crea otra orden; si cambia la cantidad, actualiza el borrador", async () => {
    const productos = [bajo(11, MAIN, 40)];
    await reponerPorNegocio(productos, { crearBorradores: true, origen: "06:34" });
    const [segunda] = await reponerPorNegocio(productos, { crearBorradores: true, origen: "06:38" });
    expect(segunda.borradores[0].accion).toBe("sin-cambios");
    expect(borradores()).toHaveLength(1);

    const [tercera] = await reponerPorNegocio([bajo(11, MAIN, 42)], { crearBorradores: true, origen: "mañana" });
    expect(tercera.borradores[0].accion).toBe("actualizada");
    const unico = borradores();
    expect(unico).toHaveLength(1);
    expect(db.lineas.filter((l) => l.purchaseOrderId === unico[0].id).map((l) => l.quantity)).toEqual([42]);
    expect(unico[0].total).toBe(105);
  });

  it("lo que ya está pedido en una orden pendiente del mismo proveedor no se vuelve a pedir", async () => {
    db.ordenes.push({ id: "po-manual", tenantId: MAIN, supplierId: "sup-main-1", supplierName: NOMBRE, status: "pendiente", total: 25, notes: "", createdAt: new Date(Date.UTC(2026, 9, 1)) });
    db.lineas.push({ id: 9, purchaseOrderId: "po-manual", productId: 11, name: "Atun", quantity: 10, unitCost: 2.5, unit: "lata" });
    const [r] = await reponerPorNegocio([bajo(11, MAIN, 40)], { crearBorradores: true, origen: "test" });
    expect(r.borradores[0].accion).toBe("sin-cambios");
    expect(borradores()).toHaveLength(0);
  });

  it("un producto ajeno colado en la lista no entra al borrador del negocio", async () => {
    // Como si el caller mezclara: `reponerBorrador` relee productos con tenantId en el WHERE.
    const { ReorderAlertsDB } = await import("@/lib/db/reorder-alerts.db");
    const r = await ReorderAlertsDB.reponerBorrador(MAIN, {
      supplierId: "sup-main-1", nuevoId: "auto-x", notes: "",
      sugeridas: [{ productId: 11, quantity: 40 }, { productId: 1252621, quantity: 40 }],
    });
    expect(r.accion).toBe("creada");
    expect(db.lineas.filter((l) => l.purchaseOrderId === "auto-x").map((l) => l.productId)).toEqual([11]);
    // Y un proveedor ajeno, ni eso.
    const ajeno = await ReorderAlertsDB.reponerBorrador(MAIN, { supplierId: "sup-demo-4", nuevoId: "auto-y", notes: "", sugeridas: [{ productId: 11, quantity: 1 }] });
    expect(ajeno.accion).toBe("sin-cambios");
    expect(db.ordenes.some((o) => o.id === "auto-y")).toBe(false);
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(expect.stringContaining("pg_advisory_xact_lock"), "reorden-auto:main:sup-main-1");
  });
});

describe("PurchasesDB: el alta y la recepción exigen todo del mismo negocio", () => {
  const base = { id: "po-1", supplierName: NOMBRE, total: 25, status: "pendiente" as const, createdAt: "", updatedAt: "" };

  it("rechaza proveedor o producto de otro negocio y no escribe nada", async () => {
    await expect(PurchasesDB.add({ ...base, supplierId: "sup-demo-4", items: [{ productId: 11, name: "Atun", quantity: 1, unitCost: 2.5, unit: "lata" }] }, MAIN))
      .rejects.toMatchObject({ name: "DatosAjenosEnOrdenError", proveedorAjeno: true });
    const err = await PurchasesDB.add({ ...base, supplierId: "sup-main-1", items: [{ productId: 1252621, name: "Atun", quantity: 1, unitCost: 3, unit: "lata" }] }, MAIN)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DatosAjenosEnOrdenError);
    expect((err as DatosAjenosEnOrdenError).productosAjenos).toEqual([1252621]);
    expect(db.ordenes.some((o) => o.id === "po-1")).toBe(false);
  });

  it("acepta lo propio", async () => {
    await PurchasesDB.add({ ...base, supplierId: "sup-main-1", items: [{ productId: 11, name: "Atun", quantity: 10, unitCost: 2.5, unit: "lata" }] }, MAIN);
    expect(db.ordenes.find((o) => o.id === "po-1")?.tenantId).toBe(MAIN);
  });

  it("pertenencia: la orden cruzada de main dice proveedor y producto ajenos; la de otro negocio no existe", async () => {
    expect(await PurchasesDB.pertenencia(MAIN, "auto-cruzada")).toEqual({ existe: true, proveedorAjeno: true, productosAjenos: [1252621] });
    expect(await PurchasesDB.pertenencia(MAIN, "po-main-hist")).toEqual({ existe: true, proveedorAjeno: false, productosAjenos: [] });
    expect((await PurchasesDB.pertenencia(MAIN, "po-demo-hist")).existe).toBe(false);
  });
});

describe("planearBorradorDeReposicion", () => {
  const linea = (productId: number, quantity: number, unitCost = 2) => ({ productId, name: "x", quantity, unitCost, unit: "u" });

  it("sin órdenes abiertas crea con total = Σ líneas", () => {
    const plan = planearBorradorDeReposicion({ abiertas: [], sugeridas: [linea(1, 3, 1.1), linea(2, 7, 0.3)] });
    expect(plan).toMatchObject({ accion: "crear", total: 5.4 });
  });

  it("con borrador agrega lo nuevo y recalcula el total con TODAS las líneas", () => {
    const plan = planearBorradorDeReposicion({
      abiertas: [{ id: "b", status: "auto_generated", items: [{ id: 1, productId: 1, quantity: 3, unitCost: 2 }] }],
      sugeridas: [linea(1, 3), linea(2, 5)],
    });
    expect(plan).toMatchObject({ accion: "actualizar", purchaseOrderId: "b", cambios: [], total: 16 });
  });
});
