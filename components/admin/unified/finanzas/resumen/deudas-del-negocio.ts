/**
 * «Te deben» y «Debes» del Resumen de Mi Plata: las dos cifras que faltaban
 * (F12, 2026-09-29). El Resumen tenía «Fiados pendientes» y «Deuda
 * proveedores», que son sólo una parte de cada lado: los adelantos, los
 * préstamos, la madera a cuenta y el aserrío que te hicieron no salían en
 * ninguna cifra de arriba.
 *
 * UNA regla: cada cifra es el total de SU sección, pedido a la misma función
 * que la dibuja — «Te deben» = `GET /api/admin/por-cobrar?resumen=1` (los
 * `totales` de `PorCobrarDB.getDetalle`) y «Debes» =
 * `GET /api/finanzas/por-pagar?resumen=1` (los `totales` de
 * `PorPagarDB.getDetalle`). Acá no se suma nada: sólo se lee la respuesta.
 *
 * Son brutos, como en sus secciones: lo que se cruza (a la misma persona le
 * debes y te debe) no se resta — se informa aparte (`cruzable`, el de «Lo que
 * debo») y se decide en Liquidar. Cada moneda, aparte; soles arriba.
 *
 * `null` = esa cifra no se pudo leer o el rol no la puede ver (el 403 de un
 * encargado): no se dibuja, en vez de mostrar un cero que parece un dato.
 *
 * PURO.
 */

import type { MontoEnMoneda } from "@/lib/finance/por-pagar";

export interface CifraDeDeuda {
  /** Por moneda, soles primero. Vacío = nada pendiente. */
  montos: MontoEnMoneda[];
  /** Cuántas cuentas (Por cobrar) o acreedores (Lo que debo). */
  cuentas: number;
}

export interface DeudasDelNegocio {
  teDeben: CifraDeDeuda | null;
  debes: CifraDeDeuda | null;
  /** Por moneda: cuánto de esto se compensa entre las mismas personas al liquidar. */
  cruzable: MontoEnMoneda[];
}

export const SIN_DEUDAS: DeudasDelNegocio = { teDeben: null, debes: null, cruzable: [] };

const PEN = "PEN";

function soloMontos(xs: readonly { moneda: string; monto: number }[]): MontoEnMoneda[] {
  return xs
    .filter((x) => Math.abs(x.monto) > 0.005)
    .sort((a, b) => (a.moneda === PEN ? -1 : b.moneda === PEN ? 1 : a.moneda.localeCompare(b.moneda)));
}

type ConTotales = { totales?: unknown; cuentas?: unknown } | null | undefined;

/** Los totales por moneda de una respuesta `?resumen=1`, o `null` si no tiene la forma. */
function totalesDe(r: ConTotales, campo: "total"): CifraDeDeuda | null {
  if (!r || !Array.isArray(r.totales)) return null;
  const montos = soloMontos(
    (r.totales as { moneda?: unknown; total?: unknown }[])
      .filter((t) => typeof t.moneda === "string" && typeof t[campo] === "number")
      .map((t) => ({ moneda: t.moneda as string, monto: t[campo] as number })),
  );
  return { montos, cuentas: typeof r.cuentas === "number" ? r.cuentas : 0 };
}

/**
 * Lee las dos respuestas tal como llegan (`null` si el fetch falló o dio 403).
 * El `cruzable` es el de «Lo que debo»: el mismo número que muestran las dos
 * secciones.
 */
export function leerDeudasDelNegocio(porCobrar: unknown, porPagar: unknown): DeudasDelNegocio {
  const pp = porPagar as ConTotales;
  const cruzable =
    pp && Array.isArray(pp.totales)
      ? soloMontos(
          (pp.totales as { moneda?: unknown; cruzable?: unknown }[])
            .filter((t) => typeof t.moneda === "string" && typeof t.cruzable === "number")
            .map((t) => ({ moneda: t.moneda as string, monto: t.cruzable as number })),
        )
      : [];
  return {
    teDeben: totalesDe(porCobrar as ConTotales, "total"),
    debes: totalesDe(pp, "total"),
    cruzable,
  };
}
