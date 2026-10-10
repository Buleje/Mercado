import type { ModuleActionItem } from "@/components/admin/shared/ModuleActionMenu";
import { useInventarioEstado } from "@/components/admin/inventario/hooks/use-inventario-estado";
import { useInventarioCarga } from "@/components/admin/inventario/hooks/use-inventario-carga";
import { useInventarioImagenes } from "@/components/admin/inventario/hooks/use-inventario-imagenes";
import { useInventarioMasivo } from "@/components/admin/inventario/hooks/use-inventario-masivo";
import { useInventarioPedidos } from "@/components/admin/inventario/hooks/use-inventario-pedidos";
import { useInventarioFiltros } from "@/components/admin/inventario/hooks/use-inventario-filtros";
import { useInventarioGuardar } from "@/components/admin/inventario/hooks/use-inventario-guardar";

/**
 * Todo el estado y las acciones de Inventario. Encadena los hooks en el MISMO orden en que estaban
 * en InventoryTab (los efectos corren igual); cada pieza de la vista recibe el resultado entero.
 */
export function useInventario(headerActions: ModuleActionItem[]) {
  const estado = useInventarioEstado();
  const carga = useInventarioCarga(estado);
  const imagenes = useInventarioImagenes({ ...estado, ...carga });
  const masivo = useInventarioMasivo({ ...estado, ...carga, ...imagenes });
  const pedidos = useInventarioPedidos({ ...estado, ...carga, ...imagenes, ...masivo });
  const filtros = useInventarioFiltros({ ...estado, ...carga, ...imagenes, ...masivo, ...pedidos });
  const guardar = useInventarioGuardar({ ...estado, ...carga, ...imagenes, ...masivo, ...pedidos, ...filtros });
  return { headerActions, ...estado, ...carga, ...imagenes, ...masivo, ...pedidos, ...filtros, ...guardar };
}

export type Inventario = ReturnType<typeof useInventario>;
