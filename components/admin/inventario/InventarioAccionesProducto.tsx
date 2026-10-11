"use client";

import { useRef } from "react";
import { MoreHorizontal, Pencil } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { cn } from "@/lib/utils";
import type { DbProduct } from "@/lib/jsondb";
import type { Inventario } from "@/components/admin/inventario/hooks/use-inventario";

/**
 * Editar a la vista + «⋯» con el resto (kardex, duplicar, adicionales, QR,
 * pedido automático, pronóstico, eliminar), en la fila de la tabla y en la
 * tarjeta. Antes la fila tenía seis íconos de 32 px sin nombre (378 botones
 * bajos en la vista) y la tarjeta otros cuatro distintos.
 */
export default function InventarioAccionesProducto({ inv, p, variante = "fila" }: { inv: Inventario; p: DbProduct; variante?: "fila" | "tarjeta" }) {
  const { accionesDeProducto, openEditModal } = inv;
  /* El menú cierra sin devolver el foco a su botón: la ventana que se abre
     guardaba «body» y, al cerrarla, el teclado volvía al inicio de la página. */
  const ref = useRef<HTMLDivElement>(null);
  const enfocarMenu = () => ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus({ preventScroll: true });
  const acciones = accionesDeProducto(p).map((a) => ({ ...a, onSelect: () => { enfocarMenu(); a.onSelect(); } }));
  return (
    <div ref={ref} className={cn("flex items-center gap-1", variante === "fila" ? "justify-end" : "")}>
      {variante === "fila" ? (
        <button
          type="button"
          onClick={() => openEditModal(p)}
          aria-label={`Editar ${p.name}`}
          title="Editar"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:hover:text-[var(--accent)]"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => openEditModal(p)}
          className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
        >
          <Pencil className="h-4 w-4" aria-hidden /> Editar
        </button>
      )}
      <ActionMenu
        label={`Más acciones de ${p.name}`}
        title="Kardex, duplicar, adicionales, QR, pedido automático, pronóstico y eliminar"
        icon={MoreHorizontal}
        actions={acciones}
        soloIcono
        size="md"
        className={cn("w-12 shrink-0", variante === "fila" && "border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!")}
      />
    </div>
  );
}
