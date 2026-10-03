/**
 * anexo04-partir.ts — parte lo que está en la vista previa del ANEXO N° 04 en
 * un anexo por tipo (o por especie), para bajarlos juntos en UN PDF
 * (Brandon, 2026-10-03: «para sacar Comercial y Larga angosta por separado,
 * filtras y descargas dos veces; con esto un botón saca un PDF por tipo»).
 *
 * Recibe las filas YA filtradas y en el formato elegido (`filasPapel` del
 * modal): partir no vuelve a filtrar ni a sumar, sólo reparte. Cada fila cae
 * en exactamente una parte, así que Σ piezas, Σ PT y Σ m³ de las partes son
 * los del anexo entero — y como un bloque impreso es especie + tipo, partir
 * por tipo o por especie no corta ningún bloque: cada parte imprime los mismos
 * bloques que tenía en el anexo entero.
 *
 * PURO: sin React (lo consume `Anexo04PorTipo`).
 */
import type { PiezaCubicada } from "./cubicacion";
import { especieDelAnexo } from "./anexo04-serfor";
import { especieLegible } from "./anexo04-vista";
import { ordenTipo, tipoDePieza, type TipoComercial } from "./cubicacion-tipo";

export type CriterioParte = "tipo" | "especie";

export interface ParteAnexo {
  /** El tipo o la especie del bloque (MAYÚSCULA, como se imprime). */
  clave: string;
  /** «Comercial», «Tornillo»: para el aviso y el nombre del archivo. */
  rotulo: string;
  piezas: PiezaCubicada[];
  totalPiezas: number;
  totalPt: number;
  totalM3: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * Las partes, en el orden en que se imprimen: tipos en su orden canónico
 * (Comercial primero), especies como aparecen en el lote (el mismo orden de
 * los bloques). Una parte vacía no existe.
 */
export function partirAnexo(filas: readonly PiezaCubicada[], criterio: CriterioParte, especieGlobal?: string): ParteAnexo[] {
  const grupos = new Map<string, PiezaCubicada[]>();
  for (const r of filas) {
    const clave = criterio === "tipo" ? tipoDePieza(r) : especieDelAnexo(r, especieGlobal);
    const g = grupos.get(clave);
    if (g) g.push(r);
    else grupos.set(clave, [r]);
  }
  const partes = [...grupos.entries()].map(([clave, piezas]): ParteAnexo => ({
    clave,
    rotulo: criterio === "tipo" ? clave : especieLegible(clave),
    piezas,
    totalPiezas: piezas.reduce((a, r) => a + r.cantidad, 0),
    totalPt: r2(piezas.reduce((a, r) => a + r.pieTablar, 0)),
    totalM3: r4(piezas.reduce((a, r) => a + r.m3, 0)),
  }));
  if (criterio === "tipo") partes.sort((a, b) => ordenTipo(a.clave as TipoComercial) - ordenTipo(b.clave as TipoComercial));
  return partes;
}

/** «anexos-04-por-tipo-0012345-2026-10-03.pdf»: identificable por GTF si la cargaron. */
export function nombrePdfPartido(criterio: CriterioParte, gtf: string, hoy = new Date().toISOString().slice(0, 10)): string {
  const g = gtf.replace(/[^\w-]+/g, "");
  return `anexos-04-por-${criterio}${g ? `-${g}` : ""}-${hoy}.pdf`;
}
