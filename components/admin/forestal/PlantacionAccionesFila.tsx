"use client";

/**
 * Acciones de una plantación en la lista: «Continuar» (lápiz) a la vista y «⋯» con el
 * resto (ver, duplicar, generar el documento, eliminar). Antes eran cinco
 * íconos de 36 px sin nombre en cada fila (11-10).
 */

import { useRef } from "react";
import { Copy, Eye, FileText, MoreHorizontal, Pencil, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { PlantacionListItem } from "@/lib/forestal/plantacion-tramite";

export default function PlantacionAccionesFila({
  p,
  duplicando,
  onAbrir,
  onDuplicar,
  onBorrar,
}: {
  p: PlantacionListItem;
  duplicando: boolean;
  onAbrir: (id: string, opts?: { soloLectura?: boolean; irARevision?: boolean }) => void;
  onDuplicar: (id: string) => void;
  onBorrar: (p: PlantacionListItem) => void;
}) {
  /* El menú cierra sin devolverle el foco a su botón: la ventana de eliminar
     guardaría «body» y, al cerrarla, el teclado volvería al inicio de la página. */
  const ref = useRef<HTMLDivElement>(null);
  const enfocarMenu = () => ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus({ preventScroll: true });
  const nombre = p.predioNombre ?? p.codigoInterno;
  const acciones: MenuAccion[] = [
    { id: "ver", label: "Ver sin editar", icon: Eye, onSelect: () => onAbrir(p.id, { soloLectura: true }) },
    { id: "documento", label: "Generar documento", hint: "El Formato N° 01 desde la revisión", icon: FileText, onSelect: () => onAbrir(p.id, { irARevision: true }) },
    { id: "duplicar", label: "Duplicar", hint: "Otro registro con estos mismos datos", icon: Copy, busy: duplicando, disabled: duplicando, onSelect: () => onDuplicar(p.id) },
    { id: "eliminar", label: "Eliminar", icon: Trash2, tone: "danger", onSelect: () => { enfocarMenu(); onBorrar(p); } },
  ];

  return (
    <div ref={ref} className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => onAbrir(p.id)}
        aria-label={`Continuar ${nombre}`}
        title="Continuar / editar"
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
      <ActionMenu
        label={`Más acciones de ${nombre}`}
        title="Ver, generar documento, duplicar y eliminar"
        icon={MoreHorizontal}
        actions={acciones}
        soloIcono
        size="md"
        className="w-12 shrink-0 border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!"
      />
    </div>
  );
}
