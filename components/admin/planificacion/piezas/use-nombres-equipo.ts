"use client";

/**
 * useNombresEquipo — los nombres que se sugieren al escribir un responsable o
 * la persona de un cargo: los colaboradores de RRHH (si el rol los puede ver)
 * más las personas ya puestas en el organigrama. Sin RRHH (403, sin red) queda
 * sólo el organigrama: el campo sigue siendo texto libre.
 *
 * Una sola petición por carga del panel (promesa del módulo), aunque se abran
 * diez ventanas.
 */
import { useEffect, useMemo, useState } from "react";
import { useSeccionPlan } from "@/hooks/use-plan-empresa";

let pedido: Promise<string[]> | null = null;

function traerColaboradores(): Promise<string[]> {
  pedido ??= fetch("/api/rrhh/colaboradores?campos=min", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) return [];
      const body = (await r.json()) as { colaboradores?: { nombre?: string | null; estado?: string }[] };
      return (body.colaboradores ?? []).map((c) => (c.nombre ?? "").trim()).filter(Boolean);
    })
    .catch(() => {
      // Sin red o sin permiso: las sugerencias salen sólo del organigrama.
      pedido = null;
      return [];
    });
  return pedido;
}

export function useNombresEquipo(): string[] {
  const [colaboradores, setColaboradores] = useState<string[]>([]);
  const organizacion = useSeccionPlan("organizacion");
  useEffect(() => {
    let vivo = true;
    void traerColaboradores().then((n) => {
      if (vivo) setColaboradores(n);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return useMemo(() => {
    const todos = [...colaboradores, ...organizacion.datos.cargos.map((c) => c.persona.trim())].filter(Boolean);
    return [...new Set(todos)].sort((a, b) => a.localeCompare(b, "es"));
  }, [colaboradores, organizacion.datos.cargos]);
}
