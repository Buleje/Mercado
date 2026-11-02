/**
 * La búsqueda del recibo repetido (ADR-528): por negocio en el WHERE y con el
 * número EXACTO — «Recibo E2421» es otro recibo que «Recibo E242».
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ expense: vi.fn(), assetExpense: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: { expense: { findMany: h.expense }, assetExpense: { findMany: h.assetExpense } },
}));

const { ExpensesDB, mismoRecibo } = await import("@/lib/db/expenses.db");
const { AssetsDB } = await import("@/lib/db/assets.db");

const fecha = new Date("2026-10-30T05:00:00.000Z");
beforeEach(() => vi.clearAllMocks());

describe("mismoRecibo", () => {
  it("exacto, sin importar mayúsculas", () => {
    expect(mismoRecibo("Asistente IA: petróleo · Recibo E242 · foto", "E242")).toBe(true);
    expect(mismoRecibo("recibo e242", "E242")).toBe(true);
    expect(mismoRecibo("Recibo E2421", "E242")).toBe(false);
    expect(mismoRecibo("Recibo E242-2", "E242")).toBe(false);
    expect(mismoRecibo(null, "E242")).toBe(false);
  });
});

describe("ExpensesDB.conRecibo", () => {
  it("filtra por tenant y descarta el número que solo empieza igual", async () => {
    h.expense.mockResolvedValue([
      { id: "g2", date: fecha, amount: "99.00", notes: "Recibo E2421", documentNumber: null },
      { id: "g1", date: fecha, amount: "150.00", notes: "x · Recibo E242", documentNumber: null },
    ]);
    expect(await ExpensesDB.conRecibo("tenant-a", "E242")).toEqual({ id: "g1", date: fecha.toISOString(), amount: 150 });
    expect(h.expense.mock.calls[0][0].where.tenantId).toBe("tenant-a");
  });
  it("vacío = null sin ir a la base", async () => {
    expect(await ExpensesDB.conRecibo("tenant-a", "  ")).toBeNull();
    expect(h.expense).not.toHaveBeenCalled();
  });
});

describe("AssetsDB.gastoConRecibo", () => {
  it("filtra por tenant y trae la máquina", async () => {
    h.assetExpense.mockResolvedValue([{ id: "a1", date: fecha, amount: "200", notes: "Recibo E242", asset: { name: "Camión" } }]);
    expect(await AssetsDB.gastoConRecibo("tenant-a", "E242")).toMatchObject({ id: "a1", amount: 200, maquina: "Camión" });
    expect(h.assetExpense.mock.calls[0][0].where.tenantId).toBe("tenant-a");
  });
});
