/**
 * La acción del asistente que TOCA datos: ajustar stock.
 *
 * El caso que motivó estas guardas: en la primera prueba real el modelo inventó
 * un `productId: 12345` y la tarjeta de confirmación preguntaba «¿ajustamos el
 * producto 12345?» — un número que el usuario no puede juzgar, sobre un
 * producto que no existe. Cada `it` de acá es una forma de que eso no llegue a
 * escribir nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { mockGetById, mockGetAll, mockAdjust } = vi.hoisted(() => ({
  mockGetById: vi.fn(),
  mockGetAll: vi.fn(),
  mockAdjust: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  ProductsDB: { getById: mockGetById, getAll: mockGetAll },
  InventoryMovementsDB: { adjust: mockAdjust, getRecent: vi.fn(), getByProduct: vi.fn() },
  AutoReorderDB: { getAll: vi.fn() },
}));
vi.mock("@/lib/db/batches.db", () => ({ BatchesDB: { getAll: vi.fn(), getStats: vi.fn() } }));

const { inventoryAgent } = await import("@/lib/agents/domains/inventory.agent");

const ctx = { tenantId: "t1", traceId: "trace" };
const tarea = (action: string, payload: Record<string, unknown>) => ({
  id: "task-1",
  domain: "inventory" as const,
  action,
  payload,
  priority: "normal" as const,
  status: "running" as const,
  tenantId: "t1",
  createdAt: new Date().toISOString(),
  traceId: "trace",
});

const correr = (action: string, payload: Record<string, unknown>) =>
  inventoryAgent.execute(tarea(action, payload), ctx);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetById.mockResolvedValue({ id: 7, name: "Tabla de tornillo 1m", stock: 3, price: 35 });
  mockAdjust.mockResolvedValue({ id: "mov-1" });
});

describe("ajustar-stock — las guardas antes de escribir", () => {
  it("un id inventado NO escribe: manda a buscar el producto", async () => {
    mockGetById.mockResolvedValue(null);
    const r = await correr("ajustar-stock", { productId: 12345, nuevoStock: 4, motivo: "prueba" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("inventory_buscar_producto");
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it("sin motivo no se ajusta: el motivo es lo que explica el descuadre después", async () => {
    const r = await correr("ajustar-stock", { productId: 7, nuevoStock: 4, motivo: "  " });
    expect(r.success).toBe(false);
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it("rechaza stock negativo y valores que no son número", async () => {
    expect((await correr("ajustar-stock", { productId: 7, nuevoStock: -2, motivo: "x" })).success).toBe(false);
    expect((await correr("ajustar-stock", { productId: 7, nuevoStock: "muchos", motivo: "x" })).success).toBe(false);
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it("sin productId no adivina cuál es", async () => {
    const r = await correr("ajustar-stock", { nuevoStock: 4, motivo: "x" });
    expect(r.success).toBe(false);
    expect(mockAdjust).not.toHaveBeenCalled();
  });
});

describe("ajustar-stock — el ensayo (__validar) que alimenta la confirmación", () => {
  it("describe lo que va a pasar y NO escribe", async () => {
    const r = await correr("ajustar-stock", { productId: 7, nuevoStock: 4, motivo: "conteo físico", __validar: true });
    expect(r.success).toBe(true);
    expect((r.data as { resumen: string }).resumen).toBe(
      'Stock de "Tabla de tornillo 1m": 3 → 4 (+1). Motivo: conteo físico.',
    );
    expect(mockAdjust).not.toHaveBeenCalled();
  });

  it("el ensayo de un id inventado falla — así no se llega a ofrecer confirmar", async () => {
    mockGetById.mockResolvedValue(null);
    const r = await correr("ajustar-stock", { productId: 999, nuevoStock: 4, motivo: "x", __validar: true });
    expect(r.success).toBe(false);
  });

  it("una baja se describe con el signo correcto", async () => {
    const r = await correr("ajustar-stock", { productId: 7, nuevoStock: 1, motivo: "rotura", __validar: true });
    expect((r.data as { resumen: string }).resumen).toContain("3 → 1 (-2)");
  });
});

describe("ajustar-stock — la escritura", () => {
  it("escribe por InventoryMovementsDB.adjust (el mismo camino del conteo físico) y deja rastro", async () => {
    const r = await correr("ajustar-stock", { productId: 7, nuevoStock: 4, motivo: "conteo físico" });
    expect(r.success).toBe(true);
    expect(mockAdjust).toHaveBeenCalledWith(
      7,
      4,
      "t1",
      undefined,
      "Asistente IA: conteo físico",
      "asistente-ia",
    );
    expect(r.data).toMatchObject({ producto: "Tabla de tornillo 1m", stockAnterior: 3, stockNuevo: 4, diferencia: 1 });
  });
});

describe("buscar-producto", () => {
  beforeEach(() => {
    mockGetAll.mockResolvedValue([
      { id: 1, name: "Arroz Costeño 5kg", category: "Abarrotes", price: 25, stock: 10, unit: "unidad", active: true, sku: "AR5" },
      { id: 2, name: "Arroz Faraón 1kg", category: "Abarrotes", price: 6, stock: 40, unit: "unidad", active: true, sku: null },
      { id: 3, name: "Aceite Primor", category: "Abarrotes", price: 12, stock: 5, unit: "unidad", active: true, sku: null },
    ]);
  });

  it("con más de una coincidencia avisa que hay que preguntar antes de tocar nada", async () => {
    const r = await correr("buscar-producto", { texto: "arroz" });
    const d = r.data as { total: number; mensaje?: string };
    expect(d.total).toBe(2);
    expect(d.mensaje).toContain("preguntá cuál");
  });

  it("encuentra por SKU exacto", async () => {
    const d = (await correr("buscar-producto", { texto: "ar5" })).data as { total: number };
    expect(d.total).toBe(1);
  });

  it("sin coincidencias lo dice, no devuelve cualquier cosa", async () => {
    const d = (await correr("buscar-producto", { texto: "quinua" })).data as { total: number; mensaje?: string };
    expect(d.total).toBe(0);
    expect(d.mensaje).toContain("Ningún producto");
  });
});
