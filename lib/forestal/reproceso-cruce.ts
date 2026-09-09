/**
 * reproceso-cruce.ts — «esto que la distribución sugiere, ¿ya lo declaré?»
 *
 * La sugerencia de reproceso (ADR-404) y el reproceso declarado (ADR-316) son
 * dos pantallas de la misma madera, y hasta ahora no se hablaban en esta
 * dirección: la distribución seguía ofreciendo «comercial → paquetería larga
 * 0.637 m³» aunque el Libro ya lo tuviera registrado esa mañana. El operario
 * sólo podía acordarse — y acordarse mal es declarar dos veces (Brandon,
 * 2026-09-09).
 *
 * Acá se cruza por **especie + tipo de origen + tipo de destino**, que es lo
 * único que las dos puntas comparten: la sugerencia no conoce corridas y el
 * Libro no conoce bloques del cubicador.
 *
 * ## Lo que NO hace, a propósito
 *
 * No marca la fila como hecha ni la esconde. Un par declarado hace un mes puede
 * no tener nada que ver con la distribución de hoy, así que se muestra **con su
 * fecha y su m³** y la decisión sigue siendo del operario. Esconder una fila
 * por un cruce aproximado es como declarar de menos sin darse cuenta.
 *
 * PURO: recibe lo que la API ya devolvió.
 */
import { analizarReproceso, type ReprocesoDeclarado } from "./reprocesos-declarados";

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Lo que el Libro ya tiene de un par especie·origen→destino. */
export interface DeclaradoDelPar {
  /** Suma de lo que entró a la sierra para ese par. */
  m3: number;
  /** Cuántos asientos lo declaran. */
  veces: number;
  /** El más reciente (ISO date-only, se formatea con `timeZone: "UTC"`). */
  ultimaFecha: string | null;
}

/** Sin tildes ni mayúsculas: «TORNILLO» y «Tornillo» son la misma madera. */
const norma = (v: string | null | undefined): string =>
  (v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** La clave del cruce. Misma función en las dos puntas o el cruce no cruza nada. */
export function claveDeConversion(
  especie: string | null | undefined,
  desdeTipo: string | null | undefined,
  haciaTipo: string | null | undefined,
): string {
  return `${norma(especie)}|${norma(desdeTipo)}|${norma(haciaTipo)}`;
}

/**
 * Lo declarado, indexado por par — para preguntarle a cada fila de la
 * sugerencia si el Libro ya la tiene.
 *
 * Las conversiones salen de `analizarReproceso`, que ya junta las corridas de
 * origen por par: dos comerciales que alimentaron la misma paquetería son UNA
 * conversión de la suma, no dos.
 */
export function cruzarReprocesosDeclarados(
  reprocesos: readonly ReprocesoDeclarado[],
): Map<string, DeclaradoDelPar> {
  const mapa = new Map<string, DeclaradoDelPar>();
  for (const r of reprocesos) {
    const { conversiones } = analizarReproceso(r);
    for (const c of conversiones) {
      if (!(c.cantidad > 0)) continue;
      const k = claveDeConversion(r.especie, c.desde, c.hacia);
      const prev = mapa.get(k);
      const fecha = (r.fecha ?? "").slice(0, 10) || null;
      if (prev) {
        prev.m3 = r4(prev.m3 + c.cantidad);
        prev.veces += 1;
        if (fecha && (!prev.ultimaFecha || fecha > prev.ultimaFecha)) prev.ultimaFecha = fecha;
      } else {
        mapa.set(k, { m3: r4(c.cantidad), veces: 1, ultimaFecha: fecha });
      }
    }
  }
  return mapa;
}

/** Qué tanto de lo sugerido ya está declarado, para decirlo en una línea. */
export type EstadoDeclarado = "sin-declarar" | "parcial" | "cubierto";

/**
 * Compara lo declarado contra lo sugerido con la tolerancia del patio (10
 * litros): declarar 0.637 y haber registrado 0.630 es el mismo reproceso medido
 * con otra cinta, no uno a medias.
 */
export function estadoDeclarado(sugeridoM3: number, declaradoM3: number): EstadoDeclarado {
  if (!(declaradoM3 > 0)) return "sin-declarar";
  return declaradoM3 + 0.01 >= sugeridoM3 ? "cubierto" : "parcial";
}
