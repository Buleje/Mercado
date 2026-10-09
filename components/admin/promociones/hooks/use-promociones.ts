import { usePromocionesEstado } from "@/components/admin/promociones/hooks/use-promociones-estado";
import { usePromocionesVentanas } from "@/components/admin/promociones/hooks/use-promociones-ventanas";
import { usePromocionesCarga } from "@/components/admin/promociones/hooks/use-promociones-carga";
import { useCampanasProgramadas } from "@/components/admin/promociones/hooks/use-campanas-programadas";
import { usePromocionesEnvio } from "@/components/admin/promociones/hooks/use-promociones-envio";

/**
 * Todo el estado y las acciones de PromotionsTab. Encadena los hooks en el MISMO orden en que estaban
 * en el componente (los efectos corren igual); cada pieza de la vista recibe el resultado entero.
 */
export function usePromociones() {
  const h0 = usePromocionesEstado();
  const h1 = usePromocionesVentanas(h0);
  const h2 = usePromocionesCarga({ ...h0, ...h1 });
  const h3 = useCampanasProgramadas({ ...h0, ...h1, ...h2 });
  const h4 = usePromocionesEnvio({ ...h0, ...h1, ...h2, ...h3 });
  return { ...h0, ...h1, ...h2, ...h3, ...h4 };
}

export type Promociones = ReturnType<typeof usePromociones>;
