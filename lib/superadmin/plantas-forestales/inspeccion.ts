/**
 * Lo puro de la inspección de planta (fase 3 de «Plantas forestales», 17-10).
 * Sin `server-only`: lo usan el servidor y los tests.
 *
 * El conteo de trozas de una inspección se cuenta contra el libro CONGELADO al
 * abrirla, no contra el patio de hoy ni contra lo que diga el equipo: el
 * servidor clava la foto (`trozas`, `fotoEn`, `truncado`), el día y el inicio
 * antes de guardarlo. Así el acta compara contra lo mismo que la inspección
 * congeló, y `iniciadoEn = libro.tomadaEn` hace que cada inspección tenga UN
 * conteo (el guardado es idempotente por `iniciadoEn`): contar desde dos
 * celulares actualiza la misma acta en vez de abrir otra.
 */
import type { ConteoPatio } from "@/lib/forestal/conteo-patio";
import { actaParaGuardar } from "@/lib/forestal/conteo-patio-guardado";
import type { InspeccionPlanta } from "./tipos";

export type TrozasDeInspeccion = NonNullable<InspeccionPlanta["trozas"]>;

/** El conteo que manda el equipo, clavado a la foto del libro de la inspección. */
export function conteoDeLaInspeccion(
  c: ConteoPatio,
  i: Pick<InspeccionPlanta, "fecha" | "inspector" | "libro">,
): ConteoPatio {
  return {
    ...c,
    fecha: i.fecha,
    iniciadoEn: i.libro.tomadaEn,
    quien: (c.quien.trim() || i.inspector).slice(0, 120),
    trozas: i.libro.trozasDelPatio ?? [],
    fotoEn: i.libro.tomadaEn,
    truncado: Boolean(i.libro.trozasDelPatioTruncado),
  };
}

/** Las cuentas del acta de un conteo, como las devuelve `ForestPatioConteoDB` (`ResumenActaConteo`). */
export interface CuentasDelActa {
  esperadas: number;
  contadas: number;
  /** = esperadas − contadas (las esperadas que no se escanearon). */
  faltan: number;
  /** Escaneadas que el libro da por fuera del patio (bloqueadas o salidas al contar). */
  sobrantes: number;
  /** Códigos que no son de ninguna troza. */
  sorpresas?: number;
  m3Esperado: number | null;
  m3Contado: number | null;
}

/**
 * El resumen de trozas que guarda la inspección. «Sobrantes» = todo lo que se
 * escaneó y el libro dice que NO está en el patio: piezas bloqueadas
 * (consumidas, despachadas…), las que salieron mientras se contaba y los
 * códigos que no son de ninguna troza. El acta del patio los muestra juntos
 * («Sobran: el libro dice que no están»), y una etiqueta que no es de ninguna
 * troza es justo lo que una inspección tiene que ver.
 */
export function trozasDeResumen(a: CuentasDelActa): TrozasDeInspeccion {
  return {
    esperadas: a.esperadas,
    contadas: a.contadas,
    m3Esperado: a.m3Esperado,
    m3Contado: a.m3Contado,
    faltantes: a.faltan,
    sobrantes: a.sobrantes + (a.sorpresas ?? 0),
  };
}

/**
 * Lo mismo, directo de un conteo: `actaParaGuardar` (→ `resumirConteo`, la
 * cuenta del acta del patio) y las mismas cuentas que guarda la base. Nunca
 * sumado a mano.
 */
export function trozasDeConteo(c: ConteoPatio): TrozasDeInspeccion {
  const a = actaParaGuardar(c);
  return trozasDeResumen({
    esperadas: a.esperadas,
    contadas: a.contadas,
    faltan: a.faltantes.length,
    sobrantes: a.sobrantes.length,
    sorpresas: a.sorpresas.length,
    m3Esperado: a.m3Esperado,
    m3Contado: a.m3Contado,
  });
}
