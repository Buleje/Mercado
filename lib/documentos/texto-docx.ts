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
  /** Formato UNIFORME del párrafo (el del primer tramo con texto). */
  negrita: boolean;
  cursiva: boolean;
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

/**
 * ¿Se puede LEER en el visor de texto? Suma .odt, que se muestra pero no se
 * edita: la edición reescribe el .docx original tramo por tramo y un ODF es
 * otro formato — guardarlo desde acá lo empeoraría.
 */
export function esTextoLegible(mimeType: string | null | undefined, nombre?: string | null): boolean {
  if (esTextoEditable(mimeType, nombre)) return true;
  const m = (mimeType ?? "").toLowerCase();
  const n = (nombre ?? "").toLowerCase();
  return m.includes("opendocument.text") || n.endsWith(".odt");
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

/** Negrita/cursiva del primer tramo con texto — el formato "del párrafo". */
function formatoDeParrafo(p: Element): { negrita: boolean; cursiva: boolean } {
  const run = hijosPorNombre(p, "r").find((r) => r.getElementsByTagNameNS(W, "t").length > 0);
  const rPr = run ? primerHijo(run, "rPr") : null;
  const activo = (nombre: string) => {
    if (!rPr) return false;
    const el = primerHijo(rPr, nombre);
    if (!el) return false;
    // `<w:b w:val="0"/>` es negrita APAGADA, no prendida.
    const val = el.getAttributeNS(W, "val") ?? el.getAttribute("w:val");
    return val !== "0" && val !== "false" && val !== "none";
  };
  return { negrita: activo("b"), cursiva: activo("i") };
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
      ...formatoDeParrafo(p),
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
      negrita: false,
      cursiva: false,
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
 *
 * @returns el run nuevo, por si hay que ajustarle el formato.
 */
function reescribirParrafo(doc: XMLDocument, p: Element, texto: string): Element {
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
  return run;
}

/** Prende o apaga negrita/cursiva en el `rPr` de un run. */
function fijarFormatoRun(doc: XMLDocument, run: Element, negrita: boolean, cursiva: boolean): void {
  let rPr = primerHijo(run, "rPr");
  if (!rPr) {
    if (!negrita && !cursiva) return;
    rPr = doc.createElementNS(W, "w:rPr");
    run.insertBefore(rPr, run.firstChild); // rPr va PRIMERO dentro del run
  }
  // En orden i, luego b (cada uno al frente): quedan b,i como pide el esquema.
  for (const [nombre, activo] of [["i", cursiva], ["b", negrita]] as const) {
    const el = primerHijo(rPr, nombre);
    if (activo) {
      if (el) { el.removeAttribute("w:val"); } // limpiar un posible val="0"
      else rPr.insertBefore(doc.createElementNS(W, `w:${nombre}`), rPr.firstChild);
    } else if (el) {
      rPr.removeChild(el);
    }
  }
}

/** Estilo de párrafo según el tipo elegido en el editor. */
function fijarTipo(doc: XMLDocument, p: Element, tipo: BloqueTexto["tipo"]): void {
  const estilo = tipo === "titulo" ? "Heading1" : tipo === "subtitulo" ? "Heading2" : null;
  let pPr = primerHijo(p, "pPr");
  if (!pPr && !estilo) return;
  if (!pPr) {
    pPr = doc.createElementNS(W, "w:pPr");
    p.insertBefore(pPr, p.firstChild); // pPr debe ser el primer hijo del párrafo
  }
  const pStyle = primerHijo(pPr, "pStyle");
  if (estilo) {
    if (pStyle) {
      pStyle.setAttributeNS(W, "w:val", estilo);
    } else {
      const nuevo = doc.createElementNS(W, "w:pStyle");
      nuevo.setAttributeNS(W, "w:val", estilo);
      pPr.insertBefore(nuevo, pPr.firstChild); // pStyle va primero dentro de pPr
    }
  } else if (pStyle) {
    pPr.removeChild(pStyle);
  }
  // Si dejó de ser lista, la viñeta/numeración se va con el tipo.
  if (tipo !== "lista") {
    const numPr = primerHijo(pPr, "numPr");
    if (numPr) pPr.removeChild(numPr);
  }
}

/**
 * Guarda los cambios en el .docx original.
 *
 * Sólo se tocan los párrafos cuyo texto cambió respecto de `originales`; los
 * agregados heredan el formato del bloque anterior, y al final el CUERPO se
 * re-encadena en el orden del editor — así insertar en el medio o mover un
 * párrafo queda en el archivo tal como se ve en pantalla. Una tabla viaja
 * entera (sus párrafos no se reordenan por dentro); todo lo demás del zip
 * sale idéntico.
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
  const previos = new Map(originales.map((b) => [b.id, b]));
  const vivos = new Set(bloques.map((b) => b.id));

  // 1) Reescrituras: bloques existentes cuyo texto, tipo o formato cambió.
  for (const b of bloques) {
    const p = parrafos[b.id];
    const previo = previos.get(b.id);
    if (!p || !previo) continue;
    const cambio = previo.texto !== b.texto || previo.tipo !== b.tipo
      || previo.negrita !== b.negrita || previo.cursiva !== b.cursiva;
    if (!cambio) continue;
    const run = reescribirParrafo(doc, p, b.texto);
    if (previo.negrita !== b.negrita || previo.cursiva !== b.cursiva) {
      fijarFormatoRun(doc, run, b.negrita, b.cursiva);
    }
    if (previo.tipo !== b.tipo) fijarTipo(doc, p, b.tipo);
  }

  // 2) Altas: cada bloque nuevo clona el párrafo del bloque ANTERIOR en el
  //    editor (o el último del documento) para heredar la fuente y el estilo.
  const nuevos = new Map<number, Element>();
  for (let i = 0; i < bloques.length; i++) {
    const b = bloques[i];
    if (parrafos[b.id]) continue;
    let modelo: Element | undefined;
    for (let j = i - 1; j >= 0; j--) {
      const candidato = parrafos[bloques[j].id];
      if (candidato) { modelo = candidato; break; }
    }
    modelo = modelo ?? parrafos[parrafos.length - 1];
    const nuevo = modelo ? (modelo.cloneNode(true) as Element) : doc.createElementNS(W, "w:p");
    const run = reescribirParrafo(doc, nuevo, b.texto);
    if (b.negrita || b.cursiva) fijarFormatoRun(doc, run, b.negrita, b.cursiva);
    fijarTipo(doc, nuevo, b.tipo);
    nuevos.set(b.id, nuevo);
  }

  // 3) Bajas.
  for (let i = 0; i < parrafos.length; i++) {
    if (previos.has(i) && !vivos.has(i)) parrafos[i].parentNode?.removeChild(parrafos[i]);
  }

  // 4) Orden del cuerpo. Se recorre el orden del editor re-encadenando los
  //    nodos de PRIMER NIVEL: un párrafo suelto es él mismo; uno de tabla, su
  //    tabla entera (que aparece una sola vez, cuando toca su primer párrafo).
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (body) {
    const topDe = (el: Element): Element => {
      let n: Element = el;
      while (n.parentElement && n.parentElement !== body) n = n.parentElement;
      return n;
    };
    let anterior: Element | null = null;
    for (const b of bloques) {
      const propio = nuevos.get(b.id);
      const existente = parrafos[b.id];
      if (!propio && !existente) continue;
      const top = propio ?? topDe(existente!);
      if (top === anterior) continue; // otro párrafo de la misma tabla
      if (anterior) {
        if (anterior.nextElementSibling !== top) body.insertBefore(top, anterior.nextSibling);
      } else if (body.firstElementChild !== top) {
        body.insertBefore(top, body.firstElementChild);
      }
      anterior = top;
    }
    // `sectPr` (márgenes y tamaño de hoja) tiene que quedar SIEMPRE último
    // dentro del body, o Word da el archivo por corrupto.
    const sectPr = primerHijo(body, "sectPr");
    if (sectPr) body.appendChild(sectPr);
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
