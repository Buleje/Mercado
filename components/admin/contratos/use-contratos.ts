import { useContratosAcciones } from "./use-contratos-acciones";
import { useContratosWizard } from "./use-contratos-wizard";
import { useContratosVista } from "./use-contratos-vista";
import { useContratosCarga } from "./use-contratos-carga";
import { useContratosEstado } from "./use-contratos-estado";
/** El estado entero del componente, por hooks encadenados en el MISMO orden del original. */
export function useContratos() {
  const h0 = useContratosEstado();
  const h1 = { ...h0, ...useContratosCarga(h0) };
  const h2 = { ...h1, ...useContratosVista(h1) };
  const h3 = { ...h2, ...useContratosWizard(h2) };
  const h4 = { ...h3, ...useContratosAcciones(h3) };
  return h4;
}
export type EstadoContratos = ReturnType<typeof useContratos>;
