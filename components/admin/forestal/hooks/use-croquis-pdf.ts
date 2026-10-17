"use client";

/**
 * Estado de la importación del PDF del croquis (ADR-465): la propuesta que
 * devolvió el servidor, qué componentes quedan marcados y con qué tipo, y el
 * alta en lote de las zonas confirmadas. Las posiciones y los contornos viajan
 * en fracción de la imagen; a metros se pasan recién al crear, con el
 * ancho/largo final. Cada renglón con contorno puede volver al cuadrado.
 */

import { useCallback, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { numeroDeCodigo, zonasDesdeComponentes, type PropuestaCroquisPdf } from "@/lib/forestal/croquis-desde-pdf";
import { tipoDeComponente } from "@/lib/forestal/croquis-componentes";
import type { CategoriaComponente, ZonaTipo } from "@/lib/forestal/planta-zona-types";

/** `forma`: el contorno del PDF (si lo trae) o la marca cuadrada en el número. `categoria`: qué es según la leyenda. */
export interface FilaPdf { incluir: boolean; categoria: CategoriaComponente; tipo: ZonaTipo; forma: "contorno" | "cuadrado" }
/** Códigos de zona del negocio al momento de importar (todos y los del croquis). */
export interface ExistentesPdf { codigos: string[]; croquis: string[] }
export type ResultadoZonasPdf =
  | { ok: true; creadas: number; omitidas: { codigo: string; motivo: string }[] }
  | { ok: false; error: string };

const URL_ZONAS = "/api/admin/forestal/ctp/planta/croquis/zonas";

/** Número de la leyenda → código de la zona del croquis que ya lo usa (PT-08 → 8). */
function porNumero(croquis: string[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const c of croquis) {
    const n = numeroDeCodigo(c);
    if (n != null && !m.has(n)) m.set(n, c);
  }
  return m;
}

export function useCroquisPdf() {
  const [propuesta, setPropuesta] = useState<PropuestaCroquisPdf | null>(null);
  const [existentes, setExistentes] = useState<ExistentesPdf>({ codigos: [], croquis: [] });
  const [filas, setFilas] = useState<Record<string, FilaPdf>>({});

  const yaEnCroquis = useMemo(() => porNumero(existentes.croquis), [existentes]);

  const cargar = useCallback((p: PropuestaCroquisPdf, ex: ExistentesPdf) => {
    const usados = porNumero(ex.croquis);
    setPropuesta(p);
    setExistentes(ex);
    // Un número que ya tiene zona en el croquis entra SIN marcar: re-importar no duplica.
    setFilas(Object.fromEntries(p.componentes.map((c) => [c.clave, {
      incluir: c.sugerido && !usados.has(c.numero), categoria: c.categoria, tipo: c.tipo, forma: c.contorno ? "contorno" : "cuadrado",
    } satisfies FilaPdf])));
  }, []);

  const cambiarFila = useCallback((clave: string, cambio: Partial<FilaPdf>) => {
    setFilas((f) => (f[clave] ? { ...f, [clave]: { ...f[clave], ...cambio } } : f));
  }, []);

  /** Cambiar qué es también cambia el tipo sugerido (se puede volver a elegir después). */
  const cambiarCategoria = useCallback((clave: string, categoria: CategoriaComponente) => {
    const nombre = propuesta?.componentes.find((c) => c.clave === clave)?.nombre ?? "";
    setFilas((f) => (f[clave] ? { ...f, [clave]: { ...f[clave], categoria, tipo: tipoDeComponente(categoria, nombre) } } : f));
  }, [propuesta]);

  const marcarTodas = useCallback((incluir: boolean) => {
    setFilas((f) => Object.fromEntries(Object.entries(f).map(([k, x]) => [k, { ...x, incluir }])));
  }, []);

  const elegidos = useMemo(
    () => (propuesta?.componentes ?? []).filter((c) => filas[c.clave]?.incluir).map((c) => ({
      ...c, categoria: filas[c.clave].categoria, tipo: filas[c.clave].tipo, contorno: filas[c.clave].forma === "contorno" ? c.contorno : null,
    })),
    [propuesta, filas],
  );

  const limpiar = useCallback(() => { setPropuesta(null); setFilas({}); }, []);

  const crearZonas = useCallback(async (terreno: { anchoM: number; altoM: number }): Promise<ResultadoZonasPdf> => {
    const zonas = zonasDesdeComponentes(elegidos, terreno);
    if (!zonas.length) return { ok: true, creadas: 0, omitidas: [] };
    try {
      const r = await fetch(URL_ZONAS, {
        method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), credentials: "include",
        body: JSON.stringify({ zonas }),
      });
      const j = (await r.json().catch(() => ({}))) as { creadas?: unknown[]; omitidas?: { codigo: string; motivo: string }[]; message?: string; error?: string };
      if (!r.ok) return { ok: false, error: j.message ?? j.error ?? (r.status === 403 ? "solo el dueño o el administrador crea las zonas del plano" : `HTTP ${r.status}`) };
      return { ok: true, creadas: j.creadas?.length ?? 0, omitidas: j.omitidas ?? [] };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [elegidos]);

  return { propuesta, existentes, yaEnCroquis, filas, cargar, cambiarFila, cambiarCategoria, marcarTodas, elegidos, limpiar, crearZonas };
}

export type CroquisPdfEstado = ReturnType<typeof useCroquisPdf>;
