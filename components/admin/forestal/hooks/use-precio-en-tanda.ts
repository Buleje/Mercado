"use client";

/**
 * usePrecioEnTanda — las guías vivas agrupadas por proveedor × especie y la
 * escritura en tanda (`/api/admin/forestal/wood-entries/precio`).
 *
 * El servidor arma los grupos y las referencias del dedazo; la pantalla sólo
 * previsualiza con la misma regla pura (`lib/forestal/precio-en-tanda.ts`) y
 * el total definitivo lo devuelve el POST.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type {
  FilaParaPrecio,
  FilaVista,
  GrupoProveedor,
  PlanDePrecio,
  PrecioPedido,
  ReferenciasDePrecio,
} from "@/lib/forestal/precio-en-tanda";
import { logger } from "@/lib/logger";

export const URL_PRECIO = "/api/admin/forestal/wood-entries/precio";

export interface DatosPrecio {
  filas: FilaParaPrecio[];
  grupos: GrupoProveedor[];
  referencias: ReferenciasDePrecio;
  truncada: boolean;
}

export interface AvisoDeGrupo {
  proveedor: string;
  especie: string;
  precioM3: number;
  avisos: string[];
}

export type RespuestaTanda =
  | { tipo: "hecho"; cambios: PlanDePrecio["cambios"]; saltadas: PlanDePrecio["saltadas"]; totales: PlanDePrecio["totales"] }
  | { tipo: "avisos"; avisos: AvisoDeGrupo[] }
  | { tipo: "error"; mensaje: string };

export interface PedidoTanda {
  precios: PrecioPedido[];
  vistos: FilaVista[];
  tambienConPrecio: boolean;
  confirmarAvisos: boolean;
}

export function usePrecioEnTanda() {
  const [datos, setDatos] = useState<DatosPrecio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(0);

  const cargar = useCallback(() => {
    const n = ++pedido.current;
    setError(null);
    ctpGet<DatosPrecio>(URL_PRECIO)
      .then((j) => {
        if (n !== pedido.current) return;
        setDatos(j);
      })
      .catch((err) => {
        if (n !== pedido.current) return;
        logger.warn("[precio-en-tanda] no cargó", { error: String(err) });
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  useEffect(() => {
    cargar();
    return () => {
      pedido.current += 1;
    };
  }, [cargar]);

  const recargar = useCallback(() => {
    invalidarCtp("wood-entries");
    cargar();
  }, [cargar]);

  const guardar = useCallback(async (body: PedidoTanda): Promise<RespuestaTanda> => {
    try {
      const r = await fetch(URL_PRECIO, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 && Array.isArray(j.avisos)) return { tipo: "avisos", avisos: j.avisos as AvisoDeGrupo[] };
      if (!r.ok) return { tipo: "error", mensaje: j.message ?? j.error ?? `El servidor respondió ${r.status}` };
      /* Lo escrito cambia la lista de Ingresos, la Plata del permiso y
         Rentabilidad: todo lo cacheado del libro queda viejo. */
      invalidarCtp();
      return { tipo: "hecho", cambios: j.cambios ?? [], saltadas: j.saltadas ?? [], totales: j.totales };
    } catch (err) {
      return { tipo: "error", mensaje: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  return { datos, error, recargar, guardar };
}
