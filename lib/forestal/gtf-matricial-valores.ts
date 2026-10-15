/**
 * gtf-matricial-valores — QUÉ se imprime en el talonario de la matricial, hoja
 * por hoja. Los valores NO se recalculan: salen de la misma entrada que arma
 * «Imprimir hoja SERFOR» (`entradasGuiaLoth` / `entradaGtfLoth`) y de los
 * mismos formateadores del papel A4 (`casillerosGtf`, `detalleGtf`,
 * `celdasTroza`). Un casillero vacío queda vacío y no se imprime.
 *
 * Paginado:
 *   · guía: una hoja; si el detalle (37) pasa de las filas del talonario,
 *     sigue en otra con los mismos casilleros y el total sólo en la última;
 *   · lista: cada lista de SERFOR (20 trozas, `partirEnHojas`) con su N°; si
 *     el talonario entra menos filas, la lista sigue en otra hoja y su total
 *     va en la última hoja de ESA lista. Una hoja nunca mezcla dos listas.
 */

import { casillerosGtf, detalleGtf, fechaGtf } from "./ctp-gtf-formato";
import { leerGtfDatos } from "./ctp-gtf-datos";
import { celdasTroza, piezasListadas, totalListado } from "./ctp-lista-trozas";
import { listaDeTrozas, piezasDeItems } from "./loth-guia-despacho";
import { entradaGtfLoth, type LothGtfCaratula, type LothGtfDoc } from "./loth-gtf-oficial";
import { entradasGuiaLoth, hojasDeLaLista, type EntradasGuiaLoth } from "./loth-guia-print";
import { partirEnHojas } from "./loth-lista-numero";
import { ORIGENES_TALONARIO, type DisposicionHoja, type FormatoTalonario, type SeparadorFecha } from "./gtf-matricial-disposicion";

/** Una hoja del talonario: el valor de cada campo y las filas de su tabla (por id de columna). */
export interface PaginaTalonario {
  campos: Record<string, string>;
  filas: Record<string, string>[];
}

/**
 * Las entradas de la guía, por el MISMO camino que «Imprimir hoja SERFOR»
 * (`usePapelesGtf`): con `gtfDatos` la hoja de la guía del bosque; sin ellos la
 * de casilleros con la carátula del libro (y la lista sale de sus ítems).
 */
export function entradasDeLaGuia(doc: LothGtfDoc, caratula: LothGtfCaratula | null): EntradasGuiaLoth {
  const piezas = piezasDeItems(doc.items);
  if (doc.gtfDatos) {
    return entradasGuiaLoth({
      gtfNumber: doc.gtfNumber,
      gtfDate: (doc.gtfDate ?? "").slice(0, 10),
      titular: doc.titularName ?? "",
      datos: leerGtfDatos(doc.gtfDatos),
      piezas,
    });
  }
  const cuerpo = entradaGtfLoth(doc, caratula);
  const filas = listaDeTrozas(piezas);
  return {
    cuerpo,
    filas,
    listas: hojasDeLaLista(cuerpo.datos, doc.gtfNumber, filas.length),
    lista: {
      titular: cuerpo.ficha.razonSocial || (doc.titularName ?? ""),
      ubicacion: [cuerpo.ficha.distrito, cuerpo.ficha.provincia, cuerpo.ficha.region].filter(Boolean).join(" · "),
      ruc: cuerpo.ficha.ruc || undefined,
      guia: doc.gtfNumber.trim(),
      fecha: fechaGtf(cuerpo.fechaExpedicion),
      observaciones: "",
    },
  };
}

/** `DD.MM.YYYY` (el del papel A4) con el separador del talonario, y sus tres partes. */
function fechaPartida(f: string, sep: SeparadorFecha): { entera: string; d: string; m: string; a: string } {
  const [d = "", m = "", a = ""] = f ? f.split(".") : [];
  return { entera: f ? [d, m, a].join(sep) : "", d, m, a };
}

/** Trozos de `n` filas; siempre al menos uno (una hoja sin filas también se imprime). */
function enTrozos<T>(filas: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  const paso = Math.max(1, Math.trunc(n));
  for (let i = 0; i < filas.length; i += paso) out.push(filas.slice(i, i + paso));
  return out.length ? out : [[]];
}

export function paginasGuia(e: EntradasGuiaLoth, hoja: DisposicionHoja): PaginaTalonario[] {
  const v = casillerosGtf(e.cuerpo);
  const campos: Record<string, string> = { numero: e.cuerpo.numeroGtf.trim() };
  for (const [id, valor] of Object.entries(v)) if (id !== "5") campos[id] = valor;
  for (const n of ["3", "4"] as const) {
    const f = fechaPartida(v[n], hoja.separadorFecha);
    Object.assign(campos, { [n]: f.entera, [`${n}d`]: f.d, [`${n}m`]: f.m, [`${n}a`]: f.a });
  }
  for (const o of ORIGENES_TALONARIO) campos[`5:${o.clave}`] = v["5"] === o.clave ? "X" : "";
  const det = detalleGtf(e.cuerpo.lineas);
  const hojas = enTrozos(det.filas, hoja.tabla.maxFilas);
  return hojas.map((filas, i) => ({
    campos: { ...campos, "37t": i === hojas.length - 1 && det.filas.length > 0 ? det.total : "" },
    filas: filas.map((f) => ({ ...f })),
  }));
}

export function paginasLista(e: EntradasGuiaLoth, hoja: DisposicionHoja): PaginaTalonario[] {
  const f = fechaPartida(e.lista.fecha ?? "", hoja.separadorFecha);
  const base: Record<string, string> = {
    titular: e.lista.titular ?? "",
    subtitulo: e.lista.subtitulo ?? "",
    ubicacion: e.lista.ubicacion ?? "",
    ruc: e.lista.ruc ?? "",
    guia: e.lista.guia ?? "",
    fecha: f.entera,
    fechad: f.d,
    fecham: f.m,
    fechaa: f.a,
    obs: e.lista.observaciones ?? "",
  };
  const listas = partirEnHojas(e.filas);
  const paginas: PaginaTalonario[] = [];
  (listas.length ? listas : [[]]).forEach((trozas, li) => {
    /* El N° de fila arranca en 1 en cada lista, como en el papel A4. */
    const filas = trozas.map((t, n) => {
      const c = celdasTroza(t);
      return {
        n: String(n + 1),
        cientifico: t.especieCientifica ?? "",
        comun: t.especieComun ?? "",
        producto: t.producto ?? "",
        codigo: t.codificacion ?? "",
        d1: c.d1, d2: c.d2, largo: c.largo, cant: c.cant, vol: c.vol,
      };
    });
    const trozos = enTrozos(filas, hoja.tabla.maxFilas);
    const hay = trozas.length > 0;
    trozos.forEach((trozo, ti) => {
      const ultima = ti === trozos.length - 1;
      paginas.push({
        campos: {
          ...base,
          numero: e.listas.numeros[li] ?? e.listas.casillero35,
          totPiezas: ultima && hay ? String(piezasListadas(trozas)) : "",
          totVol: ultima && hay ? totalListado(trozas).toFixed(3) : "",
        },
        filas: trozo,
      });
    });
  });
  return paginas;
}

export const paginasDe = (formato: FormatoTalonario, e: EntradasGuiaLoth, hoja: DisposicionHoja): PaginaTalonario[] =>
  formato === "guia" ? paginasGuia(e, hoja) : paginasLista(e, hoja);
