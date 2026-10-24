/**
 * «Libros para el contador» — qué columnas se ven en la vista previa y qué
 * totales van arriba. El archivo que se baja lleva TODAS las columnas del
 * formato; acá solo las que se leen de un vistazo en una pantalla de 1280 px.
 */
import type { LibroId } from "@/lib/contabilidad/libros/comun";

export interface ColumnaVista {
  clave: string;
  corto: string;
  soles?: boolean;
  numero?: boolean;
}

export const LIBROS: Array<{ value: LibroId; label: string; formato: string; ayuda: string }> = [
  { value: "ventas", label: "Ventas", formato: "14.1", ayuda: "Registro de Ventas e Ingresos" },
  { value: "compras", label: "Compras", formato: "8.1", ayuda: "Registro de Compras" },
  { value: "kardex", label: "Kardex", formato: "13.1", ayuda: "Inventario permanente valorizado" },
];

export const COLUMNAS_VISTA: Record<LibroId, ColumnaVista[]> = {
  ventas: [
    { clave: "correlativo", corto: "N°" },
    { clave: "fechaEmision", corto: "Fecha" },
    { clave: "tipo", corto: "Tipo" },
    { clave: "serie", corto: "Serie" },
    { clave: "numero", corto: "Número" },
    { clave: "clienteNombre", corto: "Cliente" },
    { clave: "baseGravada", corto: "Base gravada", soles: true },
    { clave: "exonerada", corto: "Exonerado", soles: true },
    { clave: "igv", corto: "IGV", soles: true },
    { clave: "total", corto: "Total", soles: true },
    { clave: "origen", corto: "Origen" },
  ],
  compras: [
    { clave: "correlativo", corto: "N°" },
    { clave: "fechaSistema", corto: "Fecha anotada" },
    { clave: "tipo", corto: "Tipo" },
    { clave: "serie", corto: "Serie" },
    { clave: "numero", corto: "Número" },
    { clave: "provDoc", corto: "RUC / DNI" },
    { clave: "provNombre", corto: "Proveedor" },
    { clave: "bi1", corto: "Base imponible", soles: true },
    { clave: "igv1", corto: "IGV", soles: true },
    { clave: "total", corto: "Total", soles: true },
    { clave: "origen", corto: "Origen" },
  ],
  kardex: [
    { clave: "fecha", corto: "Fecha" },
    { clave: "descripcion", corto: "Producto" },
    { clave: "movimiento", corto: "Movimiento" },
    { clave: "operacion", corto: "Op." },
    { clave: "entCant", corto: "Entra", numero: true },
    { clave: "entCu", corto: "Costo u.", soles: true },
    { clave: "salCant", corto: "Sale", numero: true },
    { clave: "salCu", corto: "Costo u.", soles: true },
    { clave: "saldoCant", corto: "Saldo", numero: true },
  ],
};

export const TOTALES_VISTA: Record<LibroId, Array<{ clave: string; rotulo: string }>> = {
  ventas: [
    { clave: "baseGravada", rotulo: "Base gravada" },
    { clave: "exonerada", rotulo: "Exonerado" },
    { clave: "inafecta", rotulo: "Inafecto" },
    { clave: "igv", rotulo: "IGV" },
    { clave: "total", rotulo: "Importe total" },
  ],
  compras: [
    { clave: "bi1", rotulo: "Base imponible" },
    { clave: "igv1", rotulo: "IGV" },
    { clave: "total", rotulo: "Importe total" },
  ],
  kardex: [
    { clave: "entCosto", rotulo: "Costo de lo que entró" },
    { clave: "salCosto", rotulo: "Costo de lo que salió" },
  ],
};

/** El mes anterior al de hoy en Lima: el contador cierra el mes que ya terminó. */
export function mesAnterior(hoyLima: string): string {
  const anio = Number(hoyLima.slice(0, 4));
  const mes = Number(hoyLima.slice(5, 7));
  return mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, "0")}`;
}
