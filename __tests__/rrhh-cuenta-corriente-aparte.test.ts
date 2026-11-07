/**
 * «Cuenta corriente aparte» (Brandon 24-10): «Queda por pagar» resta sólo los
 * adelantos POR PLANILLA, lo mismo que descuenta el pago del sábado. Rosa debía
 * S/ 573 de cuenta corriente y Lo ganado decía «0 por pagar» mientras el pago
 * le entregaba S/ 120. La cuenta corriente se muestra al lado, nunca restada.
 *
 * Las dos pantallas pasan por la MISMA resta (`restaDelSueldo`): estos tests
 * arman los dos caminos con los mismos adelantos y piden que den lo mismo.
 */
import { describe, expect, it } from "vitest";
import {
  calcularQuedaPorPagar,
  explicarQuedaPorPagar,
  margenParaDescontar,
  restaDelSueldo,
  saldosDelSueldo,
  totalQuedaPorPagar,
} from "@/lib/rrhh/ganado";
import { calcularPagoSemana, type AdelantoParaPago } from "@/lib/rrhh/pago-semana";

const SEMANAL = { modalidad: "SEMANA" as const, monto: 60 };

function adelanto(id: string, modalidad: string, saldo: number): AdelantoParaPago {
  return {
    id,
    codigoOperacion: `ADL-${id}`,
    modalidad,
    status: "ABIERTO",
    saldoPendiente: saldo,
    moneda: "PEN",
    direccion: "DADO",
    fechaAdelanto: "2026-10-20T15:00:00.000Z",
  };
}

/** Lo que devuelve `AdelantosDB.saldosAbiertosPorModalidad` para esos adelantos. */
function grupos(adelantos: readonly AdelantoParaPago[]) {
  const porModalidad = new Map<string, { beneficiarioId: string; modalidad: string; moneda: string; saldoPendiente: number; cantidad: number }>();
  for (const a of adelantos) {
    const g = porModalidad.get(a.modalidad) ?? { beneficiarioId: "rosa", modalidad: a.modalidad, moneda: "PEN", saldoPendiente: 0, cantidad: 0 };
    g.saldoPendiente += a.saldoPendiente;
    g.cantidad++;
    porModalidad.set(a.modalidad, g);
  }
  return [...porModalidad.values()];
}

/** Los dos caminos con los mismos adelantos: Lo ganado y el pago del sábado. */
function lasDosPantallas(ganado: number, adelantos: readonly AdelantoParaPago[]) {
  const saldo = saldosDelSueldo(grupos(adelantos)).get("rosa")!;
  const queda = calcularQuedaPorPagar({ total: ganado, adelantos: { ...saldo, descontadoPen: 0 }, pagado: 0 })!;
  const pago = calcularPagoSemana({ referencia: SEMANAL, ganado, descontadoPrevio: 0, adelantos });
  return { saldo, queda, pago };
}

// Rosa: dos adelantos de cuenta corriente que suman 573 (como en main el 24-10).
const CUENTA_CORRIENTE = [adelanto("cc1", "CUENTA_CORRIENTE", 500), adelanto("cc2", "CUENTA_CORRIENTE", 73)];

describe("Rosa: la cuenta corriente no se resta de lo ganado", () => {
  it("ganado 120, cuenta corriente 573, sin planilla → por pagar 120 y la cuenta corriente 573 aparte", () => {
    const { saldo, queda, pago } = lasDosPantallas(120, CUENTA_CORRIENTE);
    expect(saldo).toEqual({ abiertosPen: 573, abiertos: 2, planillaPen: 0, planillaAbiertos: 0, cuentaCorrientePen: 573 });
    expect(queda).toMatchObject({ ganado: 120, adelantos: 0, aPagar: 120, deuda: 0, cuentaCorriente: 573 });
    expect(pago.neto).toBe(120);
    expect(pago.lineas).toEqual([]);
    expect(queda.aPagar).toBe(pago.neto);
  });

  it("con un adelanto de planilla de 20 → por pagar 100 en las dos pantallas; la cuenta corriente sigue 573", () => {
    const { saldo, queda, pago } = lasDosPantallas(120, [...CUENTA_CORRIENTE, adelanto("p1", "DESCUENTO_PLANILLA", 20)]);
    expect(saldo).toMatchObject({ planillaPen: 20, planillaAbiertos: 1, cuentaCorrientePen: 573, abiertosPen: 593 });
    expect(queda).toMatchObject({ adelantos: 20, aPagar: 100, deuda: 0, cuentaCorriente: 573 });
    expect(pago).toMatchObject({ aDescontar: 20, neto: 100, sigueDebiendo: 0 });
    expect(pago.lineas.map((l) => l.adelantoId)).toEqual(["p1"]);
  });

  it("la línea de «Cómo sale» nombra la cuenta corriente como aparte, sin restarla", () => {
    const { queda } = lasDosPantallas(120, CUENTA_CORRIENTE);
    expect(explicarQuedaPorPagar(queda)).toBe(
      "S/ 120.00 ganado − S/ 0.00 de adelantos por planilla = S/ 120.00 por pagar. Aparte debe S/ 573.00 de cuenta corriente: eso no se descuenta del sueldo.",
    );
  });

  it("las entregas pactadas tampoco salen del sueldo: van con la cuenta corriente", () => {
    const { saldo, queda, pago } = lasDosPantallas(120, [adelanto("e1", "ENTREGAS_PACTADAS", 40)]);
    expect(saldo).toMatchObject({ planillaPen: 0, cuentaCorrientePen: 40 });
    expect(queda.aPagar).toBe(120);
    expect(pago.neto).toBe(120);
  });

  it("el total del pie suma la cuenta corriente aparte, sin tocar lo que queda por pagar", () => {
    const rosa = saldosDelSueldo(grupos(CUENTA_CORRIENTE)).get("rosa")!;
    const total = totalQuedaPorPagar([
      { total: 120, adelantos: { ...rosa, descontadoPen: 0 } },
      { total: 300, adelantos: { planillaPen: 50 } },
    ]);
    expect(total).toMatchObject({ aPagar: 370, deuda: 0, cuentaCorriente: 573 });
  });

  it("otra moneda no entra en los montos en soles, pero sí en la cuenta de adelantos", () => {
    const saldo = saldosDelSueldo([
      { beneficiarioId: "rosa", modalidad: "DESCUENTO_PLANILLA", moneda: "USD", saldoPendiente: 30, cantidad: 1 },
      { beneficiarioId: "rosa", modalidad: "CUENTA_CORRIENTE", moneda: "PEN", saldoPendiente: 573, cantidad: 2 },
    ]).get("rosa")!;
    expect(saldo).toEqual({ abiertosPen: 573, abiertos: 3, planillaPen: 0, planillaAbiertos: 0, cuentaCorrientePen: 573 });
  });
});

describe("restaDelSueldo: una sola resta para las dos pantallas", () => {
  it.each([
    // ganado, descontado, planilla
    [120, 0, 0],
    [120, 0, 20],
    [120, 0, 500],
    [420, 50, 30],
    [100, 150, 40],
    [0, 0, 250],
    [1320.3, 0, 0.1],
  ])("ganado %d, ya descontado %d, planilla %d: Lo ganado y el pago dan lo mismo", (ganado, descontado, planilla) => {
    const resta = restaDelSueldo({ ganado, descontado, pagado: 0, planilla });
    const queda = calcularQuedaPorPagar({ total: ganado, adelantos: { planillaPen: planilla, descontadoPen: descontado } })!;
    const pago = calcularPagoSemana({
      referencia: SEMANAL,
      ganado,
      descontadoPrevio: descontado,
      adelantos: planilla > 0 ? [adelanto("p1", "DESCUENTO_PLANILLA", planilla)] : [],
    });
    expect(queda.aPagar).toBe(pago.neto);
    expect(queda.deuda).toBe(pago.sigueDebiendo);
    expect(pago.aDescontar).toBe(resta.aDescontar);
    expect(resta.aPagar).toBeGreaterThanOrEqual(0);
    expect(resta.sigueDebiendo).toBeGreaterThanOrEqual(0);
  });
});

describe("margenParaDescontar (tope de «Descontar» en Lo ganado)", () => {
  it("semana pagada entera + adelanto después → tope 0 (no se descuenta de lo ya entregado)", () => {
    expect(margenParaDescontar({ total: 120, pagado: 120, adelantos: { descontadoPen: 0 } })).toBe(0);
  });
  it("sin pagar: lo ganado menos lo ya descontado", () => {
    expect(margenParaDescontar({ total: 120, pagado: 0, adelantos: { descontadoPen: 20 } })).toBe(100);
  });
  it("pago parcial: queda la diferencia", () => {
    expect(margenParaDescontar({ total: 180, pagado: 120, adelantos: { descontadoPen: 0 } })).toBe(60);
  });
});

