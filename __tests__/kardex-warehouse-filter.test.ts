/**
 * KardexTab – warehouse filter logic unit tests
 * Tests the warehouse dropdown filter and toKardexLine warehouse resolution
 * using isolated pure-function extractions to avoid full component render.
 */

import { describe, it, expect } from "vitest";

// ── Types mirroring KardexTab internals ───────────────────────────────────────

type InventoryMovement = {
  id: string;
  productId: number;
  type: string;
  lossType?: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  reference?: string;
  notes?: string;
  warehouseId?: string;
  createdAt: string;
};

type ProductOption = { id: number; name: string; costPrice?: number };
type WarehouseOption = { id: string; name: string };

type KardexLine = {
  id: string;
  date: string;
  type: string;
  reference: string;
  description: string;
  qtyIn: number;
  qtyOut: number;
  balance: number;
  costUnit: number;
  totalCost: number;
  warehouse: string;
  warehouseId?: string;
};

const TYPE_META: Record<string, { dir: "in" | "out"; label: string }> = {
  entrada: { dir: "in", label: "Entrada" },
  venta: { dir: "out", label: "Venta" },
  ajuste_positivo: { dir: "in", label: "Ajuste +" },
  ajuste_negativo: { dir: "out", label: "Ajuste -" },
};

function toKardexLine(
  movement: InventoryMovement,
  product: ProductOption,
  warehouses: WarehouseOption[]
): KardexLine {
  const meta = TYPE_META[movement.type] ?? TYPE_META.ajuste_negativo;
  const qtyIn = meta.dir === "in" ? movement.quantity : 0;
  const qtyOut = meta.dir === "out" ? movement.quantity : 0;
  const costUnit = product.costPrice ?? 0;
  const totalCost = movement.quantity * costUnit;
  const warehouseName = movement.warehouseId
    ? (warehouses.find((w) => w.id === movement.warehouseId)?.name ??
      movement.notes?.match(/almacen:([^|]+)/i)?.[1]?.trim() ??
      "Principal")
    : (movement.notes?.match(/almacen:([^|]+)/i)?.[1]?.trim() ?? "Principal");
  return {
    id: movement.id,
    date: movement.createdAt,
    type: movement.type,
    reference: movement.reference || "SIN-REF",
    description: movement.notes || "",
    qtyIn,
    qtyOut,
    balance: movement.newStock,
    costUnit,
    totalCost,
    warehouse: warehouseName,
    warehouseId: movement.warehouseId,
  };
}

function filterLines(
  allLines: KardexLine[],
  filterWarehouse: string
): KardexLine[] {
  if (!filterWarehouse || filterWarehouse === "todos") return allLines;
  if (filterWarehouse === "sin-almacen") return allLines.filter((l) => !l.warehouseId);
  return allLines.filter((l) => l.warehouseId === filterWarehouse);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRODUCT: ProductOption = { id: 1, name: "Harina", costPrice: 5 };
const WAREHOUSES: WarehouseOption[] = [
  { id: "wh-1", name: "Almacén Central" },
  { id: "wh-2", name: "Bodega Norte" },
];

const BASE_MOV: Omit<InventoryMovement, "id" | "warehouseId"> = {
  productId: 1,
  type: "entrada",
  quantity: 10,
  previousStock: 0,
  newStock: 10,
  createdAt: "2026-01-01T00:00:00.000Z",
};

// ── toKardexLine – warehouse resolution ───────────────────────────────────────

describe("toKardexLine – warehouse name resolution", () => {
  it("resolves warehouse name from warehouseId FK when found", () => {
    const mov: InventoryMovement = { ...BASE_MOV, id: "m1", warehouseId: "wh-1" };
    const line = toKardexLine(mov, PRODUCT, WAREHOUSES);
    expect(line.warehouse).toBe("Almacén Central");
    expect(line.warehouseId).toBe("wh-1");
  });

  it("resolves warehouse name for second warehouse", () => {
    const mov: InventoryMovement = { ...BASE_MOV, id: "m2", warehouseId: "wh-2" };
    const line = toKardexLine(mov, PRODUCT, WAREHOUSES);
    expect(line.warehouse).toBe("Bodega Norte");
  });

  it("falls back to notes regex when warehouseId is set but not found in list", () => {
    const mov: InventoryMovement = {
      ...BASE_MOV, id: "m3", warehouseId: "wh-unknown",
      notes: "almacen:Bodega Sur|ref:123",
    };
    const line = toKardexLine(mov, PRODUCT, WAREHOUSES);
    expect(line.warehouse).toBe("Bodega Sur");
  });

  it("falls back to 'Principal' when warehouseId unknown and no notes regex", () => {
    const mov: InventoryMovement = { ...BASE_MOV, id: "m4", warehouseId: "wh-ghost" };
    const line = toKardexLine(mov, PRODUCT, WAREHOUSES);
    expect(line.warehouse).toBe("Principal");
  });

  it("uses notes regex when warehouseId is absent", () => {
    const mov: InventoryMovement = {
      ...BASE_MOV, id: "m5",
      notes: "almacen:Tienda Centro|motivo:reposicion",
    };
    const line = toKardexLine(mov, PRODUCT, WAREHOUSES);
    expect(line.warehouse).toBe("Tienda Centro");
    expect(line.warehouseId).toBeUndefined();
  });

  it("defaults to 'Principal' when warehouseId absent and no valid notes", () => {
    const mov: InventoryMovement = { ...BASE_MOV, id: "m6", notes: "sin info adicional" };
    const line = toKardexLine(mov, PRODUCT, WAREHOUSES);
    expect(line.warehouse).toBe("Principal");
  });

  it("preserves warehouseId on the returned line", () => {
    const mov: InventoryMovement = { ...BASE_MOV, id: "m7", warehouseId: "wh-1" };
    const line = toKardexLine(mov, PRODUCT, WAREHOUSES);
    expect(line.warehouseId).toBe("wh-1");
  });
});

// ── toKardexLine – qtyIn / qtyOut direction ───────────────────────────────────

describe("toKardexLine – movement direction", () => {
  it("sets qtyIn for entrada type", () => {
    const line = toKardexLine({ ...BASE_MOV, id: "m8", type: "entrada" }, PRODUCT, WAREHOUSES);
    expect(line.qtyIn).toBe(10);
    expect(line.qtyOut).toBe(0);
  });

  it("sets qtyOut for venta type", () => {
    const line = toKardexLine({ ...BASE_MOV, id: "m9", type: "venta" }, PRODUCT, WAREHOUSES);
    expect(line.qtyIn).toBe(0);
    expect(line.qtyOut).toBe(10);
  });

  it("computes totalCost correctly", () => {
    const line = toKardexLine({ ...BASE_MOV, id: "m10" }, PRODUCT, WAREHOUSES);
    expect(line.totalCost).toBe(50); // 10 qty * 5 costPrice
  });

  it("uses SIN-REF when reference is absent", () => {
    const line = toKardexLine({ ...BASE_MOV, id: "m11" }, PRODUCT, WAREHOUSES);
    expect(line.reference).toBe("SIN-REF");
  });
});

// ── filterLines – warehouse dropdown ──────────────────────────────────────────

describe("filterLines – warehouse filter", () => {
  const lines: KardexLine[] = [
    { id: "l1", date: "", type: "entrada", reference: "", description: "", qtyIn: 5, qtyOut: 0, balance: 5, costUnit: 0, totalCost: 0, warehouse: "Almacén Central", warehouseId: "wh-1" },
    { id: "l2", date: "", type: "venta", reference: "", description: "", qtyIn: 0, qtyOut: 3, balance: 2, costUnit: 0, totalCost: 0, warehouse: "Bodega Norte", warehouseId: "wh-2" },
    { id: "l3", date: "", type: "entrada", reference: "", description: "", qtyIn: 2, qtyOut: 0, balance: 4, costUnit: 0, totalCost: 0, warehouse: "Principal" },
  ];

  it("returns all lines when filterWarehouse is 'todos'", () => {
    expect(filterLines(lines, "todos")).toHaveLength(3);
  });

  it("returns all lines when filterWarehouse is empty string", () => {
    expect(filterLines(lines, "")).toHaveLength(3);
  });

  it("returns only wh-1 lines when filtering by wh-1", () => {
    const result = filterLines(lines, "wh-1");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("l1");
  });

  it("returns only wh-2 lines when filtering by wh-2", () => {
    const result = filterLines(lines, "wh-2");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("l2");
  });

  it("returns lines without warehouseId when filtering by 'sin-almacen'", () => {
    const result = filterLines(lines, "sin-almacen");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("l3");
  });

  it("returns empty array when no lines match the warehouse", () => {
    expect(filterLines(lines, "wh-nonexistent")).toHaveLength(0);
  });

  it("does not mutate original array", () => {
    const original = [...lines];
    filterLines(lines, "wh-1");
    expect(lines).toHaveLength(original.length);
  });
});
