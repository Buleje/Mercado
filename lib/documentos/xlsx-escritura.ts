/**
 * xlsx-escritura — guardar los cambios DENTRO del .xlsx original.
 *
 * POR QUÉ NO SE REGENERA EL ARCHIVO
 *
 * Lo natural sería leer la planilla, armar una nueva con la librería y subirla.
 * El problema es lo que la librería no entiende: gráficos, tablas dinámicas,
 * formato condicional, validaciones, imágenes, macros, la configuración de
 * impresión. Todo eso desaparecería en silencio, y el usuario se enteraría el
 * día que abra el archivo para presentarlo.
 *
 * Acá se hace cirugía: se abre el zip del .xlsx, se busca la hoja, y se cambia
 * ÚNICAMENTE el `<c>` de cada celda editada. Una celda que no se tocó sale
 * byte por byte igual que entró, y todo lo demás del paquete ni se abre.
 *
 * Mismo criterio que el editor de documentos de Word (`texto-docx.ts`).
 */

import type JSZipType from "jszip";
import { numeroALetra } from "./xlsx-formato";

const NS_SS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Una celda editada: fila y columna en base 1, y el valor nuevo como texto. */
export interface CambioCelda {
  hoja: number;
  fila: number;
  columna: number;
  valor: string;
}

/** Abre el paquete .xlsx conservándolo entero. */
export async function abrirPaquete(datos: ArrayBuffer): Promise<JSZipType> {
  const JSZip = (await import("jszip")).default;
  return JSZip.loadAsync(datos);
}

/**
 * Nombre de archivo de cada hoja, EN EL ORDEN EN QUE APARECEN EN EXCEL.
 *
 * No alcanza con asumir `sheet1.xml`, `sheet2.xml`…: el orden de los archivos
 * no tiene por qué coincidir con el de las pestañas (pasa cuando se reordenan
 * o se borran hojas). El orden real vive en `workbook.xml` y la ruta de cada
 * una se resuelve por su relación `r:id`.
 */
export async function rutasDeHojas(zip: JSZipType): Promise<string[]> {
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wbXml || !relsXml) throw new Error("El archivo no parece un .xlsx válido.");

  const rels = new Map<string, string>();
  const relsDoc = new DOMParser().parseFromString(relsXml, "application/xml");
  const nodosRel = relsDoc.getElementsByTagName("Relationship");
  for (let i = 0; i < nodosRel.length; i++) {
    const r = nodosRel[i];
    const id = r.getAttribute("Id");
    const target = r.getAttribute("Target");
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }

  const wbDoc = new DOMParser().parseFromString(wbXml, "application/xml");
  const sheets = wbDoc.getElementsByTagNameNS(NS_SS, "sheet");
  const rutas: string[] = [];
  for (let i = 0; i < sheets.length; i++) {
    const rid = sheets[i].getAttributeNS(NS_REL, "id") ?? sheets[i].getAttribute("r:id");
    const destino = rid ? rels.get(rid) : undefined;
    rutas.push(destino ? `xl/${destino}` : `xl/worksheets/sheet${i + 1}.xml`);
  }
  return rutas;
}

/** ¿El texto representa un número? (mismo criterio que ve el usuario). */
function comoNumero(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return null;
  // Los códigos con cero adelante son texto: "007" no es 7.
  if (/^0\d+$/.test(t)) return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  // Convención peruana: "1.234,56".
  if (/^-?[\d.]+,\d+$/.test(t)) {
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Inserta un hijo respetando el orden por referencia de celda/fila. */
function insertarOrdenado(padre: Element, nuevo: Element, clave: (el: Element) => number): void {
  const valor = clave(nuevo);
  for (let i = 0; i < padre.children.length; i++) {
    if (clave(padre.children[i]) > valor) {
      padre.insertBefore(nuevo, padre.children[i]);
      return;
    }
  }
  padre.appendChild(nuevo);
}

function numeroDeFila(row: Element): number {
  return Number(row.getAttribute("r")) || 0;
}

function columnaDeCelda(c: Element): number {
  const ref = c.getAttribute("r") ?? "";
  const letras = /^([A-Z]+)/.exec(ref)?.[1] ?? "";
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * Escribe un valor en una celda del XML de la hoja, conservando su estilo.
 *
 * El texto se guarda como `inlineStr` a propósito: la alternativa es agregarlo
 * a `sharedStrings.xml`, que obliga a reescribir ese archivo y recalcular sus
 * contadores. `inlineStr` es parte del estándar, Excel lo abre igual y no toca
 * nada más del paquete.
 */
function escribirCelda(doc: XMLDocument, sheetData: Element, fila: number, columna: number, valor: string): void {
  const ref = `${numeroALetra(columna)}${fila}`;

  let row: Element | null = null;
  const rows = sheetData.getElementsByTagNameNS(NS_SS, "row");
  for (let i = 0; i < rows.length; i++) {
    if (numeroDeFila(rows[i]) === fila) { row = rows[i]; break; }
  }
  if (!row) {
    row = doc.createElementNS(NS_SS, "row");
    row.setAttribute("r", String(fila));
    insertarOrdenado(sheetData, row, numeroDeFila);
  }

  let celda: Element | null = null;
  for (let i = 0; i < row.children.length; i++) {
    if (row.children[i].getAttribute("r") === ref) { celda = row.children[i]; break; }
  }
  if (!celda) {
    celda = doc.createElementNS(NS_SS, "c");
    celda.setAttribute("r", ref);
    insertarOrdenado(row, celda, columnaDeCelda);
  }

  // Se conserva `s` (el estilo de la celda) y se descarta el resto del
  // contenido: valor viejo, fórmula y tipo.
  while (celda.firstChild) celda.removeChild(celda.firstChild);
  celda.removeAttribute("t");

  if (valor === "") return; // celda vacía: sin hijos, con su estilo intacto

  const numero = comoNumero(valor);
  if (numero !== null) {
    const v = doc.createElementNS(NS_SS, "v");
    v.textContent = String(numero);
    celda.appendChild(v);
    return;
  }

  celda.setAttribute("t", "inlineStr");
  const is = doc.createElementNS(NS_SS, "is");
  const t = doc.createElementNS(NS_SS, "t");
  t.setAttribute("xml:space", "preserve");
  t.textContent = valor;
  is.appendChild(t);
  celda.appendChild(is);
}

/**
 * Marca el libro para que Excel recalcule al abrirlo.
 *
 * Si se pisa una celda de la que dependen fórmulas, los resultados guardados
 * quedan viejos. `fullCalcOnLoad` hace que Excel los rehaga solo; y se elimina
 * `calcChain.xml`, que es un índice de dependencias que queda inconsistente y
 * hace que Excel avise de "contenido ilegible".
 */
async function forzarRecalculo(zip: JSZipType): Promise<void> {
  zip.remove("xl/calcChain.xml");

  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  if (!wbXml) return;
  const doc = new DOMParser().parseFromString(wbXml, "application/xml");
  const wb = doc.documentElement;
  let calcPr = doc.getElementsByTagNameNS(NS_SS, "calcPr")[0] as Element | undefined;
  if (!calcPr) {
    calcPr = doc.createElementNS(NS_SS, "calcPr");
    wb.appendChild(calcPr);
  }
  calcPr.setAttribute("fullCalcOnLoad", "1");
  zip.file("xl/workbook.xml", new XMLSerializer().serializeToString(doc));
}

/**
 * Aplica los cambios al paquete y devuelve el .xlsx listo para subir.
 *
 * Sólo se reescriben los XML de las hojas que tuvieron cambios.
 */
export async function guardarCambios(zip: JSZipType, cambios: CambioCelda[]): Promise<Blob> {
  if (cambios.length === 0) {
    return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  }

  const rutas = await rutasDeHojas(zip);
  const porHoja = new Map<number, CambioCelda[]>();
  for (const c of cambios) {
    const lista = porHoja.get(c.hoja) ?? [];
    lista.push(c);
    porHoja.set(c.hoja, lista);
  }

  for (const [indice, lista] of porHoja) {
    const ruta = rutas[indice];
    const xml = ruta ? await zip.file(ruta)?.async("string") : undefined;
    if (!xml) continue;

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) {
      throw new Error(`No se pudo leer la hoja ${indice + 1} del archivo.`);
    }
    let sheetData = doc.getElementsByTagNameNS(NS_SS, "sheetData")[0] as Element | undefined;
    if (!sheetData) {
      sheetData = doc.createElementNS(NS_SS, "sheetData");
      doc.documentElement.appendChild(sheetData);
    }
    for (const c of lista) escribirCelda(doc, sheetData, c.fila, c.columna, c.valor);
    zip.file(ruta, new XMLSerializer().serializeToString(doc));
  }

  await forzarRecalculo(zip);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
  });
}
