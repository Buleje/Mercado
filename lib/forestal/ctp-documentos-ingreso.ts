"use client";

/**
 * ctp-documentos-ingreso.ts — los papeles de UN ingreso, en un solo lugar.
 *
 * La GTF y su lista de trozas se arman en tres lados: el visor de la pestaña
 * Ingresos, el legajo y el archivado automático al validar. Si cada uno las
 * compone por su cuenta, el papel que se mira y el que se archiva empiezan a
 * ser distintos —basta que uno sume un dato al encabezado— y en un expediente
 * eso es exactamente lo que no puede pasar.
 *
 * Devuelve `null` cuando el ingreso no trae la ficha de SERFOR: sin ella no hay
 * guía que reproducir, y un papel en blanco con membrete es peor que ninguno.
 */

import { documentoHtml } from "./ctp-documento-print";
import { CSS_GTF_SERFOR, documentoGtfSerfor, trozasDesdeSerfor } from "./ctp-gtf-desde-serfor";
import { CSS_GTF_OFICIAL, fechaGtf } from "./ctp-gtf-formato";
import { CSS_LISTA_TROZAS, htmlListaTrozas } from "./ctp-lista-trozas";
import type { GtfSerfor } from "./serfor-gtf";

/** Lo mínimo del ingreso que hace falta para encabezar sus papeles. */
export interface IngresoConGuia {
  serforGtf?: unknown;
  gtfNumber: string;
  providerName: string;
  /** Para etiquetar y describir el archivo en el Drive. */
  libroNro?: number | null;
  entryDate?: string;
  volumeM3?: string;
  speciesCommonName?: string;
}

/**
 * Con qué se guarda el papel en el expediente. Vive acá y no en cada pantalla
 * porque una guía archivada al validar y la misma archivada a mano tienen que
 * quedar con las mismas etiquetas — si no, la mitad no aparece al buscar.
 */
export function metaArchivado(e: IngresoConGuia, nombreDoc: string): {
  etiquetas: string[];
  descripcion: string;
} {
  const g = (e.serforGtf ?? null) as GtfSerfor | null;
  const numero = g?.gtfNumber ?? e.gtfNumber;
  return {
    etiquetas: [
      "forestal",
      nombreDoc.startsWith("GTF") ? "GTF" : "lista de trozas",
      numero,
      e.providerName,
      e.speciesCommonName,
    ].filter((t): t is string => Boolean(t && t.trim())),
    descripcion:
      `${nombreDoc} — ${g?.titular ?? e.providerName}. ` +
      `Ingreso al libro N° ${e.libroNro ?? "s/n"}${e.entryDate ? ` del ${e.entryDate.slice(0, 10)}` : ""}` +
      `${e.volumeM3 ? `, ${e.volumeM3} m³` : ""}${e.speciesCommonName ? ` de ${e.speciesCommonName}` : ""}.`,
  };
}

export interface HojaDeIngreso {
  /** Rótulo corto para la pestaña del visor. */
  nombre: string;
  /** Nombre del archivo al bajar o archivar (lleva el N° de guía). */
  archivo: string;
  etiqueta: string;
  pieCorrido: string;
  html: string;
}

export interface PapelesDeIngreso {
  gtf: HojaDeIngreso;
  /** Sólo si la guía trae trozas: una lista vacía haría pensar que se perdió. */
  lista?: HojaDeIngreso;
  guia: GtfSerfor;
  trozas: number;
}

export function papelesDeIngreso(
  e: IngresoConGuia,
  opts: { impresoEl?: string } = {},
): PapelesDeIngreso | null {
  if (!e.serforGtf) return null;
  const g = e.serforGtf as GtfSerfor;
  const numero = g.gtfNumber ?? e.gtfNumber;
  const trozas = trozasDesdeSerfor(g);

  const pieGtf = `GTF ${numero} · Reproducción del registro público del SNIFFS · Libro de Operaciones del CTP`;
  const gtf: HojaDeIngreso = {
    nombre: `GTF ${numero}`,
    archivo: `GTF ${numero}`,
    etiqueta: "Guía de Transporte Forestal",
    pieCorrido: pieGtf,
    html: documentoHtml({
      titulo: `GTF ${numero}`,
      css: CSS_GTF_OFICIAL + CSS_GTF_SERFOR,
      cuerpo: documentoGtfSerfor(g, opts),
      pieCorrido: pieGtf,
    }),
  };

  if (trozas.length === 0) return { gtf, guia: g, trozas: 0 };

  const nroLista = g.listaTrozas ?? numero;
  const pieLista = `Lista de trozas N° ${nroLista} · Anexo de la GTF ${numero}`;
  const lista: HojaDeIngreso = {
    nombre: "Lista de trozas",
    archivo: `Lista de trozas ${nroLista}`,
    etiqueta: `${trozas.length} pieza(s) · anexo del (35)`,
    pieCorrido: pieLista,
    html: documentoHtml({
      titulo: `Lista de trozas ${nroLista}`,
      css: CSS_LISTA_TROZAS,
      cuerpo: htmlListaTrozas({
        titular: g.titular ?? e.providerName,
        subtitulo: g.gtfNumber ? `Guía ${g.gtfNumber}` : undefined,
        ubicacion: [g.distrito, g.provincia, g.departamento].filter(Boolean).join(" · "),
        numero: nroLista,
        guia: g.gtfNumber ?? undefined,
        fecha: fechaGtf(g.fechaExpedicion),
        trozas,
      }),
      pieCorrido: pieLista,
    }),
  };

  return { gtf, lista, guia: g, trozas: trozas.length };
}
