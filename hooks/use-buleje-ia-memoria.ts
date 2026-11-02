"use client";

/** Lo que Buleje IA recuerda del negocio: lista, buscar, editar, olvidar, agregar (contrato carril 2). */
import { useCallback, useEffect, useState } from "react";
import type { MemoriaItem, TipoMemoria } from "@/lib/ia-proveedores/tipos";
import { pedirIa, type Resultado } from "@/components/admin/buleje-ia/api";
import { useBulejeIaLista } from "./use-buleje-ia-lista";

const URL_BASE = "/api/admin/ia/memoria";

export interface DatosMemoria {
  tipo: TipoMemoria;
  titulo: string;
  texto: string;
}

export function useBulejeIaMemoria() {
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");
  // Espera a que dejes de escribir: sin esto cada letra era un pedido al servidor.
  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const url = q ? `${URL_BASE}?q=${encodeURIComponent(q)}` : URL_BASE;
  const { datos, cargando, error, recargar } = useBulejeIaLista<{ items: MemoriaItem[] }>(url);

  const crear = useCallback(
    async (d: DatosMemoria): Promise<Resultado<unknown>> => {
      const r = await pedirIa(URL_BASE, { method: "POST", json: d });
      if (r.ok) recargar();
      return r;
    },
    [recargar],
  );

  const editar = useCallback(
    async (id: string, d: Partial<DatosMemoria>): Promise<Resultado<unknown>> => {
      const r = await pedirIa(`${URL_BASE}/${encodeURIComponent(id)}`, { method: "PATCH", json: d });
      if (r.ok) recargar();
      return r;
    },
    [recargar],
  );

  const olvidar = useCallback(
    async (id: string): Promise<Resultado<unknown>> => {
      const r = await pedirIa(`${URL_BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (r.ok) recargar();
      return r;
    },
    [recargar],
  );

  return { items: datos?.items ?? [], cargando, error, recargar, busqueda, setBusqueda, buscando: Boolean(q), crear, editar, olvidar };
}
