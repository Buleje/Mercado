"use client";

/** Conexiones para usar el negocio desde ChatGPT, Claude, Gemini o Cursor (contrato carril 4). */
import { useCallback } from "react";
import type { ConexionMcp } from "@/lib/ia-proveedores/tipos";
import { pedirIa, type Resultado } from "@/components/admin/buleje-ia/api";
import { useBulejeIaLista } from "./use-buleje-ia-lista";

const URL_BASE = "/api/admin/ia/conexiones";

export interface ConexionCreada {
  conexion: ConexionMcp;
  /** La clave completa: el servidor la da UNA sola vez. */
  token: string;
}

export function useBulejeIaConexiones() {
  const { datos, setDatos, cargando, error, recargar } = useBulejeIaLista<{ items: ConexionMcp[]; urlMcp: string }>(URL_BASE);

  const crear = useCallback(
    async (nombre: string, permiteEscribir: boolean): Promise<Resultado<ConexionCreada>> => {
      const r = await pedirIa<ConexionCreada>(URL_BASE, { method: "POST", json: { nombre, permiteEscribir } });
      if (r.ok) setDatos((d) => (d ? { ...d, items: [r.data.conexion, ...d.items] } : d));
      return r;
    },
    [setDatos],
  );

  const actualizar = useCallback(
    async (id: string, cambios: Partial<Pick<ConexionMcp, "nombre" | "permiteEscribir" | "activo">>): Promise<Resultado<unknown>> => {
      const r = await pedirIa(`${URL_BASE}/${encodeURIComponent(id)}`, { method: "PATCH", json: cambios });
      if (r.ok) setDatos((d) => (d ? { ...d, items: d.items.map((c) => (c.id === id ? { ...c, ...cambios } : c)) } : d));
      return r;
    },
    [setDatos],
  );

  const revocar = useCallback(
    async (id: string): Promise<Resultado<unknown>> => {
      const r = await pedirIa(`${URL_BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (r.ok) setDatos((d) => (d ? { ...d, items: d.items.filter((c) => c.id !== id) } : d));
      return r;
    },
    [setDatos],
  );

  return { items: datos?.items ?? [], urlMcp: datos?.urlMcp ?? "", cargando, error, recargar, crear, actualizar, revocar };
}
