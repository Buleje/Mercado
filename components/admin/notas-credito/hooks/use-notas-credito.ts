import { useNcEstado } from "@/components/admin/notas-credito/hooks/use-nc-estado";
import { useNcSelector } from "@/components/admin/notas-credito/hooks/use-nc-selector";
import { useNcDocumento } from "@/components/admin/notas-credito/hooks/use-nc-documento";
import { useNcPlantillas } from "@/components/admin/notas-credito/hooks/use-nc-plantillas";
import { useNcLista } from "@/components/admin/notas-credito/hooks/use-nc-lista";
import { useNcAcciones } from "@/components/admin/notas-credito/hooks/use-nc-acciones";
import { useNcIndicadores } from "@/components/admin/notas-credito/hooks/use-nc-indicadores";
import { useNcVentanas } from "@/components/admin/notas-credito/hooks/use-nc-ventanas";

/**
 * Todo el estado y las acciones de Notas de crédito. Encadena los hooks en el mismo orden del original
 * (las ventanas y atajos al final porque cierran con `resetWizard`); cada pieza recibe el resultado entero.
 */
export function useNotasCredito() {
  const estado = useNcEstado();
  const selector = useNcSelector(estado);
  const documento = useNcDocumento({ ...estado, ...selector });
  const plantillas = useNcPlantillas({ ...estado, ...selector });
  const lista = useNcLista({ ...estado, ...selector });
  const acciones = useNcAcciones({ ...estado, ...selector, ...documento, ...lista });
  const indicadores = useNcIndicadores({ ...estado, ...selector, ...lista, ...acciones });
  const ventanas = useNcVentanas({ ...estado, ...selector, ...lista, ...acciones, ...indicadores });
  return { ...estado, ...selector, ...documento, ...plantillas, ...lista, ...acciones, ...indicadores, ...ventanas };
}

export type NotasCreditoVista = ReturnType<typeof useNotasCredito>;
