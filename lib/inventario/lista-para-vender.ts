/**
 * «Lista para vender» (28-10): qué le falta al catálogo para que la caja venda
 * rápido (código de barras), sepa la ganancia (costo) y cuide el stock.
 * Lógica pura: la pantalla sólo la dibuja. NO toca precios de venta.
 */
import { leFalta, type ProductoDelCatalogo } from "@/lib/inventario/catalogo-incompleto";

export interface ProductoDeLista extends ProductoDelCatalogo {
  id: number;
  name: string;
  price?: number | string | null;
  active?: boolean;
  sku?: string | null;
}

export interface ConteoDeFaltas {
  sinCodigo: number;
  sinCosto: number;
  sinControl: number;
}

/** Los tres contadores sobre los productos activos (los servicios no cuentan). */
export function contarFaltas(productos: readonly ProductoDeLista[]): ConteoDeFaltas {
  const c: ConteoDeFaltas = { sinCodigo: 0, sinCosto: 0, sinControl: 0 };
  for (const p of productos) {
    if (p.active === false) continue;
    if (leFalta(p, "sin-codigo")) c.sinCodigo++;
    if (leFalta(p, "sin-costo")) c.sinCosto++;
    if (leFalta(p, "sin-control")) c.sinControl++;
  }
  return c;
}

const norm = (t: string | null | undefined) => (t ?? "").trim().toLowerCase();

/** Otro producto (no `exceptoId`) que ya tiene ese código de barras. */
export function productoConElCodigo<T extends ProductoDeLista>(productos: readonly T[], codigo: string, exceptoId?: number): T | null {
  const q = norm(codigo);
  if (!q) return null;
  return productos.find((p) => p.id !== exceptoId && norm(p.barcode) === q) ?? null;
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Productos activos SIN código cuyo nombre contiene lo escrito (sin tildes); vacío = los primeros por nombre. */
export function sugerirSinCodigo<T extends ProductoDeLista>(productos: readonly T[], texto: string, limite = 6): T[] {
  const q = sinTildes(texto.trim());
  return productos
    .filter((p) => p.active !== false && leFalta(p, "sin-codigo") && (q === "" || sinTildes(p.name).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .slice(0, limite);
}

/** Margen sobre el precio de venta, en %: (precio − costo) / precio. null si no hay con qué calcular. */
export function margenDe(precio: number | string | null | undefined, costoEnCentimos: number | null): number | null {
  const p = Number(precio ?? 0);
  if (!(p > 0) || costoEnCentimos == null || costoEnCentimos <= 0) return null;
  return Math.round(((p - costoEnCentimos / 100) / p) * 1000) / 10;
}

export type LecturaDeStock = { ok: true; cantidad: number } | { ok: false; error: string };

/** Stock inicial escrito a mano: entero de 0 a 1 000 000 (vacío no vale: activar el control exige un número). */
export function leerStockInicial(texto: string): LecturaDeStock {
  const t = texto.trim();
  if (t === "") return { ok: false, error: "Escribe cuántas unidades hay" };
  if (!/^\d+$/.test(t)) return { ok: false, error: "Usa un número entero, como 12" };
  const n = Number(t);
  if (n > 1_000_000) return { ok: false, error: "Esa cantidad es demasiado grande" };
  return { ok: true, cantidad: n };
}
