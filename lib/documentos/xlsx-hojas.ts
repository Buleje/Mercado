/**
 * xlsx-hojas — crear, renombrar, duplicar y eliminar HOJAS del libro, sobre el
 * archivo original.
 *
 * Mismo criterio quirúrgico que el resto del editor (`xlsx-escritura.ts`): no
 * se regenera nada. Una hoja nueva es un XML mínimo más tres registros — la
 * entrada en `workbook.xml` (nombre y orden de las pestañas), la relación que
 * dice en qué archivo vive, y el content-type del paquete. Duplicar copia el
 * XML de la hoja (datos, formato y fórmulas incluidos); eliminar quita esos
 * mismos tres registros.
 *
 * LO DELICADO de cada operación:
 *   · Renombrar: las fórmulas de OTRAS hojas y los gráficos apuntan a la hoja
 *     por su nombre (`Ventas!B2`) — hay que actualizarlos o quedan en #REF!.
 *   · Duplicar: la hoja puede referenciar partes externas por `r:id` (gráficos,
 *     tablas, hipervínculos). La copia no hereda esas relaciones, así que esos
 *     elementos se quitan de la copia — si quedaran, Excel daría el archivo
 *     por corrupto. Datos, formato y fórmulas sí viajan enteros.
 *   · Eliminar: `calcChain.xml` y los nombres definidos de esa hoja quedarían
 *     apuntando a la nada; se limpian acá.
 */

import type JSZipType from "jszip";
import { rutasDeHojas } from "./xlsx-escritura";

const NS_SS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_DOCREL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKGREL = "http://schemas.openxmlformats.org/package/2006/relationships";
const NS_CT = "http://schemas.openxmlformats.org/package/2006/content-types";

const TIPO_REL_HOJA = `${NS_DOCREL}/worksheet`;
const CONTENT_TYPE_HOJA = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";

/** XML de una hoja recién creada: vacía, válida, lista para escribirle celdas. */
const HOJA_NUEVA_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS_SS}"><sheetData/></worksheet>`;

// ── Nombres de hoja ─────────────────────────────────────────────────────────

/**
 * Valida un nombre de hoja con las reglas de Excel.
 * @returns el mensaje de error, o null si el nombre sirve.
 */
export function nombreHojaValido(nombre: string): string | null {
  const n = nombre.trim();
  if (n === "") return "El nombre no puede estar vacío.";
  if (n.length > 31) return "El nombre no puede superar los 31 caracteres.";
  if (/[[\]:*?/\\]/.test(n)) return "El nombre no puede llevar [ ] : * ? / \\";
  if (n.startsWith("'") || n.endsWith("'")) return "El nombre no puede empezar ni terminar con apóstrofe.";
  return null;
}

/** "Hoja2" si está libre; si no, "Hoja3", "Hoja4"… (comparando como Excel, sin mayúsculas). */
export function nombreHojaLibre(existentes: string[], base: string): string {
  const usados = new Set(existentes.map((n) => n.toLowerCase()));
  const limpio = base.trim().slice(0, 28) || "Hoja";
  if (!usados.has(limpio.toLowerCase())) return limpio;
  for (let i = 2; i < 1000; i++) {
    const candidato = `${limpio} ${i}`;
    if (candidato.length <= 31 && !usados.has(candidato.toLowerCase())) return candidato;
  }
  return `${limpio} ${Date.now() % 1000}`;
}

/** El nombre como aparece en una fórmula: entre comillas sólo si hace falta. */
function nombreEnRef(nombre: string): string {
  const simple = /^[A-Za-z_][A-Za-z0-9_]*$/.test(nombre) && !/^[A-Za-z]{1,3}\d+$/.test(nombre);
  return simple ? nombre : `'${nombre.replace(/'/g, "''")}'`;
}

/** Regex que encuentra `Nombre!` o `'Nombre'!` en el texto de una fórmula. */
function regexDeHoja(nombre: string): RegExp {
  const esc = nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escConComillas = nombre.replace(/'/g, "''").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // El nombre sin comillas no puede venir pegado a otra palabra: `Ventas!` sí,
  // `MisVentas!` no. Lookbehind: soportado en todo runtime actual.
  return new RegExp(`(?:'${escConComillas}'|(?<![A-Za-z0-9_.])${esc})(?=!)`, "g");
}

/** Reemplaza las referencias a una hoja dentro de una fórmula. */
export function renombrarEnFormula(formula: string, viejo: string, nuevo: string): string {
  return formula.replace(regexDeHoja(viejo), nombreEnRef(nuevo));
}

// ── El libro abierto ────────────────────────────────────────────────────────

interface Libro {
  zip: JSZipType;
  wbDoc: XMLDocument;
  relsDoc: XMLDocument;
  hojas: Element[];
}

function parsear(xml: string, que: string): XMLDocument {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`No se pudo leer ${que} del archivo.`);
  }
  return doc;
}

function serializar(doc: XMLDocument): string {
  return new XMLSerializer().serializeToString(doc);
}

async function abrirLibro(zip: JSZipType): Promise<Libro> {
  const wbXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");
  if (!wbXml || !relsXml) throw new Error("El archivo no parece un .xlsx válido.");
  const wbDoc = parsear(wbXml, "el libro");
  const relsDoc = parsear(relsXml, "las relaciones");
  const hojas = Array.from(wbDoc.getElementsByTagNameNS(NS_SS, "sheet"));
  return { zip, wbDoc, relsDoc, hojas };
}

/**
 * Escribe el libro y lo marca para recálculo.
 *
 * `calcChain.xml` es un índice de dependencias entre celdas: cualquier cambio
 * de hojas lo deja inconsistente y Excel avisa "contenido ilegible". Se borra
 * y `fullCalcOnLoad` hace que Excel lo rearme solo.
 */
function guardarLibro(libro: Libro): void {
  const { zip, wbDoc, relsDoc } = libro;
  zip.remove("xl/calcChain.xml");
  let calcPr = wbDoc.getElementsByTagNameNS(NS_SS, "calcPr")[0] as Element | undefined;
  if (!calcPr) {
    calcPr = wbDoc.createElementNS(NS_SS, "calcPr");
    wbDoc.documentElement.appendChild(calcPr);
  }
  calcPr.setAttribute("fullCalcOnLoad", "1");
  zip.file("xl/workbook.xml", serializar(wbDoc));
  zip.file("xl/_rels/workbook.xml.rels", serializar(relsDoc));
}

/** Registra una hoja nueva: relación + entrada en `<sheets>` + content-type. */
async function registrarHoja(libro: Libro, ruta: string, nombre: string): Promise<void> {
  const { zip, wbDoc, relsDoc } = libro;

  const relIds = Array.from(relsDoc.getElementsByTagName("Relationship"))
    .map((r) => Number(/^rId(\d+)$/.exec(r.getAttribute("Id") ?? "")?.[1] ?? 0));
  const rid = `rId${Math.max(0, ...relIds) + 1}`;
  const rel = relsDoc.createElementNS(NS_PKGREL, "Relationship");
  rel.setAttribute("Id", rid);
  rel.setAttribute("Type", TIPO_REL_HOJA);
  rel.setAttribute("Target", ruta.replace(/^xl\//, ""));
  relsDoc.documentElement.appendChild(rel);

  const sheets = wbDoc.getElementsByTagNameNS(NS_SS, "sheets")[0];
  if (!sheets) throw new Error("El libro no tiene lista de hojas.");
  const ids = Array.from(sheets.children).map((s) => Number(s.getAttribute("sheetId")) || 0);
  const hoja = wbDoc.createElementNS(NS_SS, "sheet");
  hoja.setAttribute("name", nombre);
  hoja.setAttribute("sheetId", String(Math.max(0, ...ids) + 1));
  hoja.setAttributeNS(NS_DOCREL, "r:id", rid);
  sheets.appendChild(hoja);

  // Content-type del paquete: sin este registro, Excel ignora el archivo.
  const ctXml = await zip.file("[Content_Types].xml")?.async("string");
  if (ctXml) {
    const ctDoc = parsear(ctXml, "los tipos de contenido");
    const partName = `/${ruta}`;
    const yaEsta = Array.from(ctDoc.getElementsByTagName("Override"))
      .some((o) => o.getAttribute("PartName") === partName);
    if (!yaEsta) {
      const override = ctDoc.createElementNS(NS_CT, "Override");
      override.setAttribute("PartName", partName);
      override.setAttribute("ContentType", CONTENT_TYPE_HOJA);
      ctDoc.documentElement.appendChild(override);
      zip.file("[Content_Types].xml", serializar(ctDoc));
    }
  }
}

/** Primera ruta `xl/worksheets/sheetN.xml` que no esté ocupada. */
function rutaLibre(zip: JSZipType): string {
  let max = 0;
  zip.forEach((ruta) => {
    const n = /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(ruta);
    if (n) max = Math.max(max, Number(n[1]));
  });
  return `xl/worksheets/sheet${max + 1}.xml`;
}

function validarNombre(libro: Libro, nombre: string, ignorarIndice?: number): void {
  const error = nombreHojaValido(nombre);
  if (error) throw new Error(error);
  const repetido = libro.hojas.some((h, i) =>
    i !== ignorarIndice && (h.getAttribute("name") ?? "").toLowerCase() === nombre.trim().toLowerCase());
  if (repetido) throw new Error(`Ya hay una hoja que se llama "${nombre.trim()}".`);
}

// ── Operaciones ─────────────────────────────────────────────────────────────

/** Agrega una hoja vacía al final del libro. */
export async function nuevaHoja(zip: JSZipType, nombre: string): Promise<void> {
  const libro = await abrirLibro(zip);
  validarNombre(libro, nombre);
  const ruta = rutaLibre(zip);
  zip.file(ruta, HOJA_NUEVA_XML);
  await registrarHoja(libro, ruta, nombre.trim());
  guardarLibro(libro);
}

/**
 * Duplica una hoja al final del libro: datos, formato y fórmulas enteros.
 *
 * Lo que la hoja referencia por `r:id` (gráficos, imágenes, tablas con nombre,
 * hipervínculos externos) no puede viajar con la copia — las relaciones son
 * por-hoja y no se duplican. Se quitan de la copia para que el archivo siga
 * abriendo bien; el original queda intacto.
 */
export async function duplicarHoja(zip: JSZipType, indice: number, nombre: string): Promise<void> {
  const libro = await abrirLibro(zip);
  validarNombre(libro, nombre);
  const rutas = await rutasDeHojas(zip);
  const origen = rutas[indice];
  const xml = origen ? await zip.file(origen)?.async("string") : undefined;
  if (!xml) throw new Error("No se encontró la hoja a duplicar.");

  const doc = parsear(xml, "la hoja");
  // Elementos que apuntan a partes externas por r:id: fuera de la copia.
  for (const etiqueta of ["drawing", "legacyDrawing", "legacyDrawingHF", "picture", "oleObjects", "controls", "tableParts", "hyperlinks"]) {
    for (const el of Array.from(doc.getElementsByTagNameNS(NS_SS, etiqueta))) {
      el.parentNode?.removeChild(el);
    }
  }
  // Cualquier r:id suelto que quede (ej. la impresora en pageSetup) se limpia
  // como atributo; el elemento en sí no molesta.
  const todos = doc.getElementsByTagName("*");
  for (let i = 0; i < todos.length; i++) {
    if (todos[i].hasAttributeNS(NS_DOCREL, "id")) todos[i].removeAttributeNS(NS_DOCREL, "id");
  }
  // Las extensiones (sparklines, segmentaciones) también relacionan por id.
  for (const ext of Array.from(doc.getElementsByTagNameNS(NS_SS, "extLst"))) {
    if (new XMLSerializer().serializeToString(ext).includes(":id=")) ext.parentNode?.removeChild(ext);
  }

  const ruta = rutaLibre(zip);
  zip.file(ruta, serializar(doc));
  await registrarHoja(libro, ruta, nombre.trim());
  guardarLibro(libro);
}

/**
 * Renombra una hoja y actualiza a quienes la nombran: las fórmulas de todas
 * las hojas, los nombres definidos, los gráficos y las tablas dinámicas.
 */
export async function renombrarHoja(zip: JSZipType, indice: number, nombre: string): Promise<void> {
  const libro = await abrirLibro(zip);
  const hoja = libro.hojas[indice];
  if (!hoja) throw new Error("No se encontró la hoja a renombrar.");
  const viejo = hoja.getAttribute("name") ?? "";
  const nuevo = nombre.trim();
  if (viejo === nuevo) return;
  validarNombre(libro, nuevo, indice);
  hoja.setAttribute("name", nuevo);

  // OJO: la regex es `g` — `.test()` la haría stateful (lastIndex) y saltearía
  // ocurrencias. Siempre reemplazar y comparar, nunca testear.
  const re = regexDeHoja(viejo);
  const ref = nombreEnRef(nuevo);

  // Nombres definidos del libro ("=Ventas!$A$1:$B$9").
  for (const dn of Array.from(libro.wbDoc.getElementsByTagNameNS(NS_SS, "definedName"))) {
    const texto = dn.textContent ?? "";
    const nuevo2 = texto.replace(re, ref);
    if (nuevo2 !== texto) dn.textContent = nuevo2;
  }

  // Fórmulas de todas las hojas.
  for (const rutaHoja of await rutasDeHojas(zip)) {
    const xml = await zip.file(rutaHoja)?.async("string");
    if (!xml || xml.replace(re, ref) === xml) continue;
    const doc = parsear(xml, "una hoja");
    let cambio = false;
    for (const f of Array.from(doc.getElementsByTagNameNS(NS_SS, "f"))) {
      const texto = f.textContent ?? "";
      const reemplazado = texto.replace(re, ref);
      if (reemplazado !== texto) {
        f.textContent = reemplazado;
        cambio = true;
      }
    }
    if (cambio) zip.file(rutaHoja, serializar(doc));
  }

  // Gráficos (las series guardan "Ventas!$B$2:$B$9") y tablas dinámicas
  // (referencian la hoja por nombre en su origen de datos).
  const pendientes: { ruta: string; contenido: Promise<string> }[] = [];
  zip.forEach((ruta, archivo) => {
    if (/^xl\/charts\/.*\.xml$/.test(ruta) || /^xl\/pivotCache\/pivotCacheDefinition.*\.xml$/.test(ruta)) {
      pendientes.push({ ruta, contenido: archivo.async("string") });
    }
  });
  const escapado = viejo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escapadoNuevo = nuevo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  for (const p of pendientes) {
    const xml = await p.contenido;
    const out = xml.replace(re, ref).split(`sheet="${escapado}"`).join(`sheet="${escapadoNuevo}"`);
    if (out !== xml) zip.file(p.ruta, out);
  }

  guardarLibro(libro);
}

/**
 * Elimina una hoja del libro.
 *
 * Como en Excel: las fórmulas de otras hojas que la referenciaban quedan en
 * #REF! — por eso la interfaz pide confirmación antes de llegar acá.
 */
export async function eliminarHoja(zip: JSZipType, indice: number): Promise<void> {
  const libro = await abrirLibro(zip);
  const hoja = libro.hojas[indice];
  if (!hoja) throw new Error("No se encontró la hoja a eliminar.");

  const visibles = libro.hojas.filter((h) => {
    const estado = h.getAttribute("state");
    return estado !== "hidden" && estado !== "veryHidden";
  });
  const estaVisible = !["hidden", "veryHidden"].includes(hoja.getAttribute("state") ?? "");
  if (estaVisible && visibles.length <= 1) {
    throw new Error("El libro necesita al menos una hoja visible.");
  }

  const rutas = await rutasDeHojas(zip);
  const ruta = rutas[indice];

  // La relación y el archivo de la hoja (con sus relaciones propias, si tiene).
  const rid = hoja.getAttributeNS(NS_DOCREL, "id") ?? hoja.getAttribute("r:id");
  if (rid) {
    for (const rel of Array.from(libro.relsDoc.getElementsByTagName("Relationship"))) {
      if (rel.getAttribute("Id") === rid) rel.parentNode?.removeChild(rel);
    }
  }
  hoja.parentNode?.removeChild(hoja);
  if (ruta) {
    zip.remove(ruta);
    const partes = ruta.split("/");
    const nombreArchivo = partes.pop();
    zip.remove(`${partes.join("/")}/_rels/${nombreArchivo}.rels`);

    const ctXml = await zip.file("[Content_Types].xml")?.async("string");
    if (ctXml) {
      const ctDoc = parsear(ctXml, "los tipos de contenido");
      for (const o of Array.from(ctDoc.getElementsByTagName("Override"))) {
        if (o.getAttribute("PartName") === `/${ruta}`) o.parentNode?.removeChild(o);
      }
      zip.file("[Content_Types].xml", serializar(ctDoc));
    }
  }

  // Nombres definidos con alcance de hoja: el índice viaja en `localSheetId`.
  for (const dn of Array.from(libro.wbDoc.getElementsByTagNameNS(NS_SS, "definedName"))) {
    const local = dn.getAttribute("localSheetId");
    if (local === null) continue;
    const n = Number(local);
    if (n === indice) dn.parentNode?.removeChild(dn);
    else if (n > indice) dn.setAttribute("localSheetId", String(n - 1));
  }

  // La pestaña activa no puede quedar apuntando fuera del libro.
  for (const vista of Array.from(libro.wbDoc.getElementsByTagNameNS(NS_SS, "workbookView"))) {
    const activa = Number(vista.getAttribute("activeTab") ?? 0);
    if (activa >= libro.hojas.length - 1) vista.setAttribute("activeTab", "0");
  }

  guardarLibro(libro);
}
