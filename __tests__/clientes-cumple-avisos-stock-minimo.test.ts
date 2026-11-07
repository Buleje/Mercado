/**
 * Clientes (09-10): un solo cumpleaños, un solo stock mínimo.
 *  - El cumpleaños que carga el cajero (fechaNacimiento) tiene que llegar al
 *    cupón de cumpleaños, que sólo leía `birthday`.
 *  - `Settings.globalMinStock` es el respaldo de los productos sin mínimo propio
 *    en el cierre, las alertas y Compras (antes: 5, 0 y 0 escritos a mano).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findManyCustomer = vi.fn();
const findManyProduct = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: (...a: unknown[]) => findManyCustomer(...a) },
    product: {
      findMany: (...a: unknown[]) => findManyProduct(...a),
      fields: { stockMin: { name: "stockMin", modelName: "Product" } },
    },
  },
}));
const settingsGet = vi.fn();
vi.mock("@/lib/db/settings.db", () => ({ SettingsDB: { get: (...a: unknown[]) => settingsGet(...a) } }));
vi.mock("@/lib/domain-events", () => ({ DomainEvents: { stockBajo: vi.fn(async () => undefined) } }));

import { aYmd, cumpleCorto, cumpleDe, cumpleParaGuardar } from "@/lib/clientes/cumpleanos";
import { minimoGlobalDe, stockMinimoDe, STOCK_MINIMO_GLOBAL_POR_DEFECTO } from "@/lib/inventario/stock-minimo";
import { calculateSuggestedQty, needsReorder } from "@/lib/types/purchases";
import { BirthdayCouponsDB } from "@/lib/db/birthday-coupons.db";
import { AutoReorderDB } from "@/lib/db/inventory.db";
import { CierreDiarioPreviewDB } from "@/lib/db/cierre-diario-preview.db";

describe("un solo cumpleaños", () => {
  it("usa la columna que tenga dato; si están las dos, birthday (la tienda sólo escribe esa)", () => {
    expect(cumpleDe({ fechaNacimiento: "1990-05-12T00:00:00.000Z" })).toBe("1990-05-12");
    expect(cumpleDe({ birthday: "1991-01-02T12:00:00.000Z" })).toBe("1991-01-02");
    expect(cumpleDe({ birthday: "1991-01-02", fechaNacimiento: "1990-05-12" })).toBe("1991-01-02");
    expect(cumpleDe({ birthday: null, fechaNacimiento: null })).toBeNull();
    expect(cumpleDe(null)).toBeNull();
  });

  it("lee el día UTC de un Date (date de Postgres = medianoche UTC; no se corre al día anterior)", () => {
    expect(aYmd(new Date("1990-05-12T00:00:00.000Z"))).toBe("1990-05-12");
    expect(aYmd(new Date("1990-05-12T12:00:00.000Z"))).toBe("1990-05-12");
    expect(aYmd("no es fecha")).toBeNull();
  });

  it("guarda a mediodía UTC: el mismo día en Lima (−5) y en el servidor (UTC)", () => {
    const d = cumpleParaGuardar("1990-05-12");
    expect(d?.toISOString()).toBe("1990-05-12T12:00:00.000Z");
    // Lima = UTC−5 → 07:00 del mismo día
    expect(new Date(d!.getTime() - 5 * 3600_000).getUTCDate()).toBe(12);
    expect(cumpleParaGuardar("")).toBeNull();
    expect(cumpleParaGuardar(null)).toBeNull();
    expect(cumpleCorto("1990-05-12")).toBe("12/05");
  });

  it("el cupón de cumpleaños ve al cliente que sólo tiene fechaNacimiento (lo cargó el cajero)", async () => {
    findManyCustomer.mockResolvedValueOnce([
      { phone: "999000001", name: "Cajero", tenantId: "t1", notifPromotions: true, birthday: null, fechaNacimiento: new Date("1990-05-12T00:00:00.000Z") },
      { phone: "999000002", name: "Tienda", tenantId: "t1", notifPromotions: false, birthday: new Date("1985-10-09T00:00:00.000Z"), fechaNacimiento: null },
    ]);
    const lista = await BirthdayCouponsDB.listBirthdayCandidates();
    const where = findManyCustomer.mock.calls[0][0].where;
    expect(where).toEqual({ OR: [{ birthday: { not: null } }, { fechaNacimiento: { not: null } }] });
    expect(lista.map((c) => c.birthday?.toISOString())).toEqual(["1990-05-12T12:00:00.000Z", "1985-10-09T12:00:00.000Z"]);
    expect(lista[0]).not.toHaveProperty("fechaNacimiento");
    expect(lista[1].notifPromotions).toBe(false);
  });
});

describe("un solo stock mínimo", () => {
  beforeEach(() => {
    findManyProduct.mockReset();
    settingsGet.mockReset();
  });

  it("el propio manda (0 incluido); sin propio, el global del negocio", () => {
    expect(stockMinimoDe({ stockMin: 20 }, 5)).toBe(20);
    expect(stockMinimoDe({ stockMin: 0 }, 5)).toBe(0);
    expect(stockMinimoDe({ stockMin: null }, 5)).toBe(5);
    expect(stockMinimoDe({}, 7)).toBe(7);
  });

  it("global saneado: sin Settings o inválido → 5 (default del schema)", () => {
    expect(minimoGlobalDe({ globalMinStock: 8 })).toBe(8);
    expect(minimoGlobalDe({ globalMinStock: 0 })).toBe(0);
    expect(minimoGlobalDe({ globalMinStock: null })).toBe(STOCK_MINIMO_GLOBAL_POR_DEFECTO);
    expect(minimoGlobalDe({ globalMinStock: -3 })).toBe(5);
    expect(minimoGlobalDe(null)).toBe(5);
  });

  it("Compras: sin global, igual que antes (sin mínimo propio no repone); con global, sí", () => {
    const sinMin = { stock: 3, stockMin: null };
    expect(needsReorder(sinMin)).toBe(false);
    expect(needsReorder(sinMin, 5)).toBe(true);
    expect(needsReorder({ stock: null, stockMin: null }, 5)).toBe(false);
    expect(needsReorder({ stock: 0, stockMin: 0 }, 5)).toBe(false); // mínimo 0 propio = no repone
    expect(calculateSuggestedQty({ stock: 3, stockMin: null, stockMax: null })).toBe(7); // 10 − 3, como antes
    expect(calculateSuggestedQty({ stock: 3, stockMin: null, stockMax: null }, 5)).toBe(12); // 5×3 − 3
  });

  it("alertas de inventario: los sin mínimo propio entran con el global y salen con su mínimo efectivo", async () => {
    settingsGet.mockResolvedValueOnce({ globalMinStock: 5 });
    findManyProduct.mockResolvedValueOnce([
      { id: 1, name: "Arroz", stock: 10, stockMin: 20, stockMax: null, category: "a", unit: "kg" },
      { id: 2, name: "Azúcar", stock: 4, stockMin: null, stockMax: null, category: "a", unit: "kg" },
      { id: 3, name: "Sal", stock: 6, stockMin: null, stockMax: null, category: "a", unit: "kg" },
    ]);
    const bajos = await AutoReorderDB.getLowStockProducts("t1");
    const where = findManyProduct.mock.calls[0][0].where;
    expect(where.OR[1]).toEqual({ stockMin: null, stock: { lte: 5 } });
    expect(where.OR[0].stock.lte).toMatchObject({ name: "stockMin" });
    expect(where.deletedAt).toBeNull(); // los borrados no avisan
    expect(bajos.map((p) => [p.name, p.stockMin, p.stockMax])).toEqual([
      ["Arroz", 20, 60],
      ["Azúcar", 5, 15],
    ]);
  });

  it("cierre del día (/api/cierre-diario/preview): el propio por columna y el global para los sin mínimo, no `lte: 5` para todos", async () => {
    findManyProduct.mockResolvedValueOnce([]);
    await CierreDiarioPreviewDB.listLowStockProducts("t1", 3, 20);
    const { where, take } = findManyProduct.mock.calls[0][0];
    expect(take).toBe(20);
    expect(where.deletedAt).toBeNull();
    expect(where.OR[0]).toMatchObject({ stockMin: { not: null }, stock: { lte: { name: "stockMin" } } });
    expect(where.OR[1]).toEqual({ stockMin: null, stock: { lte: 3 } });
    expect(JSON.stringify(where)).not.toContain('"lte":5');
  });
});
