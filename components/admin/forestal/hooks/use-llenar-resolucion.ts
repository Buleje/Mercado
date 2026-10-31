"use client";

/**
 * use-llenar-resolucion — «Llenar desde la resolución» (pestaña Papeles).
 *
 * Pide al servidor que lea la resolución (o el certificado de la plantación)
 * que ya está en la carpeta del plan y devuelve, campo por campo, «hoy» contra
 * «el papel dice». Nada se guarda solo: la persona marca qué pasa al plan y
 * recién ahí van el PATCH del plan y el PUT de especies de siempre.
 *
 * Arranca marcado SÓLO lo que completa un dato vacío del plan (`sugerida`):
 * lo que cambia un dato que ya está, la especie nueva y el volumen que pasa el
 * tope los marca la persona (o no se pueden marcar). Un papel plantado en la
 * carpeta no llega con el volumen inflado ya tildado (security 25-10).
 */

import { useCallback, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import type { LecturaResolucion } from "@/lib/forestal/loth-resolucion-lectura";
import { cuerpoPatchPlan, cuerpoPutEspecies, type PropuestaResolucion } from "@/lib/forestal/loth-resolucion-propuesta";

export type FuenteLectura = "texto" | "ia" | "ia+texto";

/** Quién subió el archivo leído y cuándo: un papel ajeno se nota antes de pasarlo. */
export interface ArchivoLeido {
  nombre: string;
  subidoPor: string | null;
  subidoEl: string | null;
}

export interface LecturaDelPapel {
  lectura: LecturaResolucion;
  archivo?: ArchivoLeido;
  propuesta: PropuestaResolucion;
  fuente: FuenteLectura;
  avisos: string[];
}

export type EstadoLlenar =
  | { fase: "leyendo" }
  | { fase: "listo"; r: LecturaDelPapel }
  | { fase: "error"; mensaje: string; avisos: string[] };

/** Clave de cada casilla: el campo del plan, o `esp:<especie>`. */
export const claveEspecie = (especie: string) => `esp:${especie}`;

export function marcadasDeInicio(p: PropuestaResolucion): Set<string> {
  return new Set([
    ...p.filas.filter((f) => f.sugerida).map((f) => f.campo as string),
    ...p.especies.filter((e) => e.sugerida).map((e) => claveEspecie(e.especie)),
  ]);
}

async function motivo(r: Response, quePedia: string): Promise<string> {
  const j = await leerJson<{ message?: string; error?: string }>(r);
  return j?.message ?? j?.error ?? `No se pudo ${quePedia} (HTTP ${r.status}).`;
}

export function useLlenarResolucion({ planId, onGuardado }: { planId: string; onGuardado: () => void | Promise<void> }) {
  const [estado, setEstado] = useState<EstadoLlenar | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set());
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  /* Cerrar y volver a abrir con otro archivo: la lectura vieja no pisa la nueva. */
  const turno = useRef(0);

  const leer = useCallback(
    async (documentId: string) => {
      const este = ++turno.current;
      setEstado({ fase: "leyendo" });
      setErrorGuardar(null);
      try {
        const r = await fetch("/api/admin/forestal/plan/documentos/leer-resolucion", {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ planId, documentId }),
        });
        if (este !== turno.current) return;
        if (!r.ok) {
          const j = await leerJson<{ message?: string; error?: string; avisos?: string[] }>(r);
          if (este !== turno.current) return;
          setEstado({ fase: "error", mensaje: j?.message ?? j?.error ?? `No se pudo leer el papel (HTTP ${r.status}).`, avisos: j?.avisos ?? [] });
          return;
        }
        const j = await leerJson<LecturaDelPapel>(r);
        if (este !== turno.current) return;
        if (!j?.propuesta) {
          setEstado({ fase: "error", mensaje: "El servidor no devolvió lo leído.", avisos: [] });
          return;
        }
        setMarcadas(marcadasDeInicio(j.propuesta));
        setEstado({ fase: "listo", r: { ...j, avisos: j.avisos ?? [] } });
      } catch (e) {
        if (este === turno.current) setEstado({ fase: "error", mensaje: e instanceof Error ? e.message : String(e), avisos: [] });
      }
    },
    [planId],
  );

  const cerrar = useCallback(() => {
    turno.current += 1;
    setEstado(null);
    setErrorGuardar(null);
  }, []);

  const alternar = useCallback((clave: string, si: boolean) => {
    setMarcadas((prev) => {
      const nuevo = new Set(prev);
      if (si) nuevo.add(clave);
      else nuevo.delete(clave);
      return nuevo;
    });
  }, []);

  /** Pasa al plan lo marcado. true = guardó (y el plan se recargó). */
  const guardar = useCallback(async (): Promise<boolean> => {
    if (estado?.fase !== "listo") return false;
    const { propuesta } = estado.r;
    const patch = cuerpoPatchPlan(planId, propuesta.filas.filter((f) => marcadas.has(f.campo)));
    const put = cuerpoPutEspecies(planId, propuesta.especies.filter((e) => marcadas.has(claveEspecie(e.especie))));
    if (!patch && !put) return false;
    setGuardando(true);
    setErrorGuardar(null);
    let planGuardado = false;
    try {
      if (patch) {
        const r = await fetch("/api/admin/forestal/plan", {
          method: "PATCH",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(patch),
        });
        if (!r.ok) throw new Error(await motivo(r, "guardar los datos del plan"));
        planGuardado = true;
      }
      if (put) {
        const r = await fetch("/api/admin/forestal/plan/species", {
          method: "PUT",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(put),
        });
        /* El plan ya quedó: se dice qué parte no entró, no «falló todo». */
        if (!r.ok) throw new Error(`${patch ? "Los datos del plan se guardaron, pero las especies no: " : ""}${await motivo(r, "guardar las especies")}`);
      }
      await onGuardado();
      cerrar();
      return true;
    } catch (e) {
      setErrorGuardar(e instanceof Error ? e.message : String(e));
      if (planGuardado) await onGuardado();
      return false;
    } finally {
      setGuardando(false);
    }
  }, [estado, planId, marcadas, onGuardado, cerrar]);

  return { estado, marcadas, alternar, leer, cerrar, guardar, guardando, errorGuardar };
}

export type LlenarResolucion = ReturnType<typeof useLlenarResolucion>;
