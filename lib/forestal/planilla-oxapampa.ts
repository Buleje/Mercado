/**
 * planilla-oxapampa.ts — la planilla «Cubicar Oxapampa» de una guía
 * (Brandon, 2026-09-26): una fila por troza, tres celdas en pulgadas y pies, y
 * dos opcionales en cm cuando la guía no trajo D1/D2.
 *
 * PURO y client-safe. La pantalla guarda TEXTO (lo que se tipea: «18,5»,
 * «18.5», «18″») y esto decide tres cosas con él:
 *
 * 1. Qué dice cada celda: número, vacío o error (`errorDeCelda`).
 * 2. El pt en vivo de la fila (`ptDeFila`) — la MISMA `ptOxapampa` que
 *    congela el servidor, así lo que se ve al tipear es lo que queda.
 * 3. Qué se manda al guardar (`cambioDeFila`): SÓLO lo que cambió contra lo
 *    guardado. En Oxapampa, vaciar una celda que tenía medida manda `null`
 *    (borrar); en cm, sólo se manda sobre vacío (el dato de SERFOR no se pisa).
 */

import { LIMITES_OXAPAMPA, ptOxapampa } from "./cubicacion-oxapampa";
import { MAX_DIAMETRO_CM, redondear2, type CambioMedidaTroza } from "./medidas-troza";

/** Las celdas de una fila, en el orden en que se tipean. */
export const CAMPOS_OXAPAMPA = ["d1", "d2", "largo"] as const;
export const CAMPOS_CM = ["d1Cm", "d2Cm"] as const;
export type CampoPlanilla = (typeof CAMPOS_OXAPAMPA)[number] | (typeof CAMPOS_CM)[number];

/** Lo tipeado en una fila, tal cual. */
export type FilaPlanilla = Record<CampoPlanilla, string>;

/** Lo guardado de una troza: contra esto se decide qué cambió. */
export interface BaseTrozaPlanilla {
  id: string;
  oxD1Pulg?: number | null;
  oxD2Pulg?: number | null;
  oxLargoPies?: number | null;
  oxPt?: number | null;
  d1Cm?: number | null;
  d2Cm?: number | null;
}

const TOPE: Record<CampoPlanilla, { max: number; unidad: string }> = {
  d1: { max: LIMITES_OXAPAMPA.pulgadasMax, unidad: "″" },
  d2: { max: LIMITES_OXAPAMPA.pulgadasMax, unidad: "″" },
  largo: { max: LIMITES_OXAPAMPA.piesMax, unidad: " pies" },
  d1Cm: { max: MAX_DIAMETRO_CM, unidad: " cm" },
  d2Cm: { max: MAX_DIAMETRO_CM, unidad: " cm" },
};

/**
 * Un número tipeado con coma o punto decimal, y con la marca de unidad que a
 * veces se escribe detrás («18″», «18"», «12'», «12 pies»). Vacío = `null`; lo
 * que no es un número = `"invalido"` (no se adivina: «1.2.3» no es 1,23, y
 * «1 2» no es 12 — un espacio en medio es un dedo que se fue).
 *
 * Devuelve el número YA redondeado a 2 decimales con el mismo `redondear2` con
 * que el servidor lo guarda (`planearMedida`): así el pt en vivo, lo que se
 * compara contra lo guardado y lo que viaja son el MISMO número. Con el crudo,
 * 18.125″ · 22.375″ · 12′ daba 200,85 en pantalla y se guardaba 200,95.
 */
export function leerDecimal(texto: string): number | null | "invalido" {
  const s = texto
    .trim()
    .replace(/\s*(″|"|′|'|pulg|pies|pie|cm)+$/iu, "")
    .replace(",", ".");
  if (s === "") return null;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return "invalido";
  const n = Number(s);
  return Number.isFinite(n) ? redondear2(n) : "invalido";
}

/** El texto con que se prellena una celda desde lo guardado. */
export function textoDeMedida(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? "" : String(v);
}

/** La fila prellenada con lo que la troza ya tiene guardado. */
export function filaDeTroza(t: BaseTrozaPlanilla): FilaPlanilla {
  return {
    d1: textoDeMedida(t.oxD1Pulg),
    d2: textoDeMedida(t.oxD2Pulg),
    largo: textoDeMedida(t.oxLargoPies),
    d1Cm: "",
    d2Cm: "",
  };
}

/** Qué está mal en una celda, en palabras; `null` = bien (o vacía). */
export function errorDeCelda(campo: CampoPlanilla, texto: string): string | null {
  const v = leerDecimal(texto);
  if (v === "invalido") return "No es un número";
  if (v == null) return null;
  if (v <= 0) return "Debe ser mayor que 0";
  const { max, unidad } = TOPE[campo];
  if (v > max) return `Máximo ${max}${unidad}`;
  return null;
}

/** Los errores de una fila por celda. Sólo las celdas con error. */
export function erroresDeFila(fila: FilaPlanilla): Partial<Record<CampoPlanilla, string>> {
  const out: Partial<Record<CampoPlanilla, string>> = {};
  for (const c of [...CAMPOS_OXAPAMPA, ...CAMPOS_CM]) {
    const e = errorDeCelda(c, fila[c]);
    if (e) out[c] = e;
  }
  return out;
}

const numeroValido = (campo: CampoPlanilla, texto: string): number | null => {
  if (errorDeCelda(campo, texto)) return null;
  const v = leerDecimal(texto);
  return typeof v === "number" ? v : null;
};

/** El pt Oxapampa de lo tipeado en la fila; `null` si no alcanza o hay error. */
export function ptDeFila(fila: FilaPlanilla): number | null {
  if (CAMPOS_OXAPAMPA.some((c) => errorDeCelda(c, fila[c]))) return null;
  return ptOxapampa({
    d1Pulg: numeroValido("d1", fila.d1),
    d2Pulg: numeroValido("d2", fila.d2),
    largoPies: numeroValido("largo", fila.largo),
  });
}

const ROTULO_FALTA: Record<(typeof CAMPOS_OXAPAMPA)[number], string> = {
  d1: "D1″",
  d2: "D2″",
  largo: "L′",
};

/**
 * Qué le falta a una fila medida a medias («falta D2″», «faltan D1″ y L′»).
 * Sin pt NO es lo mismo que sin medir: con una sola punta la fórmula no se
 * aplica (revisión 26-09: media medida = sin cubicar) y la fila tiene que
 * decir qué celda completar. `null` si está vacía, completa o con error (el
 * error ya lo dice su celda).
 */
export function faltaDeFila(fila: FilaPlanilla): string | null {
  if (CAMPOS_OXAPAMPA.some((c) => errorDeCelda(c, fila[c]))) return null;
  const vacias = CAMPOS_OXAPAMPA.filter((c) => leerDecimal(fila[c]) == null);
  if (vacias.length === 0 || vacias.length === CAMPOS_OXAPAMPA.length) return null;
  const nombres = vacias.map((c) => ROTULO_FALTA[c]);
  return nombres.length === 1 ? `falta ${nombres[0]}` : `faltan ${nombres.join(" y ")}`;
}

const mismo = (a: number, b: number) => Math.abs(redondear2(a) - redondear2(b)) < 0.005;

/**
 * Lo que hay que mandar de UNA fila, o `null` si no cambió nada. Supone la
 * fila sin errores (la pantalla no deja guardar con celdas en rojo).
 *
 * - Oxapampa: celda con número distinto de lo guardado → ese número; celda
 *   vaciada que tenía medida → `null` (se borra); igual → no viaja.
 * - cm: sólo si la troza NO lo tiene (el del libro no se pisa desde acá).
 */
export function cambioDeFila(
  base: BaseTrozaPlanilla,
  fila: FilaPlanilla,
): CambioMedidaTroza | null {
  const c: CambioMedidaTroza = { id: base.id };
  let hay = false;
  const ox = (
    campo: (typeof CAMPOS_OXAPAMPA)[number],
    actual: number | null | undefined,
    clave: "oxD1Pulg" | "oxD2Pulg" | "oxLargoPies",
  ) => {
    const v = leerDecimal(fila[campo]);
    if (v === "invalido") return;
    const guardado = actual ?? null;
    if (v == null) {
      if (guardado != null) {
        c[clave] = null;
        hay = true;
      }
      return;
    }
    if (guardado == null || !mismo(v, guardado)) {
      c[clave] = v;
      hay = true;
    }
  };
  ox("d1", base.oxD1Pulg, "oxD1Pulg");
  ox("d2", base.oxD2Pulg, "oxD2Pulg");
  ox("largo", base.oxLargoPies, "oxLargoPies");

  const cm = (
    campo: (typeof CAMPOS_CM)[number],
    actual: number | null | undefined,
    clave: "d1Cm" | "d2Cm",
  ) => {
    if (actual != null) return;
    const v = leerDecimal(fila[campo]);
    if (typeof v !== "number") return;
    c[clave] = v;
    hay = true;
  };
  cm("d1Cm", base.d1Cm, "d1Cm");
  cm("d2Cm", base.d2Cm, "d2Cm");
  return hay ? c : null;
}

/**
 * La fila sin los cm. Con la pastilla «D1/D2 en cm» apagada esas celdas no se
 * ven, así que tampoco cuentan: ni viajan al guardar, ni frenan con un error
 * que no se puede ver. Lo tipeado sigue en la fila: prender la pastilla lo
 * devuelve.
 */
export function filaSinCm(fila: FilaPlanilla): FilaPlanilla {
  return fila.d1Cm === "" && fila.d2Cm === "" ? fila : { ...fila, d1Cm: "", d2Cm: "" };
}

/**
 * ¿Hay en la fila algo tipeado que se pierde al cerrar? Un cambio que se
 * guardaría, O una celda en rojo: la fila con error no viaja al guardar (y por
 * eso no está en la lista de cambios), pero lo tipeado en ella también se
 * pierde. Volver una celda a lo guardado («18.0» sobre 18) no cuenta.
 */
export function filaSinGuardar(base: BaseTrozaPlanilla, fila: FilaPlanilla): boolean {
  if (cambioDeFila(base, fila)) return true;
  const inicial = filaDeTroza(base);
  return [...CAMPOS_OXAPAMPA, ...CAMPOS_CM].some(
    (c) => fila[c] !== inicial[c] && errorDeCelda(c, fila[c]) != null,
  );
}

/**
 * El pt que muestra una fila: si no se tocó, el CONGELADO del servidor (si
 * mañana cambia el divisor, lo ya guardado no se reescribe en pantalla); si se
 * tocó, el de lo tipeado.
 */
export function ptVisibleDeFila(base: BaseTrozaPlanilla, fila: FilaPlanilla): number | null {
  const tocada = CAMPOS_OXAPAMPA.some(
    (c) =>
      fila[c] !==
      textoDeMedida(base[c === "d1" ? "oxD1Pulg" : c === "d2" ? "oxD2Pulg" : "oxLargoPies"]),
  );
  if (!tocada && typeof base.oxPt === "number" && base.oxPt > 0) return base.oxPt;
  return ptDeFila(fila);
}

/** Σ pt y cuántas filas tienen pt, sobre lo que se VE (guardado o tipeado). */
export function totalDePlanilla(
  bases: readonly BaseTrozaPlanilla[],
  filas: Readonly<Record<string, FilaPlanilla>>,
): { pt: number; cubicadas: number; total: number } {
  let pt = 0;
  let cubicadas = 0;
  for (const b of bases) {
    const f = filas[b.id];
    const v = f ? ptVisibleDeFila(b, f) : (b.oxPt ?? null);
    if (v == null) continue;
    pt += v;
    cubicadas += 1;
  }
  return { pt: redondear2(pt), cubicadas, total: bases.length };
}
