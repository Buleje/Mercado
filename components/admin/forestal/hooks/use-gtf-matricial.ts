"use client";

/**
 * useGtfMatricial — el estado del diseñador «Imprimir en talonario»: la
 * disposición del tenant (guía + lista), lo que cambió sin guardar, qué campo
 * está elegido y las hojas que salen de ESTA guía.
 *
 * Los valores salen de `entradasDeLaGuia` (la misma entrada que «Imprimir hoja
 * SERFOR»). Una guía anotada a mano necesita la carátula del libro para su
 * identidad (casilleros 6 y 7): se pide sólo en ese caso.
 *
 * Todo cambio de la hoja pasa por `editar`, que guarda el paso anterior para
 * deshacer (uno por hoja, hasta `HISTORIAL_MAX`). Los cambios con la misma
 * `clave` seguidos (un arrastre) son UN paso.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { deshacer as deshacerH, empujar, historialVacio, rehacer as rehacerH, type Historial } from "@/lib/forestal/gtf-matricial-edicion";
import { entradasDeLaGuia, paginasDe, type PaginaTalonario } from "@/lib/forestal/gtf-matricial-valores";
import type { LothGtfCaratula, LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import type { Gtf } from "../gtf-tabla-columnas";

const RUTA = "/api/admin/forestal/loth/gtf-matricial";

/** Dos cambios con la misma clave a menos de esto son un solo paso de deshacer. */
const JUNTAR_MS = 1200;

const foto = (h: DisposicionHoja | undefined): string => JSON.stringify(h ?? null);

async function leerJson<T>(r: Response): Promise<T | null> {
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function useGtfMatricial(g: Gtf) {
  const [disp, setDispEstado] = useState<DisposicionTalonario | null>(null);
  /* Espejo síncrono: varias ediciones en el mismo cuadro (un arrastre) leen la última, no la del render. */
  const dispRef = useRef<DisposicionTalonario | null>(null);
  const setDisp = useCallback((d: DisposicionTalonario | null) => {
    dispRef.current = d;
    setDispEstado(d);
  }, []);
  const historial = useRef<Record<FormatoTalonario, Historial<DisposicionHoja>>>({ guia: historialVacio(), lista: historialVacio() });
  const ultimo = useRef<{ clave: string | null; t: number }>({ clave: null, t: 0 });
  const [, setPasos] = useState(0);
  /** Lo último que confirmó el servidor, hoja por hoja: contra eso se mide «sin guardar». */
  const [guardado, setGuardado] = useState<Record<FormatoTalonario, string>>({ guia: "", lista: "" });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [formato, setFormato] = useState<FormatoTalonario>("guia");
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
  }, [setDisp]);

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

  /** Cambia la hoja abierta y guarda el paso anterior para deshacer. */
  const editar = useCallback(
    (fn: (h: DisposicionHoja) => DisposicionHoja, clave: string | null = null) => {
      const d = dispRef.current;
      if (!d) return;
      const actual = d[formato];
      const nueva = fn(actual);
      if (foto(nueva) === foto(actual)) return;
      const ahora = Date.now();
      /* Un arrastre (clave única por arrastre) es UN paso aunque se pause; lo demás, si llega seguido. */
      const misma = clave != null && ultimo.current.clave === clave;
      const juntar = misma && (clave.startsWith("arrastre:") || ahora - ultimo.current.t < JUNTAR_MS);
      if (!juntar) historial.current[formato] = empujar(historial.current[formato], actual);
      ultimo.current = { clave, t: ahora };
      setDisp({ ...d, [formato]: nueva });
      setPasos((n) => n + 1);
    },
    [formato, setDisp],
  );

  const moverEnHistorial = useCallback(
    (cual: "deshacer" | "rehacer") => {
      const d = dispRef.current;
      if (!d) return;
      const r = (cual === "deshacer" ? deshacerH : rehacerH)(historial.current[formato], d[formato]);
      if (!r) return;
      historial.current[formato] = r.h;
      ultimo.current = { clave: null, t: 0 };
      setDisp({ ...d, [formato]: r.valor });
      setPasos((n) => n + 1);
    },
    [formato, setDisp],
  );
  const deshacer = useCallback(() => moverEnHistorial("deshacer"), [moverEnHistorial]);
  const rehacer = useCallback(() => moverEnHistorial("rehacer"), [moverEnHistorial]);
  const puedeDeshacer = historial.current[formato].pasado.length > 0;
  const puedeRehacer = historial.current[formato].futuro.length > 0;

  const cambiarHoja = useCallback((patch: Partial<DisposicionHoja>) => editar((h) => ({ ...h, ...patch })), [editar]);
  const cambiarCampo = useCallback(
    (id: string, patch: Partial<CampoPos>) =>
      editar((h) => {
        const p = { ...patch, ...(patch.x != null && { x: acotarPos(patch.x) }), ...(patch.y != null && { y: acotarPos(patch.y) }) };
        return { ...h, campos: { ...h.campos, [id]: { ...h.campos[id], ...p } } };
      }),
    [editar],
  );
  const cambiarTabla = useCallback(
    (patch: Partial<Omit<TablaPos, "columnas">>) =>
      editar((h) => {
        const p = { ...patch, ...(patch.y != null && { y: acotarPos(patch.y) }) };
        return { ...h, tabla: { ...h.tabla, ...p } };
      }),
    [editar],
  );
  const cambiarColumna = useCallback(
    (id: string, patch: Partial<ColumnaPos>) =>
      editar((h) => {
        const p = { ...patch, ...(patch.x != null && { x: acotarPos(patch.x) }) };
        return { ...h, tabla: { ...h.tabla, columnas: { ...h.tabla.columnas, [id]: { ...h.tabla.columnas[id], ...p } } } };
      }),
    [editar],
  );

  /** Vuelve a la de fábrica las posiciones; la medida de la hoja y el corrimiento son del papel y de la impresora: quedan. Se deshace. */
  const restaurar = useCallback(
    () =>
      editar((h) => ({ ...hojaDeFabrica(formato), anchoMm: h.anchoMm, altoMm: h.altoMm, offsetXMm: h.offsetXMm, offsetYMm: h.offsetYMm })),
    [editar, formato],
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
        const d = dispRef.current;
        if (d) setDisp({ ...d, ...(foto(d[f]) === enviado && { [f]: servidor[f] }), actualizado: servidor.actualizado });
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setGuardando(false);
    }
  }, [disp, guardado, setDisp]);

  const elegirFormato = useCallback((f: FormatoTalonario) => {
    setFormato(f);
    setPagina(0);
  }, []);

  return {
    disp, hoja, formato, elegirFormato, entradas, paginas, pagina: paginaActual, setPagina,
    sucio, guardando, error, guardar, restaurar, cambiarHoja, cambiarCampo, cambiarTabla, cambiarColumna,
    editar, deshacer, rehacer, puedeDeshacer, puedeRehacer,
  };
}

export type EstadoGtfMatricial = ReturnType<typeof useGtfMatricial>;
