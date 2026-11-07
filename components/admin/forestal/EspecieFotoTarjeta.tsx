"use client";

/**
 * Una foto de la biblioteca de especies: la imagen, el nombre común y el
 * científico, quién la subió y un «⋯» con reemplazar y quitar. Antes eran dos
 * íconos de 28 px sin nombre al pie de cada tarjeta (11-10).
 */

import { useRef } from "react";
import { MoreHorizontal, Trash2, Upload } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { FotoEspecie } from "@/lib/forestal/especies-fotos";

export default function EspecieFotoTarjeta({
  f,
  ocupado,
  onReemplazar,
  onQuitar,
}: {
  f: FotoEspecie;
  /** Hay una subida en curso: no se ofrece reemplazar otra a la vez. */
  ocupado: boolean;
  onReemplazar: (f: FotoEspecie) => void;
  /** Pide confirmación: la tarjeta no borra sola. */
  onQuitar: (f: FotoEspecie) => void;
}) {
  /* El menú cierra sin devolverle el foco a su botón: la ventana de confirmar
     guardaría «body» y, al cerrarla, el teclado volvería al inicio de la página. */
  const ref = useRef<HTMLDivElement>(null);
  const enfocarMenu = () => ref.current?.querySelector<HTMLButtonElement>("button[aria-haspopup]")?.focus({ preventScroll: true });
  const acciones: MenuAccion[] = [
    { id: "reemplazar", label: "Reemplazar la foto", icon: Upload, disabled: ocupado, onSelect: () => onReemplazar(f) },
    { id: "quitar", label: "Quitar la foto", icon: Trash2, tone: "danger", onSelect: () => { enfocarMenu(); onQuitar(f); } },
  ];
  return (
    <li className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={f.url} alt={`Foto de ${f.nombre}`} className="h-32 w-full object-cover" loading="lazy" />
      <div ref={ref} className="flex items-center gap-1 py-2 pl-3 pr-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--text-primary)]">{f.nombre}</p>
          {f.cientifico && <p className="truncate text-sm italic text-[var(--text-secondary)]">{f.cientifico}</p>}
          {f.actualizadoPor && (
            <p className="truncate text-sm text-[var(--text-tertiary)]" title={`Subida por ${f.actualizadoPor}`}>
              {f.actualizadoPor}
            </p>
          )}
        </div>
        <ActionMenu
          label={`Más acciones de la foto de ${f.nombre}`}
          title="Reemplazar o quitar la foto"
          icon={MoreHorizontal}
          actions={acciones}
          soloIcono
          size="md"
          className="w-12 shrink-0 border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!"
        />
      </div>
    </li>
  );
}
