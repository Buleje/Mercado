"use client";

/** Las conversaciones del usuario en la barra lateral de Buleje IA (contrato carril 3). */
import { useCallback } from "react";
import type { ConversacionResumen } from "@/lib/ia-proveedores/tipos";
import { pedirIa, type Resultado } from "@/components/admin/buleje-ia/api";
import { useBulejeIaLista } from "./use-buleje-ia-lista";

const URL_BASE = "/api/admin/ia/conversaciones";

export function useBulejeIaConversaciones() {
  const { datos, setDatos, cargando, error, recargar } = useBulejeIaLista<{ items: ConversacionResumen[] }>(URL_BASE);

  const renombrar = useCallback(
    async (id: string, titulo: string): Promise<Resultado<unknown>> => {
      const r = await pedirIa(`${URL_BASE}/${encodeURIComponent(id)}`, { method: "PATCH", json: { titulo } });
      if (r.ok) setDatos((d) => (d ? { items: d.items.map((c) => (c.id === id ? { ...c, titulo } : c)) } : d));
      return r;
    },
    [setDatos],
  );

  const borrar = useCallback(
    async (id: string): Promise<Resultado<unknown>> => {
      const r = await pedirIa(`${URL_BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (r.ok) setDatos((d) => (d ? { items: d.items.filter((c) => c.id !== id) } : d));
      return r;
    },
    [setDatos],
  );

  return { items: datos?.items ?? [], cargando, error, recargar, renombrar, borrar };
}

export type BulejeIaConversaciones = ReturnType<typeof useBulejeIaConversaciones>;
