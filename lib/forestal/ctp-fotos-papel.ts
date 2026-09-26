"use client";

/**
 * La hoja «Fotos de la carga» del Documento de la guía (ADR-434, 2026-09-26).
 *
 * Va como ÚLTIMA hoja del visor, después de la GTF y su lista de trozas, y no
 * pegada adentro de la GTF: la GTF es la reproducción de un formato oficial y no
 * se le agregan secciones propias. Así el papel que se le muestra al
 * fiscalizador trae la guía tal cual y, aparte, la evidencia del CTP.
 *
 * Hasta 6 fotos, de a dos por renglón. Cada renglón es un bloque propio para que
 * `paginar()` pueda cortar la hoja ENTRE renglones y nunca una foto al medio.
 * La imagen va con `object-fit: contain` —nunca `cover`—: la franja del sello
 * vive en el borde de abajo y recortarla borraría justo lo que prueba la foto.
 *
 * Las URLs van ABSOLUTAS: las privadas son `/api/admin/forestal/fotos/ver?p=…`
 * y el documento se dibuja en un iframe `srcdoc`, se baja como HTML y se
 * fotografía para el PDF. Con el dominio adelante, las tres lo resuelven igual.
 */

import { cabeceraDoc, documentoHtml, esc, notaDoc, tituloDoc } from "./ctp-documento-print";
import type { HojaDeIngreso } from "./ctp-documentos-ingreso";
import { srcDeFoto, type FotoCarga } from "./fotos-carga";
import { coordenadasDelSello, hrefAbsolutoDeFoto, pieDeFoto } from "./sello-foto";

/** Cuántas entran al papel: más ya es un álbum, y el álbum vive en el libro. */
export const MAX_FOTOS_EN_PAPEL = 6;

const CSS_FOTOS = `
.fc-fila{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin:0 0 4mm;break-inside:avoid;page-break-inside:avoid}
.fc-foto{margin:0;border:0.3mm solid #b8b8b8;border-radius:1.5mm;overflow:hidden;background:#fff}
.fc-foto img{display:block;width:100%;height:66mm;object-fit:contain;background:#f2f2f2}
.fc-foto figcaption{padding:1.6mm 2mm;font-size:8pt;line-height:1.35;color:#111}
.fc-foto figcaption b{font-weight:700}
.fc-foto figcaption .fc-tenue{color:#555}
`;

/** El pie de una foto en el papel: cuándo y quién, dónde, y si la imagen trae el sello. */
function pieHtml(f: FotoCarga, n: number): string {
  const conDatos = Boolean(f.tomadaEn || f.subidaEn || f.por);
  if (!conDatos) {
    return `<b>Foto ${n}</b> · <span class="fc-tenue">anterior al sello: sin fecha ni lugar registrados</span>`;
  }
  const donde = coordenadasDelSello(f.lat, f.lng, f.precisionM);
  return [
    `<b>Foto ${n}</b> · ${esc(pieDeFoto(f))}`,
    `<br><span class="fc-tenue">${donde ? `Lugar: ${esc(donde)}` : "Sin ubicación registrada"}${
      f.sellada ? " · sello en la imagen" : ""
    }</span>`,
  ].join("");
}

export interface DatosHojaFotos {
  gtf: string;
  /** Titular o proveedor: encabeza la hoja como en la GTF. */
  emisor: string;
  fotos: readonly FotoCarga[];
  logo?: string | null;
  /** Dominio del panel (tests); en el navegador sale de `window.location`. */
  origen?: string | null;
}

/** La hoja, o `undefined` si la guía no tiene fotos (una hoja vacía haría pensar que se perdieron). */
export function hojaFotosDeLaCarga(d: DatosHojaFotos): HojaDeIngreso | undefined {
  if (d.fotos.length === 0) return undefined;
  const van = d.fotos.slice(0, MAX_FOTOS_EN_PAPEL);
  const resto = d.fotos.length - van.length;

  const figuras = van.map(
    (f, i) => `<figure class="fc-foto">
      <img src="${esc(hrefAbsolutoDeFoto(srcDeFoto(f), d.origen))}" alt="Foto ${i + 1} de la carga de la GTF ${esc(d.gtf)}" />
      <figcaption>${pieHtml(f, i + 1)}</figcaption>
    </figure>`,
  );
  const filas: string[] = [];
  for (let i = 0; i < figuras.length; i += 2) {
    filas.push(`<div class="fc-fila">${figuras.slice(i, i + 2).join("")}</div>`);
  }

  const pie = `Fotos de la carga · GTF ${d.gtf} · Libro de Operaciones del CTP`;
  const cuerpo = [
    cabeceraDoc({ emisor: d.emisor, logo: d.logo, tipo: "Fotos de la carga", numero: d.gtf, numeroNota: "N° de GTF" }),
    tituloDoc(
      "Fotos de la carga",
      `${d.fotos.length} foto${d.fotos.length === 1 ? "" : "s"} tomada${d.fotos.length === 1 ? "" : "s"} al recibir la madera`,
    ),
    ...filas,
    notaDoc(
      `Fecha y hora en hora de Lima. La franja al pie de cada imagen se grabó al sacar la foto, con la ubicación del teléfono si la dio.${
        resto > 0 ? ` Hay ${resto} foto${resto === 1 ? "" : "s"} más en el libro.` : ""
      }`,
    ),
  ].join("");

  return {
    nombre: "Fotos de la carga",
    archivo: `Fotos de la carga GTF ${d.gtf}`,
    etiqueta: `${d.fotos.length} foto(s) con sello`,
    pieCorrido: pie,
    html: documentoHtml({ titulo: `Fotos de la carga GTF ${d.gtf}`, css: CSS_FOTOS, cuerpo, pieCorrido: pie }),
  };
}
