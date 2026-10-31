/**
 * Las cifras de arriba del Resumen cuadran con la «Cuenta por persona» de abajo
 * (25-10). Arriba decía «Le debes S/ 0.00» (sólo adelantos) y abajo, en la
 * misma pantalla, «Le debes S/ 4,479.60 a Comunidad Nativa…», «S/ 1,000.00» y
 * «S/ 800.00» (madera): la cabecera de la cuenta sumaba S/ 6,279.60.
 *
 * Ahora las dos salen de la misma cuenta (`unificarCuentas`, armada en el
 * servidor por `cuentasDelNegocio`): acá se pasa por la unión REAL y se compara
 * con la cuenta de la cabecera de `CuentasPorPersona` (Σ neto > 0 y Σ |neto < 0|).
 */
import { describe, expect, it } from "vitest";
import { unificarCuentas, type CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";
import { porCobrarConCuentas, totalesDeCuentas, type TareaHoy } from "@/lib/adelantos/hoy-toca";

const mov = (parteId: string, tipo: "cargo" | "abono", monto: number, concepto: MovimientoCuenta["concepto"] = "madera"): MovimientoCuenta => ({
  id: `m-${parteId}-${monto}`,
  parteId,
  parteNombre: parteId,
  fecha: "2026-10-01",
  tipo,
  concepto,
  monto,
  moneda: "PEN",
  referencia: null,
  fleteId: null,
  notas: null,
});

const benef = (id: string, forestPartyId: string | null = null) => ({ id, nombre: id, documento: null, telefono: null, forestPartyId });
const dado = (beneficiarioId: string, saldoPendiente: number, moneda = "PEN") => ({
  beneficiarioId,
  status: "ABIERTO",
  saldoPendiente,
  moneda,
  cantidad: 1,
  direccion: "DADO",
});
const parte = (id: string) => ({ id, nombre: id, docNumero: null, telefono: null });

const cobrar = (beneficiarioId: string, monto: Record<string, number>): TareaHoy => ({
  id: `cobrar:${beneficiarioId}`,
  tipo: "cobrar",
  titulo: `Cobrar a ${beneficiarioId}`,
  detalle: "",
  monto,
  cantidad: 1,
  boton: "Cobrar",
  href: "/admin",
});

/** La cuenta de la cabecera de `CuentasPorPersona.tsx` (en soles), tal cual. */
function cabeceraDeLaLista(personas: CuentaPersona[]) {
  return {
    teDeben: personas.filter((p) => p.neto > 0.005).reduce((s, p) => s + p.neto, 0),
    leDebes: personas.filter((p) => p.neto < -0.005).reduce((s, p) => s + Math.abs(p.neto), 0),
  };
}

describe("Resumen: «Te deben» y «Le debes» = la Cuenta por persona", () => {
  it("main 25-10: la madera por pagar entra en «Le debes» (S/ 6,279.60, no S/ 0.00)", () => {
    const personas = unificarCuentas({
      beneficiarios: [benef("qa-modal-303942"), benef("qa-caja-549235"), ...Array.from({ length: 8 }, (_, i) => benef(`qa-${i}`))],
      adelantos: [dado("qa-modal-303942", 733.34), dado("qa-caja-549235", 573), ...Array.from({ length: 8 }, (_, i) => dado(`qa-${i}`, 400))],
      partes: [parte("comunidad-nativa"), parte("qa-plata"), parte("proveedor-guias")],
      movimientos: [mov("comunidad-nativa", "abono", 4479.6), mov("qa-plata", "abono", 1000), mov("proveedor-guias", "abono", 800)],
    });

    const arriba = totalesDeCuentas(personas);
    const abajo = cabeceraDeLaLista(personas);

    expect(arriba.leDebes).toEqual({ PEN: 6279.6 });
    expect(arriba.teDeben).toEqual({ PEN: 4506.34 });
    expect(arriba.leDebes.PEN).toBeCloseTo(abajo.leDebes, 2);
    expect(arriba.teDeben.PEN).toBeCloseTo(abajo.teDeben, 2);
    expect(arriba.personasLeDebes).toBe(3);
    expect(arriba.personasTeDeben).toBe(10);
  });

  it("adelanto y madera de la misma persona se compensan antes de sumar", () => {
    /* Le diste S/ 1,000 y te entregó S/ 300 de madera que no pagaste: te debe S/ 700. */
    const personas = unificarCuentas({
      beneficiarios: [benef("quispe", "p-quispe"), benef("ruiz", "p-ruiz")],
      adelantos: [dado("quispe", 1000), dado("ruiz", 200)],
      partes: [parte("p-quispe"), parte("p-ruiz")],
      movimientos: [mov("p-quispe", "abono", 300), mov("p-ruiz", "abono", 500)],
    });

    const t = totalesDeCuentas(personas);
    expect(t.teDeben).toEqual({ PEN: 700 });
    /* Ruiz: le diste 200, te entregó 500 de madera: le debes 300 (y no te debe 200). */
    expect(t.leDebes).toEqual({ PEN: 300 });
    expect(t).toMatchObject({ personasTeDeben: 1, personasLeDebes: 1 });
    expect(t.teDeben.PEN).toBeCloseTo(cabeceraDeLaLista(personas).teDeben, 2);
    expect(t.leDebes.PEN).toBeCloseTo(cabeceraDeLaLista(personas).leDebes, 2);
  });

  it("«Sin moverse o vencido» nunca pasa de lo que la persona te debe en su cuenta entera", () => {
    const personas = unificarCuentas({
      beneficiarios: [benef("quispe", "p-quispe"), benef("ruiz", "p-ruiz"), benef("wasaco")],
      adelantos: [dado("quispe", 1000), dado("ruiz", 200), dado("wasaco", 6248)],
      partes: [parte("p-quispe"), parte("p-ruiz")],
      movimientos: [mov("p-quispe", "abono", 300), mov("p-ruiz", "abono", 500)],
    });
    const tareas = [cobrar("quispe", { PEN: 1000 }), cobrar("ruiz", { PEN: 200 }), cobrar("wasaco", { PEN: 6248 })];

    const r = porCobrarConCuentas(tareas, personas);
    /* Quispe: 1,000 quietos pero te debe 700 en total. Ruiz: el neto es suyo, nada por cobrar. Wasaco: sin madera, todo. */
    expect(r.monto).toEqual({ PEN: 6948 });
    expect(r.personas).toBe(2);
    expect(r.monto.PEN).toBeLessThanOrEqual(totalesDeCuentas(personas).teDeben.PEN);
  });

  it("otras monedas van aparte, también por persona (ADR-118)", () => {
    const t = totalesDeCuentas([
      { neto: 0, otrasMonedas: { USD: 50 } },
      { neto: -120, otrasMonedas: { USD: -20 } },
      { neto: 0.004 },
    ]);
    expect(t.teDeben).toEqual({ USD: 50 });
    expect(t.leDebes).toEqual({ PEN: 120, USD: 20 });
    expect(t.personasTeDeben).toBe(1);
    expect(t.personasLeDebes).toBe(1);
  });

  it("una persona sin fila en la cuenta se cobra entera (no se inventa un tope)", () => {
    expect(porCobrarConCuentas([cobrar("nuevo", { PEN: 400 })], [])).toEqual({ monto: { PEN: 400 }, personas: 1 });
  });
});
