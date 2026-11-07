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
  /**
   * Lo que SALIÓ del reproceso para ese par — el número comparable con la
   * sugerencia.
   *
   * 🚨 No es lo que entró. Un reproceso siempre pierde madera (el corte, el
   * recorte, el aserrín): comparar los 0.700 m³ que volvieron a la sierra
   * contra los 0.637 m³ que el bloque ampara marcaba «declarado de MÁS» en
   * TODOS los reprocesos sanos. Se vio en pantalla al declarar uno de verdad
   * (2026-09-09) — los fixtures, con merma cero, no lo mostraban.
   */
  m3: number;
  /** Lo que volvió a la sierra para ese par. `entro − m3` es la merma. */
  entroM3: number;
  /**
   * `true` cuando el asiento mezcla VARIOS pares y lo que salió se repartió
   * entre ellos en proporción a lo que entró. Es un derivado, no un dato del
   * Libro: se dice, no se presenta como declarado.
   */
  repartido: boolean;
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
    const { conversiones, entro, salio } = analizarReproceso(r);
    /* Lo que salió es UNO por asiento (la corrida destino). Con un solo par va
       entero; con varios se reparte en proporción a lo que entró por cada uno
       —es lo único que el Libro deja saber— y queda marcado como repartido. */
    const varios = conversiones.length > 1;
    for (const c of conversiones) {
      if (!(c.cantidad > 0)) continue;
      const parte = entro > 0 ? c.cantidad / entro : 0;
      const salioDelPar = r4(varios ? salio * parte : salio);
      const k = claveDeConversion(r.especie, c.desde, c.hacia);
      const prev = mapa.get(k);
      const fecha = (r.fecha ?? "").slice(0, 10) || null;
      if (prev) {
        prev.m3 = r4(prev.m3 + salioDelPar);
        prev.entroM3 = r4(prev.entroM3 + c.cantidad);
        prev.repartido = prev.repartido || varios;
        prev.veces += 1;
        if (fecha && (!prev.ultimaFecha || fecha > prev.ultimaFecha)) prev.ultimaFecha = fecha;
      } else {
        mapa.set(k, {
          m3: salioDelPar,
          entroM3: r4(c.cantidad),
          repartido: varios,
          veces: 1,
          ultimaFecha: fecha,
        });
      }
    }
  }
  return mapa;
}

/** Qué tanto de lo sugerido ya está declarado, para decirlo en una línea. */
export type EstadoDeclarado = "sin-declarar" | "parcial" | "cubierto" | "de-mas";

/** La tolerancia del patio: 10 litros es lo más fino que mide una cinta. */
const TOL_M3 = 0.01;
/**
 * A partir de acá «declaró de más» deja de ser redondeo.
 *
 * Es el mismo piso con el que se SUGIERE un reproceso (`MINIMO_SUGERIBLE_M3`):
 * media tabla. Por debajo, marcar en rojo una diferencia que nadie puede medir
 * enseña a ignorar la marca.
 */
const MARGEN_DE_MAS_M3 = 0.05;

/**
 * Compara lo declarado contra lo sugerido con la tolerancia del patio (10
 * litros): declarar 0.637 y haber registrado 0.630 es el mismo reproceso medido
 * con otra cinta, no uno a medias.
 *
 * `de-mas` es un **aviso, no un error**: el Libro puede tener declarado más de
 * lo que este bloque ampara porque ese par se reprocesó también en otro lote
 * del mes. Pero también es la firma de un asiento cargado dos veces, y eso no
 * se ve mirando la lista — por eso se marca y se dicen los dos números
 * (Brandon, 2026-09-09).
 */
export function estadoDeclarado(sugeridoM3: number, declaradoM3: number): EstadoDeclarado {
  if (!(declaradoM3 > 0)) return "sin-declarar";
  if (declaradoM3 > sugeridoM3 + MARGEN_DE_MAS_M3) return "de-mas";
  return declaradoM3 + TOL_M3 >= sugeridoM3 ? "cubierto" : "parcial";
}
