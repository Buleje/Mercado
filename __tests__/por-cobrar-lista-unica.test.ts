/**
 * «Por cobrar» pasó de cuatro tarjetas que enlazan a UNA lista con la deuda
 * adentro (Brandon 2026-09-21). El riesgo nuevo es que la lista y el total se
 * contradigan: acá se fija que el resumen SALE de las filas, que el orden es el
 * de cobranza (lo vencido primero) y que el vacío es vacío de verdad.
 *
 * Los helpers son puros: `lib/db/por-cobrar.db.ts` importa `server-only`, que
 * vitest ya aliasea a un mock, y `@/lib/prisma` se mockea porque el módulo lo
 * importa al tope aunque estos helpers no lo toquen.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  resumirPorCobrar,
  ordenarPorCobrar,
  saldosPorParte,
  diaUtc,
  type PorCobrarFila,
} from "@/lib/db/por-cobrar.db";

const fila = (p: Partial<PorCobrarFila> & { id: string; tipo: PorCobrarFila["tipo"]; monto: number }): PorCobrarFila => ({
  quien: "Alguien",
  desde: "2026-09-01",
  vence: null,
  nota: null,
  ...p,
});

describe("resumirPorCobrar — el total es la suma de lo que se lista", () => {
  it("agrupa por tipo y el total general cierra con las filas", () => {
    const filas = [
      fila({ id: "f1", tipo: "fiado", monto: 150 }),
      fila({ id: "f2", tipo: "fiado", monto: 49.9 }),
      fila({ id: "p1", tipo: "prestamo", monto: 1200.5 }),
      fila({ id: "a1", tipo: "adelanto", monto: 4506.34 }),
      fila({ id: "m1", tipo: "madera", monto: 0.01 }),
    ];
    const r = resumirPorCobrar(filas);

    expect(r.fiados).toEqual({ total: 199.9, count: 2 });
    expect(r.prestamos).toEqual({ total: 1200.5, count: 1 });
    expect(r.adelantos).toEqual({ total: 4506.34, count: 1 });
    expect(r.madera).toEqual({ total: 0.01, count: 1 });
    expect(r.totalGeneral).toBe(5906.75);
    // La afirmación que sostiene la pantalla: cabecera == suma de la tabla.
    expect(r.totalGeneral).toBe(
      Math.round(filas.reduce((s, f) => s + f.monto, 0) * 100) / 100,
    );
  });

  it("sin filas, todo en cero (y ningún NaN del redondeo)", () => {
    const r = resumirPorCobrar([]);
    expect(r.totalGeneral).toBe(0);
    expect(r.fiados).toEqual({ total: 0, count: 0 });
    expect(r.madera).toEqual({ total: 0, count: 0 });
  });

  it("no arrastra el error del float: 0.1 + 0.2 son 0.30, no 0.30000000000000004", () => {
    const r = resumirPorCobrar([
      fila({ id: "a", tipo: "fiado", monto: 0.1 }),
      fila({ id: "b", tipo: "fiado", monto: 0.2 }),
    ]);
    expect(r.fiados.total).toBe(0.3);
    expect(r.totalGeneral).toBe(0.3);
  });
});

describe("ordenarPorCobrar — primero lo que ya se venció", () => {
  const hoy = "2026-09-21";

  it("vencido (lo más viejo arriba) → por vencer → sin plazo por monto", () => {
    const filas = [
      fila({ id: "sinPlazoChico", tipo: "adelanto", monto: 100 }),
      fila({ id: "porVencer", tipo: "fiado", monto: 10, vence: "2026-09-30" }),
      fila({ id: "sinPlazoGrande", tipo: "adelanto", monto: 900 }),
      fila({ id: "vencidoViejo", tipo: "fiado", monto: 5, vence: "2026-08-01" }),
      fila({ id: "vencidoReciente", tipo: "fiado", monto: 5000, vence: "2026-09-20" }),
    ];
    expect(ordenarPorCobrar(filas, hoy).map((f) => f.id)).toEqual([
      "vencidoViejo",
      "vencidoReciente",
      "porVencer",
      "sinPlazoGrande",
      "sinPlazoChico",
    ]);
  });

  it("lo que vence HOY todavía no está vencido, pero va antes que lo sin plazo", () => {
    const filas = [
      fila({ id: "sinPlazo", tipo: "adelanto", monto: 9999 }),
      fila({ id: "venceHoy", tipo: "fiado", monto: 1, vence: hoy }),
      fila({ id: "vencido", tipo: "fiado", monto: 1, vence: "2026-09-20" }),
    ];
    expect(ordenarPorCobrar(filas, hoy).map((f) => f.id)).toEqual(["vencido", "venceHoy", "sinPlazo"]);
  });

  it("no muta el arreglo que recibe", () => {
    const filas = [
      fila({ id: "b", tipo: "fiado", monto: 1, vence: "2026-09-30" }),
      fila({ id: "a", tipo: "fiado", monto: 1, vence: "2026-01-01" }),
    ];
    ordenarPorCobrar(filas, hoy);
    expect(filas.map((f) => f.id)).toEqual(["b", "a"]);
  });
});

describe("saldosPorParte — la cuenta corriente forestal", () => {
  const mov = (parteId: string, tipo: string, monto: number, fecha: string) => ({
    parteId,
    parteNombre: parteId === "p1" ? "Maderera del Ucayali" : "Aserradero Norte",
    tipo,
    monto,
    fecha: new Date(fecha),
  });

  it("cargo suma, abono resta, y el «desde» es el movimiento más viejo", () => {
    const saldos = saldosPorParte([
      mov("p1", "cargo", 5000, "2026-07-10T00:00:00Z"),
      mov("p1", "abono", 1500, "2026-08-02T00:00:00Z"),
      mov("p1", "cargo", 500.5, "2026-06-01T00:00:00Z"),
    ]);
    expect(saldos).toEqual([
      { parteId: "p1", nombre: "Maderera del Ucayali", saldo: 4000.5, desde: "2026-06-01" },
    ]);
  });

  it("una parte con saldo a favor SUYO queda en negativo (no se compensa con la que debe)", () => {
    const saldos = saldosPorParte([
      mov("p1", "cargo", 1000, "2026-07-10T00:00:00Z"),
      mov("p2", "abono", 300, "2026-07-11T00:00:00Z"),
    ]);
    expect(saldos.find((s) => s.parteId === "p2")?.saldo).toBe(-300);
    expect(saldos.filter((s) => s.saldo > 0.005)).toHaveLength(1);
  });
});

describe("diaUtc — el día de un vencimiento no se corre a Lima", () => {
  it("una fecha de calendario guardada a medianoche UTC se lee ese mismo día", () => {
    // Leída en hora de Lima (UTC−5) daría el 09: el vencimiento se adelantaría un día.
    expect(diaUtc(new Date("2026-09-10T00:00:00.000Z"))).toBe("2026-09-10");
  });

  it("sin fecha devuelve null, y una fecha inválida no rompe", () => {
    expect(diaUtc(null)).toBeNull();
    expect(diaUtc(undefined)).toBeNull();
    expect(diaUtc(new Date("no es fecha"))).toBeNull();
  });
});
