/**
 * Precio con y sin IGV — vista previa del formulario de producto (18-10).
 *
 * El precio que se guarda (`Product.price`) es el que paga el cliente, CON IGV. Esto sólo
 * calcula la otra cara para mostrarla: no cambia lo guardado y los totales de la venta los
 * sigue calculando el servidor. La tasa sale de `lib/tax.ts` (no se repite el 18).
 *
 * Exonerado / inafecto (p. ej. Amazonía, Ley 27037) o tienda con IGV 0: no hay impuesto,
 * base = total.
 */
import { extractIgv, addIgv, IGV_RATE } from "@/lib/tax";
import { afectacionDe } from "@/lib/sunat/lineas-comprobante";

export type Afectacion = "gravado" | "exonerado" | "inafecto";

export interface DesglosePrecio {
  base: number;
  igv: number;
  total: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Tasa (fracción) que aplica a un producto: 0 si es exonerado/inafecto o la
 * tienda no cobra IGV. Usa `afectacionDe` (el criterio del comprobante:
 * minúsculas y por prefijo, «Exonerado» o «EXONERADO» cuentan) y no una
 * comparación exacta, para no cobrar IGV por una mayúscula.
 */
export function tasaDelProducto(taxType: string | null | undefined, tasaTienda: number = IGV_RATE): number {
  if (afectacionDe(taxType) !== "gravado") return 0;
  return Number.isFinite(tasaTienda) && tasaTienda > 0 ? tasaTienda : 0;
}

/** «Exonerado», «Inafecto» o null (gravado con IGV). */
export function etiquetaSinIgv(taxType: string | null | undefined, tasaTienda: number = IGV_RATE): string | null {
  if (taxType === "exonerado") return "Exonerado de IGV";
  if (taxType === "inafecto") return "Inafecto a IGV";
  return tasaDelProducto(taxType, tasaTienda) === 0 ? "Sin IGV (tu tienda no cobra IGV)" : null;
}

/** Del precio de venta (con IGV) a base + IGV. `base + igv` siempre suma el total exacto. */
export function desdeTotal(total: number, tasa: number = IGV_RATE): DesglosePrecio {
  const t = r2(Number.isFinite(total) && total > 0 ? total : 0);
  const base = r2(extractIgv(t, tasa).base);
  return { base, igv: r2(t - base), total: t };
}

/** De la base (sin IGV) al precio de venta. El total sale redondeado a céntimos. */
export function desdeBase(base: number, tasa: number = IGV_RATE): DesglosePrecio {
  const b = r2(Number.isFinite(base) && base > 0 ? base : 0);
  const total = r2(addIgv(b, tasa).total);
  return { base: b, igv: r2(total - b), total };
}

/** Texto de un input numérico → número (acepta coma decimal); vacío o inválido → 0. */
export function leerMonto(texto: string): number {
  const n = Number(String(texto).trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Número → texto para un input (sin ceros de sobra: 10 → «10», 11.8 → «11.8»); 0 → vacío. */
export function montoATexto(n: number): string {
  return n > 0 ? String(r2(n)) : "";
}
