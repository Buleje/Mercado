/**
 * gtf-matricial-pantalla — lo que el diseñador «Imprimir en talonario» dibuja
 * SÓLO en pantalla, sacado de los mismos datos que se imprimen:
 *
 *   · `encabezadoDelTalonario`: el recuadro de la imprenta (titular, RUC,
 *     título habilitante, ubicación) y el (1) serie + N° de la hoja, para que
 *     el formato dibujado debajo de los valores sea el talonario de ESA guía.
 *     Lo que no se sabe queda vacío: el dibujo pone su texto por defecto, no
 *     se inventa nada.
 *   · `revisarEncaje`: los valores que no entran en su renglón ni achicando
 *     la letra hasta 6 pt (en la hoja salen en amarillo: en el papel pisan al
 *     vecino) y los que entran achicados (`encajarValor`, la misma cuenta del
 *     papel). `camposQueNoEntran` = sólo los amarillos.
 *
 * PURO y client-safe. Nada de esto viaja al papel (`gtf-matricial-print`).
 */

import { casillerosGtf } from "./ctp-gtf-formato";
import type { EntradasGuiaLoth } from "./loth-guia-print";
import type { EncabezadoTalonario } from "./gtf-talonario-plantilla";
import { type CatalogoFormato, type DisposicionHoja, type FormatoTalonario } from "./gtf-matricial-disposicion";
import type { PaginaTalonario } from "./gtf-matricial-valores";
import { claveElemento } from "./gtf-matricial-edicion";
import { anchoParaEntrar, encajarValor } from "./gtf-salida-geometria";

const limpio = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** «019-001-0000771» → serie «19» y N° «0000771»; sin guiones, sólo el N°. */
export function serieYNumero(crudo: string): { serie?: string; numero?: string } {
  const s = limpio(crudo);
  if (!s) return {};
  const partes = s.split(/\s*-\s*/).filter(Boolean);
  if (partes.length < 2) return { numero: s };
  const serie = /^\d+$/.test(partes[0]) ? String(Number(partes[0])) : partes[0];
  return { serie, numero: partes[partes.length - 1] };
}

/** El N° como lo trae la imprenta: seis cifras como mínimo («6» → «000006»). */
const folio = (n: string | undefined): string | undefined => (n && /^\d+$/.test(n) && n.length < 6 ? n.padStart(6, "0") : n);

/**
 * El encabezado del talonario de la hoja que se ve. `titular`: el del talonario
 * que el modal ya muestra (el de la guía); si no hay, el (7) de la guía.
 */
export function encabezadoDelTalonario(
  formato: FormatoTalonario,
  e: EntradasGuiaLoth,
  pagina: PaginaTalonario | undefined,
  titular?: string | null,
): EncabezadoTalonario {
  const v = casillerosGtf(e.cuerpo);
  const nombre = limpio(titular) || limpio(v["7"]);
  /* El RUC del titular: el de la lista (propietario = el titular), el de la ficha, o el del (13) si el propietario es el mismo titular. */
  const mismoQueTitular = !!v["13"] && limpio(v["13"]).toUpperCase() === limpio(v["7"]).toUpperCase();
  const ruc = limpio(e.lista.ruc) || limpio(e.cuerpo.ficha?.ruc) || (mismoQueTitular ? limpio(v["15"]) : "");
  const ubicacion = [v["12"], v["11"], v["10"]].map(limpio).filter(Boolean).join(" - ");
  const guia = serieYNumero(e.cuerpo.numeroGtf);
  let numero = guia.numero;
  if (formato === "lista") {
    /* Una guía sin N° de lista propio imprime el de la guía en la lista: eso no es el N° de la hoja, queda el de fábrica. */
    const n = limpio(pagina?.campos.numero);
    numero = n && n !== limpio(e.cuerpo.numeroGtf) ? serieYNumero(n).numero : undefined;
  }
  return {
    ...(nombre && { titular: nombre }),
    ...(ruc && { ruc }),
    ...(limpio(v["6"]) && { titulo: limpio(v["6"]) }),
    ...(ubicacion && { ubicacion }),
    ...(guia.serie && { serie: guia.serie }),
    ...(numero && { numero: folio(numero) }),
  };
}

/** Un valor que no entra en su renglón (o que entra achicado): la clave del elemento en la hoja, su rótulo y lo que dice. */
export interface NoEntra {
  clave: string;
  etiqueta: string;
  texto: string;
  /** La letra con la que sale (achicado: menor que la del renglón). */
  letraPt: number;
  /** El ancho que le haría falta para entrar a la letra más chica (6 pt). */
  necesitaMm: number;
}

export interface RevisionEncaje {
  /** No entran ni achicados (o «Encajar» apagado): amarillo, pisan al vecino. */
  noEntran: NoEntra[];
  /** Entran porque se les achicó la letra. */
  achicados: NoEntra[];
}

/**
 * Cómo sale cada valor de la hoja que se ve: los campos visibles y, de la
 * tabla, cada columna por su fila más larga (se marca su primera fila, la que
 * se acomoda: las demás comparten su ancho y, en monoespaciada, si la más
 * larga entra, entran todas). Un campo de varios renglones nunca es amarillo:
 * se parte a propósito. La hoja pinta exactamente estos.
 */
export function revisarEncaje(hoja: DisposicionHoja, cat: CatalogoFormato, pagina: PaginaTalonario | undefined): RevisionEncaje {
  const r: RevisionEncaje = { noEntran: [], achicados: [] };
  if (!pagina) return r;
  const anotar = (clave: string, etiqueta: string, texto: string, ancho: number, letra: number, modo: { varias?: boolean; encajar?: boolean }) => {
    const e = encajarValor(texto, ancho, letra, modo);
    const item = { clave, etiqueta, texto, letraPt: e.letraPt, necesitaMm: anchoParaEntrar(texto) };
    if (e.noEntra) r.noEntran.push(item);
    else if (e.achicado) r.achicados.push(item);
  };
  for (const c of cat.campos) {
    const pos = hoja.campos[c.id];
    const texto = (pagina.campos[c.id] ?? "").trim();
    if (pos?.visible && texto) anotar(claveElemento({ tipo: "campo", id: c.id }), c.label, texto, pos.anchoMm, pos.letraPt, pos);
  }
  const filas = pagina.filas.slice(0, hoja.tabla.maxFilas);
  for (const c of cat.columnas) {
    const pos = hoja.tabla.columnas[c.id];
    if (!pos?.visible) continue;
    const texto = filas.map((f) => (f[c.id] ?? "").trim()).reduce((a, b) => (b.length > a.length ? b : a), "");
    if (texto) anotar(claveElemento({ tipo: "columna", id: c.id }), c.label, texto, pos.anchoMm, hoja.tabla.letraPt, { encajar: pos.encajar });
  }
  return r;
}

/** Sólo los amarillos: lo que ni achicado entra en su renglón. */
export const camposQueNoEntran = (hoja: DisposicionHoja, cat: CatalogoFormato, pagina: PaginaTalonario | undefined): NoEntra[] =>
  revisarEncaje(hoja, cat, pagina).noEntran;
