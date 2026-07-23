/**
 * xlsx-estilos — aplicar formato (negrita, colores, moneda, alineación) sobre
 * el archivo original, sin regenerarlo.
 *
 * CÓMO GUARDA EXCEL EL FORMATO: las celdas no llevan su formato encima, llevan
 * un número. Ese número (`s`) apunta a una entrada de `xl/styles.xml`, que a su
 * vez apunta a una fuente, un relleno, un borde y un formato numérico. Miles de
 * celdas con el mismo aspecto comparten una sola entrada.
 *
 * Entonces poner algo en negrita es: buscar la entrada que usa la celda,
 * clonarla con la fuente en negrita, ver si esa combinación ya existe (para no
 * inflar el archivo) y apuntar la celda al índice que corresponda.
 *
 * Se respeta lo que ya tenía: poner negrita no borra su color ni su moneda.
 */

/** Cambios de formato que ofrece la barra de herramientas. */
export interface CambioFormato {
  negrita?: boolean;
  cursiva?: boolean;
  subrayado?: boolean;
  /** `#rrggbb` para la letra. */
  color?: string;
  /** `#rrggbb` para el relleno; `null` lo quita. */
  fondo?: string | null;
  alineacion?: "left" | "center" | "right";
  /** Código de formato de Excel, ej. `"S/ "#,##0.00`. `null` vuelve a General. */
  numFmt?: string | null;
}

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/** `#rrggbb` → `FFRRGGBB`, que es como lo guarda Excel. */
function aArgb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

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

/** Contenedor de `<fonts>`, `<fills>`… creándolo si el archivo no lo trae. */
function contenedor(doc: XMLDocument, nombre: string): Element {
  const raiz = doc.documentElement;
  const existente = hijo(raiz, nombre);
  if (existente) return existente;
  const nuevo = doc.createElementNS(NS, nombre);
  raiz.appendChild(nuevo);
  return nuevo;
}

/** Agrega el elemento si no hay uno idéntico; devuelve su índice. */
function indiceDe(lista: Element[], candidato: Element, contenedorEl: Element): number {
  const firma = (el: Element) => new XMLSerializer().serializeToString(el).replace(/\s+/g, " ");
  const buscado = firma(candidato);
  for (let i = 0; i < lista.length; i++) {
    if (firma(lista[i]) === buscado) return i;
  }
  contenedorEl.appendChild(candidato);
  contenedorEl.setAttribute("count", String(lista.length + 1));
  return lista.length;
}

/** Fuente nueva a partir de la que tenía la celda. */
function fuenteCon(doc: XMLDocument, base: Element | null, cambio: CambioFormato): Element {
  const f = base ? (base.cloneNode(true) as Element) : doc.createElementNS(NS, "font");

  const marca = (nombre: string, activo: boolean | undefined) => {
    if (activo === undefined) return;
    const el = hijo(f, nombre);
    if (activo && !el) f.appendChild(doc.createElementNS(NS, nombre));
    if (!activo && el) f.removeChild(el);
  };
  marca("b", cambio.negrita);
  marca("i", cambio.cursiva);
  marca("u", cambio.subrayado);

  if (cambio.color) {
    const viejo = hijo(f, "color");
    if (viejo) f.removeChild(viejo);
    const c = doc.createElementNS(NS, "color");
    c.setAttribute("rgb", aArgb(cambio.color));
    f.appendChild(c);
  }
  // Una fuente sin tamaño ni nombre hace que Excel la muestre diminuta.
  if (!hijo(f, "sz")) {
    const sz = doc.createElementNS(NS, "sz");
    sz.setAttribute("val", "11");
    f.appendChild(sz);
  }
  if (!hijo(f, "name")) {
    const n = doc.createElementNS(NS, "name");
    n.setAttribute("val", "Calibri");
    f.appendChild(n);
  }
  return f;
}

/** Relleno sólido con el color pedido. */
function rellenoCon(doc: XMLDocument, color: string): Element {
  const fill = doc.createElementNS(NS, "fill");
  const pattern = doc.createElementNS(NS, "patternFill");
  pattern.setAttribute("patternType", "solid");
  const fg = doc.createElementNS(NS, "fgColor");
  fg.setAttribute("rgb", aArgb(color));
  const bg = doc.createElementNS(NS, "bgColor");
  bg.setAttribute("indexed", "64");
  pattern.appendChild(fg);
  pattern.appendChild(bg);
  fill.appendChild(pattern);
  return fill;
}

/** Id del formato numérico: reusa el estándar si existe, si no crea uno. */
function idDeNumFmt(doc: XMLDocument, codigo: string): number {
  // Formatos que Excel trae de fábrica: no hace falta declararlos.
  const estandar: Record<string, number> = {
    "General": 0, "0": 1, "0.00": 2, "#,##0": 3, "#,##0.00": 4,
    "0%": 9, "0.00%": 10, "dd/mm/yyyy": 14, "d/m/yyyy": 14,
  };
  if (codigo in estandar) return estandar[codigo];

  const cont = contenedor(doc, "numFmts");
  const existentes = hijos(cont, "numFmt");
  for (const n of existentes) {
    if (n.getAttribute("formatCode") === codigo) return Number(n.getAttribute("numFmtId"));
  }
  // Los ids propios arrancan en 164 por especificación.
  const usados = existentes.map((n) => Number(n.getAttribute("numFmtId")));
  const id = Math.max(163, ...usados) + 1;
  const nuevo = doc.createElementNS(NS, "numFmt");
  nuevo.setAttribute("numFmtId", String(id));
  nuevo.setAttribute("formatCode", codigo);
  cont.appendChild(nuevo);
  cont.setAttribute("count", String(existentes.length + 1));
  return id;
}

/**
 * Devuelve el índice de estilo que le corresponde a una celda tras aplicarle
 * el cambio, creando en `styles.xml` lo que haga falta.
 *
 * @param estiloActual el `s` que ya tenía la celda (0 si no tenía).
 */
export function aplicarFormato(doc: XMLDocument, estiloActual: number, cambio: CambioFormato): number {
  const cellXfs = contenedor(doc, "cellXfs");
  const xfs = hijos(cellXfs, "xf");
  const base = xfs[estiloActual] ?? xfs[0];
  const xf = base ? (base.cloneNode(true) as Element) : doc.createElementNS(NS, "xf");

  // ── Fuente ──
  if (cambio.negrita !== undefined || cambio.cursiva !== undefined || cambio.subrayado !== undefined || cambio.color) {
    const fonts = contenedor(doc, "fonts");
    const lista = hijos(fonts, "font");
    const idActual = Number(xf.getAttribute("fontId") ?? 0);
    const nueva = fuenteCon(doc, lista[idActual] ?? null, cambio);
    xf.setAttribute("fontId", String(indiceDe(lista, nueva, fonts)));
    xf.setAttribute("applyFont", "1");
  }

  // ── Relleno ──
  if (cambio.fondo !== undefined) {
    if (cambio.fondo === null) {
      xf.setAttribute("fillId", "0");   // 0 = sin relleno, por especificación
    } else {
      const fills = contenedor(doc, "fills");
      const lista = hijos(fills, "fill");
      xf.setAttribute("fillId", String(indiceDe(lista, rellenoCon(doc, cambio.fondo), fills)));
    }
    xf.setAttribute("applyFill", "1");
  }

  // ── Formato numérico ──
  if (cambio.numFmt !== undefined) {
    const id = cambio.numFmt === null ? 0 : idDeNumFmt(doc, cambio.numFmt);
    xf.setAttribute("numFmtId", String(id));
    xf.setAttribute("applyNumberFormat", "1");
  }

  // ── Alineación ──
  if (cambio.alineacion) {
    const viejo = hijo(xf, "alignment");
    const al = viejo ?? doc.createElementNS(NS, "alignment");
    al.setAttribute("horizontal", cambio.alineacion);
    if (!viejo) xf.appendChild(al);
    xf.setAttribute("applyAlignment", "1");
  }

  return indiceDe(xfs, xf, cellXfs);
}

/** El `styles.xml` mínimo, para los archivos que no lo traen. */
export const STYLES_VACIO = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`;

/** Formatos numéricos que ofrece la barra, con su código de Excel. */
export const FORMATOS = {
  general: null,
  moneda: '"S/ "#,##0.00',
  numero: "#,##0.00",
  entero: "#,##0",
  porcentaje: "0.00%",
  fecha: "dd/mm/yyyy",
} as const;

export type NombreFormato = keyof typeof FORMATOS;
