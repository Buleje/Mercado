/**
 * __tests__/liquidar-me-pago-solo-aserrio.test.ts
 *
 * ADR-413 — «Me pagó» cuando la persona no tiene adelantos y sólo debe un
 * cargo de aserrío (ADR-412). Es el caso central de Brandon: le cobrás el
 * aserrío y te paga una parte. Sólo funciona con vínculo EXPLÍCITO
 * (`cruzable: true` + `forestal` presente) — sin él, `leerPartidas` no manda
 * la cuenta forestal y esto no aplicaría (revisión de código, FormularioLiquidacion.tsx).
 *
 * No se toca `lib/cuentas/liquidacion.ts` (del servidor): esto sólo verifica,
 * como pidió la revisión, que `planLiquidacion` ya soporta imputar un pago
 * `recibido` contra la cuenta forestal antes de habilitar el botón en la UI.
 */
import { describe, expect, it } from "vitest";
import { planLiquidacion, type PartidasDePersona } from "@/lib/cuentas/liquidacion";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";

const cargoAserrio: MovimientoCuenta = {
  id: "m1",
  parteId: "p1",
  parteNombre: "Aserradero El Roble",
  fecha: "2026-09-01T00:00:00.000Z",
  tipo: "cargo",
  concepto: "aserrio_prestado",
  monto: 300,
  moneda: "PEN",
  referencia: "Corrida N° 1",
  fleteId: null,
  notas: null,
};

const partidas: PartidasDePersona = {
  persona: { beneficiarioId: "b1", parteId: "p1", nombre: "Ana", documento: "12345678" },
  cruzable: true, // vínculo explícito — sin esto la cuenta forestal ni llega acá
  adelantos: [],
  forestal: { saldo: 300, desde: "2026-09-01", movimientos: [cargoAserrio] },
  fuera: [],
};

describe("planLiquidacion — pago recibido sólo contra la cuenta forestal", () => {
  it("con S/ 300 de aserrío y un pago de S/ 100, la vista previa deja S/ 200", () => {
    const r = planLiquidacion(partidas, {
      fecha: "2026-09-14",
      compensar: 0,
      pago: { direccion: "recibido", monto: 100, metodo: "efectivo", moverCaja: true },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.despues.adelantosTeDebe).toBe(0);
    expect(r.plan.despues.maderaSaldo).toBe(200);
    expect(r.plan.despues.neto).toBe(200);
    // Se escribe UN abono en la cuenta forestal, nada en adelantos (no hay ninguno).
    expect(r.plan.entregas).toHaveLength(0);
    expect(r.plan.movimientos).toEqual([
      { tipo: "abono", concepto: "pago", monto: 100, paso: "pago", notas: "Pago recibido (efectivo)" },
    ]);
  });

  it("un pago mayor a la deuda de aserrío se rechaza con la cifra (sobrepago, decisión de Brandon)", () => {
    const r = planLiquidacion(partidas, {
      fecha: "2026-09-14",
      compensar: 0,
      pago: { direccion: "recibido", monto: 400, metodo: "efectivo", moverCaja: true },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errores[0]).toMatch(/S\/ 300\.00/);
  });
});
