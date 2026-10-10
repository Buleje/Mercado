"use client";

/**
 * Los datos de «Qué tiene cada negocio»: el catálogo de piezas del código, la
 * matriz de lo asignado, y el guardado de UNA asignación. Todo por las rutas
 * `/api/superadmin/piezas` (ADR-457); la pantalla nunca decide qué es válido,
 * lo dice el servidor.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSuperadmin } from "@/lib/superadmin/fetch-auth";
import { broadcastSpecsChanged } from "@/hooks/use-enabled-specs";
import { logger } from "@/lib/logger";
import { explicarIssues, type IssueDeOpciones } from "./errores-de-opciones";
import type { EnchufeId } from "@/extensiones/_contrato";
import type { FilaDeLaMatriz } from "@/lib/extensiones/resolver";
import type { PiezaDeCatalogoUI } from "./piezas-del-negocio";

export interface AsignacionAGuardar {
  tenantId: string;
  piezaId: string;
  enchufe: EnchufeId;
  prendida: boolean;
  opciones: Record<string, unknown>;
}

export type ResultadoGuardado = { ok: true } | { ok: false; mensaje: string };

interface RespuestaDelServidor {
  mensaje?: string;
  error?: string;
  issues?: IssueDeOpciones[];
}

function mensajeDeError(status: number, cuerpo: RespuestaDelServidor, rotulos: Record<string, string>): string {
  if (cuerpo.error === "pagina_de_otro_negocio") return cuerpo.mensaje ?? "Esa página propia ya es de otro negocio: no puede tener dos dueños.";
  if (cuerpo.issues?.length) return explicarIssues(cuerpo.issues, rotulos).join(" · ");
  return cuerpo.mensaje ?? cuerpo.error ?? `No se pudo guardar (HTTP ${status}).`;
}

export function usePiezasSuperadmin() {
  const [catalogo, setCatalogo] = useState<PiezaDeCatalogoUI[]>([]);
  const [matriz, setMatriz] = useState<FilaDeLaMatriz[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const vivo = useRef(true);
  /** Un número por pedido de la matriz: sólo vale la respuesta del ÚLTIMO (una vieja que llega tarde pisaría lo que otro guardado ya escribió). */
  const ticket = useRef(0);

  /** `silencioso`: refrescar tras guardar sin esconder la tabla detrás de un «cargando». */
  const cargar = useCallback(async (silencioso = false) => {
    const mio = ++ticket.current;
    const vigente = () => vivo.current && mio === ticket.current;
    if (!silencioso) setCargando(true);
    setError(null);
    try {
      const res = await fetchSuperadmin("/api/superadmin/piezas");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { catalogo: PiezaDeCatalogoUI[]; matriz: FilaDeLaMatriz[] };
      if (!vigente()) return;
      setCatalogo(data.catalogo);
      setMatriz(data.matriz);
    } catch (err) {
      logger.error("[superadmin/piezas] no pude leer la matriz", { error: String(err) });
      if (vigente()) setError("No pude leer las piezas. Reintenta en un momento.");
    } finally {
      if (vigente()) setCargando(false);
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    void cargar(false);
    return () => {
      vivo.current = false;
    };
  }, [cargar]);

  const guardar = useCallback(async (a: AsignacionAGuardar, rotulos: Record<string, string> = {}): Promise<ResultadoGuardado> => {
    try {
      const res = await fetchSuperadmin("/api/superadmin/piezas/asignacion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as RespuestaDelServidor;
      if (!res.ok) {
        // 409: otro superadmin la tomó mientras tanto. Se recarga para que la pantalla diga de quién es.
        if (res.status === 409) await cargar(true);
        return { ok: false, mensaje: mensajeDeError(res.status, cuerpo, rotulos) };
      }
      // La fila que vuelve del servidor no trae los avisos: se recarga la matriz entera
      // (son decenas de filas) en vez de adivinar `desactualizada` en el navegador.
      await cargar(true);
      broadcastSpecsChanged({ tenantId: a.tenantId });
      return { ok: true };
    } catch (err) {
      logger.error("[superadmin/piezas] guardar falló", { error: String(err) });
      return { ok: false, mensaje: "No pude guardar. Revisa tu conexión." };
    }
  }, [cargar]);

  /** Soltar una página propia APAGADA: borra la fila y queda libre para otro negocio. */
  const soltar = useCallback(async (a: { tenantId: string; piezaId: string; enchufe: EnchufeId }): Promise<ResultadoGuardado> => {
    try {
      const res = await fetchSuperadmin("/api/superadmin/piezas/asignacion", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(a),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as RespuestaDelServidor;
      if (!res.ok) {
        await cargar(true);
        const mensaje = cuerpo.error === "pagina_prendida" ? "Está prendida: apágala primero y luego suéltala." : (cuerpo.mensaje ?? cuerpo.error ?? `No se pudo soltar (HTTP ${res.status}).`);
        return { ok: false, mensaje };
      }
      await cargar(true);
      broadcastSpecsChanged({ tenantId: a.tenantId });
      return { ok: true };
    } catch (err) {
      logger.error("[superadmin/piezas] soltar falló", { error: String(err) });
      return { ok: false, mensaje: "No pude soltarla. Revisa tu conexión." };
    }
  }, [cargar]);

  return { catalogo, matriz, cargando, error, recargar: () => cargar(false), guardar, soltar };
}

export type PiezasSuperadmin = ReturnType<typeof usePiezasSuperadmin>;
