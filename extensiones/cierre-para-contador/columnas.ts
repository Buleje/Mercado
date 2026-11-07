/**
 * Pieza `cierre-para-contador` — las columnas que el contador puede pedir.
 *
 * Sólo datos y etiquetas (sin React ni servidor): las usan el manifiesto (el
 * Zod de las opciones), el armado de las filas y el formulario del superadmin.
 * Cada columna es un dato que el sistema YA guarda; ninguna es un cálculo.
 */

export const COLUMNAS_VENTAS = ["fecha", "hora", "comprobante", "ruc", "pago", "descuento", "cajero", "total"] as const;
export type ColumnaVenta = (typeof COLUMNAS_VENTAS)[number];

export const COLUMNAS_GASTOS = [
  "fecha",
  "categoria",
  "descripcion",
  "proveedor",
  "ruc",
  "tipoDoc",
  "numeroDoc",
  "pago",
  "igv",
  "monto",
] as const;
export type ColumnaGasto = (typeof COLUMNAS_GASTOS)[number];

/** El encabezado que ve el contador en el Excel. */
export const ROTULO_VENTA: Readonly<Record<ColumnaVenta, string>> = {
  fecha: "Fecha",
  hora: "Hora",
  comprobante: "Comprobante",
  ruc: "RUC del cliente",
  pago: "Forma de pago",
  descuento: "Descuento (S/)",
  cajero: "Cajero",
  total: "Total (S/)",
};

export const ROTULO_GASTO: Readonly<Record<ColumnaGasto, string>> = {
  fecha: "Fecha",
  categoria: "Categoría",
  descripcion: "Descripción",
  proveedor: "Proveedor",
  ruc: "RUC del proveedor",
  tipoDoc: "Tipo de documento",
  numeroDoc: "N° de documento",
  pago: "Forma de pago",
  igv: "IGV (S/)",
  monto: "Monto (S/)",
};
