"use client";

/**
 * use-reportes-diarios — leer, guardar, borrar, previsualizar y mandar los
 * reportes diarios del libro (ADR-439).
 *
 * La validación y el armado viven en el servidor (`reporteDiarioSchema`,
 * `armarReporteForestal`): acá sólo el fetch. Cada acción devuelve el `message`
 * del servidor TAL CUAL para mostrarlo al lado del botón.
 */
import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CanalReporte, RangoReporte, ReporteDiario, ReporteDiarioInput, SeccionReporte } from "@/lib/forestal/reporte-diario";

const API = "/api/admin/forestal/reportes-diarios";

export interface EnvioDeReporte {
  id: string;
  type: string;
  recipient: string;
  status: string;
  message: string;
  createdAt: string;
}

export interface VistaPrevia {
  asunto: string;
  html: string;
  texto: string;
  desde: string;
  hasta: string;
  fallidas: SeccionReporte[];
}

export interface ResultadoEnvio {
  canal: CanalReporte;
  destino: string;
  ok: boolean;
  error: string | null;
  explicacion: string | null;
}

interface Estado {
  reportes: ReporteDiario[];
  envios: Record<string, EnvioDeReporte[]>;
  disparos: string[];
  /** El disparador de cada media hora está vivo (latido < 65 min): se promete la hora exacta. */
  horaExacta: boolean;
  canales: { correo: boolean; whatsapp: boolean };
}

const VACIO: Estado = { reportes: [], envios: {}, disparos: [], horaExacta: false, canales: { correo: true, whatsapp: true } };

/** `{ ok, j }` sin tirar: un 422 trae el motivo que hay que mostrar. */
async function pedir<T>(url: string, init: RequestInit = {}): Promise<{ ok: true; j: T } | { ok: false; motivo: string }> {
  try {
    const r = await fetch(url, {
      credentials: "include",
      ...init,
      headers: init.method && init.method !== "GET" ? csrfHeaders({ "Content-Type": "application/json" }) : undefined,
    });
    const j = (await r.json().catch(() => ({}))) as T & { message?: string };
    if (!r.ok) return { ok: false, motivo: j.message ?? `El servidor respondió ${r.status}.` };
    return { ok: true, j };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "Sin conexión con el servidor." };
  }
}

export function useReportesDiarios() {
  const [estado, setEstado] = useState<Estado>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    const r = await pedir<Estado>(API);
    if (r.ok) {
      setEstado({ ...VACIO, ...r.j });
      setError(null);
    } else {
      setError(`No se pudieron leer los reportes guardados: ${r.motivo}`);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Crea (sin id) o reemplaza (con id). Devuelve el reporte guardado o el motivo. */
  const guardar = useCallback(
    async (input: ReporteDiarioInput, id?: string): Promise<{ reporte: ReporteDiario } | { motivo: string }> => {
      const r = await pedir<{ reporte: ReporteDiario }>(id ? `${API}/${id}` : API, {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(input),
      });
      if (!r.ok) return { motivo: r.motivo };
      await recargar();
      return { reporte: r.j.reporte };
    },
    [recargar],
  );

  const eliminar = useCallback(
    async (id: string): Promise<string | null> => {
      const r = await pedir<{ ok: true }>(`${API}/${id}`, { method: "DELETE" });
      if (!r.ok) return r.motivo;
      await recargar();
      return null;
    },
    [recargar],
  );

  const vistaPrevia = useCallback(
    async (b: { nombre: string; secciones: SeccionReporte[]; rango: RangoReporte }): Promise<VistaPrevia | { motivo: string }> => {
      const r = await pedir<VistaPrevia>(`${API}/vista-previa`, { method: "POST", body: JSON.stringify(b) });
      return r.ok ? r.j : { motivo: r.motivo };
    },
    [],
  );

  const enviarAhora = useCallback(
    async (id: string): Promise<{ resultados: ResultadoEnvio[] } | { motivo: string }> => {
      const r = await pedir<{ resultados: ResultadoEnvio[] }>(`${API}/${id}/enviar`, { method: "POST" });
      await recargar();
      return r.ok ? { resultados: r.j.resultados } : { motivo: r.motivo };
    },
    [recargar],
  );

  return { ...estado, cargando, error, recargar, guardar, eliminar, vistaPrevia, enviarAhora };
}
