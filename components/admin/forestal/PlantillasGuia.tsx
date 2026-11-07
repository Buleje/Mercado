"use client";

/**
 * «Plantillas ▾» de «Datos de la guía» (16-10-2026, Brandon: «guardar varios
 * bloques y ponerle un nombre… para rellenar más rápido la guía»).
 *
 * Un menú: usar una, guardar la guía de ahora como plantilla y las últimas
 * usadas a un clic (abren la vista previa: nada se pisa sin verlo antes).
 */

import { useRef, useState } from "react";
import { Bookmark, BookmarkPlus, CheckCircle2, FileStack, FolderOpen } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import type { PlantillaGuia } from "@/lib/forestal/gtf-plantillas";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { usePlantillasGuia } from "./hooks/use-plantillas-guia";
import PlantillaGuardarModal from "./PlantillaGuardarModal";
import PlantillaUsarModal from "./PlantillaUsarModal";

/** Cuántas de las últimas van a la vista en el menú. */
const RECIENTES = 4;

export default function PlantillasGuia({ g }: { g: DespachoGuiaLoth }) {
  const pl = usePlantillasGuia(g);
  const [ventana, setVentana] = useState<"guardar" | "usar" | null>(null);
  const [elegida, setElegida] = useState<PlantillaGuia | null>(null);
  const lista = pl.plantillas ?? [];
  const menuRef = useRef<HTMLDivElement>(null);

  /* La ventana se abre desde un ítem del menú, que ya no existe al cerrarla:
     AdminModal no tiene a quién devolver el foco y quedaba en la pestaña.
     Vuelve al botón «Plantillas», sin mover el scroll. */
  const cerrar = () => {
    setVentana(null);
    requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }));
  };
  const abrirUsar = (p: PlantillaGuia | null) => {
    setElegida(p);
    setVentana("usar");
  };
  const acciones: MenuAccion[] = [
    {
      id: "usar",
      label: "Usar una plantilla…",
      hint: pl.plantillas === null ? "Trayendo tus plantillas…" : lista.length ? `${lista.length} guardada${lista.length === 1 ? "" : "s"}` : "Todavía no guardas ninguna",
      icon: FolderOpen,
      onSelect: () => abrirUsar(null),
    },
    {
      id: "guardar",
      label: "Guardar como plantilla…",
      hint: "Permiso, propietario, partida, destino o transporte, con nombre",
      icon: BookmarkPlus,
      onSelect: () => setVentana("guardar"),
    },
    ...lista.slice(0, RECIENTES).map(
      (p): MenuAccion => ({
        id: `plantilla-${p.id}`,
        label: p.nombre,
        icon: Bookmark,
        seccion: "Las últimas",
        meta: p.usos ? `${p.usos}×` : undefined,
        onSelect: () => abrirUsar(p),
      }),
    ),
  ];

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2">
      {pl.aviso && (
        <span role="status" className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[var(--data-success-ink)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <span className="line-clamp-2">{pl.aviso}</span>
        </span>
      )}
      <div ref={menuRef} className="shrink-0">
        <ActionMenu label="Plantillas" icon={FileStack} actions={acciones} compactoEnMovil title="Guardar o usar los datos de una guía" />
      </div>
      {ventana === "guardar" && <PlantillaGuardarModal g={g} pl={pl} onCerrar={cerrar} />}
      {ventana === "usar" && <PlantillaUsarModal pl={pl} inicial={elegida} onCerrar={cerrar} />}
    </div>
  );
}
