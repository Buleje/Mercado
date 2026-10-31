"use client";

/**
 * usePasarATareas — manda una acción de un objetivo a «Tareas del equipo»
 * (`POST /api/tasks`, ADR-497). La tarea lleva el texto, la fecha y el
 * responsable de la acción, y en la descripción el objetivo de donde sale.
 *
 * El id de la tarea creada vuelve por `alEnviar` y la lista lo guarda en la
 * acción (`tareaId`): al recargar sigue marcada y no se manda dos veces.
 */
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import type { Accion, Objetivo } from "./objetivos-config";

export type EstadoEnvio = "enviando" | "hecho";

export function usePasarATareas(alEnviar?: (accionId: string, tareaId: string) => void) {
  const [envios, setEnvios] = useState<Record<string, EstadoEnvio>>({});

  const pasar = useCallback(async (accion: Accion, objetivo: Objetivo) => {
    setEnvios((p) => ({ ...p, [accion.id]: "enviando" }));
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({
          title: accion.texto.trim().slice(0, 200),
          description: `Del objetivo «${objetivo.titulo}» (Planificación).`,
          priority: "media",
          assignedTo: accion.responsable || objetivo.responsable || undefined,
          dueDate: accion.fecha || null,
          module: "planificacion",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? (res.status === 403 ? "Tu rol no puede crear tareas." : `No se creó la tarea (error ${res.status}).`));
      }
      const tarea = (await res.json().catch(() => null)) as { id?: string } | null;
      setEnvios((p) => ({ ...p, [accion.id]: "hecho" }));
      if (tarea?.id) alEnviar?.(accion.id, tarea.id);
      toast.success("Pasó a Tareas del equipo", { description: accion.texto.slice(0, 80) });
    } catch (err) {
      setEnvios((p) => {
        const resto = { ...p };
        delete resto[accion.id];
        return resto;
      });
      toast.error(err instanceof Error ? err.message : "No se creó la tarea.");
    }
  }, [alEnviar]);

  return { envios, pasar };
}
