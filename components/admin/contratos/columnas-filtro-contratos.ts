import type { ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import type { AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { diaDeVigencia } from "@/lib/cotizaciones/vigencia";
import { ESTADO_VISIBLE_LABELS, estadoVisible, TIPO_LABELS, type DbContract } from "@/lib/types/contracts";

const fechaDe = (c: DbContract) => diaDeVigencia(c.fechaInicio || c.createdAt);

/**
 * Filtros de columna de la tabla de contratos (llegan enteros; se paginan en el cliente).
 * Tipo y Estado ya tienen sus selectores de la barra: no se repiten acá. El monto va sin
 * símbolo porque la lista mezcla soles y dólares.
 */
export const COLUMNAS_CONTRATOS: readonly ColumnaFiltro<DbContract>[] = [
  { id: "numero", label: "N.o", tipo: "texto", valor: (c) => c.numero },
  { id: "cliente", label: "Cliente", tipo: "texto", valor: (c) => [c.clienteNombre, c.clienteDoc ?? ""] },
  { id: "monto", label: "Monto", tipo: "rango", numero: (c) => c.monto, paso: 0.01 },
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: fechaDe },
];

export const ORDEN_CONTRATOS: Record<string, AccesorOrden<DbContract>> = {
  numero: { valor: (c) => c.numero, texto: true },
  cliente: { valor: (c) => c.clienteNombre, texto: true },
  tipo: { valor: (c) => TIPO_LABELS[c.tipo] || c.tipo, texto: true },
  monto: { valor: (c) => c.monto },
  fecha: { valor: fechaDe },
  estado: { valor: (c) => ESTADO_VISIBLE_LABELS[estadoVisible(c)], texto: true },
};
