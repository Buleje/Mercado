/**
 * odf — leer .ods y .odt (LibreOffice / OpenOffice) para la vista previa.
 *
 * En Perú media contabilidad chica corre sobre LibreOffice: la planilla del mes
 * llega en .ods y el contrato en .odt. Hasta ahora el drive los guardaba pero
 * mostraba "sin vista previa", así que había que bajarlos igual.
 *
 * Es SÓLO LECTURA a propósito. El editor de planillas guarda en xlsx y el de
 * texto reescribe el .docx original tramo por tramo (ver `texto-docx.ts`);
 * aplicar eso a un ODF sería reescribir un formato distinto y devolver un
 * archivo que LibreOffice abre peor que el original. Mejor mostrarlo bien y
 * dejar que se edite donde corresponde.
 *
 * ⚠️ La trampa del formato: ODF comprime repeticiones. Una fila con 3 celdas
 * vacías no guarda 3 celdas, guarda una con `table:number-columns-repeated="3"`
 * — y al final de cada fila suele haber un repeat de 1000+ para "llenar" la
 * hoja. Expandir eso a lo bruto genera millones de celdas vacías y cuelga la
 * pestaña; por eso se recorta (ver TOPE_REPETICION).
 */

import type { HojaDatos } from "./hoja-calculo";
import type { BloqueTexto, DocumentoTexto } from "./texto-docx";

/** Lo mínimo de JSZip que hace falta acá. */
export interface ZipOdf {
  file(nombre: string): { async(tipo: "string"): Promise<string> } | null;
}

/**
 * Tope de expansión de un `repeated`. Las hojas de LibreOffice cierran cada
 * fila con `table:number-columns-repeated="16384"`: expandirlo tal cual son
 * 16.000 celdas vacías por fila.
 */
const TOPE_REPETICION = 200;

export function esOds(mimeType?: string | null, nombre?: string | null): boolean {
  const m = (mimeType ?? "").toLowerCase();
  const n = (nombre ?? "").toLowerCase();
  return m.includes("opendocument.spreadsheet") || n.endsWith(".ods");
}

export function esOdt(mimeType?: string | null, nombre?: string | null): boolean {
  const m = (mimeType ?? "").toLowerCase();
  const n = (nombre ?? "").toLowerCase();
  return m.includes("opendocument.text") || n.endsWith(".odt");
}

/** Atributo de un tag abierto, sin depender de DOMParser (esto corre en cualquier lado). */
function attr(tag: string, nombre: string): string | null {
  const m = new RegExp(`${nombre}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

function repeticiones(tag: string, nombre: string): number {
  const v = Number(attr(tag, nombre) ?? "1");
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(v, TOPE_REPETICION);
}

/** Texto visible de un fragmento XML: sin etiquetas y con las entidades resueltas. */
function texto(xml: string): string {
  return xml
    .replace(/<text:s\/>/g, " ")
    .replace(/<text:s\s+text:c="(\d+)"\/>/g, (_, n) => " ".repeat(Math.min(Number(n), 40)))
    .replace(/<text:tab\/>/g, "\t")
    .replace(/<text:line-break\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .trim();
}

/** Quita las columnas y filas vacías del final: son relleno del formato. */
function podar(filas: string[][]): string[][] {
  const recortada = filas.map((f) => {
    let fin = f.length;
    while (fin > 0 && f[fin - 1] === "") fin--;
    return f.slice(0, fin);
  });
  let ultima = recortada.length;
  while (ultima > 0 && recortada[ultima - 1].length === 0) ultima--;
  return recortada.slice(0, ultima);
}

/**
 * Las hojas de un .ods. Cada `<table:table>` es una hoja; adentro filas y
 * celdas, ambas con su repetición.
 */
export function parsearOds(contentXml: string): HojaDatos[] {
  const hojas: HojaDatos[] = [];
  // Se parte por tabla en vez de usar un parser XML: es una pasada lineal y
  // aguanta los content.xml de varios MB sin construir un árbol entero.
  const tablas = contentXml.split(/<table:table(?=[\s>])/).slice(1);

  for (const bruto of tablas) {
    const cierre = bruto.indexOf(">");
    const nombre = attr(bruto.slice(0, cierre + 1), "table:name") ?? `Hoja ${hojas.length + 1}`;
    const cuerpo = bruto.slice(cierre + 1);
    let tieneFormulas = false;
    const filas: string[][] = [];

    for (const filaBruta of cuerpo.split(/<table:table-row(?=[\s>])/).slice(1)) {
      const finTag = filaBruta.indexOf(">");
      const tagFila = filaBruta.slice(0, finTag + 1);
      const contenidoFila = filaBruta.slice(finTag + 1).split("</table:table-row>")[0];

      const celdas: string[] = [];
      for (const celdaBruta of contenidoFila.split(/<table:(?:covered-)?table-cell(?=[\s>])/).slice(1)) {
        const fin = celdaBruta.indexOf(">");
        const tagCelda = celdaBruta.slice(0, fin + 1);
        if (attr(tagCelda, "table:formula")) tieneFormulas = true;
        // Celda vacía: `<table:table-cell/>` cierra en el mismo tag.
        const valor = tagCelda.endsWith("/>")
          ? (attr(tagCelda, "office:value") ?? "")
          : texto(celdaBruta.slice(fin + 1).split("</table:table-cell>")[0]);
        const veces = repeticiones(tagCelda, "table:number-columns-repeated");
        for (let i = 0; i < veces; i++) celdas.push(valor);
      }

      const vecesFila = repeticiones(tagFila, "table:number-rows-repeated");
      // Una fila vacía repetida 1000 veces es relleno: se guarda una sola.
      const repetirFila = celdas.some((c) => c !== "") ? vecesFila : 1;
      for (let i = 0; i < repetirFila; i++) filas.push([...celdas]);
    }

    hojas.push({ nombre, filas: podar(filas), tieneFormulas });
  }
  return hojas;
}

/** Los párrafos de un .odt, en el mismo modelo que usa el visor de texto. */
export function parsearOdt(contentXml: string): BloqueTexto[] {
  const cuerpo = contentXml.split("<office:text")[1] ?? contentXml;
  const bloques: BloqueTexto[] = [];
  // `text:h` son títulos (con nivel), `text:p` párrafos y `text:list` listas.
  const re = /<text:(h|p)(\s[^>]*)?>([\s\S]*?)<\/text:\1>/g;

  for (const m of cuerpo.matchAll(re)) {
    const [, etiqueta, atributos = "", interior] = m;
    const contenido = texto(interior);
    if (!contenido) continue;
    const nivel = Number(attr(atributos, "text:outline-level") ?? "1");
    const estilo = (attr(atributos, "text:style-name") ?? "").toLowerCase();
    bloques.push({
      id: bloques.length,
      tipo: etiqueta === "h" ? (nivel <= 1 ? "titulo" : "subtitulo") : /list/.test(estilo) ? "lista" : "parrafo",
      texto: contenido,
      // ODF guarda el formato en estilos aparte: no se puede afirmar negrita
      // mirando el párrafo, y decir que no la tiene es más honesto que inventar.
      negrita: false,
      cursiva: false,
      formatoMixto: false,
      enTabla: false,
    });
  }
  return bloques;
}

/** Abre un .ods desde el zip ya cargado. */
export async function leerOds(zip: ZipOdf): Promise<HojaDatos[]> {
  const xml = await zip.file("content.xml")?.async("string");
  if (!xml) throw new Error("El archivo no tiene contenido (¿es un .ods válido?).");
  return parsearOds(xml);
}

/** Abre un .odt desde el zip ya cargado. */
export async function leerOdt(zip: ZipOdf): Promise<DocumentoTexto> {
  const xml = await zip.file("content.xml")?.async("string");
  if (!xml) throw new Error("El archivo no tiene contenido (¿es un .odt válido?).");
  return { bloques: parsearOdt(xml), formato: "plano" };
}
