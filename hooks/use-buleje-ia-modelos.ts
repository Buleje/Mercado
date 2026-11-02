"use client";

/** Los modelos de IA del negocio: catálogo, los guardados, probar una clave (contrato carril 1). */
import { useCallback, useMemo } from "react";
import type { ProveedorCatalogo, ProveedorConfigurado, ProveedorIaId, ResultadoPrueba } from "@/lib/ia-proveedores/tipos";
import { pedirIa, type Resultado } from "@/components/admin/buleje-ia/api";
import { useBulejeIaLista } from "./use-buleje-ia-lista";

const URL_BASE = "/api/admin/ia/proveedores";

export interface RespuestaProveedores {
  catalogo: ProveedorCatalogo[];
  configurados: ProveedorConfigurado[];
  plataforma: { disponible: boolean; proveedor?: string; modelo?: string };
}

export interface DatosProveedor {
  proveedor: ProveedorIaId;
  nombre?: string;
  modelo: string;
  modeloVision?: string;
  baseUrl?: string;
  clave: string;
  principal?: boolean;
}

export type CambiosProveedor = Partial<Pick<ProveedorConfigurado, "nombre" | "modelo" | "principal" | "activo">> & {
  modeloVision?: string | null;
  baseUrl?: string | null;
  clave?: string;
};

/** ¿El modelo que contesta lee fotos? null = no se sabe (modelo fuera del catálogo). */
export function leeFotos(p: ProveedorConfigurado, catalogo: ProveedorCatalogo[]): boolean | null {
  if (p.modeloVision) return true;
  const sugerido = catalogo.find((c) => c.id === p.proveedor)?.modelosSugeridos.find((m) => m.id === p.modelo);
  return sugerido ? sugerido.vision : null;
}

export function useBulejeIaModelos() {
  const { datos, setDatos, cargando, error, recargar } = useBulejeIaLista<RespuestaProveedores>(URL_BASE);

  const probar = useCallback(
    (cuerpo: { proveedor: ProveedorIaId; clave?: string; configId?: string; baseUrl?: string }) =>
      pedirIa<ResultadoPrueba>(`${URL_BASE}/probar`, { method: "POST", json: cuerpo }),
    [],
  );

  const guardar = useCallback(
    async (d: DatosProveedor): Promise<Resultado<{ proveedor: ProveedorConfigurado }>> => {
      const r = await pedirIa<{ proveedor: ProveedorConfigurado }>(URL_BASE, { method: "POST", json: d });
      if (r.ok) recargar();
      return r;
    },
    [recargar],
  );

  const actualizar = useCallback(
    async (id: string, cambios: CambiosProveedor): Promise<Resultado<unknown>> => {
      const r = await pedirIa(`${URL_BASE}/${encodeURIComponent(id)}`, { method: "PATCH", json: cambios });
      // Marcar principal apaga al anterior en el servidor: se relee en vez de adivinar.
      if (r.ok) recargar();
      return r;
    },
    [recargar],
  );

  const borrar = useCallback(
    async (id: string): Promise<Resultado<unknown>> => {
      const r = await pedirIa(`${URL_BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (r.ok) setDatos((d) => (d ? { ...d, configurados: d.configurados.filter((p) => p.id !== id) } : d));
      return r;
    },
    [setDatos],
  );

  const catalogo = useMemo(() => datos?.catalogo ?? [], [datos]);
  const configurados = useMemo(() => datos?.configurados ?? [], [datos]);
  const principal = configurados.find((p) => p.principal && p.activo) ?? null;

  return {
    catalogo,
    configurados,
    plataforma: datos?.plataforma ?? null,
    principal,
    principalLeeFotos: principal ? leeFotos(principal, catalogo) : false,
    cargando,
    error,
    recargar,
    probar,
    guardar,
    actualizar,
    borrar,
  };
}

export type BulejeIaModelos = ReturnType<typeof useBulejeIaModelos>;
