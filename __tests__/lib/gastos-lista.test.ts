/**
 * Plata › Gastos: en qué día cae cada gasto (las dos formas de guardar la
 * fecha), el rango que se le pide a la base, el filtro y la línea de caja de
 * la confirmación de borrar. Y GET /api/expenses?from&to con días de Lima.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getByDateRange: vi.fn(),
  retirosDeGastos: vi.fn(),
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: h.requireAdmin }));
vi.mock("@/lib/billing/require-active-subscription", () => ({ requireActiveSubscription: vi.fn(async () => null) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/jsondb", () => ({ ExpensesDB: { getByDateRange: h.getByDateRange, getAll: vi.fn(async () => []) } }));
vi.mock("@/lib/db/gasto-con-caja.db", () => ({ GastoConCajaDB: { retirosDeGastos: h.retirosDeGastos } }));

import {
  categoriasDeLista, diaConNombre, diaDelGasto, filtrarGastos, gastoEnRango, lineaDeCajaAlBorrar, primeroDelMes,
  rangoDeConsulta, sumarDias,
} from "@/lib/gastos/lista-gastos";
import { limaDateKey } from "@/lib/utils";

describe("el día del gasto", () => {
  it("medianoche UTC = el día escrito en el formulario (no el 30 en Lima)", () => {
    expect(diaDelGasto("2026-10-01T00:00:00.000Z")).toBe("2026-10-01");
    expect(diaDelGasto("2026-10-01")).toBe("2026-10-01");
    expect(diaDelGasto(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10-01");
  });

  it("un instante real cae en su día de Lima", () => {
    // 1/10 a las 20:00 en Pucallpa = 2/10 01:00 UTC.
    expect(diaDelGasto("2026-10-02T01:00:00.000Z")).toBe("2026-10-01");
    expect(diaDelGasto("2026-10-01T12:00:00.000Z")).toBe("2026-10-01");
    expect(diaDelGasto("")).toBe("");
  });

  it("aritmética de días y meses en UTC", () => {
    expect(sumarDias("2026-09-30", 1)).toBe("2026-10-01");
    expect(primeroDelMes("2026-10-09")).toBe("2026-10-01");
    expect(primeroDelMes("2026-10-09", 5)).toBe("2026-05-01");
    expect(primeroDelMes("2026-02-15", 3)).toBe("2025-11-01");
    expect(diaConNombre("2026-10-01")).toBe("jueves 01/10");
  });
});

describe("el período de noche (bug: los gastos del 1 se perdían desde las 19:00)", () => {
  afterEach(() => vi.useRealTimers());

  it("a las 20:00 del 9/10 en Pucallpa el período arranca el 1, no el 2", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T01:00:00Z"));
    const hoy = limaDateKey();
    expect(hoy).toBe("2026-10-09");
    expect(primeroDelMes(hoy)).toBe("2026-10-01");
  });

  it("el rango cubre los dos formatos y deja afuera los bordes ajenos", () => {
    const r = rangoDeConsulta("2026-10-01", "2026-10-09");
    expect(r.desde.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-10-10T04:59:59.999Z");
    expect(gastoEnRango("2026-10-01T00:00:00.000Z", "2026-10-01", "2026-10-09")).toBe(true); // el 1, sin hora
    expect(gastoEnRango("2026-10-01T01:00:00.000Z", "2026-10-01", "2026-10-09")).toBe(false); // 30/09 20:00 Lima
    expect(gastoEnRango("2026-10-10T01:00:00.000Z", "2026-10-01", "2026-10-09")).toBe(true); // 9/10 20:00 Lima
    expect(gastoEnRango("2026-10-10T00:00:00.000Z", "2026-10-01", "2026-10-09")).toBe(false); // el 10, sin hora
  });
});

describe("buscar y filtrar", () => {
  const gastos = [
    { category: "servicios", description: "Energía octubre", amount: 120, date: "2026-10-01" },
    { category: "alquiler", description: "Local", amount: 800, date: "2026-10-02", supplierName: "Inmobiliaria Sol" },
    { category: "servicios", description: "Agua", amount: 40, date: "2026-10-03", documentNumber: "F001-77" },
  ];
  const descripcion = (g: { description: string }) => g.description;

  it("sin tildes ni mayúsculas, también por proveedor y N°", () => {
    expect(filtrarGastos(gastos, { buscar: "energia", categoria: null, descripcion }).map((g) => g.amount)).toEqual([120]);
    expect(filtrarGastos(gastos, { buscar: "sol", categoria: null, descripcion }).map((g) => g.amount)).toEqual([800]);
    expect(filtrarGastos(gastos, { buscar: "f001", categoria: null, descripcion }).map((g) => g.amount)).toEqual([40]);
  });

  it("«Servicios» y «servicios» son una sola opción del selector", () => {
    const conMayuscula = [...gastos, { category: "Servicios", description: "Cable", amount: 60, date: "2026-10-04" }];
    expect(categoriasDeLista(conMayuscula)).toEqual([
      { categoria: "servicios", cuantos: 3 },
      { categoria: "alquiler", cuantos: 1 },
    ]);
  });

  it("por categoría (la tarjeta «Servicios»)", () => {
    expect(filtrarGastos(gastos, { buscar: "", categoria: "servicios", descripcion })).toHaveLength(2);
    expect(filtrarGastos(gastos, { buscar: "agua", categoria: "alquiler", descripcion })).toHaveLength(0);
  });
});

describe("la línea de caja de la confirmación", () => {
  it("dice lo mismo que hace el servidor", () => {
    expect(lineaDeCajaAlBorrar(null)).toBe("No salió de la caja: la caja no cambia.");
    expect(lineaDeCajaAlBorrar({ monto: 25, abierta: true, dia: "jueves 09/10" })).toBe(
      "Salió de la caja abierta: los S/ 25.00 vuelven al cajón.",
    );
    expect(lineaDeCajaAlBorrar({ monto: 25, abierta: false, dia: "jueves 09/10" })).toBe(
      "Salió de la caja del jueves 09/10, que ya se cerró: esa caja no cambia.",
    );
  });
});

describe("GET /api/expenses?from&to (días de Lima)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.requireAdmin.mockResolvedValue({ tenantId: "tenant-a", username: "qa" });
    h.getByDateRange.mockResolvedValue([
      { id: "g-dia1", date: "2026-10-01T00:00:00.000Z", amount: 10 },
      { id: "g-sep30-noche", date: "2026-10-01T01:00:00.000Z", amount: 20 },
      { id: "g-hoy-noche", date: "2026-10-10T01:00:00.000Z", amount: 30 },
      { id: "g-manana", date: "2026-10-10T00:00:00.000Z", amount: 40 },
    ]);
    h.retirosDeGastos.mockResolvedValue({ "g-dia1": { monto: 10, abierta: true, dia: "jueves 01/10" } });
  });

  it("pide el rango ancho y devuelve sólo los gastos de esos días", async () => {
    const { GET } = await import("@/app/api/expenses/route");
    const res = await GET(new NextRequest("http://localhost/api/expenses?from=2026-10-01&to=2026-10-09"));
    const ids = ((await res.json()) as { id: string }[]).map((g) => g.id);
    expect(ids).toEqual(["g-dia1", "g-hoy-noche"]);
    const [tenant, desde, hasta] = h.getByDateRange.mock.calls[0];
    expect(tenant).toBe("tenant-a");
    expect((desde as Date).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect((hasta as Date).toISOString()).toBe("2026-10-10T04:59:59.999Z");
    expect(h.retirosDeGastos).not.toHaveBeenCalled();
  });

  it("con caja=1 cada gasto trae su retiro (o null)", async () => {
    const { GET } = await import("@/app/api/expenses/route");
    const res = await GET(new NextRequest("http://localhost/api/expenses?from=2026-10-01&to=2026-10-09&caja=1"));
    const body = (await res.json()) as { id: string; caja: unknown }[];
    expect(h.retirosDeGastos).toHaveBeenCalledWith("tenant-a", ["g-dia1", "g-hoy-noche"]);
    expect(body.map((g) => g.caja)).toEqual([{ monto: 10, abierta: true, dia: "jueves 01/10" }, null]);
  });
});
