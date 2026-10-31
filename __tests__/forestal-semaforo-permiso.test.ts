/**
 * calcularSemaforoPermiso (`lib/forestal/semaforo-permiso.ts`) — el permiso,
 * a simple vista, con lo que queda por producir contra el techo del 56 %.
 *
 * Los tramos que pidió Brandon (2026-09-25): ≥50 % holgado, 20-49 % ajustado,
 * 0-19 % por acabarse, excedido (con la MISMA tolerancia en pt que la tarjeta
 * «Saldo aserrable», `TOLERANCIA_EXCESO_PT`), sin ingreso (sin techo), y el
 * caso de redondeo donde el color tiene que coincidir con lo que dice el
 * rótulo (nunca un «50 %» pintado en amarillo).
 */
import { describe, expect, it } from "vitest";
import { calcularSemaforoPermiso, TOLERANCIA_EXCESO_PT } from "@/lib/forestal/semaforo-permiso";

describe("calcularSemaforoPermiso", () => {
  it("≥ 50 % es holgado", () => {
    const s = calcularSemaforoPermiso({ aserrablePt: 10_000, saldoPt: 6_000 });
    expect(s.nivel).toBe("holgado");
    expect(s.quedaPct).toBe(60);
    expect(s.excesoPt).toBeNull();
  });

  it("50 % exacto es holgado (el corte es inclusivo)", () => {
    const s = calcularSemaforoPermiso({ aserrablePt: 10_000, saldoPt: 5_000 });
    expect(s.nivel).toBe("holgado");
    expect(s.quedaPct).toBe(50);
  });

  it("20-49 % es ajustado", () => {
    const s = calcularSemaforoPermiso({ aserrablePt: 10_000, saldoPt: 3_000 });
    expect(s.nivel).toBe("ajustado");
    expect(s.quedaPct).toBe(30);
  });

  it("0-19 % es por acabarse", () => {
    const s = calcularSemaforoPermiso({ aserrablePt: 10_000, saldoPt: 500 });
    expect(s.nivel).toBe("porAcabarse");
    expect(s.quedaPct).toBe(5);
  });

  it("saldo 0 exacto es por acabarse, no excedido", () => {
    const s = calcularSemaforoPermiso({ aserrablePt: 10_000, saldoPt: 0 });
    expect(s.nivel).toBe("porAcabarse");
    expect(s.quedaPct).toBe(0);
  });

  it("< 0 es excedido y trae cuánto se produjo de más", () => {
    const s = calcularSemaforoPermiso({ aserrablePt: 10_000, saldoPt: -800 });
    expect(s.nivel).toBe("excedido");
    expect(s.excesoPt).toBe(800);
  });

  it("un exceso bien por encima de la tolerancia (−20 pt) es excedido", () => {
    const s = calcularSemaforoPermiso({ aserrablePt: 10_000, saldoPt: -20 });
    expect(s.nivel).toBe("excedido");
    expect(s.excesoPt).toBe(20);
  });

  it("dentro de la tolerancia (−0,3 pt) NO es excedido, igual que la tarjeta «Saldo aserrable» (esNegativo con 0,5)", () => {
    // Revisor 2026-09-25: con −0,3 pt el semáforo salía rojo y la tarjeta
    // (`esNegativo(t.saldoPt, 0.5)`) neutra — dos lecturas del MISMO número.
    const s = calcularSemaforoPermiso({ aserrablePt: 10_000, saldoPt: -0.3 });
    expect(s.nivel).not.toBe("excedido");
    expect(s.excesoPt).toBeNull();
  });

  it("más allá de la tolerancia (−0,6 pt) SÍ es excedido", () => {
    const s = calcularSemaforoPermiso({ aserrablePt: 10_000, saldoPt: -0.6 });
    expect(s.nivel).toBe("excedido");
    expect(s.excesoPt).toBeCloseTo(0.6);
  });

  it("el corte usa la constante compartida TOLERANCIA_EXCESO_PT, no un número suelto", () => {
    expect(TOLERANCIA_EXCESO_PT).toBe(0.5);
    const justoDentro = calcularSemaforoPermiso({
      aserrablePt: 10_000,
      saldoPt: -(TOLERANCIA_EXCESO_PT - 0.01),
    });
    const justoFuera = calcularSemaforoPermiso({
      aserrablePt: 10_000,
      saldoPt: -(TOLERANCIA_EXCESO_PT + 0.01),
    });
    expect(justoDentro.nivel).not.toBe("excedido");
    expect(justoFuera.nivel).toBe("excedido");
  });

  it("sin ingreso (aserrablePt 0) no hay techo que medir: sin nivel de color", () => {
    const s = calcularSemaforoPermiso({ aserrablePt: 0, saldoPt: 0 });
    expect(s.nivel).toBe("sinIngreso");
    expect(s.quedaPct).toBeNull();
    expect(s.excesoPt).toBeNull();
  });

  it("aserrablePt negativo (no debería pasar, pero no hay techo que medir igual) también es sin ingreso", () => {
    const s = calcularSemaforoPermiso({ aserrablePt: -5, saldoPt: 0 });
    expect(s.nivel).toBe("sinIngreso");
  });

  it("redondeo: el color usa el % YA REDONDEADO, nunca el crudo — 49,6 % crudo se pinta holgado, igual que el «50 %» que muestra", () => {
    // 4 960 / 10 000 = 49,6 % crudo → redondea a 50 → el corte de ≥50 % lo agarra.
    const s = calcularSemaforoPermiso({ aserrablePt: 10_000, saldoPt: 4_960 });
    expect(s.quedaPct).toBe(50);
    expect(s.nivel).toBe("holgado");
  });

  it("redondeo: 19,6 % crudo redondea a 20 % y pasa a ajustado, no por acabarse", () => {
    const s = calcularSemaforoPermiso({ aserrablePt: 10_000, saldoPt: 1_960 });
    expect(s.quedaPct).toBe(20);
    expect(s.nivel).toBe("ajustado");
  });

  it("el % sale de las MISMAS dos cifras que la tarjeta «Saldo aserrable» de la ficha (saldoPt / aserrablePt)", () => {
    // Blas real (CON-25-UCA-0142, 25-09): valores de ejemplo con la misma fórmula.
    const s = calcularSemaforoPermiso({ aserrablePt: 46_155, saldoPt: 33_231.6 });
    expect(s.quedaPct).toBe(Math.round((33_231.6 / 46_155) * 100));
  });
});
