import { useOcEstado } from "@/components/admin/ordenes-compra/hooks/use-oc-estado";
import { useOcRecurrentes } from "@/components/admin/ordenes-compra/hooks/use-oc-recurrentes";
import { useOcModales } from "@/components/admin/ordenes-compra/hooks/use-oc-modales";
import { useOcCarga } from "@/components/admin/ordenes-compra/hooks/use-oc-carga";
import { useOcFormulario } from "@/components/admin/ordenes-compra/hooks/use-oc-formulario";
import { useOcAcciones } from "@/components/admin/ordenes-compra/hooks/use-oc-acciones";
import { useOcDerivados } from "@/components/admin/ordenes-compra/hooks/use-oc-derivados";

/**
 * Todo el estado y las acciones de Órdenes de compra. Encadena los hooks en el MISMO orden en que
 * estaban en PurchaseOrdersTab (los efectos corren igual); cada pieza de la vista recibe el resultado entero.
 */
export function useOrdenesCompra() {
  const estado = useOcEstado();
  const recurrentes = useOcRecurrentes();
  const modales = useOcModales({ ...estado, ...recurrentes });
  const carga = useOcCarga({ ...estado, ...recurrentes, ...modales });
  const formulario = useOcFormulario({ ...estado, ...recurrentes, ...modales, ...carga });
  const acciones = useOcAcciones({ ...estado, ...recurrentes, ...modales, ...carga, ...formulario });
  const derivados = useOcDerivados({ ...estado, ...recurrentes, ...modales, ...carga, ...formulario, ...acciones });
  return { ...estado, ...recurrentes, ...modales, ...carga, ...formulario, ...acciones, ...derivados };
}

export type OrdenesCompra = ReturnType<typeof useOrdenesCompra>;
