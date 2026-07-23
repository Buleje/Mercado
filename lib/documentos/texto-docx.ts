/**
 * texto-docx — leer y reescribir documentos de texto del drive (.docx, .txt, .md).
 *
 * ESTRATEGIA (y por qué no se usa una librería de conversión):
 *
 * Un .docx es un zip de XML. Las librerías tipo mammoth lo convierten a HTML y
 * después hay que RECONSTRUIR el .docx desde cero — y en esa reconstrucción se
 * pierde todo lo que el editor no entendió: encabezados, pies, numeración,
 * márgenes, la plantilla de la empresa.
 *
 * Acá se hace al revés: se conserva el ARCHIVO ORIGINAL entero y sólo se
 * reemplaza el texto de los párrafos que el usuario efectivamente tocó, dentro
 * del mismo `word/document.xml`. Un párrafo que no se editó sale byte por byte
 * igual que entró. Es lo que hace que un contrato siga pareciendo el contrato.
 *
 * LÍMITE HONESTO: la edición es a nivel PÁRRAFO. Si un párrafo mezcla formatos
 * (una palabra en negrita en medio de la frase) y se lo edita, el párrafo queda
 * con el formato de su primer tramo. Por eso el editor marca esos párrafos
 * antes de que el usuario los toque. Imágenes, tablas, encabezados y estilos
 * quedan intactos porque no se los toca.
 */

import type JSZipType from "jszip";

/** Extensiones que el editor de texto puede abrir. */
export const MIMES_TEXTO = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "text/markdown",
] as const;

export type FormatoTexto = "docx" | "plano";

export interface BloqueTexto {
  /** Posición del párrafo en el documento — su identidad al reescribir. */
  id: number;
  tipo: "titulo" | "subtitulo" | "parrafo" | "lista";
  texto: string;
  /**
   * true si el párrafo mezcla varios formatos: editarlo unifica el formato.
   * El editor lo avisa en vez de sorprender al usuario después.
   */
  formatoMixto: boolean;
  /** Los párrafos dentro de una tabla se muestran pero no se reordenan. */
  enTabla: boolean;
}

/** ¿Este documento se puede abrir en el editor de texto? */
export function esTextoEditable(mimeType: string | null | undefined, nombre?: string | null): boolean {
  const m = (mimeType ?? "").toLowerCase();
  if ((MIMES_TEXTO as readonly string[]).includes(m)) return true;
  const n = (nombre ?? "").toLowerCase();
  return n.endsWith(".docx") || n.endsWith(".txt") || n.endsWith(".md");
}

export function formatoTextoDe(mimeType: string | null | undefined, nombre?: string | null): FormatoTexto {
  const m = (mimeType ?? "").toLowerCase();
  const n = (nombre ?? "").toLowerCase();
  if (m.includes("wordprocessingml") || n.endsWith(".docx")) return "docx";
  return "plano";
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Texto visible de un `<w:p>`: los `<w:t>` más tabs y saltos de línea. */
function textoDeParrafo(p: Element): string {
  let out = "";
  const nodos = p.getElementsByTagNameNS(W, "*");
  for (let i = 0; i < nodos.length; i++) {
    const n = nodos[i];
    if (n.localName === "t") out += n.textContent ?? "";
    else if (n.localName === "tab") out += "\t";
    else if (n.localName === "br" || n.localName === "cr") out += "\n";
  }
  return out;
}

function primerHijo(el: Element, nombre: string): Element | null {
  for (let i = 0; i < el.children.length; i++) {
    if (el.children[i].localName === nombre) return el.children[i];
  }
  return null;
}

function hijosPorNombre(el: Element, nombre: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < el.children.length; i++) {
    if (el.children[i].localName === nombre) out.push(el.children[i]);
  }
  return out;
}

/** Estilo del párrafo → el tipo que muestra el editor. */
function tipoDeParrafo(p: Element): BloqueTexto["tipo"] {
  const pPr = primerHijo(p, "pPr");
  if (!pPr) return "parrafo";
  if (primerHijo(pPr, "numPr")) return "lista";

  const style = primerHijo(pPr, "pStyle")?.getAttributeNS(W, "val")
    ?? primerHijo(pPr, "pStyle")?.getAttribute("w:val")
    ?? "";
  const s = style.toLowerCase();
  if (s === "title" || s === "heading1" || s === "ttulo1" || s === "titulo1") return "titulo";
  if (s.startsWith("heading") || s.startsWith("titulo") || s.startsWith("ttulo")) return "subtitulo";
  if (s.includes("list")) return "lista";
  return "parrafo";
}

/** ¿El párrafo mezcla formatos? (más de un run con `rPr` distinto). */
function tieneFormatoMixto(p: Element): boolean {
  const runs = hijosPorNombre(p, "r").filter((r) => r.getElementsByTagNameNS(W, "t").length > 0);
  if (runs.length < 2) return false;
  const firma = (r: Element) => {
    const rPr = primerHijo(r, "rPr");
    return rPr ? rPr.innerHTML || new XMLSerializer().serializeToString(rPr) : "";
  };
  const primera = firma(runs[0]);
  return runs.some((r) => firma(r) !== primera);
}

function esDescendienteDeTabla(p: Element): boolean {
  let el: Element | null = p.parentElement;
  while (el) {
    if (el.localName === "tbl") return true;
    el = el.parentElement;
  }
  return false;
}

/** Documento abierto: los bloques para editar + el zip original para reescribir. */
export interface DocumentoTexto {
  bloques: BloqueTexto[];
  formato: FormatoTexto;
  /** Sólo en .docx — el paquete original, que se conserva al guardar. */
  zip?: JSZipType;
  /** Sólo en .docx — el XML del cuerpo, ya parseado. */
  doc?: XMLDocument;
}

/** Abre un .docx conservando el paquete original. */
export async function leerDocx(datos: ArrayBuffer): Promise<DocumentoTexto> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(datos);
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("El archivo no tiene cuerpo de documento (¿es un .docx válido?).");

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("No se pudo leer el contenido del documento.");
  }

  const parrafos = doc.getElementsByTagNameNS(W, "p");
  const bloques: BloqueTexto[] = [];
  for (let i = 0; i < parrafos.length; i++) {
    const p = parrafos[i];
    bloques.push({
      id: i,
      tipo: tipoDeParrafo(p),
      texto: textoDeParrafo(p),
      formatoMixto: tieneFormatoMixto(p),
      enTabla: esDescendienteDeTabla(p),
    });
  }
  return { bloques, formato: "docx", zip, doc };
}

/** Texto plano (.txt/.md) → bloques, uno por línea. */
export function leerPlano(texto: string): DocumentoTexto {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  return {
    formato: "plano",
    bloques: lineas.map((linea, i) => ({
      id: i,
      // En Markdown, `#` marca título: se refleja en el editor.
      tipo: /^#{2,}\s/.test(linea) ? "subtitulo" : /^#\s/.test(linea) ? "titulo" : /^\s*[-*+]\s/.test(linea) ? "lista" : "parrafo",
      texto: linea,
      formatoMixto: false,
      enTabla: false,
    })),
  };
}

export function generarPlano(bloques: BloqueTexto[]): string {
  return bloques.map((b) => b.texto).join("\n");
}

/**
 * Reemplaza el texto de un `<w:p>` conservando su formato de párrafo (`pPr`) y
 * el del primer tramo (`rPr`). Los saltos de línea vuelven a ser `<w:br/>`.
 */
function reescribirParrafo(doc: XMLDocument, p: Element, texto: string): void {
  const runs = hijosPorNombre(p, "r");
  const modelo = runs.find((r) => r.getElementsByTagNameNS(W, "t").length > 0) ?? runs[0] ?? null;
  const rPr = modelo ? primerHijo(modelo, "rPr") : null;

  // Fuera todos los tramos viejos; `pPr` y cualquier marca de revisión quedan.
  for (const r of runs) p.removeChild(r);

  const run = doc.createElementNS(W, "w:r");
  if (rPr) run.appendChild(rPr.cloneNode(true));

  // Un `<w:br/>` entre líneas; `xml:space="preserve"` para no perder espacios
  // al principio o al final (Word los recorta si falta).
  const lineas = texto.split("\n");
  lineas.forEach((linea, i) => {
    if (i > 0) run.appendChild(doc.createElementNS(W, "w:br"));
    const t = doc.createElementNS(W, "w:t");
    t.setAttribute("xml:space", "preserve");
    t.textContent = linea;
    run.appendChild(t);
  });

  p.appendChild(run);
}

/**
 * Guarda los cambios en el .docx original.
 *
 * Sólo se tocan los párrafos cuyo texto cambió respecto de `originales`: todo
 * lo demás —incluidos los otros archivos del zip— sale idéntico.
 */
export async function escribirDocx(
  documento: DocumentoTexto,
  bloques: BloqueTexto[],
  originales: BloqueTexto[],
): Promise<Blob> {
  const { zip, doc } = documento;
  if (!zip || !doc) throw new Error("Falta el documento original para guardar.");

  // Instantánea: `getElementsByTagNameNS` devuelve una lista VIVA, y agregar o
  // borrar párrafos mientras se la recorre corre los índices.
  const parrafos = Array.from(doc.getElementsByTagNameNS(W, "p"));
  const previos = new Map(originales.map((b) => [b.id, b.texto]));
  const vivos = new Set(bloques.map((b) => b.id));

  for (const b of bloques) {
    const p = parrafos[b.id];
    if (p) {
      if (previos.get(b.id) === b.texto) continue; // intacto: ni se lo mira
      reescribirParrafo(doc, p, b.texto);
      continue;
    }
    // Párrafo agregado en el editor: se clona el último para heredar su
    // formato (así el texto nuevo sale con la fuente del documento, no con la
    // de Word por defecto).
    const cuerpo = parrafos[parrafos.length - 1]?.parentNode
      ?? doc.getElementsByTagNameNS(W, "body")[0];
    if (!cuerpo) continue;
    const modelo = parrafos[parrafos.length - 1];
    const nuevo = modelo
      ? (modelo.cloneNode(true) as Element)
      : doc.createElementNS(W, "w:p");
    reescribirParrafo(doc, nuevo, b.texto);
    // `sectPr` (márgenes y tamaño de hoja) tiene que quedar SIEMPRE último
    // dentro del body, o Word da el archivo por corrupto.
    const sectPr = cuerpo.nodeType === 1 ? primerHijo(cuerpo as Element, "sectPr") : null;
    if (sectPr) cuerpo.insertBefore(nuevo, sectPr);
    else cuerpo.appendChild(nuevo);
  }

  // Párrafos eliminados en el editor.
  for (const p of parrafos) {
    const idx = parrafos.indexOf(p);
    if (previos.has(idx) && !vivos.has(idx)) p.parentNode?.removeChild(p);
  }

  const xml = new XMLSerializer().serializeToString(doc);
  zip.file("word/document.xml", xml);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    // DEFLATE: Word rechaza los paquetes sin comprimir de algunos generadores.
    compression: "DEFLATE",
  });
}
