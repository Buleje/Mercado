/**
 * «Uso vs límites» del superadmin con operaciones REALES (noche 2026-11-04).
 *
 * Antes la ruta contaba sólo pedidos del mes, productos y usuarios, así que Blas (aserradero:
 * 0 pedidos, 0 productos, pero libro CTP, trozas e ingresos todos los días) salía con uso cero.
 * Ahora cada fila suma `SaludNegocioDB.senalesDeUso` como campos aditivos. Cifras de Blas = las
 * medidas en producción el 04-11 (solo lectura).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SenalesDeUso } from "@/lib/db/salud-negocio.db";
import { camposDeOperaciones, compararPorUso, SIN_SENALES } from "@/lib/superadmin/uso-negocio";

const senalesDeBlas: SenalesDeUso = {
  ingresos7d: 9,
  ingresos30d: 39,
  ultimoIngreso: new Date("2026-11-04T13:10:00.000Z"),
  acciones7d: 300,
  acciones30d: 879,
  modulos30d: 12,
  operaciones7d: 120,
  operaciones30d: 420,
  ultimaOperacion: new Date("2026-11-03T22:00:00.000Z"),
  desglose30d: { pedidos: 0, ventas: 0, libroCtp: 380, trozas: 40 },
};

describe("camposDeOperaciones", () => {
  it("convierte las señales de un aserradero en campos de la fila", () => {
    const c = camposDeOperaciones(senalesDeBlas);
    expect(c.operations30d).toBe(420);
    expect(c.operationsBreakdown).toEqual({ pedidos: 0, ventas: 0, libroCtp: 380, trozas: 40 });
    expect(c.logins30d).toBe(39);
    expect(c.actions30d).toBe(879);
    expect(c.lastLoginAt).toBe("2026-11-04T13:10:00.000Z");
    expect(c.lastOperationAt).toBe("2026-11-03T22:00:00.000Z");
  });

  it("nunca ingresó ni operó = fechas null (no 1970)", () => {
    const c = camposDeOperaciones({ ...senalesDeBlas, ultimoIngreso: null, ultimaOperacion: null, operaciones30d: 0 });
    expect(c.lastLoginAt).toBeNull();
    expect(c.lastOperationAt).toBeNull();
    expect(c.operations30d).toBe(0);
  });

  it("sin señales (falló la lectura) = todo null, no un 0 que parezca abandono", () => {
    expect(camposDeOperaciones(null)).toEqual(SIN_SENALES);
    expect(camposDeOperaciones(undefined)).toEqual(SIN_SENALES);
    expect(SIN_SENALES.operations30d).toBeNull();
  });

  it("el desglose es una copia: tocar la fila no cambia las señales", () => {
    const c = camposDeOperaciones(senalesDeBlas);
    if (c.operationsBreakdown) c.operationsBreakdown.libroCtp = 0;
    expect(senalesDeBlas.desglose30d.libroCtp).toBe(380);
  });
});

describe("compararPorUso", () => {
  const fila = (nearLimit: boolean, orderPct: number, operations30d: number | null) => ({ nearLimit, orderPct, operations30d });

  it("cerca del límite va primero, luego más porcentaje de pedidos", () => {
    const lista = [fila(false, 80, 5), fila(true, 95, 0), fila(false, 10, 900)].sort(compararPorUso);
    expect(lista.map((f) => f.orderPct)).toEqual([95, 80, 10]);
  });

  it("a igual 0 % de pedidos, el que más opera sube (aserradero antes que tienda vacía)", () => {
    const blas = fila(false, 0, 420);
    const vacia = fila(false, 0, 0);
    const sinMedir = fila(false, 0, null);
    expect([vacia, sinMedir, blas].sort(compararPorUso)[0]).toBe(blas);
  });
});

describe("la ruta ya no toca Prisma", () => {
  const ruta = readFileSync(join(process.cwd(), "app/api/superadmin/tenants/usage/route.ts"), "utf8");

  it("lee por UsoNegocioDB y no importa @/lib/prisma", () => {
    expect(ruta).not.toMatch(/@\/lib\/prisma/);
    expect(ruta).not.toMatch(/\bprisma\./);
    expect(ruta).toContain("UsoNegocioDB.leerTodo(");
  });

  it("sigue protegida por el guard de superadmin", () => {
    expect(ruta).toContain("requirePlatformAPI(req)");
  });

  it("la DB class reutiliza SaludNegocioDB.senalesDeUso y no copia sus consultas", () => {
    const db = readFileSync(join(process.cwd(), "lib/db/uso-negocio.db.ts"), "utf8");
    expect(db).toContain("SaludNegocioDB.senalesDeUso(");
    expect(db).not.toMatch(/ActivityLog|ForestCtpEntry|WoodEntry/);
  });
});
