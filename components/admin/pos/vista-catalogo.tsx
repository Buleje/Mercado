"use client";

/**
 * Tarjetas o lista en el catálogo del mostrador (M09, 17-10), recordado en el
 * equipo. La fila de categorías lleva el selector (pegado a la grilla que
 * cambia) y la grilla lo lee: `useLocalStorage` sincroniza las dos instancias.
 */
import { LayoutGrid, List } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";

export type VistaCatalogo = "tarjetas" | "lista";

export function useVistaCatalogo() {
  return useLocalStorage<VistaCatalogo>("pos:vista-catalogo", "tarjetas");
}

const OPCIONES: { id: VistaCatalogo; label: string; Icono: typeof List }[] = [
  { id: "tarjetas", label: "Ver en tarjetas", Icono: LayoutGrid },
  { id: "lista", label: "Ver en lista", Icono: List },
];

export function VistaCatalogoToggle() {
  const [vista, setVista] = useVistaCatalogo();
  return (
    <div role="group" aria-label="Cómo ver el catálogo" className="flex shrink-0 rounded-xl bg-[var(--surface-sunken)]">
      {OPCIONES.map(({ id, label, Icono }) => (
        <button
          key={id}
          type="button"
          aria-pressed={vista === id}
          aria-label={label}
          title={label}
          data-qa={`pos-vista-${id}`}
          onClick={() => setVista(id)}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
            vista === id ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--rule-base)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
        >
          <Icono className="h-5 w-5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
