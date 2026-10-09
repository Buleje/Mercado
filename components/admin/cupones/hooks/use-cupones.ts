import { useCuponesEstado } from "@/components/admin/cupones/hooks/use-cupones-estado";

/**
 * Todo el estado y las acciones de CouponsTab. Encadena los hooks en el MISMO orden en que estaban
 * en el componente (los efectos corren igual); cada pieza de la vista recibe el resultado entero.
 */
export function useCupones() {
  const h0 = useCuponesEstado();
  return { ...h0 };
}

export type Cupones = ReturnType<typeof useCupones>;
