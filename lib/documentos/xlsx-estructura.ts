/**
 * xlsx-estructura — insertar y eliminar filas y columnas, y cambiar el ancho
 * de una columna, dentro del archivo original.
 *
 * ES LA OPERACIÓN MÁS DELICADA del editor: en un .xlsx cada celda lleva su
 * dirección escrita ("C7"), así que insertar una fila no es correr un array —
 * hay que reescribir la dirección de todo lo que está más abajo, y además:
 *
 *   · las fórmulas que apuntaban a C7 tienen que pasar a apuntar a C8;
 *   · las celdas combinadas que cruzan el corte tienen que estirarse;
 *   · el alto de las filas y el ancho de las columnas viajan con ellas.
 *
 * Si algo de eso se saltea, el archivo abre con los totales apuntando a la
 * celda equivocada, que es peor que no poder insertar filas.
 */

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

export type Eje = "fila" | "columna";

function hijo(padre: Element, nombre: string): Element | null {
  for (let i = 0; i < padre.children.length; i++) {
    if (padre.children[i].localName === nombre) return padre.children[i];
  }
  return null;
}

function hijos(padre: Element, nombre: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < padre.children.length; i++) {
    if (padre.children[i].localName === nombre) out.push(padre.children[i]);
  }
  return out;
}

function letraANum(letra: string): number {
  let n = 0;
  for (const ch of letra.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function numALetra(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/** Desplaza una dirección de celda. Devuelve null si la celda desaparece. */
function moverRef(ref: string, eje: Eje, desde: number, delta: number): string | null {
  const m = /^(\$?)([A-Z]+)(\$?)(\d+)$/.exec(ref);
  if (!m) return ref;
  const [, absCol, letras, absFila, digitos] = m;
  let col = letraANum(letras);
  let fila = Number(digitos);

  if (eje === "fila" && fila >= desde) {
    fila += delta;
    if (fila < desde && delta < 0) return null; // estaba en la fila borrada
  }
  if (eje === "columna" && col >= desde) {
    col += delta;
    if (col < desde && delta < 0) return null;
  }
  return `${absCol}${numALetra(col)}${absFila}${fila}`;
}

/**
 * Reescribe las referencias de una fórmula.
 *
 * Se saltean los textos entre comillas: una fórmula como `SI(A1>0;"B2 ok";"")`
 * no debe tocar el "B2" que es parte del mensaje. Y se saltean las referencias
 * A OTRA HOJA (`Resumen!B1`, `'Lista 2026'!B1`): insertar una fila ACÁ no
 * mueve las celdas de allá — correrlas dejaba los totales apuntando mal.
 */
export function moverFormula(formula: string, eje: Eje, desde: number, delta: number): string {
  let salida = "";
  let i = 0;
  while (i < formula.length) {
    if (formula[i] === '"') {
      const fin = formula.indexOf('"', i + 1);
      const corte = fin === -1 ? formula.length : fin + 1;
      salida += formula.slice(i, corte);
      i = corte;
      continue;
    }
    // 'Nombre de hoja'!REF — el nombre entre comillas simples (con `''` como
    // apóstrofe escapado) y su referencia viajan tal cual.
    if (formula[i] === "'") {
      let fin = i + 1;
      while (fin < formula.length) {
        if (formula[fin] === "'" && formula[fin + 1] === "'") { fin += 2; continue; }
        if (formula[fin] === "'") break;
        fin++;
      }
      let corte = Math.min(formula.length, fin + 1);
      const ref = /^!\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?/.exec(formula.slice(corte));
      if (ref) corte += ref[0].length;
      salida += formula.slice(i, corte);
      i = corte;
      continue;
    }
    const resto = formula.slice(i);
    // Nombre de hoja sin comillas + `!` + referencia: tampoco se corre.
    const conHoja = /^[\p{L}_][\p{L}0-9_.]*!\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?/u.exec(resto);
    if (conHoja) {
      salida += conHoja[0];
      i += conHoja[0].length;
      continue;
    }
    const m = /^(\$?[A-Z]+\$?\d+)/.exec(resto);
    if (m) {
      const nueva = moverRef(m[1], eje, desde, delta);
      salida += nueva ?? "#REF!";
      i += m[1].length;
      continue;
    }
    salida += formula[i];
    i++;
  }
  return salida;
}

/**
 * Corre las referencias que OTRA hoja hace a la hoja editada.
 *
 * El espejo de `moverFormula`: cuando se inserta una fila en Precios, el
 * `Precios!B4` que vive en Resumen tiene que pasar a `Precios!B5` — Excel lo
 * hace y si acá no, el total de Resumen queda apuntando a la celda corrida.
 * Sólo se tocan las referencias calificadas con ESE nombre; el resto de la
 * fórmula (referencias propias, textos) sale intacto.
 */
export function moverFormulaCruzada(formula: string, nombreHoja: string, eje: Eje, desde: number, delta: number): string {
  const objetivo = nombreHoja.toLowerCase();
  const moverParte = (ref: string): string =>
    ref.split(":").map((r) => moverRef(r, eje, desde, delta) ?? "#REF!").join(":");

  let salida = "";
  let i = 0;
  while (i < formula.length) {
    if (formula[i] === '"') {
      const fin = formula.indexOf('"', i + 1);
      const corte = fin === -1 ? formula.length : fin + 1;
      salida += formula.slice(i, corte);
      i = corte;
      continue;
    }
    if (formula[i] === "'") {
      let fin = i + 1;
      let nombre = "";
      while (fin < formula.length) {
        if (formula[fin] === "'" && formula[fin + 1] === "'") { nombre += "'"; fin += 2; continue; }
        if (formula[fin] === "'") break;
        nombre += formula[fin];
        fin++;
      }
      const trasComilla = Math.min(formula.length, fin + 1);
      const ref = /^!(\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?)/.exec(formula.slice(trasComilla));
      if (ref && nombre.toLowerCase() === objetivo) {
        salida += `${formula.slice(i, trasComilla)}!${moverParte(ref[1])}`;
        i = trasComilla + ref[0].length;
      } else {
        const corte = ref ? trasComilla + ref[0].length : trasComilla;
        salida += formula.slice(i, corte);
        i = corte;
      }
      continue;
    }
    const resto = formula.slice(i);
    const conHoja = /^([\p{L}_][\p{L}0-9_.]*)!(\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?)/u.exec(resto);
    if (conHoja) {
      salida += conHoja[1].toLowerCase() === objetivo
        ? `${conHoja[1]}!${moverParte(conHoja[2])}`
        : conHoja[0];
      i += conHoja[0].length;
      continue;
    }
    salida += formula[i];
    i++;
  }
  return salida;
}

/** Ajusta un rango "A1:C9" (usado por merges y validaciones). */
function moverRango(rango: string, eje: Eje, desde: number, delta: number): string | null {
  const [a, b] = rango.split(":");
  if (!b) return moverRef(a, eje, desde, delta);
  const na = moverRef(a, eje, desde, delta) ?? a;
  const nb = moverRef(b, eje, desde, delta);
  if (!nb) return null;
  return `${na}:${nb}`;
}

/**
 * Inserta o elimina una fila/columna en el XML de una hoja.
 *
 * @param indice posición en base 1 (la fila 1 es la primera).
 * @param delta  +1 inserta, -1 elimina.
 */
export function moverEstructura(doc: XMLDocument, eje: Eje, indice: number, delta: number): void {
  const sheetData = doc.getElementsByTagNameNS(NS, "sheetData")[0];
  if (!sheetData) return;

  const filas = hijos(sheetData, "row");

  // Se recorre en el orden que evita pisar: al insertar, de abajo hacia arriba.
  const orden = delta > 0 ? [...filas].reverse() : filas;

  for (const row of orden) {
    const numero = Number(row.getAttribute("r"));

    if (eje === "fila") {
      if (numero === indice && delta < 0) { sheetData.removeChild(row); continue; }
      if (numero >= indice) row.setAttribute("r", String(numero + delta));
    }

    for (const celda of hijos(row, "c")) {
      const ref = celda.getAttribute("r");
      if (!ref) continue;

      if (eje === "columna") {
        const col = letraANum(/^([A-Z]+)/.exec(ref)?.[1] ?? "A");
        if (col === indice && delta < 0) { row.removeChild(celda); continue; }
      }
      const nueva = moverRef(ref, eje, indice, delta);
      if (nueva) celda.setAttribute("r", nueva);

      // La fila cambió de número: las celdas también, aunque el eje sea fila.
      if (eje === "fila") {
        const actual = celda.getAttribute("r") ?? "";
        const letras = /^([A-Z]+)/.exec(actual)?.[1] ?? "A";
        celda.setAttribute("r", `${letras}${row.getAttribute("r")}`);
      }

      const f = hijo(celda, "f");
      if (f?.textContent) f.textContent = moverFormula(f.textContent, eje, indice, delta);
    }
  }

  // ── Celdas combinadas ──
  const merges = doc.getElementsByTagNameNS(NS, "mergeCell");
  for (let i = merges.length - 1; i >= 0; i--) {
    const el = merges[i];
    const ref = el.getAttribute("ref");
    if (!ref) continue;
    const nueva = moverRango(ref, eje, indice, delta);
    if (nueva) el.setAttribute("ref", nueva);
    else el.parentNode?.removeChild(el);
  }
  const cont = doc.getElementsByTagNameNS(NS, "mergeCells")[0];
  if (cont) cont.setAttribute("count", String(hijos(cont, "mergeCell").length));

  // ── Anchos y altos ──
  if (eje === "columna") {
    for (const col of doc.getElementsByTagNameNS(NS, "col")) {
      const min = Number(col.getAttribute("min"));
      const max = Number(col.getAttribute("max"));
      if (min >= indice) col.setAttribute("min", String(min + delta));
      if (max >= indice) col.setAttribute("max", String(max + delta));
    }
  }

  // La dimensión declarada queda vieja; Excel la recalcula si no está.
  const dim = doc.getElementsByTagNameNS(NS, "dimension")[0];
  dim?.parentNode?.removeChild(dim);
}

/** Busca (o crea, en orden) el `<row>` de una fila en `sheetData`. */
function filaDe(doc: XMLDocument, fila: number): Element | null {
  const sheetData = doc.getElementsByTagNameNS(NS, "sheetData")[0];
  if (!sheetData) return null;
  for (const row of hijos(sheetData, "row")) {
    if (Number(row.getAttribute("r")) === fila) return row;
  }
  const nueva = doc.createElementNS(NS, "row");
  nueva.setAttribute("r", String(fila));
  for (const row of hijos(sheetData, "row")) {
    if (Number(row.getAttribute("r")) > fila) {
      sheetData.insertBefore(nueva, row);
      return nueva;
    }
  }
  sheetData.appendChild(nueva);
  return nueva;
}

/** Alto de una fila (base 1) en píxeles de pantalla → puntos del archivo. */
export function fijarAltoFila(doc: XMLDocument, fila: number, altoPx: number): void {
  const row = filaDe(doc, fila);
  if (!row) return;
  row.setAttribute("ht", (altoPx * (72 / 96)).toFixed(2));
  row.setAttribute("customHeight", "1");
}

/**
 * Aísla la columna (base 1) en su propio `<col>`, partiendo el tramo que la
 * contenga, y devuelve su elemento con los atributos del tramo original.
 */
function colPropia(doc: XMLDocument, columna: number): Element {
  const hojaEl = doc.documentElement;
  let cols = doc.getElementsByTagNameNS(NS, "cols")[0] as Element | undefined;
  if (!cols) {
    cols = doc.createElementNS(NS, "cols");
    const sheetData = doc.getElementsByTagNameNS(NS, "sheetData")[0];
    if (sheetData) hojaEl.insertBefore(cols, sheetData);
    else hojaEl.appendChild(cols);
  }
  let heredada: Element | null = null;
  for (const col of [...hijos(cols, "col")]) {
    const min = Number(col.getAttribute("min"));
    const max = Number(col.getAttribute("max"));
    if (columna < min || columna > max) continue;
    if (min === max) return col; // ya está sola
    heredada = col;
    if (columna > min) {
      const izq = col.cloneNode(true) as Element;
      izq.setAttribute("max", String(columna - 1));
      cols.insertBefore(izq, col);
    }
    if (columna < max) {
      const der = col.cloneNode(true) as Element;
      der.setAttribute("min", String(columna + 1));
      cols.insertBefore(der, col);
    }
    col.parentNode?.removeChild(col);
    break;
  }
  const propia = heredada ? (heredada.cloneNode(false) as Element) : doc.createElementNS(NS, "col");
  propia.setAttribute("min", String(columna));
  propia.setAttribute("max", String(columna));
  if (!propia.getAttribute("width")) {
    propia.setAttribute("width", "8.43"); // el ancho por defecto de Excel
  }
  cols.appendChild(propia);
  return propia;
}

/** Oculta o muestra una fila o columna (base 1). */
export function fijarVisibilidad(doc: XMLDocument, eje: Eje, indice: number, oculta: boolean): void {
  if (eje === "fila") {
    const row = filaDe(doc, indice);
    if (!row) return;
    if (oculta) row.setAttribute("hidden", "1");
    else row.removeAttribute("hidden");
    return;
  }
  const col = colPropia(doc, indice);
  if (oculta) col.setAttribute("hidden", "1");
  else col.removeAttribute("hidden");
}

/**
 * Congela (o descongela, con 0/0) los paneles de la hoja: el `<pane>` de la
 * primera `sheetView`, con la celda de arranque del panel móvil.
 */
export function fijarCongelado(doc: XMLDocument, filas: number, columnas: number): void {
  const raiz = doc.documentElement;
  let sheetViews = doc.getElementsByTagNameNS(NS, "sheetViews")[0] as Element | undefined;
  if (!sheetViews) {
    sheetViews = doc.createElementNS(NS, "sheetViews");
    // El esquema lo pide antes de sheetFormatPr/cols/sheetData.
    const antesDe = ["sheetFormatPr", "cols", "sheetData"]
      .map((n) => doc.getElementsByTagNameNS(NS, n)[0])
      .find(Boolean);
    if (antesDe) raiz.insertBefore(sheetViews, antesDe);
    else raiz.appendChild(sheetViews);
  }
  let vista = hijos(sheetViews, "sheetView")[0];
  if (!vista) {
    vista = doc.createElementNS(NS, "sheetView");
    vista.setAttribute("workbookViewId", "0");
    sheetViews.appendChild(vista);
  }
  for (const pane of hijos(vista, "pane")) vista.removeChild(pane);
  if (filas <= 0 && columnas <= 0) return;
  const pane = doc.createElementNS(NS, "pane");
  if (columnas > 0) pane.setAttribute("xSplit", String(columnas));
  if (filas > 0) pane.setAttribute("ySplit", String(filas));
  pane.setAttribute("topLeftCell", `${numALetra(columnas + 1)}${filas + 1}`);
  pane.setAttribute("activePane", columnas > 0 && filas > 0 ? "bottomRight" : filas > 0 ? "bottomLeft" : "topRight");
  pane.setAttribute("state", "frozen");
  // `pane` va primero dentro de la vista, antes de `selection`.
  vista.insertBefore(pane, vista.firstChild);
}

/**
 * Cambia el ancho de una columna (base 1), como al arrastrar su borde.
 *
 * El ancho de Excel se mide en caracteres, no en píxeles: se convierte con la
 * misma fórmula que usa la lectura, al revés.
 */
export function fijarAnchoColumna(doc: XMLDocument, columna: number, anchoPx: number): void {
  const ancho = Math.max(0, (anchoPx - 5) / 7);
  const hojaEl = doc.documentElement;
  let cols = doc.getElementsByTagNameNS(NS, "cols")[0] as Element | undefined;
  if (!cols) {
    cols = doc.createElementNS(NS, "cols");
    // `<cols>` va antes de `<sheetData>` o Excel rechaza el archivo.
    const sheetData = doc.getElementsByTagNameNS(NS, "sheetData")[0];
    if (sheetData) hojaEl.insertBefore(cols, sheetData);
    else hojaEl.appendChild(cols);
  }

  // Un `<col>` puede cubrir un tramo (min..max): si la columna cae dentro de
  // un tramo más grande, hay que partirlo para no cambiarle el ancho a todas.
  for (const col of [...hijos(cols, "col")]) {
    const min = Number(col.getAttribute("min"));
    const max = Number(col.getAttribute("max"));
    if (columna < min || columna > max) continue;

    if (min === max) { col.parentNode?.removeChild(col); continue; }
    if (columna > min) {
      const izq = col.cloneNode(true) as Element;
      izq.setAttribute("max", String(columna - 1));
      cols.insertBefore(izq, col);
    }
    if (columna < max) {
      const der = col.cloneNode(true) as Element;
      der.setAttribute("min", String(columna + 1));
      cols.insertBefore(der, col);
    }
    col.parentNode?.removeChild(col);
  }

  const nuevo = doc.createElementNS(NS, "col");
  nuevo.setAttribute("min", String(columna));
  nuevo.setAttribute("max", String(columna));
  nuevo.setAttribute("width", ancho.toFixed(2));
  nuevo.setAttribute("customWidth", "1");
  cols.appendChild(nuevo);
}
