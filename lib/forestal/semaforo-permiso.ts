/**
 * semaforo-permiso — el permiso, a simple vista: verde/amarillo/rojo según lo
 * que queda por producir contra el techo del 56 % que da la madera ingresada.
 *
 * Brandon (2026-09-25, chip de la banda): «el chip de arriba... muestra una
 * barrita en verde, amarillo o rojo con lo que queda por producir». El % es
 * un DERIVADO de las MISMAS dos cifras que la tarjeta «Saldo aserrable» de la
 * ficha del permiso (`CtpPermisoVolumen`, ADR-432): `totales.saldoPt` sobre
 * `totales.aserrablePt`. Sin ingreso (`aserrablePt` 0, ninguna guía bajo el
 * permiso) no hay techo que medir: no se inventa un semáforo — regla 6 de
 * `armarVolumenDelPermiso` es «lo que no se puede calcular es `null`, nunca
 * 0», y acá se hereda esa misma regla.
 *
 * PURO: sólo aritmética sobre lo que ya trajo el servidor (nada se recalcula,
 * `saldoPt`/`aserrablePt` son los mismos que pinta la ficha). La clasificación
 * en tramos usa el % YA REDONDEADO (no el crudo) para que el color de la barra
 * y el número del rótulo nunca se contradigan: un 49,6 % crudo que en pantalla
 * dice «50 %» tiene que pintarse verde, no amarillo. El corte de «excedido» es
 * la única excepción — se decide en PT, no en %, con la MISMA tolerancia que
 * usa la tarjeta «Saldo aserrable» (`esNegativo(t.saldoPt, 0.5)` en
 * `permiso-volumen-ui.tsx`): menos de medio pie tablar es redondeo, no un
 * exceso real (revisor 2026-09-25: con −0,3 pt el chip salía rojo y la
 * tarjeta neutra — dos pantallas del MISMO número, dos lecturas).
 */

/** Menos de esto, en pt, es ruido de redondeo — no un exceso real. Coincide con
 *  la tolerancia de `esNegativo(t.saldoPt, TOLERANCIA_EXCESO_PT)` que usa la
 *  tarjeta «Saldo aserrable» (`permiso-volumen-ui.tsx`); single source. */
export const TOLERANCIA_EXCESO_PT = 0.5;

export type NivelSemaforoPermiso = "sinIngreso" | "holgado" | "ajustado" | "porAcabarse" | "excedido";

export interface SemaforoPermiso {
  nivel: NivelSemaforoPermiso;
  /** Redondeado a entero para el rótulo («queda 72 %»). `null` = sin ingreso. */
  quedaPct: number | null;
  aserrablePt: number;
  saldoPt: number;
  /** Sólo con `nivel === "excedido"`: cuánto se produjo por encima del techo, en pt. */
  excesoPt: number | null;
}

const r0 = (n: number) => Math.round(n);

/**
 * Tramos (Brandon 2026-09-25): ≥50 % holgado · 20-49 % ajustado · 0-19 % por
 * acabarse · < −`TOLERANCIA_EXCESO_PT` pt excedido.
 */
export function calcularSemaforoPermiso(totales: {
  aserrablePt: number;
  saldoPt: number;
}): SemaforoPermiso {
  const { aserrablePt, saldoPt } = totales;
  if (!(aserrablePt > 0)) {
    return { nivel: "sinIngreso", quedaPct: null, aserrablePt, saldoPt, excesoPt: null };
  }
  const crudo = (saldoPt / aserrablePt) * 100;
  if (saldoPt < -TOLERANCIA_EXCESO_PT) {
    return { nivel: "excedido", quedaPct: r0(crudo), aserrablePt, saldoPt, excesoPt: -saldoPt };
  }
  const pct = r0(crudo);
  const nivel: NivelSemaforoPermiso = pct >= 50 ? "holgado" : pct >= 20 ? "ajustado" : "porAcabarse";
  return { nivel, quedaPct: pct, aserrablePt, saldoPt, excesoPt: null };
}
