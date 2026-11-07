"use client";

import { useEffect, useState } from "react";
import { useMiRol } from "@/hooks/use-mi-rol";
import { ROLES_PAPELES_GUIA } from "@/lib/forestal/documentos-guia";
import type { PapelesPendientes } from "@/lib/forestal/papeles-pendientes";

const PUEDE_VER: ReadonlySet<string> = new Set(ROLES_PAPELES_GUIA);

/**
 * Cuántas guías de ingreso no tienen sus papeles de ley. Un aviso no debe
 * estorbar: el cajero ni lo pide (su 403 ensuciaba la consola) y ante cualquier
 * falla (red) devuelve `null` y no se pinta nada.
 */
export function usePapelesPendientes(activo: boolean): PapelesPendientes | null {
  const [datos, setDatos] = useState<PapelesPendientes | null>(null);
  const rol = useMiRol();
  const puede = rol !== null && PUEDE_VER.has(rol);
  useEffect(() => {
    if (!activo || !puede) return;
    const ac = new AbortController();
    fetch("/api/admin/forestal/guias/papeles-pendientes", { credentials: "include", cache: "no-store", signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<PapelesPendientes>) : null))
      .then((j) => {
        if (!ac.signal.aborted) setDatos(j);
      })
      .catch((e: unknown) => {
        if (!ac.signal.aborted) console.warn("[inicio-forestal] papeles pendientes", e);
      });
    return () => ac.abort();
  }, [activo, puede]);
  return datos;
}
