/**
 * __tests__/liquidar-caja-texto.test.ts
 *
 * ADR-413 §5 — qué se lee de la caja al liquidar, y con qué TONO: un aviso
 * que pide revisar el arqueo no puede pintarse igual que una confirmación
 * (revisión de código).
 */
import { describe, expect, it } from "vitest";
import { textoResultadoCaja } from "@/components/admin/adelantos/cuentas/liquidar/caja-texto";
import type { LiquidacionDTO } from "@/lib/db/liquidacion-cuenta.db";

type Entrada = Pick<LiquidacionDTO, "pago" | "caja">;

const conPago = (p: Partial<NonNullable<Entrada["pago"]>>, caja: Entrada["caja"]): Entrada => ({
  pago: { direccion: "recibido", monto: 100, metodo: "efectivo", moverCaja: true, ...p },
  caja,
});

describe("textoResultadoCaja — tono", () => {
  it("movida (recibido) es 'ok' y dice cuánto entró", () => {
    const r = textoResultadoCaja(conPago({ direccion: "recibido" }, { resultado: "movida", movimientoId: "m1" }));
    expect(r).toEqual({ texto: "Entró a la caja S/ 100.00", tono: "ok" });
  });

  it("movida (hecho) dice cuánto salió", () => {
    const r = textoResultadoCaja(conPago({ direccion: "hecho" }, { resultado: "movida", movimientoId: "m1" }));
    expect(r?.texto).toBe("Salió de la caja S/ 100.00");
    expect(r?.tono).toBe("ok");
  });

  it("sin_caja es 'aviso'", () => {
    const r = textoResultadoCaja(conPago({}, { resultado: "sin_caja", movimientoId: null }));
    expect(r).toEqual({ texto: "No había caja abierta: anótalo a mano", tono: "aviso" });
  });

  it("fallo es 'aviso'", () => {
    const r = textoResultadoCaja(conPago({}, { resultado: "fallo", movimientoId: null }));
    expect(r).toEqual({ texto: "No se pudo anotar en la caja: revisa el arqueo", tono: "aviso" });
  });

  it("no_mover no dice nada — se eligió a propósito", () => {
    const r = textoResultadoCaja(conPago({ moverCaja: false }, { resultado: "no_mover", movimientoId: null }));
    expect(r).toBeNull();
  });

  it("resultado null + moverCaja + efectivo es 'aviso' (proceso murió entre el commit y la caja)", () => {
    const r = textoResultadoCaja(conPago({ moverCaja: true, metodo: "efectivo" }, { resultado: null, movimientoId: null }));
    expect(r).toEqual({ texto: "No se sabe si se anotó en la caja", tono: "aviso" });
  });

  it("resultado null sin moverCaja no dice nada", () => {
    const r = textoResultadoCaja(conPago({ moverCaja: false }, { resultado: null, movimientoId: null }));
    expect(r).toBeNull();
  });

  it("sin pago no hay nada que decir", () => {
    expect(textoResultadoCaja({ pago: null, caja: { resultado: "movida", movimientoId: "m1" } })).toBeNull();
  });
});
