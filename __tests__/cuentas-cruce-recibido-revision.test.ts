/**
 * ADR-449 — lo que pidió la revisión (revisor + seguridad, 28-09), lo PURO:
 *
 *  · el abono del cruce y el pago recibido se parten por el PERMISO de los
 *    cargos que cubren (el más viejo primero): en Blas los aserríos de WASACO
 *    son de FMP-2026-007 y, sin partir, el balance del permiso seguía diciendo
 *    «por recuperar 12 323,02»;
 *  · la huella del CUERPO para la idempotencia (misma clave, otro cruce → 422);
 *  · la sugerencia de vínculo: dos documentos distintos no son la misma
 *    persona, y «SA» sólo sale como sigla («José Sá» es un apellido).
 */

import { describe, expect, it } from "vitest";
import {
  clasificarAdelantos,
  huellaDelCuerpo,
  partirPorPermiso,
  planLiquidacion,
  type AdelantoParaLiquidar,
  type MovimientoPlaneado,
  type PartidasDePersona,
} from "@/lib/cuentas/liquidacion";
import { normalizarNombre, sugerirVinculo } from "@/lib/adelantos/vinculo-sugerido";
import type { MovimientoCuenta } from "@/lib/forestal/cuenta-corriente";

const cargo = (id: string, fecha: string, monto: number, contratoId: string | null): MovimientoCuenta => ({
  id,
  parteId: "p",
  parteNombre: "WASACO",
  fecha: `${fecha}T00:00:00.000Z`,
  tipo: "cargo",
  concepto: "aserrio_prestado",
  monto,
  moneda: "PEN",
  referencia: null,
  fleteId: null,
  notas: null,
  contratoId,
});

const abono = (monto: number): MovimientoPlaneado => ({ tipo: "abono", concepto: "compensacion", monto, paso: "cruce", notas: "Cruce" });

describe("partir por permiso", () => {
  it("todo de un permiso → una sola pata con ese permiso", () => {
    const movs = [cargo("c1", "2026-09-07", 5000, "FMP-007"), cargo("c2", "2026-09-08", 7323.02, "FMP-007")];
    expect(partirPorPermiso(abono(3031), movs, 0)).toEqual([{ ...abono(3031), contratoId: "FMP-007" }]);
  });

  it("el más viejo primero: 1 000 del permiso A y 2 031 del B; sumadas, el abono entero", () => {
    const movs = [cargo("c1", "2026-09-07", 1000, "A"), cargo("c2", "2026-09-08", 5000, "B"), cargo("c3", "2026-09-09", 500, null)];
    const partes = partirPorPermiso(abono(3031), movs, 0);
    expect(partes.map((x) => [x.contratoId ?? null, x.monto])).toEqual([["A", 1000], ["B", 2031]]);
    /* Lo que ya cubrió un paso anterior (el cruce) corre el pago: 3 031 → sigue en B y después sin permiso. */
    const pago = partirPorPermiso({ ...abono(3469), concepto: "pago", paso: "pago" }, movs, 3031);
    expect(pago.map((x) => [x.contratoId ?? null, x.monto])).toEqual([["B", 2969], [null, 500]]);
  });

  it("sin permisos en juego, el movimiento queda exactamente como antes", () => {
    const movs = [cargo("c1", "2026-09-07", 5000, null)];
    const base = abono(100);
    const [unico, ...resto] = partirPorPermiso(base, movs, 0);
    expect(resto).toEqual([]);
    expect(unico).toBe(base);
    expect("contratoId" in unico).toBe(false);
  });

  it("en el plan de WASACO: el cruce y el cobro de «dejar en cero» llevan el permiso de los aserríos", () => {
    const filas: AdelantoParaLiquidar[] = [
      { id: "a2", codigo: "ADL-2026-0002", fecha: "2026-09-19T22:00:00.000Z", saldo: 3217, moneda: "PEN", modalidad: "CUENTA_CORRIENTE", status: "ABIERTO", cuotasPactadas: 0, direccion: "DADO" },
      { id: "a3", codigo: "ADL-2026-0003", fecha: "2026-09-19T22:00:00.000Z", saldo: 1731, moneda: "PEN", modalidad: "CUENTA_CORRIENTE", status: "ABIERTO", cuotasPactadas: 0, direccion: "RECIBIDO" },
      { id: "a4", codigo: "ADL-2026-0004", fecha: "2026-09-19T22:00:00.000Z", saldo: 1300, moneda: "PEN", modalidad: "CUENTA_CORRIENTE", status: "ABIERTO", cuotasPactadas: 0, direccion: "RECIBIDO" },
    ];
    const { adelantos, recibidos, fuera } = clasificarAdelantos(filas);
    const movs = [cargo("c1", "2026-09-07", 5000, "FMP-007"), cargo("c2", "2026-09-08", 4323.02, "FMP-007"), cargo("c3", "2026-10-02", 3000, "FMP-007")];
    const p: PartidasDePersona = {
      persona: { beneficiarioId: "b", parteId: "p", nombre: "Wasaco", documento: null, parteNombre: "WASACO" },
      cruzable: true,
      adelantos,
      recibidos,
      forestal: { saldo: 12323.02, desde: "2026-09-07T00:00:00.000Z", movimientos: movs },
      fuera,
    };
    const r = planLiquidacion(p, {
      fecha: "2026-09-28",
      compensar: 0,
      cruzarRecibido: 3031,
      pago: { direccion: "recibido", monto: 12509.02, metodo: "transferencia", moverCaja: false },
    });
    if (!r.ok) throw new Error(r.errores.join(" · "));
    expect(r.plan.movimientos.map((m) => [m.concepto, m.monto, m.contratoId])).toEqual([
      ["compensacion", 3031, "FMP-007"],
      ["pago", 9292.02, "FMP-007"],
    ]);
    /* El neto del permiso: los cargos 12 323,02 − abonos 12 323,02 = 0 por recuperar. */
    expect(r.plan.movimientos.reduce((a, m) => Math.round((a + m.monto) * 100) / 100, 0)).toBe(12323.02);
  });
});

describe("huella del cuerpo (idempotencia)", () => {
  const cuerpo = {
    persona: { beneficiarioId: "b1" },
    fecha: "2026-09-28",
    compensar: 0,
    cruzarRecibido: 3031,
    pago: null,
    imputacion: { cruceRecibido: [{ adelantoId: "a3", monto: 1731 }, { adelantoId: "a4", monto: 1300 }] },
  };

  it("el mismo acto da la misma huella aunque las claves vengan en otro orden", () => {
    const otroOrden = { imputacion: { cruceRecibido: [{ monto: 1731, adelantoId: "a3" }, { monto: 1300, adelantoId: "a4" }] }, pago: null, cruzarRecibido: 3031, compensar: 0, fecha: "2026-09-28", persona: { beneficiarioId: "b1" } };
    expect(huellaDelCuerpo(otroOrden)).toBe(huellaDelCuerpo(cuerpo));
    expect(huellaDelCuerpo(cuerpo)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("otro cruce, otro pago u otra persona → otra huella", () => {
    const base = huellaDelCuerpo(cuerpo);
    expect(huellaDelCuerpo({ ...cuerpo, cruzarRecibido: 3000 })).not.toBe(base);
    expect(huellaDelCuerpo({ ...cuerpo, pago: { direccion: "recibido", monto: 1, metodo: "yape", moverCaja: false } })).not.toBe(base);
    expect(huellaDelCuerpo({ ...cuerpo, persona: { beneficiarioId: "b2" } })).not.toBe(base);
    /* Sin cruce de lo recibido, `undefined` y 0 son lo mismo: el cliente de antes no lo manda. */
    const sinCruce = { ...cuerpo, cruzarRecibido: undefined, imputacion: undefined, compensar: 10 };
    expect(huellaDelCuerpo(sinCruce)).toBe(huellaDelCuerpo({ ...sinCruce, cruzarRecibido: 0 }));
  });
});

describe("la sugerencia de vínculo, más estricta", () => {
  it("los dos con documento y distinto: no son la misma persona aunque se llamen igual", () => {
    expect(sugerirVinculo({ nombre: "Wasaco", documento: "20600000001" }, [{ parteId: "p", nombre: "WASACO", documento: "20600000002" }])).toBeNull();
    /* A uno le falta el documento: se sugiere por nombre. */
    expect(sugerirVinculo({ nombre: "Wasaco", documento: "20600000001" }, [{ parteId: "p", nombre: "WASACO", documento: null }])?.motivo).toBe("mismo-nombre");
  });

  it("«SA» sólo como sigla: con puntos, o sin puntos detrás de dos palabras o más", () => {
    expect(normalizarNombre("José Sá")).toBe("jose sa");
    expect(sugerirVinculo({ nombre: "José Sá", documento: null }, [{ parteId: "p", nombre: "JOSE", documento: null }])).toBeNull();
    expect(normalizarNombre("Wasaco S.A.")).toBe("wasaco");
    expect(normalizarNombre("Wasaco S. A.")).toBe("wasaco");
    expect(normalizarNombre("Maderas Unidas SA")).toBe("maderas unidas");
    expect(normalizarNombre("Transportes SA")).toBe("transportes sa");
    expect(normalizarNombre("Maderera San Martín S.A.C.")).toBe("maderera san martin");
    expect(normalizarNombre("S.A.")).toBe("sa");
  });
});
