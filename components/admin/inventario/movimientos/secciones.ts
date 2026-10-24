/**
 * Las secciones de «Entradas y salidas» (`?sub=`). La lista la lee
 * `__tests__/admin-subvistas-sincronizadas.test.ts` cuando
 * `lib/admin/subvistas-modulos.ts` las declara.
 *
 * Pérdidas era una pestaña aparte y mostraba las MISMAS filas que el kardex
 * filtrado por «Pérdida» (`lib/db/mermas.db.ts`: `where type = "merma"`), con
 * su propio formulario para registrarlas. Ahora es una sección: mismas filas,
 * mismo modal para registrar, y la ficha de cada una es la del movimiento.
 */
export const SUBS_MOVIMIENTOS = ["movimientos", "perdidas"] as const;
export type SeccionMovimientos = (typeof SUBS_MOVIMIENTOS)[number];

export const ID_PANEL_MOVIMIENTOS = "panel-entradas-salidas";
export const MODULO_SECCIONES = "inventario-movimientos";

export const SECCION: Record<SeccionMovimientos, {
  rotulo: string;
  ayuda: { what: string; affects: string; example: string };
}> = {
  movimientos: {
    rotulo: "Movimientos",
    ayuda: {
      what: "Cada entrada y salida de stock de cada producto: compras, ventas, devoluciones, ajustes y pérdidas, con quién la registró.",
      affects: "Las cifras son del período y los filtros elegidos. Toca una fila para ver su ficha o revertirla.",
      example: "Llegan 24 latas de atún de la factura 0034: registras una entrada «Compra» de 24 y el stock sube de 6 a 30.",
    },
  },
  perdidas: {
    rotulo: "Pérdidas",
    ayuda: {
      what: "Lo que se perdió —vencido, roto, robado o deteriorado— con su causa y cuánto cuesta. Cada pérdida es una salida del kardex.",
      affects: "El monto es cantidad × el costo de HOY del producto: el movimiento no guarda el costo que tenía ese día.",
      example: "Se vencen 3 yogures de S/ 2,10: registras la pérdida «Vencimiento», el stock baja en 3 y suma S/ 6,30.",
    },
  },
};
