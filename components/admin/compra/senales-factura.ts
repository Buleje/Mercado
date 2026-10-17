/**
 * Señales de la canasta de Comprar (C60): «ninguna lectura crea una orden o
 * deuda sin revisión; documento repetido y costo incierto se señalan». Puro:
 * sólo arma el texto; no frena el guardado (un mismo número de otro proveedor
 * es normal).
 */
import { diaCorto, claveDeDia } from "@/lib/compras/ciclo-oc";
import { codigoDeOrden } from "@/lib/compras/referencia-documento";
import { formatCurrency } from "@/lib/format";
import type { CompraYaCargada } from "@/lib/compras/compra-con-numero";

/** Un costo leído que se aleja así de lo que pagaste la última vez es dudoso. */
export const RAZON_COSTO_DUDOSO = 1.5;

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export type AvisoRepetido = { texto: string; mismoProveedor: boolean; ordenId: string };

/** Lo que se dice bajo el N.º de comprobante cuando ese número ya está en otra compra. */
export function avisoComprobanteRepetido(compra: CompraYaCargada, numero: string, proveedorElegido: string | null): AvisoRepetido {
  const dia = claveDeDia(compra.fecha);
  const cuando = dia ? ` el ${diaCorto(dia)}` : "";
  const orden = codigoDeOrden(compra.id);
  const de = compra.proveedor.trim() || "un proveedor";
  const mismo = !proveedorElegido || !compra.proveedor.trim() || normal(proveedorElegido) === normal(compra.proveedor);
  const texto = mismo
    ? `${numero.trim()} ya está registrado${cuando}: orden ${orden} de ${de} por ${formatCurrency(compra.total)}. Revísala antes de guardar otra vez.`
    : `Ese número ya está en una compra de ${de}${cuando} (orden ${orden}). Si es de otro proveedor, puede ser normal.`;
  return { texto, mismoProveedor: mismo, ordenId: compra.id };
}

/** `ultimo`: el costo que ya tenías (última compra o, si nunca, el de la ficha). */
export type LineaLeida = { nombre: string; precio: number | undefined; ultimo: number | null };

export type CostoDudoso = { nombre: string; motivo: string };

/**
 * Renglones de la factura cuyo costo no hay que creer sin mirar: sin precio
 * (queda el de tu última compra o ninguno) o muy lejos del último que pagaste.
 */
export function costosDudosos(lineas: LineaLeida[]): CostoDudoso[] {
  const dudosos: CostoDudoso[] = [];
  for (const l of lineas) {
    if (l.precio === undefined) {
      dudosos.push({
        nombre: l.nombre,
        motivo: l.ultimo != null ? `la factura no trae precio: quedó ${formatCurrency(l.ultimo)}, el que tenías` : "la factura no trae precio y no tenías costo: anótalo",
      });
      continue;
    }
    if (l.ultimo == null || l.ultimo <= 0) continue;
    const razon = l.precio / l.ultimo;
    if (razon >= RAZON_COSTO_DUDOSO || razon <= 1 / RAZON_COSTO_DUDOSO) {
      const pct = Math.round((razon - 1) * 100);
      dudosos.push({
        nombre: l.nombre,
        motivo: `${formatCurrency(l.precio)} contra ${formatCurrency(l.ultimo)} que tenías (${pct > 0 ? "+" : ""}${pct} %): ¿precio por caja o por unidad?`,
      });
    }
  }
  return dudosos;
}
