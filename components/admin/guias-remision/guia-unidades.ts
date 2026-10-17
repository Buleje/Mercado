/**
 * Unidades de la guía con nombre legible (auditoría de comprobantes F22, 17-10).
 * Antes el ítem pedía «Unidad» en texto libre con `NIU` adentro y placeholder
 * «Und»: nadie sabía que NIU es «Unidad». Se guarda el código del catálogo 03
 * de SUNAT; se lee el nombre.
 */

export interface UnidadGuia {
  codigo: string;
  nombre: string;
}

/** Las del catálogo 03 que usa una bodega o un almacén (las raras se escriben con su código). */
export const UNIDADES_GUIA: readonly UnidadGuia[] = [
  { codigo: "NIU", nombre: "Unidad" },
  { codigo: "KGM", nombre: "Kilogramo" },
  { codigo: "GRM", nombre: "Gramo" },
  { codigo: "TNE", nombre: "Tonelada" },
  { codigo: "LTR", nombre: "Litro" },
  { codigo: "GLL", nombre: "Galón" },
  { codigo: "MTR", nombre: "Metro" },
  { codigo: "MTK", nombre: "Metro cuadrado" },
  { codigo: "MTQ", nombre: "Metro cúbico" },
  { codigo: "BX", nombre: "Caja" },
  { codigo: "PK", nombre: "Paquete" },
  { codigo: "BG", nombre: "Bolsa o saco" },
  { codigo: "BO", nombre: "Botella" },
  { codigo: "CA", nombre: "Lata" },
  { codigo: "DZN", nombre: "Docena" },
  { codigo: "SET", nombre: "Juego" },
  { codigo: "BE", nombre: "Fardo" },
];

const POR_CODIGO = new Map(UNIDADES_GUIA.map((u) => [u.codigo, u]));

/** Cómo lo escriben en el pedido o en el producto → su código. */
const SINONIMOS: Record<string, string> = {
  unidad: "NIU", unidades: "NIU", und: "NIU", unid: "NIU", uni: "NIU", un: "NIU", u: "NIU",
  kg: "KGM", kgs: "KGM", kilo: "KGM", kilos: "KGM", kilogramo: "KGM", kilogramos: "KGM",
  g: "GRM", gr: "GRM", grs: "GRM", gramo: "GRM", gramos: "GRM",
  t: "TNE", tn: "TNE", ton: "TNE", tonelada: "TNE", toneladas: "TNE",
  l: "LTR", lt: "LTR", lts: "LTR", litro: "LTR", litros: "LTR",
  gal: "GLL", galon: "GLL", galones: "GLL",
  m: "MTR", metro: "MTR", metros: "MTR", m2: "MTK", "m²": "MTK", m3: "MTQ", "m³": "MTQ",
  caja: "BX", cajas: "BX", paquete: "PK", paquetes: "PK", paq: "PK",
  bolsa: "BG", bolsas: "BG", saco: "BG", sacos: "BG",
  botella: "BO", botellas: "BO", bot: "BO", lata: "CA", latas: "CA",
  docena: "DZN", docenas: "DZN", juego: "SET", juegos: "SET", fardo: "BE", fardos: "BE",
};

const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.$/, "").trim();

/**
 * La unidad de un pedido («kg», «botella», «porción») → código SUNAT.
 * `exacta: false` = no tiene equivalente y se cuenta como «Unidad»: la
 * pantalla lo avisa con la palabra original (no se cambia en silencio).
 */
export function normalizarUnidad(texto: string | null | undefined): { codigo: string; exacta: boolean } {
  const crudo = (texto ?? "").trim();
  if (!crudo) return { codigo: "NIU", exacta: true };
  const mayus = crudo.toUpperCase();
  if (POR_CODIGO.has(mayus)) return { codigo: mayus, exacta: true };
  const sinonimo = SINONIMOS[normal(crudo)];
  if (sinonimo) return { codigo: sinonimo, exacta: true };
  return { codigo: "NIU", exacta: false };
}

/** `KGM` → «Kilogramo»; un código fuera de la lista se muestra tal cual. */
export function unidadLegible(codigo: string | null | undefined): string {
  const c = (codigo ?? "").trim();
  return POR_CODIGO.get(c.toUpperCase())?.nombre ?? (c || "Unidad");
}

/** Lo que se imprime y se ve en el detalle: «Kilogramo (KGM)». */
export function unidadConCodigo(codigo: string | null | undefined): string {
  const c = (codigo ?? "").trim().toUpperCase() || "NIU";
  const u = POR_CODIGO.get(c);
  return u ? `${u.nombre} (${u.codigo})` : c;
}
