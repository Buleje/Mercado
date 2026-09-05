/**
 * guia-descuadre.ts — cuando la GTF no cuadra CONSIGO MISMA (ADR-353).
 *
 * Una GTF trae el mismo volumen dos veces: en la cabecera de productos
 * (casillero 37, por especie) y en la lista de trozas (casillero 35, por pieza).
 * Los dos tienen que dar lo mismo. **No siempre dan lo mismo.**
 *
 * Caso real, verificado contra la consulta pública de SERFOR el 2026-08-06
 * (GTF 019-0000016 y 019-0000013 del tenant de Blas):
 *
 *   cabecera:  Mashonaste · 2 piezas · 4.161 m³
 *   lista:     117/B cant 1 → 2.118    20/A cant 3 → 6.129   = 4 piezas · 8.247 m³
 *
 * La fila `20/A` figura con **cantidad 3** y su volumen es exactamente 3× el de
 * una troza de esas medidas. Con esa fila contada como UNA, la lista suma
 * 16.617 — que es, clavado, el «TOTAL VOLUMEN» que declara el mismo documento.
 * Es decir: el papel se contradice, y su propio total dice de qué lado.
 *
 * Esto NO se puede resolver solo. Lo que sí se puede es **verlo al importar** en
 * vez de descubrirlo tres pantallas después, cuando el consumo choca contra I2 y
 * el operador cree que se equivocó él.
 *
 * PURO y client-safe: lo usan el importador (aviso), el acta de consumo
 * (mensaje) y el modal de cuadre (propuesta).
 */

import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Un litro. La misma tolerancia que el resto del libro: el aserradero mide con
 *  cinta, no con epsilon de punto flotante. */
export const TOLERANCIA_M3 = 0.001;

const r4 = (n: number) => Number(n.toFixed(4));

/** Una fila de la lista de trozas (35), en lo que este cruce necesita de ella. */
export interface FilaDeLista {
  /** El id en la base, cuando la fila ya está guardada (el modal lo necesita). */
  id?: string;
  codificacion: string | null;
  cantidad: number | null;
  volumenM3: number | null;
}

/** La fila que explica la brecha, con lo que habría que dejarle. */
export interface FilaSospechosa {
  id?: string;
  codificacion: string | null;
  cantidad: number;
  volumenM3: number;
  /** Lo que mide UNA troza de esa fila: `volumen / cantidad`. */
  unitarioM3: number;
}

export interface DescuadreDeGuia {
  especie: string | null;
  /** Casillero 37: lo que declara la cabecera del producto. */
  declaradoM3: number;
  /** Casillero 35: lo que suman las filas de la lista. */
  listaM3: number;
  /** `lista − cabecera`. Positivo = la lista trae DE MÁS. */
  brechaM3: number;
  piezasDeclaradas: number | null;
  piezasEnLista: number;
  /**
   * La fila cuya cantidad explica TODA la brecha: si figura con 3 y valiera 1,
   * los dos lados cierran. `null` cuando ninguna sola fila la explica — ahí no
   * se propone nada, porque adivinar cuál corregir sería inventar el dato.
   */
  sospechosa: FilaSospechosa | null;
}

/**
 * Cruza la cabecera de una especie contra sus filas de la lista.
 * Devuelve `null` cuando cuadran (que es lo normal).
 */
export function descuadreDeEspecie(input: {
  especie: string | null;
  declaradoM3: number | null;
  piezasDeclaradas?: number | null;
  filas: readonly FilaDeLista[];
}): DescuadreDeGuia | null {
  const declarado = input.declaradoM3;
  if (declarado == null || declarado <= 0 || input.filas.length === 0) return null;

  const listaM3 = r4(input.filas.reduce((a, f) => a + Number(f.volumenM3 ?? 0), 0));
  if (listaM3 <= 0) return null;

  const brechaM3 = r4(listaM3 - declarado);
  if (Math.abs(brechaM3) <= TOLERANCIA_M3) return null;

  return {
    especie: input.especie,
    declaradoM3: r4(declarado),
    listaM3,
    brechaM3,
    piezasDeclaradas: input.piezasDeclaradas ?? null,
    piezasEnLista: input.filas.reduce((a, f) => a + Math.max(1, Math.round(f.cantidad ?? 1)), 0),
    sospechosa: filaQueExplica(input.filas, brechaM3),
  };
}

/**
 * ¿Hay UNA fila que, contada como una sola troza, cierra la brecha?
 *
 * Es el patrón que publica SERFOR cuando la lista y la cabecera no coinciden:
 * la fila lleva `cantidad = N` y `volumen = N × unitario`, y la cabecera contó
 * una. `(N − 1) × unitario` tiene que dar la brecha exacta.
 *
 * Si hay más de una candidata no se elige ninguna: dos explicaciones posibles
 * es lo mismo que ninguna, y acá no se adivina.
 */
export function filaQueExplica(
  filas: readonly FilaDeLista[],
  brechaM3: number,
): FilaSospechosa | null {
  if (brechaM3 <= 0) return null;
  const candidatas = filas.filter((f) => {
    const cant = Math.round(f.cantidad ?? 1);
    const vol = Number(f.volumenM3 ?? 0);
    if (cant <= 1 || vol <= 0) return false;
    return Math.abs(vol - vol / cant - brechaM3) <= TOLERANCIA_M3;
  });
  if (candidatas.length !== 1) return null;

  const f = candidatas[0];
  const cantidad = Math.round(f.cantidad ?? 1);
  const volumenM3 = Number(f.volumenM3 ?? 0);
  return {
    id: f.id,
    codificacion: f.codificacion,
    cantidad,
    volumenM3: r4(volumenM3),
    unitarioM3: r4(volumenM3 / cantidad),
  };
}

/**
 * Los dos arreglos posibles, con los números ya hechos. El operador elige cuál
 * de los dos testigos del papel vale; el sistema no elige por él.
 */
export type PropuestaDeCuadre =
  | {
      lado: "cabecera";
      /** Dejar la fila sospechosa en una sola troza. */
      troza: { id?: string; codificacion: string | null; cantidad: number; volumenM3: number };
      resumen: string;
    }
  | {
      lado: "lista";
      /** Subir el ingreso a lo que suman sus piezas. */
      volumeM3: number;
      pieces: number;
      resumen: string;
    };

export function propuestasDeCuadre(d: DescuadreDeGuia): PropuestaDeCuadre[] {
  const opciones: PropuestaDeCuadre[] = [];

  if (d.sospechosa) {
    const s = d.sospechosa;
    opciones.push({
      lado: "cabecera",
      troza: { id: s.id, codificacion: s.codificacion, cantidad: 1, volumenM3: s.unitarioM3 },
      resumen:
        `La pieza ${s.codificacion ?? "—"} pasa de ${s.cantidad} trozas · ${fmtM3(s.volumenM3)} m³ ` +
        `a 1 troza · ${fmtM3(s.unitarioM3)} m³.`,
    });
  }

  // Subir el ingreso sólo tiene sentido si la lista trae de MÁS. Si trae de
  // menos, el ingreso pasaría a declarar menos que su propio documento.
  if (d.brechaM3 > 0) {
    opciones.push({
      lado: "lista",
      volumeM3: d.listaM3,
      pieces: d.piezasEnLista,
      resumen:
        `El ingreso pasa de ${fmtM3(d.declaradoM3)} m³ a ${fmtM3(d.listaM3)} m³ ` +
        `(${d.piezasEnLista} piezas).`,
    });
  }

  return opciones;
}

/** El descuadre contado como se lo cuenta a una persona. */
export function explicarDescuadre(d: DescuadreDeGuia, gtfNumber?: string | null): string {
  const guia = gtfNumber ? `La guía ${gtfNumber}` : "La guía";
  const especie = d.especie ? ` de ${d.especie}` : "";
  const base =
    `${guia} declara ${fmtM3(d.declaradoM3)} m³${especie} en su cabecera, ` +
    `pero su lista de trozas suma ${fmtM3(d.listaM3)} m³.`;
  if (!d.sospechosa) return `${base} El documento no cuadra consigo mismo: revisalo antes de seguir.`;
  const s = d.sospechosa;
  return (
    `${base} La pieza ${s.codificacion ?? "—"} figura con cantidad ${s.cantidad} ` +
    `(${fmtM3(s.volumenM3)} m³, ${fmtM3(s.unitarioM3)} m³ cada una): contándola como una sola, los dos lados cierran.`
  );
}
