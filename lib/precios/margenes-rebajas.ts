/**
 * «Tu margen mínimo en rebajas» (Brandon 19-10): los dos números de la regla
 * única de rebajas (`rebajas.ts`) que antes estaban fijos en el código pasan a
 * ser del negocio. Los pone el dueño en Ajustes › Cobros y comprobantes, y
 * Análisis › Sugerencias de precio y la IA › Precios en bloque los usan igual.
 *
 *  · `pisoSobreCosto` (%): ninguna rebaja deja el precio debajo de costo + X %.
 *  · `margenMinimoSugerido` (%): en la diferencia, las filas que quedan con
 *    menos de Y % de margen ((precio − costo) / precio) empiezan sin marcar.
 *
 * Se guarda en `Settings.featureFlagsJson` (clave `margenesRebajas`), sin
 * schema nuevo. Sin la clave (o con algo inválido) valen los de fábrica: 5 y 15.
 *
 * Puro y client-safe.
 */
import { z } from "zod";

export const CLAVE_MARGENES_REBAJAS = "margenesRebajas";

export interface MargenesRebajas {
  /** % sobre el costo: el piso de una rebaja (5 = costo × 1,05). */
  pisoSobreCosto: number;
  /** % de margen sobre el precio: debajo de esto la fila empieza sin marcar. */
  margenMinimoSugerido: number;
}

export const MARGENES_REBAJAS_POR_DEFECTO: Readonly<MargenesRebajas> = Object.freeze({
  pisoSobreCosto: 5,
  margenMinimoSugerido: 15,
});

/** Quienes los cambian: los mismos que aplican precios en bloque (dueño, admin, encargado). */
export const ROLES_CAMBIAN_MARGENES = ["admin", "owner", "manager"] as const;

const Pct = z.number().finite().min(0, "No puede ser negativo.").max(90, "Hasta 90 %.");

/**
 * El margen (sobre el precio) que deja un precio justo en el piso (recargo
 * sobre el costo): costo + 5 % → 5 / 105 = 4,76 %. Son bases distintas: se
 * comparan así, no 5 contra 15.
 */
export function margenDelPiso(pisoSobreCosto: number): number {
  return (pisoSobreCosto / (100 + pisoSobreCosto)) * 100;
}

/** Si el piso ya dejara más margen que el mínimo, ninguna rebaja saldría con «margen bajo»: el mínimo no serviría. */
export const MargenesRebajasSchema = z
  .object({ pisoSobreCosto: Pct, margenMinimoSugerido: Pct })
  .refine((m) => margenDelPiso(m.pisoSobreCosto) <= m.margenMinimoSugerido + 1e-9, {
    message: "El piso deja más margen que el margen mínimo: sube el margen mínimo o baja el piso.",
    path: ["pisoSobreCosto"],
  });

/** Lo guardado en los flags del negocio; si falta o no pasa la validación, los de fábrica. */
export function leerMargenesRebajas(flags: Record<string, unknown> | null | undefined): MargenesRebajas {
  const r = MargenesRebajasSchema.safeParse(flags?.[CLAVE_MARGENES_REBAJAS]);
  return r.success ? r.data : { ...MARGENES_REBAJAS_POR_DEFECTO };
}

/** «5 %», «7,5 %». */
export function pctTexto(n: number): string {
  return `${String(Math.round(n * 10) / 10).replace(".", ",")} %`;
}

/** Ajustes › Cobros y comprobantes, con la tarjeta a la vista (la tarjeta lee `campo`). */
export const CAMPO_MARGENES_REBAJAS = "margenes-rebajas";
export const RUTA_MARGENES_REBAJAS = `/admin?tab=config&vista=cobros&campo=${CAMPO_MARGENES_REBAJAS}`;
