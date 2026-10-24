/**
 * La presentación de un producto de Musa —lo que se compara de un vistazo en la
 * tarjeta: «1000 ml», «Pack × 5», «3 productos»— sacada SÓLO de lo que el dueño
 * cargó, nunca inventada. En este orden:
 *
 *  1. La ficha técnica del panel (Inventario › Editar producto › Ficha técnica) con
 *     la etiqueta «Contenido», «Contenido neto», «Presentación», «Formato»,
 *     «Tamaño», «Volumen» o «Peso neto». Es el lugar para cargarla.
 *  2. La unidad del producto si no es la genérica («unidad», «und»…): «250 ml».
 *  3. Un kit o dúo: cuántas cosas trae («3 productos», «2 unidades»).
 *  4. La cantidad escrita en la descripción o el nombre: «Formato de 1000 ml» →
 *     «1000 ml»; «Pack de 5 láminas» o «(× 5)» → «Pack × 5».
 *
 * Sin nada de eso, `null`: la tarjeta deja la línea vacía (no escribe «unidad»).
 * Pura y sin servidor: la usan `datos.ts` y su test.
 */

/** Una fila de la ficha técnica del panel (`specsJson`), ya limpia. */
export interface FilaFicha {
  etiqueta: string;
  valor: string;
}

/** Las etiquetas de la ficha técnica que cuentan como presentación. */
export const ETIQUETA_PRESENTACION = /^(contenido( neto)?|presentaci[oó]n|formato|tama[nñ]o|volumen|peso( neto)?|cantidad)$/i;

const UNIDAD_GENERICA = /^(u|un|und|unid|unidad|unidades|pieza|piezas|pza|item|ítem)\.?$/i;
const CANTIDAD = /(\d+(?:[.,]\d+)?)\s?(ml|l|lt|g|gr|kg|oz)(?![\p{L}\d])/iu;
const PACK = /pack\s+de\s+(\d+)|\(\s*[×x]\s*(\d+)\s*\)/i;

/** `specsJson` del panel (`[{ label, value }]`) → filas limpias; texto roto o vacío → []. */
export function leerFicha(specsJson: string | null | undefined): FilaFicha[] {
  if (!specsJson) return [];
  let crudo: unknown;
  try {
    crudo = JSON.parse(specsJson);
  } catch {
    return [];
  }
  if (!Array.isArray(crudo)) return [];
  const filas: FilaFicha[] = [];
  for (const f of crudo) {
    if (!f || typeof f !== "object") continue;
    const { label, value } = f as { label?: unknown; value?: unknown };
    const etiqueta = typeof label === "string" ? label.trim() : "";
    const valor = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
    if (etiqueta && valor) filas.push({ etiqueta, valor });
  }
  return filas.slice(0, 12);
}

function cantidadEn(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const m = CANTIDAD.exec(texto);
  if (m?.[1] && m[2]) {
    const u = m[2].toLowerCase();
    return `${m[1]} ${u === "l" || u === "lt" ? "L" : u === "gr" ? "g" : u}`;
  }
  const pack = PACK.exec(texto);
  const n = pack?.[1] ?? pack?.[2];
  return n ? `Pack × ${n}` : null;
}

export function presentacionDe(p: {
  nombre: string;
  descripcion: string | null;
  unidad: string | null;
  ficha: readonly FilaFicha[];
  kit: { componentes: readonly { cantidad: number }[] } | null;
}): string | null {
  const deLaFicha = p.ficha.find((f) => ETIQUETA_PRESENTACION.test(f.etiqueta));
  if (deLaFicha) return deLaFicha.valor;

  const unidad = p.unidad?.trim();
  if (unidad && !UNIDAD_GENERICA.test(unidad)) return unidad;

  if (p.kit && p.kit.componentes.length > 0) {
    const total = p.kit.componentes.reduce((s, c) => s + c.cantidad, 0);
    return p.kit.componentes.length === 1 ? `${total} unidades` : `${total} productos`;
  }

  return cantidadEn(p.descripcion) ?? cantidadEn(p.nombre);
}
