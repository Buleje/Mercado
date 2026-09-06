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
import { aplicarFormato, STYLES_VACIO, type CambioFormato } from "./xlsx-estilos";
import {
  fijarAltoFila, fijarAnchoColumna, fijarCongelado, fijarVisibilidad,
  moverEstructura, moverFormulaCruzada, type Eje,
} from "./xlsx-estructura";

const NS_SS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

/** Una celda editada: fila y columna en base 1, y el valor nuevo como texto. */
export interface CambioCelda {
  hoja: number;
  fila: number;
  columna: number;
  valor: string;
}

/** Formato aplicado a una celda (barra de herramientas). */
export interface CambioEstilo {
  hoja: number;
  fila: number;
  columna: number;
  formato: CambioFormato;
}

/** Fila o columna insertada o eliminada. `delta` +1 inserta, -1 elimina. */
export interface CambioEstructura {
  hoja: number;
  eje: Eje;
  /** Posición en base 1. */
  indice: number;
  delta: 1 | -1;
}

/** Ancho de columna arrastrado por el usuario, en píxeles. */
export interface CambioAncho {
  hoja: number;
  /** Columna en base 1. */
  columna: number;
  anchoPx: number;
}

/** Celdas combinadas o separadas ("A1:C1"). */
export interface CambioCombinada {
  hoja: number;
  ref: string;
  modo: "agregar" | "quitar";
}

/** Alto de fila arrastrado, en píxeles. */
export interface CambioAltoFila {
  hoja: number;
  /** Fila en base 1. */
  fila: number;
  altoPx: number;
}

/** Fila o columna ocultada/mostrada. */
export interface CambioVisibilidad {
  hoja: number;
  eje: Eje;
  /** Posición en base 1. */
  indice: number;
  oculta: boolean;
}

/** Paneles congelados (0/0 descongela). El último del lote manda. */
export interface CambioCongelado {
  hoja: number;
  filas: number;
  columnas: number;
}

/**
 * Todo lo que el editor puede haber cambiado.
 *
 * El ORDEN importa: primero la estructura (inserciones y borrados corren las
 * direcciones de todo lo demás), después los valores, el formato y los anchos,
 * que ya se expresan en las coordenadas nuevas.
 */
export interface Cambios {
  estructura?: CambioEstructura[];
  celdas?: CambioCelda[];
  estilos?: CambioEstilo[];
  anchos?: CambioAncho[];
  combinadas?: CambioCombinada[];
  altos?: CambioAltoFila[];
  visibilidad?: CambioVisibilidad[];
  congelados?: CambioCongelado[];
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

/** Nombre visible de cada hoja, en el mismo orden que `rutasDeHojas`. */
export async function nombresDeHojas(zip: JSZipType): Promise<string[]> {
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  if (!wbXml) return [];
  const doc = new DOMParser().parseFromString(wbXml, "application/xml");
  return Array.from(doc.getElementsByTagNameNS(NS_SS, "sheet")).map((s) => s.getAttribute("name") ?? "");
}

function parsearHoja(xml: string, indice: number): XMLDocument {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`No se pudo leer la hoja ${indice + 1} del archivo.`);
  }
  return doc;
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

  // Fórmula escrita por el usuario: se guarda COMO fórmula, no como texto, y
  // sin `<v>`: `fullCalcOnLoad` hace que Excel la calcule al abrir.
  if (valor.trimStart().startsWith("=")) {
    const f = doc.createElementNS(NS_SS, "f");
    f.textContent = valor.trimStart().slice(1);
    celda.appendChild(f);
    return;
  }

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

/** Busca (o crea) la celda para leer su índice de estilo actual. */
function estiloDeCelda(sheetData: Element, fila: number, columna: number): number {
  const ref = `${numeroALetra(columna)}${fila}`;
  const rows = sheetData.getElementsByTagNameNS(NS_SS, "row");
  for (let i = 0; i < rows.length; i++) {
    if (numeroDeFila(rows[i]) !== fila) continue;
    for (let j = 0; j < rows[i].children.length; j++) {
      if (rows[i].children[j].getAttribute("r") === ref) {
        return Number(rows[i].children[j].getAttribute("s")) || 0;
      }
    }
  }
  return 0;
}

/** Apunta la celda a un índice de estilo, creándola si hace falta. */
function fijarEstilo(doc: XMLDocument, sheetData: Element, fila: number, columna: number, indice: number): void {
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
  celda.setAttribute("s", String(indice));
}

/**
 * Combina o separa un rango en el XML de la hoja.
 *
 * `<mergeCells>` tiene POSICIÓN FIJA en el esquema (después de los datos,
 * antes del formato condicional y la configuración de página): si se apoya en
 * cualquier otro lado, Excel da el archivo por corrupto y lo "repara"
 * descartándolo.
 */
function aplicarCombinada(doc: XMLDocument, ref: string, modo: "agregar" | "quitar"): void {
  const raiz = doc.documentElement;
  let cont = doc.getElementsByTagNameNS(NS_SS, "mergeCells")[0] as Element | undefined;

  if (modo === "quitar") {
    if (!cont) return;
    for (const mc of Array.from(cont.children)) {
      if (mc.getAttribute("ref") === ref) cont.removeChild(mc);
    }
    if (cont.children.length === 0) raiz.removeChild(cont);
    else cont.setAttribute("count", String(cont.children.length));
    return;
  }

  if (!cont) {
    cont = doc.createElementNS(NS_SS, "mergeCells");
    // Elementos que el esquema pone DESPUÉS de mergeCells: el contenedor se
    // inserta antes del primero que exista.
    const despues = new Set([
      "phoneticPr", "conditionalFormatting", "dataValidations", "hyperlinks",
      "printOptions", "pageMargins", "pageSetup", "headerFooter", "rowBreaks",
      "colBreaks", "customProperties", "cellWatches", "ignoredErrors",
      "smartTags", "drawing", "legacyDrawing", "legacyDrawingHF", "picture",
      "oleObjects", "controls", "webPublishItems", "tableParts", "extLst",
    ]);
    let antesDe: Element | null = null;
    for (let i = 0; i < raiz.children.length && !antesDe; i++) {
      if (despues.has(raiz.children[i].localName)) antesDe = raiz.children[i];
    }
    if (antesDe) raiz.insertBefore(cont, antesDe);
    else raiz.appendChild(cont);
  }

  const yaEsta = Array.from(cont.children).some((mc) => mc.getAttribute("ref") === ref);
  if (!yaEsta) {
    const mc = doc.createElementNS(NS_SS, "mergeCell");
    mc.setAttribute("ref", ref);
    cont.appendChild(mc);
  }
  cont.setAttribute("count", String(cont.children.length));
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

function serializar(doc: XMLDocument): string {
  return new XMLSerializer().serializeToString(doc);
}

/**
 * Aplica los cambios al paquete y devuelve el .xlsx listo para subir.
 *
 * Sólo se abren los XML de las hojas que tuvieron cambios; `styles.xml` sólo
 * si se tocó el formato.
 */
export async function guardarCambios(zip: JSZipType, cambios: Cambios | CambioCelda[]): Promise<Blob> {
  // Compatibilidad: antes esta función recibía sólo la lista de celdas.
  const todo: Cambios = Array.isArray(cambios) ? { celdas: cambios } : cambios;
  const {
    estructura = [], celdas = [], estilos = [], anchos = [], combinadas = [],
    altos = [], visibilidad = [], congelados = [],
  } = todo;
  const hayAlgo = estructura.length + celdas.length + estilos.length + anchos.length
    + combinadas.length + altos.length + visibilidad.length + congelados.length > 0;
  if (!hayAlgo) {
    return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  }

  const rutas = await rutasDeHojas(zip);

  // `styles.xml` es del libro entero, no de una hoja: se abre una sola vez.
  let stylesDoc: XMLDocument | null = null;
  if (estilos.length > 0) {
    const xml = (await zip.file("xl/styles.xml")?.async("string")) ?? STYLES_VACIO;
    stylesDoc = new DOMParser().parseFromString(xml, "application/xml");
  }

  const hojasTocadas = new Set<number>([
    ...estructura.map((c) => c.hoja), ...celdas.map((c) => c.hoja),
    ...estilos.map((c) => c.hoja), ...anchos.map((c) => c.hoja),
    ...combinadas.map((c) => c.hoja), ...altos.map((c) => c.hoja),
    ...visibilidad.map((c) => c.hoja), ...congelados.map((c) => c.hoja),
  ]);

  for (const indice of hojasTocadas) {
    const ruta = rutas[indice];
    const xml = ruta ? await zip.file(ruta)?.async("string") : undefined;
    if (!xml) continue;

    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) {
      throw new Error(`No se pudo leer la hoja ${indice + 1} del archivo.`);
    }

    // 1) Estructura primero: corre las direcciones de todo lo demás.
    for (const c of estructura.filter((c) => c.hoja === indice)) {
      moverEstructura(doc, c.eje, c.indice, c.delta);
    }

    let sheetData = doc.getElementsByTagNameNS(NS_SS, "sheetData")[0] as Element | undefined;
    if (!sheetData) {
      sheetData = doc.createElementNS(NS_SS, "sheetData");
      doc.documentElement.appendChild(sheetData);
    }

    // 2) Celdas combinadas: en orden, porque separar y re-combinar el mismo
    //    rango tiene que terminar combinado.
    for (const c of combinadas.filter((c) => c.hoja === indice)) {
      aplicarCombinada(doc, c.ref, c.modo);
    }

    // 3) Valores.
    for (const c of celdas.filter((c) => c.hoja === indice)) {
      escribirCelda(doc, sheetData, c.fila, c.columna, c.valor);
    }

    // 4) Formato.
    if (stylesDoc) {
      for (const c of estilos.filter((c) => c.hoja === indice)) {
        const actual = estiloDeCelda(sheetData, c.fila, c.columna);
        fijarEstilo(doc, sheetData, c.fila, c.columna, aplicarFormato(stylesDoc, actual, c.formato));
      }
    }

    // 5) Anchos de columna, altos de fila, visibilidad y paneles.
    for (const c of anchos.filter((c) => c.hoja === indice)) {
      fijarAnchoColumna(doc, c.columna, c.anchoPx);
    }
    for (const c of altos.filter((c) => c.hoja === indice)) {
      fijarAltoFila(doc, c.fila, c.altoPx);
    }
    for (const c of visibilidad.filter((c) => c.hoja === indice)) {
      fijarVisibilidad(doc, c.eje, c.indice, c.oculta);
    }
    for (const c of congelados.filter((c) => c.hoja === indice)) {
      fijarCongelado(doc, c.filas, c.columnas);
    }

    zip.file(ruta, serializar(doc));
  }

  if (stylesDoc) zip.file("xl/styles.xml", serializar(stylesDoc));

  // Insertar/eliminar en una hoja corre también las referencias que las DEMÁS
  // hojas le hacen por nombre ("Resumen!B1" → "Resumen!B2"), como Excel.
  if (estructura.length > 0) {
    const nombres = await nombresDeHojas(zip);
    for (const c of estructura) {
      const nombre = nombres[c.hoja];
      if (!nombre) continue;
      for (let j = 0; j < rutas.length; j++) {
        if (j === c.hoja) continue;
        const xml = await zip.file(rutas[j])?.async("string");
        if (!xml || !xml.includes("<f")) continue;
        const doc = parsearHoja(xml, j);
        let cambio = false;
        for (const f of Array.from(doc.getElementsByTagNameNS(NS_SS, "f"))) {
          const texto = f.textContent ?? "";
          const nuevo = moverFormulaCruzada(texto, nombre, c.eje, c.indice, c.delta);
          if (nuevo !== texto) { f.textContent = nuevo; cambio = true; }
        }
        if (cambio) zip.file(rutas[j], serializar(doc));
      }
    }
  }

  await forzarRecalculo(zip);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
  });
}
