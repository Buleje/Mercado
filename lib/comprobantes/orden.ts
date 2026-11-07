/**
 * Orden de la lista de Facturas y boletas (ronda 4): la lista es paginada en el
 * servidor, así que el orden se pide a la base. Lista blanca de columnas; sin
 * `orden` queda la fecha descendente de siempre. Desempate estable por id.
 */
export const COLUMNAS_ORDEN = ["fecha", "serie", "cliente", "total", "estado"] as const;
export type ColumnaOrden = (typeof COLUMNAS_ORDEN)[number];
export type DireccionOrden = "asc" | "desc";

type Campo = Record<string, DireccionOrden>;

/** El `orderBy` de Prisma para esa columna; el id al final fija el empate. */
export function ordenDeLista(columna?: ColumnaOrden | null, dir: DireccionOrden = "desc"): Campo[] {
  const d = dir;
  switch (columna) {
    case "serie":
      return [{ series: d }, { number: d }, { id: d }];
    case "cliente":
      return [{ customerName: d }, { id: d }];
    case "total":
      return [{ total: d }, { id: d }];
    case "estado":
      return [{ sunatStatus: d }, { createdAt: "desc" }, { id: "desc" }];
    case "fecha":
      return [{ createdAt: d }, { id: d }];
    default:
      return [{ createdAt: "desc" }, { id: "desc" }];
  }
}
