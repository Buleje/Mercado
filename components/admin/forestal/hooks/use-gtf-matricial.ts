"use client";

/**
 * useGtfMatricial — el estado del diseñador «Imprimir en talonario»: la
 * disposición del tenant (guía + lista), lo que cambió sin guardar, qué campo
 * está elegido y las hojas que salen de ESTA guía.
 *
 * Los valores salen de `entradasDeLaGuia` (la misma entrada que «Imprimir hoja
 * SERFOR»). Una guía anotada a mano necesita la carátula del libro para su
 * identidad (casilleros 6 y 7): se pide sólo en ese caso.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  acotarPos,
  hojaDeFabrica,
  type CampoPos,
  type ColumnaPos,
  type DisposicionHoja,
  type DisposicionTalonario,
  type FormatoTalonario,
  type TablaPos,
} from "@/lib/forestal/gtf-matricial-disposicion";
import { entradasDeLaGuia, paginasDe, type PaginaTalonario } from "@/lib/forestal/gtf-matricial-valores";
import type { LothGtfCaratula, LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import type { Gtf } from "../gtf-tabla-columnas";

const RUTA = "/api/admin/forestal/loth/gtf-matricial";

export type SeleccionTalonario = { tipo: "campo" | "columna"; id: string } | null;

const foto = (h: DisposicionHoja | undefined): string => JSON.stringify(h ?? null);

async function leerJson<T>(r: Response): Promise<T | null> {
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function useGtfMatricial(g: Gtf) {
  const [disp, setDisp] = useState<DisposicionTalonario | null>(null);
  /** Lo último que confirmó el servidor, hoja por hoja: contra eso se mide «sin guardar». */
  const [guardado, setGuardado] = useState<Record<FormatoTalonario, string>>({ guia: "", lista: "" });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [formato, setFormato] = useState<FormatoTalonario>("guia");
  const [sel, setSel] = useState<SeleccionTalonario>(null);
  const [pagina, setPagina] = useState(0);
  const [caratula, setCaratula] = useState<LothGtfCaratula | null>(null);
  const necesitaCaratula = !g.gtfDatos;

  useEffect(() => {
    let vivo = true;
    fetch(RUTA, { credentials: "include" })
      .then(async (r) => {
        const j = await leerJson<{ disposicion?: DisposicionTalonario; message?: string; error?: string }>(r);
        if (!r.ok || !j?.disposicion) throw new Error(j?.message ?? j?.error ?? `No se pudo leer la disposición (${r.status})`);
        if (!vivo) return;
        setDisp(j.disposicion);
        setGuardado({ guia: foto(j.disposicion.guia), lista: foto(j.disposicion.lista) });
      })
      .catch((err) => vivo && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!necesitaCaratula) return;
    fetch("/api/admin/forestal/loth/caratula", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCaratula(j?.active ?? null))
      .catch((err) => console.warn("[gtf-matricial] no se pudo leer la carátula", err));
  }, [necesitaCaratula]);

  const entradas = useMemo(() => entradasDeLaGuia(g as unknown as LothGtfDoc, caratula), [g, caratula]);
  const hoja = disp?.[formato] ?? null;
  const paginas: PaginaTalonario[] = useMemo(() => (hoja ? paginasDe(formato, entradas, hoja) : []), [formato, entradas, hoja]);
  const paginaActual = Math.min(pagina, Math.max(0, paginas.length - 1));

  const sucio = !!disp && (foto(disp.guia) !== guardado.guia || foto(disp.lista) !== guardado.lista);

  const cambiarHoja = useCallback(
    (patch: Partial<DisposicionHoja>) => setDisp((d) => (d ? { ...d, [formato]: { ...d[formato], ...patch } } : d)),
    [formato],
  );
  const cambiarCampo = useCallback(
    (id: string, patch: Partial<CampoPos>) =>
      setDisp((d) => {
        if (!d) return d;
        const h = d[formato];
        const p = { ...patch, ...(patch.x != null && { x: acotarPos(patch.x) }), ...(patch.y != null && { y: acotarPos(patch.y) }) };
        return { ...d, [formato]: { ...h, campos: { ...h.campos, [id]: { ...h.campos[id], ...p } } } };
      }),
    [formato],
  );
  const cambiarTabla = useCallback(
    (patch: Partial<Omit<TablaPos, "columnas">>) =>
      setDisp((d) => {
        if (!d) return d;
        const p = { ...patch, ...(patch.y != null && { y: acotarPos(patch.y) }) };
        return { ...d, [formato]: { ...d[formato], tabla: { ...d[formato].tabla, ...p } } };
      }),
    [formato],
  );
  const cambiarColumna = useCallback(
    (id: string, patch: Partial<ColumnaPos>) =>
      setDisp((d) => {
        if (!d) return d;
        const t = d[formato].tabla;
        const p = { ...patch, ...(patch.x != null && { x: acotarPos(patch.x) }) };
        return { ...d, [formato]: { ...d[formato], tabla: { ...t, columnas: { ...t.columnas, [id]: { ...t.columnas[id], ...p } } } } };
      }),
    [formato],
  );

  /** Vuelve a la de fábrica las posiciones; la medida de la hoja y el corrimiento son del papel y de la impresora: quedan. */
  const restaurar = useCallback(
    () =>
      setDisp((d) => {
        if (!d) return d;
        const h = d[formato];
        return { ...d, [formato]: { ...hojaDeFabrica(formato), anchoMm: h.anchoMm, altoMm: h.altoMm, offsetXMm: h.offsetXMm, offsetYMm: h.offsetYMm } };
      }),
    [formato],
  );

  /** Guarda las hojas que cambiaron. `true` si quedó todo guardado. */
  const guardar = useCallback(async (): Promise<boolean> => {
    if (!disp) return false;
    const pendientes = (["guia", "lista"] as const).filter((f) => foto(disp[f]) !== guardado[f]);
    if (pendientes.length === 0) return true;
    setGuardando(true);
    setError(null);
    try {
      for (const f of pendientes) {
        const enviado = foto(disp[f]);
        const r = await fetch(RUTA, {
          method: "PUT",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ formato: f, hoja: disp[f] }),
        });
        const j = await leerJson<{ disposicion?: DisposicionTalonario; message?: string; error?: string }>(r);
        if (!r.ok || !j?.disposicion) throw new Error(j?.message ?? j?.error ?? `No se pudo guardar (${r.status})`);
        const servidor = j.disposicion;
        setGuardado((prev) => ({ ...prev, [f]: foto(servidor[f]) }));
        /* Lo que se movió MIENTRAS se guardaba se queda (y sigue «sin guardar»): sólo se adopta la del servidor si nada cambió. */
        setDisp((d) => (d ? { ...d, ...(foto(d[f]) === enviado && { [f]: servidor[f] }), actualizado: servidor.actualizado } : d));
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setGuardando(false);
    }
  }, [disp, guardado]);

  const elegirFormato = useCallback((f: FormatoTalonario) => {
    setFormato(f);
    setSel(null);
    setPagina(0);
  }, []);

  return {
    disp, hoja, formato, elegirFormato, sel, setSel, entradas, paginas, pagina: paginaActual, setPagina,
    sucio, guardando, error, guardar, restaurar, cambiarHoja, cambiarCampo, cambiarTabla, cambiarColumna,
  };
}

export type EstadoGtfMatricial = ReturnType<typeof useGtfMatricial>;
