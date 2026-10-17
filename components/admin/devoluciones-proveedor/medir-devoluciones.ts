/**
 * C56 (17-10): cuánto se recupera de lo que se le reclama a cada proveedor y quién
 * reincide. Reglas de la ficha: toda tasa dice su denominador y su período, y lo
 * que no tiene costo («pendiente de valoración») NUNCA se suma como plata.
 *
 * - Solicitado = valor de lo devuelto (no anulado) que tiene costo.
 * - Recuperado = valor de las RESUELTAS que tienen costo (resuelta = el proveedor
 *   respondió; si fue nota de crédito por menos, aquí no se ve: dato que falta).
 * - Días a resolver = de registrada a resuelta, aproximado por la última
 *   modificación (`updatedAt`): no hay columna con la fecha de resolución.
 */
import { valorDevolucion, type Devolucion } from "./tipos";

export interface MedidaProveedor {
  proveedor: string;
  /** Devoluciones que cuentan (sin anuladas): el denominador. */
  n: number;
  resueltas: number;
  /** Promedio de días de registrada a resuelta; null si ninguna se resolvió. */
  diasParaResolver: number | null;
  solicitado: number;
  recuperado: number;
  /** Ítems sin costo: no están en solicitado ni en recuperado. */
  sinValorar: number;
  /** El motivo que más se repite y cuántas veces; `reincide` si son 2 o más. */
  motivo: { texto: string; veces: number } | null;
  reincide: boolean;
}

export interface MedidaDevoluciones {
  porProveedor: MedidaProveedor[];
  total: Omit<MedidaProveedor, "proveedor" | "motivo" | "reincide">;
  /** Anuladas del período: no cuentan en ningún denominador (se dicen aparte). */
  anuladas: number;
}

const DIA = 86_400_000;

function acumular(lista: Devolucion[]): Omit<MedidaProveedor, "proveedor" | "motivo" | "reincide"> {
  let resueltas = 0, solicitado = 0, recuperado = 0, sinValorar = 0, dias = 0;
  for (const d of lista) {
    const v = valorDevolucion(d.items);
    solicitado += v.total;
    sinValorar += v.sinPrecio;
    if (d.estado === "RESUELTA") {
      resueltas++;
      recuperado += v.total;
      const desde = new Date(d.createdAt).getTime();
      const hasta = new Date(d.updatedAt ?? d.createdAt).getTime();
      if (Number.isFinite(desde) && Number.isFinite(hasta)) dias += Math.max(0, (hasta - desde) / DIA);
    }
  }
  return {
    n: lista.length, resueltas, solicitado, recuperado, sinValorar,
    diasParaResolver: resueltas > 0 ? Math.round((dias / resueltas) * 10) / 10 : null,
  };
}

/** Recibe la lista YA filtrada por el período que se muestra. */
export function medirDevoluciones(lista: Devolucion[]): MedidaDevoluciones {
  const vivas = lista.filter((d) => d.estado !== "ANULADA");
  const grupos = new Map<string, Devolucion[]>();
  for (const d of vivas) grupos.set(d.proveedorNombre, [...(grupos.get(d.proveedorNombre) ?? []), d]);

  const porProveedor = [...grupos].map(([proveedor, devs]): MedidaProveedor => {
    const motivos = new Map<string, number>();
    for (const d of devs) motivos.set(d.motivo, (motivos.get(d.motivo) ?? 0) + 1);
    const [texto, veces] = [...motivos].sort((a, b) => b[1] - a[1])[0] ?? [];
    return { proveedor, ...acumular(devs), motivo: texto ? { texto, veces: veces! } : null, reincide: (veces ?? 0) >= 2 };
  }).sort((a, b) => b.n - a.n || b.solicitado - a.solicitado);

  return { porProveedor, total: acumular(vivas), anuladas: lista.length - vivas.length };
}
