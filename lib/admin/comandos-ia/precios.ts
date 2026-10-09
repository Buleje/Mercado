/**
 * «Precios en bloque» (Comandos IA) — la aritmética y el emparejado, puros.
 *
 * Los usa la ruta del plan (el servidor arma las filas), el modal de la
 * diferencia (sólo previsualiza una celda editada) y el test. Aquí renacen el
 * «precio al 15 %», la Calculadora costo+margen→precio y el Simulador ±% del
 * Análisis viejo: las mismas fórmulas, ahora para muchos productos a la vez.
 *
 * Plata en céntimos ENTEROS antes de comparar o redondear: 19,5 × 24,9 / 18 da
 * 26,974999… en float y un redondeo ingenuo lo bajaba a 26,97.
 */

export const MARGEN_MINIMO = 0.15;

export type Redondeo = 0 | 0.1 | 0.5 | 1;
export const REDONDEOS: readonly Redondeo[] = [0, 0.1, 0.5, 1];

export type TipoOperacion = "pct" | "monto" | "margen";
/** pct: +5 = sube 5 % · monto: −0,5 = baja 50 céntimos · margen: 30 = lleva a 30 % de margen. */
export interface Operacion {
  tipo: TipoOperacion;
  valor: number;
}
export interface FiltroOrden {
  categorias: string[];
  incluye: string[];
  excluye: string[];
}
export interface PlanOrden {
  filtro: FiltroOrden;
  operacion: Operacion;
  redondeo: Redondeo;
}
/** "mantener-margen" o el margen objetivo en % (30 = 30 %). */
export type PoliticaLista = "mantener-margen" | { margen: number };
export type AvisoFila = "margen<15" | "sin-costo" | "excluido";

export interface FilaDiferencia {
  productId: number;
  nombre: string;
  categoria: string;
  costoHoy: number | null;
  costoNuevo: number | null;
  precioHoy: number;
  precioNuevo: number;
  margenHoy: number | null;
  margenNuevo: number | null;
  aviso?: AvisoFila;
}

/** Lo mínimo de un producto que necesita el cálculo (DbProduct lo cumple). */
export interface ProductoPrecio {
  id: number;
  name: string;
  category: string;
  price: number;
  costPrice?: number | null;
}

// ── Aritmética ──────────────────────────────────────────────────────────────

/** Céntimos enteros, medio hacia arriba, limpiando el ruido del float. */
export function aCentimos(v: number): number {
  return Math.round(Math.round(v * 1e6) / 1e4);
}

/** ¿Mismo monto al céntimo? (la tolerancia del negocio, no la del float). */
export function mismoMonto(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return a == null && b == null;
  return aCentimos(a) === aCentimos(b);
}

/** margen = (precio − costo) / precio. Sin costo o sin precio, no hay margen. */
export function margen(precio: number, costo: number | null | undefined): number | null {
  if (costo == null || !Number.isFinite(costo) || !(precio > 0)) return null;
  return (precio - costo) / precio;
}

/** El precio que deja `margenObjetivo` (0,30 = 30 %): costo / (1 − margen). */
export function precioParaMargen(costo: number, margenObjetivo: number): number | null {
  if (!(costo > 0) || !(margenObjetivo >= 0) || !(margenObjetivo < 1)) return null;
  return costo / (1 - margenObjetivo);
}

/** Mantener el margen con un costo nuevo = la misma proporción precio/costo. */
export function precioManteniendoMargen(precioHoy: number, costoHoy: number | null, costoNuevo: number): number | null {
  if (costoHoy == null || !(costoHoy > 0) || !(costoNuevo > 0) || !(precioHoy > 0)) return null;
  return (costoNuevo * precioHoy) / costoHoy;
}

/** El precio que sale de la orden, sin redondear. null = no se puede (margen sin costo). */
export function aplicarOperacion(precio: number, costo: number | null | undefined, op: Operacion): number | null {
  if (op.tipo === "pct") return precio * (1 + op.valor / 100);
  if (op.tipo === "monto") return precio + op.valor;
  return costo == null ? null : precioParaMargen(costo, op.valor / 100);
}

/**
 * Redondeo al múltiplo SIEMPRE hacia arriba (26,93 → 27,00 a 10 céntimos):
 * el redondeo nunca te come margen. Con 0 sólo se lleva al céntimo (medio
 * hacia arriba: 26,975 → 26,98).
 */
export function redondear(valor: number, paso: Redondeo): number {
  const c = aCentimos(valor);
  if (!paso) return c / 100;
  const p = Math.round(paso * 100);
  return (Math.ceil(c / p) * p) / 100;
}

/** La fila de la diferencia, con su aviso (excluido > sin costo > margen bajo 15 %). */
export function armarFila(
  p: ProductoPrecio,
  nuevo: { precio: number; costo: number | null },
  excluido = false,
): FilaDiferencia {
  const costoHoy = p.costPrice ?? null;
  const precioNuevo = excluido ? p.price : nuevo.precio;
  const costoNuevo = excluido ? costoHoy : nuevo.costo;
  const margenNuevo = margen(precioNuevo, costoNuevo);
  const aviso: AvisoFila | undefined = excluido
    ? "excluido"
    : costoNuevo == null
      ? "sin-costo"
      : margenNuevo != null && margenNuevo < MARGEN_MINIMO
        ? "margen<15"
        : undefined;
  return {
    productId: p.id,
    nombre: p.name,
    categoria: p.category,
    costoHoy,
    costoNuevo,
    precioHoy: p.price,
    precioNuevo,
    margenHoy: margen(p.price, costoHoy),
    margenNuevo,
    ...(aviso ? { aviso } : {}),
  };
}

// ── Nombres ─────────────────────────────────────────────────────────────────

const VACIAS = new Set(["el", "la", "los", "las", "de", "del", "y", "con", "un", "una", "al", "a", "en", "x"]);

/** minúsculas, sin tildes ni signos, «d'onofrio» → «donofrio». */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[^a-z0-9.%/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function palabras(s: string): string[] {
  return normalizar(s)
    .split(" ")
    .filter((w) => w && !VACIAS.has(w));
}

const ES_MEDIDA = /^\d+(?:\.\d+)?(?:g|gr|kg|ml|l|lt|cc|un|und)$|^x\d+$/;

/** «fideo» ≈ «fideos», «arroz» ≈ «arroz»; las medidas (900g, 1kg, x30) sólo iguales. */
function coincide(a: string, b: string): boolean {
  if (a === b) return true;
  if (ES_MEDIDA.test(a) || ES_MEDIDA.test(b)) return false;
  return a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));
}

/** ¿El nombre del producto contiene la palabra o frase de la orden («el arroz», «coca cola»)? */
export function nombreContiene(nombre: string, termino: string): boolean {
  const n = palabras(nombre);
  const t = palabras(termino);
  return t.length > 0 && t.every((w) => n.some((x) => coincide(w, x)));
}

/** Qué productos toca la orden y cuáles saca su «menos …». Sin categoría ni nombre = todos. */
export function filtrarPorOrden<P extends ProductoPrecio>(productos: P[], f: FiltroOrden) {
  const cats = new Set(f.categorias.map(normalizar));
  const todos = cats.size === 0 && f.incluye.length === 0;
  const tocados = productos.filter(
    (p) => todos || cats.has(normalizar(p.category)) || f.incluye.some((t) => nombreContiene(p.name, t)),
  );
  // «menos cigarros» saca la categoría entera, no sólo los nombres que la dicen (Hamilton x20).
  const fuera = (p: P) =>
    f.excluye.some((t) => nombreContiene(p.name, t) || normalizar(p.category) === normalizar(t) || nombreContiene(p.category, t));
  return { incluidos: tocados.filter((p) => !fuera(p)), excluidos: tocados.filter(fuera) };
}

export interface Emparejado {
  estado: "unico" | "ambiguo" | "ninguno";
  productId: number | null;
  candidatos: Array<{ productId: number; nombre: string; puntaje: number }>;
}

/**
 * Empareja una línea de la lista del proveedor con el catálogo, sin IA:
 * puntaje = palabras de la línea que aparecen en el producto ÷ palabras de la
 * línea; una medida distinta (900g vs 1kg) lo anula. Único si el mejor pasa
 * 0,6 y le saca 0,2 al segundo.
 */
export function emparejarNombre(nombre: string, productos: ProductoPrecio[]): Emparejado {
  const q = palabras(nombre);
  if (q.length === 0) return { estado: "ninguno", productId: null, candidatos: [] };
  const medidasQ = q.filter((w) => ES_MEDIDA.test(w));
  const puntuados = productos
    .map((p) => {
      const n = palabras(p.name);
      const medidasN = n.filter((w) => ES_MEDIDA.test(w));
      if (medidasQ.length && medidasN.length && !medidasQ.some((m) => medidasN.includes(m))) {
        return { productId: p.id, nombre: p.name, puntaje: 0 };
      }
      const comunes = q.filter((w) => n.some((x) => coincide(w, x))).length;
      return { productId: p.id, nombre: p.name, puntaje: comunes / q.length };
    })
    .filter((c) => c.puntaje >= 0.4)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, 4);
  const [mejor, segundo] = puntuados;
  if (!mejor) return { estado: "ninguno", productId: null, candidatos: [] };
  if (mejor.puntaje >= 0.6 && (!segundo || mejor.puntaje - segundo.puntaje >= 0.2)) {
    return { estado: "unico", productId: mejor.productId, candidatos: puntuados };
  }
  return { estado: "ambiguo", productId: null, candidatos: puntuados };
}

/**
 * «Panetón D'Onofrio 900g 19.50 · Chifles 3.30» → filas {nombre, costo}. Corta
 * por renglón, «·», «;» o «|»; el costo es el ÚLTIMO número suelto del trozo
 * (con coma o punto). Lo que no trae costo vuelve en `ignoradas`.
 */
export function parsearListaProveedor(texto: string): { filas: Array<{ nombre: string; costo: number }>; ignoradas: string[] } {
  const filas: Array<{ nombre: string; costo: number }> = [];
  const ignoradas: string[] = [];
  for (const trozo of texto.split(/\r?\n|·|;|\|/)) {
    const t = trozo.trim();
    if (!t) continue;
    // `(?<![\d.,])`: «Leche Gloria 2,805» o «1,500.00» no son 805 ni 500 — van a ignoradas.
    const m = t.match(/^(.*?\S)[\s:=-]*(?:s\/\.?\s*)?(?<![\d.,])(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:soles?)?$/i);
    const costo = m ? Number(m[2].replace(",", ".")) : NaN;
    if (m && costo > 0 && /[a-záéíóúñ]/i.test(m[1])) filas.push({ nombre: m[1].trim(), costo });
    else ignoradas.push(t.slice(0, 80));
  }
  return { filas, ignoradas };
}

/** El primer objeto JSON de una respuesta de IA (con ```json o texto alrededor). */
export function extraerJson(raw: string): unknown {
  const m = raw.replace(/```json\s*|\s*```/g, "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

// ── La orden en palabras, sin IA ────────────────────────────────────────────

const NUM = "(\\d+(?:\\.\\d+)?)";
const VERBO_SUBE = "(?:sube|subir|subele|aumenta|aumentar|incrementa|incrementar)";
const VERBO_BAJA = "(?:baja|bajar|bajale|rebaja|rebajar|reduce|reducir|descuenta|descontar)";

function leerRedondeo(t: string): { redondeo: Redondeo; resto: string } | null {
  const m = t.match(new RegExp(`\\s*,?\\s*(?:y\\s+)?redonde\\w*\\s*(?:a|al|en)?\\s*(?:los|las)?\\s*(?:${NUM}\\s*)?(centimos?|soles?|sol|decimos?|entero)?\\b`));
  if (!m) return { redondeo: 0, resto: t };
  const n = m[1] ? Number(m[1]) : 1;
  const u = m[2] ?? "";
  const paso = u.startsWith("centimo") ? n / 100 : u.startsWith("decimo") ? 0.1 : u ? n : NaN;
  if (!(REDONDEOS as readonly number[]).includes(paso) || paso === 0) return null;
  return { redondeo: paso as Redondeo, resto: t.replace(m[0], " ") };
}

/** UNA sola operación en toda la frase; dos cifras («5 % y 1 sol») o dos verbos = null. */
function leerOperacion(t: string): Operacion | null {
  const mg = t.match(new RegExp(`${NUM}\\s*%\\s*de\\s*margen`)) ?? t.match(new RegExp(`margen\\s*(?:de|a|al|del)?\\s*${NUM}\\s*%`));
  const pcts = [...t.matchAll(new RegExp(`${NUM}\\s*(?:%|por ciento)`, "g"))];
  const montos = [...t.matchAll(new RegExp(`(?:s/\\.?\\s*${NUM}|${NUM}\\s*(centimos?|soles?|sol)\\b)`, "g"))];
  const sube = new RegExp(`\\b${VERBO_SUBE}\\b`).test(t);
  const baja = new RegExp(`\\b${VERBO_BAJA}\\b`).test(t);
  if (mg) return pcts.length === 1 && montos.length === 0 && !sube && !baja ? { tipo: "margen", valor: Number(mg[1]) } : null;
  if (sube === baja || pcts.length + montos.length !== 1) return null;
  const signo = sube ? 1 : -1;
  if (pcts.length) return { tipo: "pct", valor: signo * Number(pcts[0][1]) };
  const m = montos[0];
  const n = Number(m[1] ?? m[2]);
  return { tipo: "monto", valor: (signo * n) / ((m[3] ?? "").startsWith("centimo") ? 100 : 1) };
}

/** «menos el arroz y el azúcar» → ["arroz", "azucar"]. */
function leerExcluidos(t: string): string[] {
  const m = t.match(/\b(?:menos|excepto|salvo|sin contar|pero no)\s+(.+)$/);
  if (!m) return [];
  return m[1]
    .split(/,|\s+y\s+|\s+ni\s+|\s+o\s+/)
    .map((x) => palabras(x).join(" "))
    .filter(Boolean);
}

/**
 * Las órdenes de siempre («sube 5 % Abarrotes menos el arroz, redondea a 10
 * céntimos», «lleva a 30 % de margen las bebidas») se entienden sin IA ($0).
 * Exige UNA operación y al menos una categoría real (o «todo el catálogo»);
 * cualquier otra cosa → null y la ruta le pregunta a la IA.
 */
export function interpretarOrdenConReglas(orden: string, categorias: string[]): PlanOrden | null {
  const base = ` ${normalizar(orden)} `;
  const r = leerRedondeo(base);
  if (!r) return null;
  const operacion = leerOperacion(r.resto);
  if (!operacion || !Number.isFinite(operacion.valor) || operacion.valor === 0) return null;
  if (operacion.tipo === "pct" && (operacion.valor <= -90 || operacion.valor > 300)) return null;
  if (operacion.tipo === "margen" && (operacion.valor <= 0 || operacion.valor >= 95)) return null;
  const antesDelMenos = r.resto.split(/\b(?:menos|excepto|salvo|sin contar|pero no)\b/)[0];
  const cats = categorias.filter((c) => {
    const n = normalizar(c);
    return n.length > 0 && new RegExp(`(?:^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(antesDelMenos);
  });
  const todo = /\btodo el catalogo\b|\btodos los productos\b|\btoda la tienda\b/.test(antesDelMenos);
  if (cats.length === 0 && !todo) return null;
  return { filtro: { categorias: cats, incluye: [], excluye: leerExcluidos(r.resto) }, operacion, redondeo: r.redondeo };
}

const fmt = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

/** «Sube 5 % · Abarrotes · menos arroz · redondea a 10 céntimos» (lo que se entendió, para que lo confirmes). */
export function describirPlan(p: PlanOrden): string {
  const { tipo, valor } = p.operacion;
  const op =
    tipo === "margen"
      ? `Lleva a ${fmt(valor)} % de margen`
      : tipo === "pct"
        ? `${valor > 0 ? "Sube" : "Baja"} ${fmt(Math.abs(valor))} %`
        : `${valor > 0 ? "Sube" : "Baja"} S/ ${Math.abs(valor).toFixed(2)}`;
  const quien = [...p.filtro.categorias, ...p.filtro.incluye].join(", ") || "todo el catálogo";
  const menos = p.filtro.excluye.length ? ` · menos ${p.filtro.excluye.join(", ")}` : "";
  const red = p.redondeo ? ` · redondea a ${p.redondeo < 1 ? `${Math.round(p.redondeo * 100)} céntimos` : "S/ 1"}` : "";
  return `${op} · ${quien}${menos}${red}`;
}
