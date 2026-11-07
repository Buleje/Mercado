/**
 * «Lee un papel» (Comandos IA) — las reglas PURAS que deciden qué es un papel
 * y sacan sus campos antes de gastar IA.
 *
 * El texto llega del OCR del navegador (tesseract) o pegado a mano. Primero
 * deciden las reglas (Yape/Plin, RUC, «FACTURA», «LISTA DE PRECIOS»); la IA de
 * texto sólo entra si las reglas no deciden o no encuentran los ítems. Todo lo
 * de acá es puro: lo usa la ruta `/api/admin/comandos-ia/papel/entender` y lo
 * fija `__tests__/lib/comandos-ia-papel.test.ts`.
 */

import { z } from "zod";

export type TipoPapel = "factura" | "yape" | "lista-precios" | "otro";
export type DestinoPapel = "compra" | "cobro" | "precios" | "documento";

export interface ItemLeido {
  nombre: string;
  cantidad: number;
  /** Costo por unidad, en soles. */
  costoUnitario: number;
}

export interface FilaPrecio {
  nombre: string;
  costo: number;
}

export interface CamposFactura {
  proveedor: { nombre: string | null; ruc: string | null };
  numero: string | null;
  fecha: string | null;
  total: number | null;
  items: ItemLeido[];
}

export interface CamposYape {
  monto: number | null;
  nombre: string | null;
  operacion: string | null;
  fecha: string | null;
  /** Los 3 últimos dígitos del celular que muestra la captura («*** *** 455»). */
  finCelular: string | null;
}

export interface CamposLista {
  proveedor: string | null;
  filas: FilaPrecio[];
}

export interface CamposOtro {
  titulo: string | null;
}

// ── Texto ─────────────────────────────────────────────────────────────────────

/** Minúsculas, sin tildes ni signos raros, espacios colapsados. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.,/%\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lineas(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Un monto escrito a la peruana o como sea: «1,234.50», «1.234,50», «3,50»,
 * «18.5», «S/ 25». El último separador con 1-2 cifras detrás es el decimal.
 */
export function parsearMonto(s: string): number | null {
  const limpio = s.replace(/s\/\.?/gi, "").replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(limpio)) return null;
  const ultimo = Math.max(limpio.lastIndexOf("."), limpio.lastIndexOf(","));
  let n: number;
  if (ultimo === -1) {
    n = Number(limpio);
  } else {
    const decimales = limpio.slice(ultimo + 1);
    if (decimales.length >= 1 && decimales.length <= 2) {
      const entero = limpio.slice(0, ultimo).replace(/[.,]/g, "");
      n = Number(`${entero}.${decimales}`);
    } else {
      n = Number(limpio.replace(/[.,]/g, ""));
    }
  }
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const NUM = String.raw`\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})|\d+(?:[.,]\d{1,2})?`;

// ── Campos sueltos ────────────────────────────────────────────────────────────

/** El RUC: 11 cifras que empiezan como empieza un RUC (10, 15, 17, 20). */
export function extraerRuc(texto: string): string | null {
  const m = texto.replace(/(\d)[\s.-](?=\d)/g, "$1").match(/\b(10|15|17|20)\d{9}\b/);
  return m ? m[0] : null;
}

/** «F001-00004567», «B002 - 123», «E001-45»; si no, «N° 001-0004567». */
export function extraerNumeroComprobante(texto: string): string | null {
  const serie = texto.match(/\b([FBE][A-Z0-9]{3})\s*[-–]\s*(\d{1,8})\b/i);
  if (serie) return `${serie[1].toUpperCase()}-${serie[2]}`;
  const n = texto.match(/N\s*[°º.o]?\s*:?\s*(\d{3,4}\s*-\s*\d{3,8})/i);
  return n ? n[1].replace(/\s/g, "") : null;
}

/** Fecha dd/mm/aaaa (o con - y .) → «aaaa-mm-dd». */
export function extraerFecha(texto: string): string | null {
  const m = texto.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (!m) return null;
  const d = Number(m[1]);
  const mes = Number(m[2]);
  let a = Number(m[3]);
  if (a < 100) a += 2000;
  if (d < 1 || d > 31 || mes < 1 || mes > 12) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** El total del comprobante: la ÚLTIMA línea con «total» que no sea subtotal. */
export function extraerTotal(texto: string): number | null {
  let total: number | null = null;
  for (const l of lineas(texto)) {
    const n = normalizar(l);
    if (!/\btotal\b/.test(n) || /sub\s*total|op\.?\s*gravad|gravada/.test(n)) continue;
    const montos = l.match(new RegExp(NUM, "g"));
    const ultimo = montos?.length ? parsearMonto(montos[montos.length - 1]) : null;
    if (ultimo != null && ultimo > 0) total = ultimo;
  }
  return total;
}

const PALABRAS_NO_ITEM =
  /\b(total|sub\s*total|igv|gravad|exonerad|inafect|descuento|vuelto|efectivo|son:?|ruc|fecha|factura|boleta|cant\.?|descripcion|importe|p\.?\s*unit|telefono|direccion|pago|redondeo)\b/;

function tieneLetras(s: string): boolean {
  return /[a-záéíóúñ]{2,}/i.test(s);
}

/**
 * Las filas de una factura impresa: «2 Arroz Costeño 5kg 18.50 37.00»
 * (cantidad, descripción, precio unitario, importe) o «2 Arroz 37.00» (sólo el
 * importe: el unitario sale de dividir). Lo que no tenga esa forma se deja:
 * para eso está la IA, o la persona en la revisión.
 */
export function extraerItemsFactura(texto: string): ItemLeido[] {
  const items: ItemLeido[] = [];
  const conDos = new RegExp(String.raw`^(\d+(?:[.,]\d+)?)\s*(?:x|und\.?|unid\.?|u)?\s+(.+?)\s+(?:S\/\.?\s*)?(${NUM})\s+(?:S\/\.?\s*)?(${NUM})$`, "i");
  const conUno = new RegExp(String.raw`^(\d+(?:[.,]\d+)?)\s*(?:x|und\.?|unid\.?|u)?\s+(.+?)\s+(?:S\/\.?\s*)?(${NUM})$`, "i");
  for (const l of lineas(texto)) {
    const n = normalizar(l);
    if (PALABRAS_NO_ITEM.test(n)) continue;
    const dos = l.match(conDos);
    if (dos && tieneLetras(dos[2])) {
      const cantidad = parsearMonto(dos[1]) ?? 0;
      const unit = parsearMonto(dos[3]) ?? 0;
      const importe = parsearMonto(dos[4]) ?? 0;
      if (cantidad <= 0) continue;
      /* Si cantidad × unitario no da el importe, manda el importe. */
      const cuadra = Math.abs(cantidad * unit - importe) <= Math.max(0.05, importe * 0.02);
      const costoUnitario = cuadra ? unit : Math.round((importe / cantidad) * 100) / 100;
      items.push({ nombre: dos[2].trim(), cantidad, costoUnitario });
      continue;
    }
    const uno = l.match(conUno);
    if (uno && tieneLetras(uno[2])) {
      const cantidad = parsearMonto(uno[1]) ?? 0;
      const importe = parsearMonto(uno[3]) ?? 0;
      if (cantidad <= 0 || cantidad > 9999) continue;
      items.push({ nombre: uno[2].trim(), cantidad, costoUnitario: Math.round((importe / cantidad) * 100) / 100 });
    }
  }
  return items;
}

const FORMA_SOCIETARIA = /\b(s\.?\s?a\.?\s?c\.?|s\.?\s?r\.?\s?l\.?|e\.?\s?i\.?\s?r\.?\s?l\.?|s\.?\s?a\.?)\s*$/i;
const PALABRAS_CABECERA = /\b(factura|boleta|ruc|r\.u\.c|fecha|electronica|senor|cliente|direccion|telefono|lista|precios|proforma|cotizacion|pucallpa|jr\.?|av\.?|calle)\b/;

/** El nombre del proveedor: la línea con forma societaria, o la primera con letras que no sea cabecera. */
export function extraerProveedor(texto: string): string | null {
  const ls = lineas(texto).slice(0, 12);
  const conForma = ls.find((l) => FORMA_SOCIETARIA.test(l) && tieneLetras(l) && !/\b(señor|cliente)/i.test(l));
  const elegida = conForma ?? ls.find((l) => tieneLetras(l) && !PALABRAS_CABECERA.test(normalizar(l)) && !/\d{5,}/.test(l));
  if (!elegida) return null;
  return elegida.replace(/^raz[oó]n\s+social\s*:?\s*/i, "").replace(/\s*[-–]\s*$/, "").trim() || null;
}

/**
 * El proveedor de una lista de precios: lo que sigue a «LISTA DE PRECIOS -» en
 * la cabecera; si no, la primera línea con letras que no sea una fila con precio.
 */
export function extraerProveedorLista(texto: string): string | null {
  const ls = lineas(texto).slice(0, 8);
  for (const l of ls) {
    const m = l.match(/(?:lista\s+de\s+precios|precios|proforma|cotizaci[oó]n)\s*(?:[-–:|]|de|del)\s*(.+)$/i);
    if (m && tieneLetras(m[1]) && !/\d[.,]\d{2}\s*$/.test(m[1])) return m[1].trim();
  }
  const sinPrecio = ls.filter((l) => !/\d[.,]\d{1,2}\s*$/.test(l));
  return extraerProveedor(sinPrecio.join("\n"));
}

/** Una captura de Yape o Plin: monto, a nombre de quién, N.º de operación. */
export function extraerYape(texto: string): CamposYape {
  const ls = lineas(texto);
  const monto = texto.match(new RegExp(String.raw`S\/\.?\s*(${NUM})`, "i"));
  const operacion = texto.match(/(?:n(?:ro|°|º|o)?\.?\s*(?:de\s+)?operaci[oó]n|c[oó]digo\s+de\s+operaci[oó]n)\s*:?\s*(\d{5,})/i);
  const finCelular = texto.match(/\*{2,}\s*\*{2,}\s*(\d{3})\b/);
  let nombre: string | null = null;
  const teYapeo = texto.match(/^\s*(.+?)\s+te\s+(?:yape[oó]|pline[oó]|envi[oó])/im);
  if (teYapeo && tieneLetras(teYapeo[1])) {
    nombre = teYapeo[1].trim();
  } else {
    const iMonto = ls.findIndex((l) => /S\/\.?\s*\d/i.test(l));
    const despues = iMonto >= 0 ? ls.slice(iMonto + 1) : ls;
    const candidata = despues.find(
      (l) =>
        tieneLetras(l) &&
        !/yape|plin|operaci|celular|destino|comisi|fecha|\d{1,2}:\d{2}|\b(ene|feb|mar|abr|may|jun|jul|ago|set|sep|oct|nov|dic)\b\.?\s*\d{4}|enviado|exitos|mensaje|compart/i.test(l),
    );
    nombre = candidata?.replace(/^(?:a|para|de)\s+/i, "").trim() ?? null;
  }
  return {
    monto: monto ? parsearMonto(monto[1]) : null,
    nombre,
    operacion: operacion?.[1] ?? null,
    fecha: extraerFecha(texto),
    finCelular: finCelular?.[1] ?? null,
  };
}

/** «Arroz Costeño 5kg ..... S/ 18.50» → {nombre, costo}. Sin cantidades delante. */
export function extraerListaPrecios(texto: string): FilaPrecio[] {
  const fila = new RegExp(String.raw`^(.+?)[\s.:\-–_]*\s(?:S\/\.?\s*)?(${NUM})$`, "i");
  const filas: FilaPrecio[] = [];
  for (const l of lineas(texto)) {
    const n = normalizar(l);
    if (/\b(lista|precios|proforma|cotizacion|total|igv|fecha|ruc|telefono|validez|vigencia)\b/.test(n) && !/\d[.,]\d{2}\s*$/.test(l)) continue;
    if (/\b(total|igv|sub\s*total)\b/.test(n)) continue;
    const m = l.match(fila);
    if (!m || !tieneLetras(m[1])) continue;
    const costo = parsearMonto(m[2]);
    const nombre = m[1].replace(/[\s.:\-–_]+$/, "").trim();
    if (costo == null || costo <= 0 || nombre.length < 3) continue;
    filas.push({ nombre, costo });
  }
  return filas;
}

// ── Decidir el tipo ───────────────────────────────────────────────────────────

export interface Decision {
  tipo: TipoPapel | null;
  confianza: number;
  senales: string[];
}

/** Qué papel es, sólo con reglas. `tipo: null` = las reglas no deciden (va la IA). */
export function detectarTipo(texto: string): Decision {
  const n = normalizar(texto);
  const senales: string[] = [];
  let factura = 0;
  let yape = 0;
  let lista = 0;
  if (/\b(factura|boleta)\b(\s+de\s+venta)?\s+electronica|\bfactura\b/.test(n)) { factura += 0.6; senales.push("dice factura/boleta"); }
  if (extraerRuc(texto)) { factura += 0.2; senales.push("trae RUC"); }
  if (extraerNumeroComprobante(texto)) factura += 0.1;
  if (/yapeaste|te yape|\bplin\b|pline/.test(n)) { yape += 0.7; senales.push("dice Yape/Plin"); }
  else if (/\byape\b/.test(n)) yape += 0.3;
  if (/n(ro|o)?\.?\s*(de\s+)?operacion/.test(n)) { yape += 0.2; senales.push("N.º de operación"); }
  if (/s\/\.?\s*\d/.test(n)) yape += 0.1;
  if (/\b(lista|precios|proforma|cotizacion)\b/.test(n)) { lista += 0.5; senales.push("dice lista/precios"); }
  if (extraerListaPrecios(texto).length >= 2) lista += 0.3;

  /* Una factura que se pagó con Yape sigue siendo factura. */
  if (factura >= 0.6) yape = Math.min(yape, 0.4);
  const [tipo, confianza] = ([["factura", factura], ["yape", yape], ["lista-precios", lista]] as const)
    .reduce((a, b) => (b[1] > a[1] ? b : a));
  if (confianza < 0.5) return { tipo: null, confianza, senales };
  return { tipo, confianza: Math.min(1, Math.round(confianza * 100) / 100), senales };
}

// ── Lo que nunca sale hacia la IA (Ley 29733) ─────────────────────────────────

/**
 * Celulares, DNI y RUC fuera antes de mandar el texto a la IA. El RUC 10 lleva
 * el DNI adentro; los tres ya los sacan las reglas, la IA no los necesita.
 */
export function quitarDatosPersonales(texto: string): string {
  return texto
    .replace(/(?:\+?51[\s-]?)?\b9\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g, "[celular]")
    .replace(/\b(10|15|17|20)\d{9}\b/g, "[ruc]")
    .replace(/(?<![-\d])\b\d{8}\b(?![-\d])/g, "[documento]");
}

// ── Emparejar nombres ─────────────────────────────────────────────────────────

const VACIAS = new Set(["de", "la", "el", "los", "las", "con", "en", "y", "x", "para", "por", "del", "al", "sac", "srl", "eirl", "sa", "s.a.c.", "s.r.l.", "e.i.r.l.", "sociedad", "anonima", "cerrada", "empresa"]);

/** «1 kg» → «1kg», «1 lt»/«1 litro» → «1l», «500 gr» → «500g». */
function unirUnidades(s: string): string {
  return s
    .replace(/(\d)\s*(kgs?|kilos?)\b/g, "$1kg")
    .replace(/(\d)\s*(grs?|gramos?|g)\b/g, "$1g")
    .replace(/(\d)\s*(lts?|litros?|l)\b/g, "$1l")
    .replace(/(\d)\s*(ml)\b/g, "$1ml")
    .replace(/(\d)\s*(und|unid|un)\b/g, "$1u");
}

export function tokens(s: string): string[] {
  return unirUnidades(normalizar(s))
    .replace(/[.,/]/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2 && !VACIAS.has(t));
}

function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = guardado;
    }
  }
  return fila[b.length];
}

function mismoToken(a: string, b: string): boolean {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return a.length >= 5 && b.length >= 5 && distancia(a, b) <= 1;
}

/** 0-1: cuánto se parecen dos nombres (Dice sobre palabras, tolerante a OCR). */
export function puntajeNombre(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const usados = new Set<number>();
  let iguales = 0;
  for (const x of ta) {
    const j = tb.findIndex((y, k) => !usados.has(k) && mismoToken(x, y));
    if (j >= 0) { usados.add(j); iguales++; }
  }
  return Math.round(((2 * iguales) / (ta.length + tb.length)) * 100) / 100;
}

export interface Candidato<T extends string | number> {
  id: T;
  nombre: string;
}

/** Los mejores `n` candidatos para un nombre leído, de mayor a menor (≥0,2). */
export function emparejar<T extends string | number>(
  nombre: string,
  candidatos: readonly Candidato<T>[],
  n = 3,
): Array<Candidato<T> & { puntaje: number }> {
  return candidatos
    .map((c) => ({ ...c, puntaje: puntajeNombre(nombre, c.nombre) }))
    .filter((c) => c.puntaje >= 0.2)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, n);
}

/** Desde qué puntaje el emparejamiento se propone solo (debajo, la persona elige). */
export const PUNTAJE_SEGURO = 0.5;

// ── Destino y roles ───────────────────────────────────────────────────────────

export const DESTINO_DE: Record<TipoPapel, DestinoPapel> = {
  factura: "compra",
  yape: "cobro",
  "lista-precios": "precios",
  otro: "documento",
};

/** Quién puede guardar en cada destino (lo mismo que piden sus endpoints). */
export const ROLES_DESTINO: Record<DestinoPapel, readonly string[]> = {
  compra: ["admin", "almacenero"],
  cobro: ["admin", "cajero"],
  precios: ["admin"],
  documento: ["admin", "almacenero", "cajero"],
};

const GERENCIA = ["admin", "owner", "manager"];

/** ¿Este rol puede guardar ahí? admin, dueño y encargado pasan siempre (como `requireAdmin`). */
export function puedeGuardar(rol: string | null, destino: DestinoPapel): boolean {
  if (!rol) return false;
  return GERENCIA.includes(rol) || ROLES_DESTINO[destino].includes(rol);
}

// ── Lectura con reglas + respuesta de la IA ───────────────────────────────────

export type CamposPorTipo = {
  factura: CamposFactura;
  yape: CamposYape;
  "lista-precios": CamposLista;
  otro: CamposOtro;
};

/** Los campos de un tipo, sólo con reglas. */
export function camposConReglas(tipo: TipoPapel, texto: string): CamposPorTipo[TipoPapel] {
  switch (tipo) {
    case "factura":
      return {
        proveedor: { nombre: extraerProveedor(texto), ruc: extraerRuc(texto) },
        numero: extraerNumeroComprobante(texto),
        fecha: extraerFecha(texto),
        total: extraerTotal(texto),
        items: extraerItemsFactura(texto),
      };
    case "yape":
      return extraerYape(texto);
    case "lista-precios":
      return { proveedor: extraerProveedorLista(texto), filas: extraerListaPrecios(texto) };
    default:
      return { titulo: lineas(texto).find(tieneLetras)?.slice(0, 80) ?? null };
  }
}

/** ¿Hace falta la IA para sacar los campos de este tipo? */
export function faltaIA(tipo: TipoPapel, campos: CamposPorTipo[TipoPapel]): boolean {
  if (tipo === "factura") return (campos as CamposFactura).items.length === 0;
  if (tipo === "lista-precios") return (campos as CamposLista).filas.length === 0;
  return false;
}

const numero = z.coerce.number().finite().nonnegative();

/** Lo que la IA de texto tiene que devolver. Lo que no valide se descarta (nunca se inventa). */
export const RespuestaIASchema = z.object({
  tipo: z.enum(["factura", "yape", "lista-precios", "otro"]).catch("otro"),
  proveedor: z.object({ nombre: z.string().max(200).nullable().catch(null), ruc: z.string().max(20).nullable().catch(null) }).nullable().catch(null),
  numero: z.string().max(60).nullable().catch(null),
  fecha: z.string().max(30).nullable().catch(null),
  total: numero.nullable().catch(null),
  items: z.array(z.object({ nombre: z.string().min(1).max(200), cantidad: numero, precioUnitario: numero })).max(80).catch([]),
  monto: numero.nullable().catch(null),
  pagador: z.string().max(120).nullable().catch(null),
  filas: z.array(z.object({ nombre: z.string().min(1).max(200), costo: numero })).max(300).catch([]),
  titulo: z.string().max(120).nullable().catch(null),
});
export type RespuestaIA = z.infer<typeof RespuestaIASchema>;

/** El primer objeto JSON de la respuesta (los modelos a veces lo envuelven en ```json). */
export function jsonDeRespuesta(contenido: string): unknown {
  const inicio = contenido.indexOf("{");
  const fin = contenido.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    return JSON.parse(contenido.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

/** Los campos de la IA llevados a la forma de cada tipo; lo que ya leyeron las reglas manda. */
export function camposDesdeIA(tipo: TipoPapel, ia: RespuestaIA, reglas: Partial<CamposPorTipo[TipoPapel]> | null): CamposPorTipo[TipoPapel] {
  switch (tipo) {
    case "factura": {
      const r = (reglas ?? {}) as Partial<CamposFactura>;
      return {
        proveedor: {
          nombre: r.proveedor?.nombre ?? ia.proveedor?.nombre ?? null,
          ruc: r.proveedor?.ruc ?? null,
        },
        numero: r.numero ?? ia.numero ?? null,
        fecha: r.fecha ?? null,
        total: r.total ?? ia.total ?? null,
        items: r.items?.length ? r.items : ia.items.filter((i) => i.cantidad > 0).map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, costoUnitario: i.precioUnitario })),
      };
    }
    case "yape": {
      const r = (reglas ?? {}) as Partial<CamposYape>;
      return { monto: r.monto ?? ia.monto ?? null, nombre: r.nombre ?? ia.pagador ?? null, operacion: r.operacion ?? null, fecha: r.fecha ?? null, finCelular: r.finCelular ?? null };
    }
    case "lista-precios": {
      const r = (reglas ?? {}) as Partial<CamposLista>;
      return { proveedor: r.proveedor ?? ia.proveedor?.nombre ?? null, filas: r.filas?.length ? r.filas : ia.filas.filter((f) => f.costo > 0) };
    }
    default:
      return { titulo: ia.titulo ?? (reglas as Partial<CamposOtro> | null)?.titulo ?? null };
  }
}

/** La orden para la IA: sólo JSON, sin inventar. */
export const INSTRUCCION_IA = [
  "Lees papeles de una bodega peruana (facturas, boletas, capturas de Yape/Plin, listas de precios de proveedores).",
  "Devuelve SOLO un objeto JSON, sin texto antes ni después, con estas claves:",
  '{"tipo":"factura|yape|lista-precios|otro","proveedor":{"nombre":string|null,"ruc":null}|null,"numero":string|null,"fecha":string|null,"total":number|null,',
  '"items":[{"nombre":string,"cantidad":number,"precioUnitario":number}],"monto":number|null,"pagador":string|null,"filas":[{"nombre":string,"costo":number}],"titulo":string|null}',
  "Reglas: no inventes nada; si un dato no está en el texto, usa null o []. Montos en soles como número con punto decimal.",
  "items solo para factura/boleta; filas solo para lista de precios; monto y pagador solo para Yape/Plin; titulo = de qué trata el papel en 3 a 6 palabras.",
].join("\n");

// ── Contrato de `/api/admin/comandos-ia/papel/entender` ───────────────────────

/** Un producto del catálogo propuesto para una fila leída. */
export interface ProductoSugerido {
  id: number;
  nombre: string;
  stock: number | null;
  costo: number | null;
  unidad: string;
  puntaje: number;
}

export interface FilaCompraPropuesta extends ItemLeido {
  producto: ProductoSugerido | null;
  alternativas: ProductoSugerido[];
}

export interface PagadorPropuesto {
  /** null si quien lee no puede cobrar (no ve teléfonos) o la ficha no tiene celular. */
  telefono: string | null;
  nombre: string;
  /** Lo que debe en fiados abiertos (ACTIVO + VENCIDO). */
  saldo: number;
  puntaje: number;
}

export type PropuestaPapel =
  | { destino: "compra"; proveedor: { supplierId: string | null; nombre: string; ruc: string | null }; filas: FilaCompraPropuesta[] }
  | { destino: "cobro"; candidatos: PagadorPropuesto[] }
  | { destino: "precios"; filas: Array<FilaPrecio & { producto: ProductoSugerido | null }> }
  | { destino: "documento"; nombreSugerido: string };

export interface RespuestaEntender {
  tipo: TipoPapel;
  confianza: number;
  campos: CamposPorTipo[TipoPapel];
  propuesta: PropuestaPapel;
  /** Lo que gastó la IA de texto en este papel (0 = sólo reglas). */
  costoIaUsd: number;
  /** ¿Hay IA de visión en este servidor? (para ofrecer «Leer con IA de visión»). */
  visionDisponible: boolean;
  /** Una línea para la persona cuando la IA no pudo entrar (tope, sin proveedor). */
  aviso: string | null;
}

// ── Quién pagó un Yape ────────────────────────────────────────────────────────

/**
 * Desde qué puntaje se ofrece «¿Es X? Elegirlo». Debajo, el deudor sólo aparece
 * en la lista para elegirlo a mano: un Yape de un desconocido no sugiere a nadie.
 */
export const PUNTAJE_SUGERIR = 0.2;

/** Un cliente que podría haber pagado: su ficha y lo que debe en fiados abiertos. */
export interface FichaPagador {
  telefono: string;
  nombre: string;
  saldo: number;
  conDeuda: boolean;
}

/**
 * Los candidatos de un Yape, del más parecido al menos: por nombre y por el final
 * del celular (+0,4). Los que deben entran aunque no se parezcan (para elegirlos a
 * mano, con puntaje 0); los que no deben, sólo si se parecen. Máximo 8.
 */
export function candidatosDeCobro(c: Pick<CamposYape, "nombre" | "finCelular">, fichas: readonly FichaPagador[]): PagadorPropuesto[] {
  const lista: Array<PagadorPropuesto & { conDeuda: boolean }> = [];
  for (const f of fichas) {
    if (!f.nombre) continue;
    let puntaje = c.nombre ? emparejar(c.nombre, [{ id: f.telefono, nombre: f.nombre }], 1)[0]?.puntaje ?? 0 : 0;
    if (c.finCelular && f.telefono.endsWith(c.finCelular)) puntaje = Math.min(1, puntaje + 0.4);
    if (puntaje < PUNTAJE_SUGERIR && !f.conDeuda) continue;
    lista.push({
      telefono: /^\+?\d{6,15}$/.test(f.telefono) ? f.telefono : null,
      nombre: f.nombre,
      saldo: Math.round(f.saldo * 100) / 100,
      puntaje: Math.round(puntaje * 100) / 100,
      conDeuda: f.conDeuda,
    });
  }
  lista.sort((a, b) => b.puntaje - a.puntaje || Number(b.conDeuda) - Number(a.conDeuda) || b.saldo - a.saldo);
  return lista.slice(0, 8).map(({ conDeuda: _c, ...p }) => p);
}

/** El candidato que se ofrece con un clic; null si ninguno se parece de verdad. */
export function pagadorSugerido(candidatos: readonly PagadorPropuesto[]): PagadorPropuesto | null {
  const c = candidatos[0];
  return c && c.puntaje >= PUNTAJE_SUGERIR ? c : null;
}
