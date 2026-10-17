"use client";

/**
 * use-cargas-medidas — las cargas medidas por foto en el monte (16-10, F3).
 * Habla sólo con `/api/admin/forestal/loth/medicion-carga`. El monte las
 * guarda (con sus fotos) y la oficina las recoge desde el despacho con guía.
 *
 * Vuelve a leer cuando la pestaña regresa a primer plano: la oficina queda
 * con el despacho abierto mientras el monte sigue midiendo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import type { CargaMedida, NuevaCarga, TipoFotoCarga } from "@/lib/forestal/medicion-carga";

export const RUTA_CARGAS = "/api/admin/forestal/loth/medicion-carga";

export interface PlanDeCarga {
  id: string;
  planType: string | null;
  planNumber: string | null;
  tituloHabilitante: string | null;
  titularName: string | null;
  isActive: boolean;
}

export interface DatosCargas {
  cargas: CargaMedida[];
  recientes: CargaMedida[];
  planes?: PlanDeCarga[];
  siguienteCorrelativo?: Record<string, number>;
}

export type Respuesta<T> = { ok: true; valor: T } | { ok: false; mensaje: string; status?: number };

/** La foto de la carga, vista por su ruta con sesión (302 a la URL firmada). */
export const srcFotoCarga = (cargaId: string, docId: string): string =>
  `${RUTA_CARGAS}/${encodeURIComponent(cargaId)}/fotos?doc=${encodeURIComponent(docId)}`;

async function mensajeDe(res: Response, porDefecto: string): Promise<string> {
  const j = (await res.json().catch((err: unknown) => {
    logger.warn("[cargas-medidas] respuesta sin JSON", { status: res.status, error: String(err) });
    return null;
  })) as { message?: string } | null;
  if (res.status === 413) return "La foto es muy grande.";
  return j?.message ?? porDefecto;
}

async function pedir<T>(url: string, init: RequestInit, porDefecto: string): Promise<Respuesta<T>> {
  try {
    const res = await fetch(url, { credentials: "include", ...init });
    if (!res.ok) return { ok: false, mensaje: await mensajeDe(res, porDefecto), status: res.status };
    return { ok: true, valor: (await res.json()) as T };
  } catch (e) {
    logger.warn("[cargas-medidas] sin red", { error: String(e) });
    return { ok: false, mensaje: "Sin señal: no se guardó. Prueba de nuevo." };
  }
}

const json = (metodo: "POST" | "PATCH", body: unknown): RequestInit => ({
  method: metodo,
  headers: csrfHeaders({ "Content-Type": "application/json" }),
  body: JSON.stringify(body),
});

/** Sube UNA foto de la carga al Drive y la ata a la carga. */
export function subirFotoDeCarga(cargaId: string, tipo: TipoFotoCarga, blob: Blob) {
  const form = new FormData();
  form.set("tipo", tipo);
  form.set("file", new File([blob], `carga-${tipo}.jpg`, { type: blob.type || "image/jpeg" }));
  return pedir<{ carga: CargaMedida }>(
    `${RUTA_CARGAS}/${encodeURIComponent(cargaId)}/fotos`,
    { method: "POST", headers: csrfHeaders(), body: form },
    "No se pudo guardar la foto de la carga.",
  );
}

/** `soloCargas`: la oficina ya tiene planes y correlativo del despacho; pide sólo las listas. */
export function useCargasMedidas({ activo = true, soloCargas = false }: { activo?: boolean; soloCargas?: boolean } = {}) {
  const [datos, setDatos] = useState<DatosCargas | null>(null);
  const [cargando, setCargando] = useState(activo);
  const [error, setError] = useState<string | null>(null);
  /** Sólo vale la última lectura: una vieja que llega tarde no pisa a la nueva. */
  const pedido = useRef(0);

  const recargar = useCallback(async () => {
    const n = ++pedido.current;
    setCargando(true);
    const r = await pedir<DatosCargas>(`${RUTA_CARGAS}${soloCargas ? "?solo=cargas" : ""}`, { cache: "no-store" }, "No se pudieron leer las cargas.");
    if (n !== pedido.current) return;
    if (r.ok) {
      setDatos((d) => ({ ...d, ...r.valor }));
      setError(null);
    } else setError(r.mensaje);
    setCargando(false);
  }, [soloCargas]);

  useEffect(() => {
    if (!activo) return;
    void recargar();
    const alVolver = () => {
      if (document.visibilityState === "visible") void recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [activo, recargar]);

  /** Pone la carga cambiada en su lista (vigente o terminada). */
  const aplicar = useCallback((c: CargaMedida) => {
    setDatos((d) => {
      const fuera = (l: CargaMedida[] | undefined) => (l ?? []).filter((x) => x.id !== c.id);
      return c.estado === "medida"
        ? { ...d, cargas: [c, ...fuera(d?.cargas)], recientes: fuera(d?.recientes) }
        : { ...d, cargas: fuera(d?.cargas), recientes: [c, ...fuera(d?.recientes)].slice(0, 10) };
    });
  }, []);

  const guardar = useCallback(
    async (entrada: NuevaCarga): Promise<Respuesta<CargaMedida>> => {
      const r = await pedir<{ carga: CargaMedida }>(RUTA_CARGAS, json("POST", entrada), "No se pudo guardar la carga.");
      if (!r.ok) return r;
      aplicar(r.valor.carga);
      return { ok: true, valor: r.valor.carga };
    },
    [aplicar],
  );

  const subirFoto = useCallback(
    async (cargaId: string, tipo: TipoFotoCarga, blob: Blob): Promise<Respuesta<CargaMedida>> => {
      const r = await subirFotoDeCarga(cargaId, tipo, blob);
      if (!r.ok) return r;
      aplicar(r.valor.carga);
      return { ok: true, valor: r.valor.carga };
    },
    [aplicar],
  );

  const descartar = useCallback(
    async (id: string, motivo: string): Promise<Respuesta<CargaMedida>> => {
      const r = await pedir<{ carga: CargaMedida }>(RUTA_CARGAS, json("PATCH", { id, accion: "descartar", motivo }), "No se pudo descartar la carga.");
      if (!r.ok) return r;
      aplicar(r.valor.carga);
      return { ok: true, valor: r.valor.carga };
    },
    [aplicar],
  );

  return { datos, cargando, error, recargar, guardar, subirFoto, descartar };
}

export type CargasMedidas = ReturnType<typeof useCargasMedidas>;
