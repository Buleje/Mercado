"use client";

/**
 * Tarjetas o lista en el catálogo del mostrador (M09, 17-10), recordado en el
 * equipo. La fila de categorías lleva el selector (pegado a la grilla que
 * cambia) y la grilla lo lee: `useLocalStorage` sincroniza las dos instancias.
 */
import { LayoutGrid, List } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import SegmentedControl from "@/components/ui-system/SegmentedControl";

export type VistaCatalogo = "tarjetas" | "lista";

export function useVistaCatalogo() {
  return useLocalStorage<VistaCatalogo>("pos:vista-catalogo", "tarjetas");
}

const OPCIONES = [
  { value: "tarjetas" as const, label: "Ver en tarjetas", icon: <LayoutGrid className="h-5 w-5" />, dataQa: "pos-vista-tarjetas" },
  { value: "lista" as const, label: "Ver en lista", icon: <List className="h-5 w-5" />, dataQa: "pos-vista-lista" },
];

export function VistaCatalogoToggle() {
  const [vista, setVista] = useVistaCatalogo();
  return (
    <SegmentedControl<VistaCatalogo>
      soloIcono
      size="xl"
      label="Cómo ver el catálogo"
      value={vista}
      onChange={setVista}
      options={OPCIONES}
      className="shrink-0"
    />
  );
}
