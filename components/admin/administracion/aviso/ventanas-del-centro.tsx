"use client";

/**
 * Las ventanas que el centro «Pendientes y avisos» abre por encima de sí mismo
 * (Brandon 22-10): «Nueva / Editar tarea» y «Nueva actividad». Las abren el
 * menú «Agregar» y la pestaña Tareas; viven en un solo lugar para que haya UNA
 * ventana de tarea, no una por cada botón.
 */
import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ListChecks, Repeat } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import TareaFormModal from "@/components/admin/tareas/TareaFormModal";
import type { Task } from "@/components/admin/tareas/tareas-shared";
import type { Tareas } from "@/hooks/use-tareas";
import { useMiRol } from "@/hooks/use-mi-rol";
import { puedeEscribirAgenda } from "@/lib/admin/agenda-acceso";

const ActividadModal = dynamic(() => import("../actividades/ActividadModal").then((m) => ({ default: m.ActividadModal })), { ssr: false });

interface Opciones {
  /** Después de CREAR una tarea (para mostrarle dónde quedó). */
  alCrearTarea?: () => void;
}

export interface VentanasDelCentro {
  abrirTarea: (t: Task | null) => void;
  /** Las opciones del menú «Agregar» (la actividad sólo si el rol puede escribir la agenda). */
  agregar: MenuAccion[];
  ventanas: ReactNode;
}

export function useVentanasDelCentro(tareas: Tareas, { alCrearTarea }: Opciones = {}): VentanasDelCentro {
  const puedeActividades = puedeEscribirAgenda(useMiRol());
  /* `tarea` se queda al cerrar: el título no cambia a medio cierre. */
  const [formTarea, setFormTarea] = useState<{ abierta: boolean; tarea: Task | null }>({ abierta: false, tarea: null });
  const [actividadNueva, setActividadNueva] = useState(false);

  const abrirTarea = (t: Task | null) => setFormTarea({ abierta: true, tarea: t });

  const agregar: MenuAccion[] = [
    { id: "nueva-tarea", label: "Nueva tarea", hint: "Para ti o para alguien del equipo", icon: ListChecks, onSelect: () => abrirTarea(null) },
    ...(puedeActividades
      ? [{ id: "nueva-actividad", label: "Nueva actividad", hint: "Algo que se repite: te lo recuerda", icon: Repeat, onSelect: () => setActividadNueva(true) }]
      : []),
  ];

  const ventanas = (
    <>
      <TareaFormModal
        open={formTarea.abierta}
        tarea={formTarea.tarea}
        guardando={tareas.guardando}
        onClose={() => setFormTarea((f) => ({ ...f, abierta: false }))}
        onGuardar={async (form, id) => {
          const ok = await tareas.guardar(form, id);
          if (ok && !id) alCrearTarea?.();
          return ok;
        }}
        encima
      />
      {actividadNueva && <ActividadModal actividad={null} onCerrar={() => setActividadNueva(false)} encima />}
    </>
  );

  return { abrirTarea, agregar, ventanas };
}
