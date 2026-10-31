"use client";

/**
 * use-tareas — las tareas del equipo (`/api/tasks`): traerlas, guardar una
 * nueva o editada, cambiarle el estado y eliminarla.
 *
 * Salió de `TasksTab` para que Equipo › Tareas y el centro «Pendientes y
 * avisos» trabajen con lo mismo. Dos reglas que NO se tocan:
 *
 *  - Una carga que salió antes de un cambio trae la lista vieja (medido
 *    2026-09-14: el GET del doble montaje llegó 470 ms después del clic en
 *    Eliminar y la tarea volvió a la pantalla aunque ya no estaba en la base).
 *    Sólo aplica su lista la carga más nueva, y sólo si no hubo cambios
 *    mientras viajaba; cada cambio termina con una carga silenciosa.
 *  - Cada cambio avisa a las otras copias abiertas (`tareas:cambiaron`): la
 *    lista de Equipo y la del centro no se quedan con datos distintos.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import type { FormData, Task, TaskStatus } from "@/components/admin/tareas/tareas-shared";

/** Otra copia de la lista cambió algo: se vuelve a leer sin tapar la pantalla. */
const EVENTO_CAMBIO = "tareas:cambiaron";

export interface Tareas {
  tareas: Task[];
  /** Sólo la primera carga: las siguientes refrescan sin tapar la lista. */
  cargando: boolean;
  guardando: boolean;
  recargar: () => Promise<void>;
  /** Crea (sin `id`) o edita. `true` si el servidor la guardó. */
  guardar: (form: FormData, id?: string | null) => Promise<boolean>;
  cambiarEstado: (id: string, estado: TaskStatus) => Promise<void>;
  eliminar: (id: string) => Promise<void>;
}

function cuerpoDe(form: FormData) {
  // null borra el campo al editar; undefined lo dejaba como estaba (ADR-415).
  return {
    title: form.title.trim(),
    description: form.description || null,
    priority: form.priority,
    assignedTo: form.assignedTo || null,
    dueDate: form.dueDate || null,
    module: form.module || null,
  };
}

/** `activo = false` no pide nada (el centro cerrado o minimizado). */
export function useTareas(activo = true): Tareas {
  const [tareas, setTareas] = useState<Task[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const cargasRef = useRef({ ultima: 0, cambios: 0 });
  /* Lo que se ve ahora: para devolverlo si el servidor rechaza un cambio. */
  const vistasRef = useRef<Task[]>(tareas);
  vistasRef.current = tareas;
  /* Quien avisó el cambio no se relee por su propio aviso. */
  const origenRef = useRef(Symbol("tareas"));

  const cargar = useCallback(async (opciones?: { silenciosa?: boolean }) => {
    const esta = ++cargasRef.current.ultima;
    const cambiosAlSalir = cargasRef.current.cambios;
    if (!opciones?.silenciosa) setCargando(true);
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const lista = (await res.json()) as Task[];
        if (esta === cargasRef.current.ultima && cambiosAlSalir === cargasRef.current.cambios) setTareas(lista);
      }
    } catch {
      /* sin red: se queda lo que había; el siguiente cambio vuelve a intentar */
    }
    if (esta === cargasRef.current.ultima) setCargando(false);
  }, []);

  const avisarCambio = useCallback(() => {
    window.dispatchEvent(new CustomEvent(EVENTO_CAMBIO, { detail: origenRef.current }));
  }, []);

  useEffect(() => {
    if (activo) void cargar();
  }, [activo, cargar]);

  useEffect(() => {
    if (!activo) return;
    const alCambiar = (e: Event) => {
      if ((e as CustomEvent<symbol>).detail === origenRef.current) return;
      void cargar({ silenciosa: true });
    };
    window.addEventListener(EVENTO_CAMBIO, alCambiar);
    return () => window.removeEventListener(EVENTO_CAMBIO, alCambiar);
  }, [activo, cargar]);

  const guardar = useCallback(
    async (form: FormData, id?: string | null): Promise<boolean> => {
      if (!form.title.trim()) return false;
      setGuardando(true);
      cargasRef.current.cambios += 1;
      try {
        const cabeceras = csrfHeaders({ "Content-Type": "application/json" });
        const res = id
          ? await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: cabeceras, body: JSON.stringify(cuerpoDe(form)) })
          : await fetch("/api/tasks", { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpoDe(form)) });
        // Antes no se miraba la respuesta: si el servidor fallaba, el modal se cerraba igual.
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(errBody.error || `No se pudo guardar la tarea (HTTP ${res.status})`);
          return false;
        }
        await cargar();
        avisarCambio();
        return true;
      } catch {
        toast.error("No se pudo guardar la tarea. Revisa tu conexión.");
        return false;
      } finally {
        setGuardando(false);
      }
    },
    [cargar, avisarCambio],
  );

  /** Cambia en pantalla al toque y vuelve atrás si el servidor no lo guarda. `completedAt` lo pone el servidor. */
  const cambiarEstado = useCallback(
    async (id: string, status: TaskStatus) => {
      cargasRef.current.cambios += 1;
      const previo = vistasRef.current.find((t) => t.id === id);
      setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
      try {
        const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const guardada = (await res.json()) as Task;
        setTareas((prev) => prev.map((t) => (t.id === id ? guardada : t)));
        avisarCambio();
      } catch {
        if (previo) setTareas((prev) => prev.map((t) => (t.id === id ? previo : t)));
        toast.error("No se pudo cambiar el estado. Reintenta.");
      } finally {
        void cargar({ silenciosa: true });
      }
    },
    [cargar, avisarCambio],
  );

  const eliminar = useCallback(
    async (id: string) => {
      cargasRef.current.cambios += 1;
      const previas = vistasRef.current;
      setTareas((prev) => prev.filter((t) => t.id !== id));
      try {
        const res = await fetch(`/api/tasks/${id}`, { method: "DELETE", headers: csrfHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        avisarCambio();
      } catch {
        setTareas(previas);
        toast.error("No se pudo eliminar la tarea. Reintenta.");
      } finally {
        void cargar({ silenciosa: true });
      }
    },
    [cargar, avisarCambio],
  );

  const recargar = useCallback(() => cargar({ silenciosa: true }), [cargar]);

  return { tareas, cargando, guardando, recargar, guardar, cambiarEstado, eliminar };
}
