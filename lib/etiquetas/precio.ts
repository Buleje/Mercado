/**
 * Etiquetas de precio para la góndola — armado PURO (sin jsPDF ni React).
 *
 * Cada etiqueta lleva: nombre corto, el precio en S/ bien grande, la unidad
 * («el kg», «por paquete»), el código de barras del producto y, sólo si el
 * precio BAJÓ hace poco y hay registro de cuánto era, el precio anterior
 * tachado.
 *
 * Reglas del negocio:
 *   - El precio impreso es el que cobra la caja: el precio base del producto.
 *     Los precios por cliente (ADR-430) no van acá: la góndola es para todos.
 *   - El código: el `barcode` del producto (EAN-13 si su verificador cuadra,
 *     si no Code 128); sin `barcode`, el SKU (código interno) en Code 128; sin
 *     ninguno, la etiqueta sale sin barras.
 *   - El precio anterior sale del historial de precios (PriceHistory), nunca se
 *     inventa: el último cambio dejó el precio de hoy, fue una BAJA y fue hace
 *     ≤ 30 días. Un «antes» viejo o una subida no se muestran.
 *
 * Lo dibujan `precio-pdf.ts` (PDF) y `components/inventario/EtiquetaPrecioVista`.
 */
import { codigoDeBarras, modulosTotales, type CodigoDeBarras } from "./codigo-barras";

// ── Formatos ──────────────────────────────────────────────────────────────────

export type FormatoEtiquetaPrecio = "a4-3x8" | "a4-3x10" | "rollo-50x25";

export interface FormatoEtiquetaPrecioInfo {
  id: FormatoEtiquetaPrecio;
  nombre: string;
  detalle: string;
  /** Tamaño de la página del PDF. En el rollo, una etiqueta por página. */
  hojaAnchoMm: number;
  hojaAltoMm: number;
  columnas: number;
  filas: number;
  anchoMm: number;
  altoMm: number;
  margenIzqMm: number;
  margenSupMm: number;
  /** Margen interno de cada etiqueta. */
  padMm: number;
  nombrePt: number;
  nombreLineas: number;
  /** Tamaño máximo del monto; se achica si el número no entra. */
  precioPt: number;
  monedaPt: number;
  unidadPt: number;
  anteriorPt: number;
  digitosPt: number;
  /** Ancho que se reserva al código de barras (zonas mudas incluidas). */
  barrasAnchoMm: number;
  barrasAltoMm: number;
  /** Módulo (barra más fina) al que se apunta; no se agranda más allá. */
  moduloIdealMm: number;
  /**
   * Punto de la impresora térmica (203 dpi = 0,125 mm) o null en A4. En la
   * térmica cada barra tiene que medir puntos ENTEROS: con 1,6 puntos por
   * módulo el rasterizado deforma las barras y la pistola no lee (medido 10-10
   * con zxing a 203 dpi: Code 128 de 13 dígitos a 0,199 mm → no leyó).
   */
  puntoMm: number | null;
  /** El rollo térmico imprime sólo negro: sin líneas de corte. */
  rollo: boolean;
}

/** Un punto de una térmica de 203 dpi, en mm. */
export const PUNTO_203_DPI_MM = 25.4 / 203;

export const FORMATOS_ETIQUETA_PRECIO: readonly FormatoEtiquetaPrecioInfo[] = [
  {
    id: "a4-3x8", nombre: "A4 · 24 por hoja", detalle: "3 × 8 · 70 × 37 mm",
    hojaAnchoMm: 210, hojaAltoMm: 297, columnas: 3, filas: 8, anchoMm: 70, altoMm: 37,
    margenIzqMm: 0, margenSupMm: 0.5, padMm: 3.5,
    nombrePt: 10, nombreLineas: 2, precioPt: 28, monedaPt: 10, unidadPt: 8, anteriorPt: 8.5, digitosPt: 7,
    barrasAnchoMm: 32, barrasAltoMm: 17, moduloIdealMm: 0.3, puntoMm: null, rollo: false,
  },
  {
    id: "a4-3x10", nombre: "A4 · 30 por hoja", detalle: "3 × 10 · 70 × 29,7 mm",
    hojaAnchoMm: 210, hojaAltoMm: 297, columnas: 3, filas: 10, anchoMm: 70, altoMm: 29.7,
    margenIzqMm: 0, margenSupMm: 0, padMm: 3,
    nombrePt: 8.5, nombreLineas: 2, precioPt: 21, monedaPt: 9, unidadPt: 7, anteriorPt: 7, digitosPt: 6.5,
    barrasAnchoMm: 32, barrasAltoMm: 12, moduloIdealMm: 0.3, puntoMm: null, rollo: false,
  },
  {
    id: "rollo-50x25", nombre: "Rollo térmico", detalle: "50 × 25 mm · una por etiqueta",
    hojaAnchoMm: 50, hojaAltoMm: 25, columnas: 1, filas: 1, anchoMm: 50, altoMm: 25,
    margenIzqMm: 0, margenSupMm: 0, padMm: 2,
    nombrePt: 7, nombreLineas: 2, precioPt: 18, monedaPt: 7.5, unidadPt: 6, anteriorPt: 6, digitosPt: 6,
    barrasAnchoMm: 28.5, barrasAltoMm: 10, moduloIdealMm: 0.25, puntoMm: PUNTO_203_DPI_MM, rollo: true,
  },
];

export const FORMATO_ETIQUETA_PRECIO_DEFAULT: FormatoEtiquetaPrecio = "a4-3x8";

export function esFormatoEtiquetaPrecio(v: unknown): v is FormatoEtiquetaPrecio {
  return FORMATOS_ETIQUETA_PRECIO.some((f) => f.id === v);
}

export function infoFormatoPrecio(formato: FormatoEtiquetaPrecio): FormatoEtiquetaPrecioInfo {
  return FORMATOS_ETIQUETA_PRECIO.find((f) => f.id === formato) ?? FORMATOS_ETIQUETA_PRECIO[0]!;
}

export function etiquetasPorHoja(formato: FormatoEtiquetaPrecio): number {
  const f = infoFormatoPrecio(formato);
  return f.columnas * f.filas;
}

/** Páginas del PDF (hojas A4, o etiquetas del rollo). */
export function hojasNecesarias(cantidad: number, formato: FormatoEtiquetaPrecio): number {
  return cantidad <= 0 ? 0 : Math.ceil(cantidad / etiquetasPorHoja(formato));
}

/** Dónde cae la etiqueta i (desde 0): página y esquina superior izquierda en mm. */
export function posicionEnHoja(i: number, formato: FormatoEtiquetaPrecio): { pagina: number; x: number; y: number } {
  const f = infoFormatoPrecio(formato);
  const porHoja = f.columnas * f.filas;
  const enHoja = i % porHoja;
  const col = enHoja % f.columnas;
  const fila = Math.floor(enHoja / f.columnas);
  return {
    pagina: Math.floor(i / porHoja),
    x: round2(f.margenIzqMm + col * f.anchoMm),
    y: round2(f.margenSupMm + fila * f.altoMm),
  };
}

// ── Código de barras: cuánto mide en cada formato ────────────────────────────

/** Barra más fina que la pistola común lee sin dudar (≈ EAN-13 al 58 %). */
export const MODULO_MIN_MM = 0.19;
/** Lo mínimo que se deja al precio cuando el código pide más ancho. */
export const PRECIO_MIN_MM = 16;

export interface MedidaBarras {
  /** Ancho del código con sus zonas mudas. */
  anchoMm: number;
  /** Sin redondear: en la térmica es un múltiplo exacto del punto. */
  moduloMm: number;
  /** false = el código es tan largo que en este formato sale más fino de lo que la pistola lee. */
  legible: boolean;
  /** true = no entra al costado del precio: va abajo, a todo el ancho (rollo con Code 128 largo). */
  abajo: boolean;
}

export function medidaDeBarras(codigo: CodigoDeBarras, formato: FormatoEtiquetaPrecio): MedidaBarras {
  const f = infoFormatoPrecio(formato);
  const total = modulosTotales(codigo);
  const util = f.anchoMm - 2 * f.padMm;
  if (f.puntoMm) {
    // Térmica: módulo de puntos enteros (2 a 203 dpi). Si al costado no entra, abajo a todo el ancho.
    const puntos = Math.max(2, Math.round(f.moduloIdealMm / f.puntoMm));
    let modulo = puntos * f.puntoMm;
    const abajo = total * modulo > f.barrasAnchoMm + 1e-6;
    const legible = total * modulo <= util + 1e-6;
    if (!legible) modulo = util / total; // no entra ni a todo el ancho: se dibuja igual y se avisa
    return { anchoMm: round2(total * modulo), moduloMm: modulo, legible, abajo };
  }
  let ancho = Math.min(total * f.moduloIdealMm, f.barrasAnchoMm);
  if (ancho / total < MODULO_MIN_MM) {
    // Le roba ancho al precio antes de imprimir barras que la pistola no lee.
    ancho = Math.min(total * MODULO_MIN_MM, util - PRECIO_MIN_MM);
  }
  const modulo = ancho / total;
  return { anchoMm: round2(ancho), moduloMm: modulo, legible: modulo >= MODULO_MIN_MM - 1e-9, abajo: false };
}

// ── Producto → etiqueta ──────────────────────────────────────────────────────

export interface ProductoEtiquetable {
  id: number;
  nombre: string;
  categoria: string;
  /** El precio base, el mismo que cobra la caja. */
  precio: number;
  unidad: string;
  barcode?: string | null;
  sku?: string | null;
  marca?: string | null;
}

/** El último cambio de precio registrado de un producto. */
export interface CambioDePrecio {
  antes: number;
  ahora: number;
  /** ISO. */
  cuando: string;
  /**
   * ISO: desde cuándo regía el «antes» (el cambio anterior del historial), o
   * null si no hay uno en la ventana leída —entonces regía desde hace más de
   * 30 días—. Un «antes» que duró menos de un día (un «Deshacer») no es rebaja.
   */
  antesDesde?: string | null;
}

export type OrigenCodigo = "barcode" | "sku";

export interface EtiquetaPrecio {
  productoId: number;
  nombre: string;
  moneda: "S/";
  precio: number;
  /** «12.50» o «1,250.00»: el número sin la moneda (es-PE usa punto decimal). */
  precioTexto: string;
  unidadTexto: string;
  precioAnterior: number | null;
  precioAnteriorTexto: string | null;
  codigo: CodigoDeBarras | null;
  origenCodigo: OrigenCodigo | null;
}

/** El nombre que entra en la etiqueta: sin espacios dobles, cortado en palabra con «…». */
export function nombreCorto(nombre: string, max = 48): string {
  const limpio = nombre.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,.;:-]+$/, "")}…`;
}

/** El monto como lo muestra la caja: dos decimales, punto decimal y coma de miles. */
export function montoTexto(n: number): string {
  return n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const UNIDAD_POR_PIEZA = new Set(["unidad", "unidades", "und", "unid", "u", "pieza", "piezas", "pza"]);
const UNIDAD_MEDIDA: Record<string, string> = {
  kg: "el kg", kilo: "el kg", kilos: "el kg", kilogramo: "el kg",
  g: "el gramo", gr: "el gramo", gramo: "el gramo",
  l: "el litro", lt: "el litro", litro: "el litro", litros: "el litro",
  ml: "el ml", m: "el metro", metro: "el metro", metros: "el metro",
  m3: "el m³", "m³": "el m³", pt: "el pie tablar", "pie tablar": "el pie tablar",
};
const UNIDAD_TILDE: Record<string, string> = { porcion: "porción", racion: "ración", galon: "galón" };

/** «c/u», «el kg», «por paquete»: cómo se lee el precio en la góndola. */
export function unidadTexto(unidad: string | null | undefined): string {
  const u = (unidad ?? "").trim().toLowerCase();
  if (!u || UNIDAD_POR_PIEZA.has(u)) return "c/u";
  const sinTilde = u.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return UNIDAD_MEDIDA[u] ?? UNIDAD_MEDIDA[sinTilde] ?? `por ${UNIDAD_TILDE[sinTilde] ?? u}`;
}

const LIMA_MS = 5 * 3600 * 1000; // UTC-5 todo el año (Perú no tiene horario de verano)
const DIA_MS = 24 * 3600 * 1000;

/** El día calendario de Lima («2026-10-10») de un instante. */
export function diaLima(fecha: Date | string): string {
  const t = typeof fecha === "string" ? Date.parse(fecha) : fecha.getTime();
  return new Date(t - LIMA_MS).toISOString().slice(0, 10);
}

export function cambioEsDeHoy(cambio: CambioDePrecio | undefined, ahora: Date): boolean {
  return !!cambio && diaLima(cambio.cuando) === diaLima(ahora);
}

/** Cambió en los últimos 7 días calendario de Lima (hoy incluido). */
export function cambioEsDeLaSemana(cambio: CambioDePrecio | undefined, ahora: Date): boolean {
  if (!cambio) return false;
  const desde = diaLima(new Date(ahora.getTime() - 6 * DIA_MS));
  return diaLima(cambio.cuando) >= desde && diaLima(cambio.cuando) <= diaLima(ahora);
}

export const DIAS_PRECIO_ANTERIOR = 30;

/**
 * El «antes» tachado, o null. Sólo si el último cambio dejó el precio de hoy
 * (si después alguien lo cambió sin historial, ese «antes» ya no es verdad),
 * fue una baja, pasó hace ≤ 30 días y el «antes» rigió al menos un día
 * (subir y deshacer a los 2 minutos deja una «baja» en el historial que nunca
 * fue precio de góndola).
 */
export function precioAnteriorVigente(precio: number, cambio: CambioDePrecio | undefined, ahora: Date): number | null {
  if (!cambio) return null;
  const centavos = (n: number) => Math.round(n * 100);
  if (centavos(cambio.ahora) !== centavos(precio)) return null;
  if (centavos(cambio.antes) <= centavos(precio)) return null;
  const dias = (ahora.getTime() - Date.parse(cambio.cuando)) / DIA_MS;
  if (!(dias >= -1 && dias <= DIAS_PRECIO_ANTERIOR)) return null;
  if (cambio.antesDesde && Date.parse(cambio.cuando) - Date.parse(cambio.antesDesde) < DIA_MS) return null;
  return cambio.antes;
}

/** El código de la etiqueta y de dónde salió: barcode primero, SKU después. */
export function codigoDelProducto(p: Pick<ProductoEtiquetable, "barcode" | "sku">): { codigo: CodigoDeBarras | null; origen: OrigenCodigo | null } {
  const porBarcode = codigoDeBarras(p.barcode);
  if (porBarcode) return { codigo: porBarcode, origen: "barcode" };
  const porSku = codigoDeBarras(p.sku);
  if (porSku) return { codigo: porSku, origen: "sku" };
  return { codigo: null, origen: null };
}

export function armarEtiqueta(p: ProductoEtiquetable, cambio: CambioDePrecio | undefined, ahora: Date): EtiquetaPrecio {
  const anterior = precioAnteriorVigente(p.precio, cambio, ahora);
  const { codigo, origen } = codigoDelProducto(p);
  return {
    productoId: p.id,
    nombre: nombreCorto(p.nombre),
    moneda: "S/",
    precio: p.precio,
    precioTexto: montoTexto(p.precio),
    unidadTexto: unidadTexto(p.unidad),
    precioAnterior: anterior,
    precioAnteriorTexto: anterior == null ? null : `S/ ${montoTexto(anterior)}`,
    codigo,
    origenCodigo: origen,
  };
}

export interface PedidoEtiqueta {
  productoId: number;
  cantidad: number;
}

export const CANTIDAD_MAX_POR_PRODUCTO = 200;
export const ETIQUETAS_MAX = 2000;

/** Normaliza lo que se tipea en «cantidad»: entero entre 0 y el tope. */
export function cantidadValida(n: unknown): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), CANTIDAD_MAX_POR_PRODUCTO) : 0;
}

/**
 * La tanda a imprimir: cada producto repetido `cantidad` veces, en el orden
 * pedido. Productos que ya no existen se saltan; el total se corta en ETIQUETAS_MAX.
 */
export function armarTanda(
  productos: readonly ProductoEtiquetable[],
  pedidos: readonly PedidoEtiqueta[],
  cambios: Readonly<Record<number, CambioDePrecio>>,
  ahora: Date,
): EtiquetaPrecio[] {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const tanda: EtiquetaPrecio[] = [];
  for (const { productoId, cantidad } of pedidos) {
    const p = porId.get(productoId);
    if (!p) continue;
    const etiqueta = armarEtiqueta(p, cambios[productoId], ahora);
    for (let i = 0; i < cantidadValida(cantidad) && tanda.length < ETIQUETAS_MAX; i++) tanda.push(etiqueta);
  }
  return tanda;
}

/**
 * Cuántas etiquetas se pidieron antes del tope de la tanda (productos que ya
 * no existen no cuentan). Si supera ETIQUETAS_MAX, la pantalla avisa que se
 * imprimen menos.
 */
export function etiquetasPedidas(productos: readonly ProductoEtiquetable[], pedidos: readonly PedidoEtiqueta[]): number {
  const ids = new Set(productos.map((p) => p.id));
  let total = 0;
  for (const { productoId, cantidad } of pedidos) if (ids.has(productoId)) total += cantidadValida(cantidad);
  return total;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
