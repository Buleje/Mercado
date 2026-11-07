/**
 * Emparejar un pedido escrito (la foto de la lista de un cliente) con el
 * catálogo del negocio — «Venta desde una foto» (copiado de Alegra, 18-10).
 *
 * Puro: sin base ni red. La ruta `/api/ocr/pedido` lee la foto con la IA, la
 * base trae el catálogo (`CotizacionesDB.productosPorTexto`) y acá se decide,
 * línea por línea, qué producto es y cuánta confianza da.
 *
 * Reglas:
 *  - Se compara sin tildes ni mayúsculas y por palabras: «leche gloria» halla
 *    «Leche Gloria Entera 1L UHT». Una letra de más o de menos (letra a mano)
 *    también cuenta, con menos puntaje.
 *  - La cantidad y la unidad del papel («2 cj», «1 doc») no son parte del
 *    nombre: se sacan, y la unidad sólo desempata (caja ↔ producto por caja).
 *  - Las medidas («1L», «400 ml», «5 kg») se comparan EXACTAS: 400 ml no es 500 ml.
 *  - El código de barras o el SKU escrito tal cual = ese producto.
 *  - El precio escrito en el papel es referencia: el que vale es el del
 *    catálogo, y el total lo vuelve a calcular el servidor al guardar.
 */

export type Confianza = "alta" | "media" | "baja" | "sin_match";

export interface ProductoDelCatalogo {
  id: number;
  nombre: string;
  /** Precio de venta del catálogo (`Product.price`). */
  precio: number;
  /** `Product.unit` («caja», «botella», «kg»…). */
  unidad?: string | null;
  /** Código de barras y SKU: escrito tal cual en el papel, es ese producto. */
  codigos?: readonly string[];
  /** `Product.taxType` (gravado | exonerado | inafecto), para la vista previa del IGV. */
  taxType?: string | null;
}

export interface Candidato {
  producto: ProductoDelCatalogo;
  /** 0 a 1. */
  puntaje: number;
}

export interface LineaLeida {
  /** La línea tal cual la escribió el cliente: «2 cj leche gloria». */
  textoLeido: string;
  cantidad: number;
  /** El precio escrito en el papel, si había. Sólo referencia. */
  precioLeido: number | null;
}

export interface Alternativa {
  productoId: number;
  nombre: string;
  precio: number;
  taxType: string | null;
}

export interface LineaEmparejada extends LineaLeida {
  productoId: number | null;
  productoNombre: string | null;
  precioCatalogo: number | null;
  taxType: string | null;
  confianza: Confianza;
  /** Hasta 3 productos parecidos, para corregir con un toque. */
  alternativas: Alternativa[];
}

/** Alternativas que se ofrecen por línea (además del elegido). */
export const MAX_ALTERNATIVAS = 3;

/** Por debajo de esto no se ofrece ni como alternativa. */
const PISO_CANDIDATO = 0.25;
/** Por debajo de esto la línea queda sin producto. */
const PISO_MATCH = 0.4;
const UMBRAL_ALTA = 0.8;
const MARGEN_ALTA = 0.1;
const UMBRAL_MEDIA = 0.6;
const BONO_UNIDAD = 0.05;

const CANTIDAD_MAXIMA = 99_999;

/** Cómo se escribe la unidad en un pedido → la unidad del catálogo. */
const UNIDADES: Record<string, string> = {
  cj: "caja", cja: "caja", caj: "caja", caja: "caja", cajas: "caja",
  doc: "docena", docena: "docena", docenas: "docena", dz: "docena", dna: "docena",
  u: "unidad", und: "unidad", unid: "unidad", unidad: "unidad", unidades: "unidad",
  bot: "botella", botella: "botella", botellas: "botella",
  pq: "paquete", paq: "paquete", paquete: "paquete", paquetes: "paquete",
  bol: "bolsa", bolsa: "bolsa", bolsas: "bolsa",
  lata: "lata", latas: "lata",
  pack: "pack", packs: "pack", six: "pack", sixpack: "pack",
  sobre: "sobre", sobres: "sobre",
  frasco: "frasco", frascos: "frasco",
  bandeja: "bandeja", bandejas: "bandeja",
  barra: "barra", barras: "barra",
  saco: "saco", sacos: "saco",
  fardo: "fardo", fardos: "fardo",
  tira: "tira", tiras: "tira",
};

/** Medidas de tamaño: «1 lt» → «1l». */
const MEDIDAS: Record<string, string> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", k: "kg",
  g: "g", gr: "g", grs: "g", gramos: "g",
  l: "l", lt: "l", lts: "l", litro: "l", litros: "l",
  ml: "ml", cc: "ml",
  oz: "oz",
};

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "con", "en", "y", "x", "por", "para", "un", "una", "uno", "al", "a"]);

/** Sin tildes ni mayúsculas, «1,5» → «1.5», y sólo letras, números y punto decimal. */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/(^|\s)\.+|\.+(?=\s|$)/g, " ")
    .trim();
}

const esNumero = (t: string) => /^\d+(\.\d+)?$/.test(t);
/** «1.50» → «1.5», «1000ml» → «1l»: la medida escrita de dos formas es la misma. */
function medida(n: string, unidad: string): string {
  let v = Number(n);
  let u = unidad;
  if ((u === "ml" || u === "g") && v >= 1000 && v % 100 === 0) {
    v = v / 1000;
    u = u === "ml" ? "l" : "kg";
  }
  return `${v}${u}`;
}

interface Partes {
  /** Palabras del nombre (sin cantidad, unidad ni palabras vacías). */
  palabras: string[];
  /** Medidas («1l», «400ml»). Se comparan exactas. */
  medidas: string[];
  /** La unidad del pedido («caja»), si la escribió. */
  unidad: string | null;
}

/**
 * Parte un texto en palabras, medidas y unidad. `esPedido` = viene del papel:
 * el número del principio es la cantidad, no parte del nombre.
 */
export function partir(texto: string, esPedido: boolean): Partes {
  const crudos = normalizarTexto(texto).split(" ").filter(Boolean);
  // «2cj», «12und», «400ml»: número pegado a letras → dos piezas.
  const toks: string[] = [];
  for (const t of crudos) {
    const m = /^(\d+(?:\.\d+)?)([a-z]+)$/.exec(t);
    if (m) toks.push(m[1], m[2]);
    else toks.push(t);
  }
  const palabras: string[] = [];
  const medidas: string[] = [];
  let unidad: string | null = null;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const sig = toks[i + 1];
    if (esNumero(t)) {
      // Al principio del pedido: la cantidad (y si sigue «kg», su unidad).
      if (esPedido && i === 0) {
        if (sig && (UNIDADES[sig] || MEDIDAS[sig])) {
          unidad = UNIDADES[sig] ?? MEDIDAS[sig];
          i++;
        }
        continue;
      }
      if (sig && MEDIDAS[sig]) {
        medidas.push(medida(t, MEDIDAS[sig]));
        i++;
      }
      continue; // un número suelto no dice qué producto es
    }
    if (UNIDADES[t]) {
      unidad ??= UNIDADES[t];
      continue;
    }
    if (VACIAS.has(t) || MEDIDAS[t]) continue;
    palabras.push(t);
  }
  return { palabras, medidas, unidad };
}

/** Distancia de edición (Levenshtein) con tope: corta en cuanto pasa `tope`. */
function distancia(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let minFila = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < minFila) minFila = v;
    }
    if (minFila > tope) return tope + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Qué tanto se parecen dos palabras (0 a 1). */
function parecido(a: string, b: string): number {
  if (a === b) return 1;
  const corta = Math.min(a.length, b.length);
  if (corta >= 3 && (a.startsWith(b) || b.startsWith(a))) return 0.85;
  if (corta >= 4 && distancia(a, b, 1) <= 1) return 0.75;
  if (corta >= 6 && distancia(a, b, 2) <= 2) return 0.6;
  return 0;
}

interface Preparado {
  producto: ProductoDelCatalogo;
  partes: Partes;
  unidad: string | null;
  codigos: Set<string>;
}

function preparar(productos: readonly ProductoDelCatalogo[]): Preparado[] {
  return productos.map((p) => {
    const u = normalizarTexto(p.unidad ?? "");
    return {
      producto: p,
      partes: partir(p.nombre, false),
      unidad: UNIDADES[u] ?? MEDIDAS[u] ?? (u || null),
      codigos: new Set((p.codigos ?? []).map((c) => normalizarTexto(c).replace(/\s+/g, "")).filter((c) => c.length >= 4)),
    };
  });
}

function puntuar(pedido: Partes, crudos: readonly string[], p: Preparado): number {
  if (crudos.some((t) => p.codigos.has(t))) return 1;
  const tp = pedido.palabras;
  if (tp.length === 0) return 0;
  const pp = p.partes.palabras;
  const usadas = new Set<number>();
  let suma = 0;
  let algunaPalabra = false;
  for (const t of tp) {
    let mejor = 0;
    let cual = -1;
    pp.forEach((w, j) => {
      const s = parecido(t, w);
      if (s > mejor) { mejor = s; cual = j; }
    });
    if (mejor >= 0.75) algunaPalabra = true;
    if (cual >= 0 && mejor >= 0.6) usadas.add(cual);
    suma += mejor;
  }
  if (!algunaPalabra) return 0;
  // Las medidas escritas cuentan como una palabra más: si no coinciden, restan.
  const medidasEscritas = pedido.medidas.length;
  const medidasIguales = pedido.medidas.filter((m) => p.partes.medidas.includes(m)).length;
  const cobertura = (suma + medidasIguales) / (tp.length + medidasEscritas);
  const precision = (usadas.size + medidasIguales) / Math.max(1, pp.length + p.partes.medidas.length);
  let puntaje = 0.75 * cobertura + 0.25 * precision;
  if (pedido.unidad && p.unidad && pedido.unidad === p.unidad) puntaje += BONO_UNIDAD;
  return Math.min(1, puntaje);
}

/** Los `n` productos que más se parecen a cada texto (de mayor a menor puntaje). */
export function candidatosPorTexto(
  textos: readonly string[],
  productos: readonly ProductoDelCatalogo[],
  n: number = 1 + MAX_ALTERNATIVAS,
): Candidato[][] {
  const catalogo = preparar(productos);
  return textos.map((texto) => {
    const pedido = partir(texto, true);
    const crudos = normalizarTexto(texto).split(" ").filter((t) => t.length >= 4);
    return catalogo
      .map((p) => ({ producto: p.producto, puntaje: puntuar(pedido, crudos, p) }))
      .filter((c) => c.puntaje >= PISO_CANDIDATO)
      // Empate: el nombre más corto (lo dicho cubre más de él), después por nombre.
      .sort((a, b) => b.puntaje - a.puntaje || a.producto.nombre.length - b.producto.nombre.length || a.producto.nombre.localeCompare(b.producto.nombre))
      .slice(0, Math.max(0, n));
  });
}

/** Cantidad del papel → número válido (sin dato o 0 → 1). */
export function cantidadValida(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return 1;
  return Math.min(CANTIDAD_MAXIMA, Math.round(v * 1000) / 1000);
}

const aAlternativa = (c: Candidato): Alternativa => ({
  productoId: c.producto.id,
  nombre: c.producto.nombre,
  precio: c.producto.precio,
  taxType: c.producto.taxType ?? null,
});

/** Decide una línea con sus candidatos (ya ordenados): qué producto, con qué confianza y qué alternativas. */
export function decidirLinea(linea: LineaLeida, candidatos: readonly Candidato[]): LineaEmparejada {
  const base: LineaLeida = {
    textoLeido: linea.textoLeido,
    cantidad: cantidadValida(linea.cantidad),
    precioLeido: linea.precioLeido != null && Number.isFinite(linea.precioLeido) && linea.precioLeido >= 0 ? linea.precioLeido : null,
  };
  const [mejor, segundo] = candidatos;
  if (!mejor || mejor.puntaje < PISO_MATCH) {
    return {
      ...base,
      productoId: null,
      productoNombre: null,
      precioCatalogo: null,
      taxType: null,
      confianza: "sin_match",
      alternativas: candidatos.slice(0, MAX_ALTERNATIVAS).map(aAlternativa),
    };
  }
  const margen = mejor.puntaje - (segundo?.puntaje ?? 0);
  const confianza: Confianza =
    mejor.puntaje >= UMBRAL_ALTA && margen >= MARGEN_ALTA ? "alta" : mejor.puntaje >= UMBRAL_MEDIA ? "media" : "baja";
  return {
    ...base,
    productoId: mejor.producto.id,
    productoNombre: mejor.producto.nombre,
    // El del catálogo, no el del papel: el servidor lo vuelve a poner al guardar.
    precioCatalogo: mejor.producto.precio,
    taxType: mejor.producto.taxType ?? null,
    confianza,
    alternativas: candidatos.slice(1, 1 + MAX_ALTERNATIVAS).map(aAlternativa),
  };
}

/** Todo el pedido contra el catálogo (lo que hace la ruta, en una llamada). */
export function emparejarPedido(lineas: readonly LineaLeida[], productos: readonly ProductoDelCatalogo[]): LineaEmparejada[] {
  const candidatos = candidatosPorTexto(lineas.map((l) => l.textoLeido), productos);
  return lineas.map((l, i) => decidirLinea(l, candidatos[i] ?? []));
}
