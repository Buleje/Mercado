/**
 * voz-parser — entender lo que se dicta en el mostrador, sin ir a la nube.
 *
 * El dictado del POS acumulaba TODO lo hablado y recién al decir «listo» lo
 * mandaba entero a la IA. Con eso el cajero habla a ciegas: no sabe si lo
 * entendió, si el producto existe o si hay stock hasta que termina. Y si la
 * llamada falla, se perdió el dictado completo.
 *
 * Esto parsea **cada frase apenas se cierra**, acá mismo: cuánto, de qué, y con
 * qué medida. Después la busca en el catálogo que ya está cargado en pantalla.
 * La IA queda de respaldo para lo que esto no resuelve.
 *
 * PURO y client-safe.
 */

// ── normalización ────────────────────────────────────────────────────────────

/** Sin tildes, sin signos, en minúscula: «Tornillo 1"» y «tornillo 1» se cruzan. */
export function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // El guion SEPARA, no une: «Coca-Cola» son dos palabras y quien dicta dice
    // «coca cola». Dejarlo pegado hacía que ninguna de las dos calzara.
    .replace(/-/g, " ")
    .replace(/[^\w\s.,/]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const NUMEROS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14,
  quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, ciento: 100,
  media: 0.5, medio: 0.5,
};

/** Unidades habladas → unidad canónica. */
const UNIDADES: Record<string, string> = {
  kilo: "kg", kilos: "kg", kg: "kg", kilogramo: "kg", kilogramos: "kg",
  gramo: "g", gramos: "g", g: "g",
  litro: "l", litros: "l", l: "l", lt: "l",
  metro: "m", metros: "m", m: "m", mt: "m", mts: "m",
  pulgada: "in", pulgadas: "in", in: "in",
  pie: "ft", pies: "ft",
  unidad: "u", unidades: "u", u: "u",
  docena: "docena", docenas: "docena",
  pack: "pack", packs: "pack",
  caja: "caja", cajas: "caja",
  bolsa: "bolsa", bolsas: "bolsa",
  paquete: "paquete", paquetes: "paquete",
  botella: "botella", botellas: "botella",
};

/** Palabras que no aportan a la búsqueda. */
const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "por", "con", "en", "y", "a", "al"]);

export interface PedidoHablado {
  /** Cuántos. 1 si no se dijo. */
  cantidad: number;
  /** Unidad de la cantidad, si se dijo («2 kilos de…»). */
  unidad: string | null;
  /** Lo que hay que buscar en el catálogo, ya limpio. */
  consulta: string;
  /** Medida que califica al producto («de 1 metro» → { valor: 1, unidad: "m" }). */
  medida: { valor: number; unidad: string } | null;
  /** La frase tal como se dictó (para mostrarla). */
  crudo: string;
}

/** Corta la frase en pedidos: «2 tablas y 3 clavos», «dos leches, un pan». */
export function separarPedidos(texto: string): string[] {
  return norm(texto)
    .split(/\s*(?:,|;|\by\b|\bmas\b|\btambien\b|\bademas\b)\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 1);
}

const numeroDe = (tok: string): number | null => {
  if (/^\d+([.,]\d+)?$/.test(tok)) return Number(tok.replace(",", "."));
  return NUMEROS[tok] ?? null;
};

/**
 * Interpreta UN pedido hablado.
 *
 * «2 tablas de tornillo de 1 mt» →
 *   { cantidad: 2, unidad: null, consulta: "tablas tornillo", medida: 1 m }
 *
 * La primera cifra es la cantidad; una cifra posterior seguida de unidad de
 * longitud/volumen es una **medida del producto**, no otra cantidad. Confundirlas
 * es lo que haría buscar «1 metro» en vez de «tabla de tornillo».
 */
export function parsearPedido(frase: string): PedidoHablado | null {
  const crudo = frase.trim();
  const tokens = norm(frase).split(" ").filter(Boolean);
  if (tokens.length === 0) return null;

  let cantidad = 1;
  let unidad: string | null = null;
  let medida: { valor: number; unidad: string } | null = null;
  let cantidadTomada = false;
  const palabras: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const n = numeroDe(tok);
    if (n != null) {
      const sig = tokens[i + 1] ? UNIDADES[tokens[i + 1]] : undefined;
      if (!cantidadTomada) {
        cantidad = n;
        cantidadTomada = true;
        // «2 kilos de arroz»: la unidad pertenece a la cantidad.
        if (sig) {
          unidad = sig;
          i++;
        }
        continue;
      }
      // Segunda cifra con unidad de dimensión: califica al producto.
      if (sig) {
        medida = { valor: n, unidad: sig };
        i++;
        continue;
      }
      palabras.push(tok);
      continue;
    }
    if (!VACIAS.has(tok)) palabras.push(tok);
  }

  const consulta = palabras.join(" ").trim();
  if (!consulta) return null;
  return { cantidad, unidad, consulta, medida, crudo };
}

// ── búsqueda en el catálogo ──────────────────────────────────────────────────

export interface ProductoBuscable {
  id: number;
  name: string;
  price: number;
  stock?: number | null;
}

export interface Coincidencia {
  producto: ProductoBuscable;
  /**
   * Puntaje relativo: más alto = mejor calce. NO se acota a 1 — hacerlo
   * aplastaba los bonus y dejaba empatados a «Tabla de Tornillo 1m» y «Tabla
   * de Cedro 1m» cuando se pedía tornillo, con el desempate quedando en el
   * orden alfabético.
   */
  score: number;
}

/**
 * Singular tosco pero suficiente. El caso que obliga a la regla del medio:
 * el plural de «arroz» es «arroces» (z→c), y sin eso «2 arroces» no encontraba
 * «Arroz Costeño» y terminaba eligiendo «Lentejas Costeño».
 */
function singular(p: string): string {
  if (p.length > 4 && p.endsWith("ces")) return `${p.slice(0, -3)}z`; // arroces → arroz
  if (p.length > 4 && p.endsWith("es")) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith("s")) return p.slice(0, -1);
  return p;
}

/**
 * ¿Estas dos palabras son la misma?
 *
 * El prefijo suelto generaba disparates: «pan» calzaba con «panetón», y la «a»
 * de «a la brasa» calzaba con «azúcar» —por eso «medio kilo de azúcar» proponía
 * pollo a la brasa—. Un prefijo sólo vale si tiene cuerpo (4+ letras) y si cubre
 * la mayor parte de la palabra larga.
 */
function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  if (corta.length < 4) return false;
  return larga.startsWith(corta) && corta.length / larga.length >= 0.6;
}

/**
 * Busca el producto que mejor calza con lo dictado.
 *
 * Puntúa por palabras compartidas (comparadas en singular, así «2 tablas» encuentra
 * «Tabla de tornillo»), y suma un bonus fuerte si la MEDIDA dicha aparece en el
 * nombre: entre «Tabla tornillo 1m» y «Tabla tornillo 3m», decir «de 1 metro» tiene
 * que desempatar.
 */
export function buscarEnCatalogo(
  pedido: PedidoHablado,
  catalogo: ProductoBuscable[],
  opts: { minScore?: number; max?: number } = {},
): Coincidencia[] {
  const minScore = opts.minScore ?? 0.34;
  const max = opts.max ?? 5;
  const buscadas = pedido.consulta.split(" ").map(singular).filter((p) => p.length > 1);
  if (buscadas.length === 0) return [];

  const out: Coincidencia[] = [];
  for (const producto of catalogo) {
    const nombre = norm(producto.name);
    const tokensProd = nombre.split(" ").map(singular);
    let aciertos = 0;
    for (const p of buscadas) {
      if (tokensProd.some((t) => mismaPalabra(t, p))) aciertos++;
    }
    if (aciertos === 0) continue;
    let score = aciertos / buscadas.length;

    if (pedido.medida) {
      const { valor, unidad } = pedido.medida;
      // «1 m» aparece como «1m», «1 m», «1metro», «1.00 m»…
      const patron = new RegExp(`(^|[^\\d])${valor}(\\.0+)?\\s*${unidad}\\b`, "i");
      if (patron.test(nombre)) score += 0.5;
      else if (/\d\s*(m|cm|mm|in|ft|l|kg|g)\b/.test(nombre)) score -= 0.2; // tiene OTRA medida
    }
    // Nombre corto que usa casi todas sus palabras: match más limpio.
    if (tokensProd.length <= buscadas.length + 1) score += 0.08;

    if (score >= minScore) out.push({ producto, score: Math.round(score * 100) / 100 });
  }

  return out.sort((a, b) => b.score - a.score || a.producto.name.localeCompare(b.producto.name, "es")).slice(0, max);
}

export type EstadoLinea = "listo" | "ambiguo" | "sin_stock" | "no_encontrado";

export interface LineaDictada {
  id: string;
  pedido: PedidoHablado;
  candidatos: Coincidencia[];
  elegido: ProductoBuscable | null;
  estado: EstadoLinea;
}

/**
 * Resuelve una frase dictada contra el catálogo, en el acto.
 *
 * Estados, en el orden en que le importan al cajero:
 * · `no_encontrado` — nada parecido: hay que repetirlo o buscarlo a mano;
 * · `ambiguo` — dos candidatos casi iguales, elegir cuál (no adivinar);
 * · `sin_stock` — está en el catálogo pero no hay para vender;
 * · `listo` — se puede agregar.
 */
export function resolverDictado(frase: string, catalogo: ProductoBuscable[], id = frase): LineaDictada | null {
  const pedido = parsearPedido(frase);
  if (!pedido) return null;
  const candidatos = buscarEnCatalogo(pedido, catalogo);

  if (candidatos.length === 0) {
    return { id, pedido, candidatos, elegido: null, estado: "no_encontrado" };
  }
  // Dos candidatos casi empatados: preguntar es más rápido que deshacer.
  const empate = candidatos.length > 1 && candidatos[0].score - candidatos[1].score < 0.15;
  if (empate) return { id, pedido, candidatos, elegido: null, estado: "ambiguo" };

  const elegido = candidatos[0].producto;
  const stock = elegido.stock;
  if (stock != null && stock < pedido.cantidad) {
    return { id, pedido, candidatos, elegido, estado: "sin_stock" };
  }
  return { id, pedido, candidatos, elegido, estado: "listo" };
}

/** Palabras de control que no son productos. */
export const COMANDOS = {
  confirmar: /\b(listo|confirmar|terminar|cobrar|ya esta)\b/,
  cancelar: /\b(cancelar|borrar todo|olvidalo)\b/,
  deshacer: /\b(deshacer|quitar el ultimo|borra eso|atras)\b/,
};

export function comandoDe(texto: string): "confirmar" | "cancelar" | "deshacer" | null {
  const t = norm(texto);
  if (COMANDOS.cancelar.test(t)) return "cancelar";
  if (COMANDOS.deshacer.test(t)) return "deshacer";
  if (COMANDOS.confirmar.test(t)) return "confirmar";
  return null;
}
