"use client";

/**
 * Etiquetas QR de trozas (ADR-436): dos hooks.
 *
 * `useImprimirEtiquetasTrozas` — qué se tildó en una tabla «una fila por pieza»
 * y qué trozas tiene abiertas el modal de etiquetas.
 *
 * `useGenerarEtiquetasTrozas` — lo que hace el modal: lee el patio (el estado
 * de VERDAD al momento de imprimir, no el de la fila cargada: consumida,
 * despachada, sin recepcionar, ya etiquetada), manda a sellar la impresión al
 * servidor —que además numera las que no tienen código de planta— e imprime
 * con lo que el servidor devolvió, así el correlativo nuevo sale en el papel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import {
  imprimirEtiquetasDeTrozas,
  resumenEtiquetado,
  type FormatoEtiqueta,
  type TrozaEtiquetable,
} from "@/lib/forestal/ctp-troza-etiquetas";

export function useImprimirEtiquetasTrozas() {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  /** Las trozas que tiene abiertas el modal (`null` = cerrado). */
  const [modalIds, setModalIds] = useState<string[] | null>(null);

  const alternar = useCallback((id: string) => {
    setSeleccion((prev) => {
      const s2 = new Set(prev);
      if (s2.has(id)) s2.delete(id);
      else s2.add(id);
      return s2;
    });
  }, []);

  /** Reemplaza la selección entera — lo usa el checkbox «tildar todas». */
  const elegirTodas = useCallback((ids: readonly string[]) => setSeleccion(new Set(ids)), []);

  /** Abre el modal con la selección, o con las que se pasen (una guía entera). */
  const abrir = useCallback((ids?: readonly string[]) => {
    setModalIds(ids ? [...ids] : [...seleccion]);
  }, [seleccion]);

  const cerrar = useCallback(() => setModalIds(null), []);
  const limpiar = useCallback(() => setSeleccion(new Set()), []);

  return { seleccion, alternar, elegirTodas, limpiar, modalIds, abrir, cerrar };
}

export interface RespuestaEtiquetas {
  trozas: TrozaEtiquetable[];
  asignados: { id: string; codigo: string }[];
  omitidas: { id: string; motivo: string }[];
  /** Piezas de un mes cerrado: se etiquetan con el código del bosque, sin correlativo. */
  sinCodigoNuevo?: { id: string; motivo: string }[];
  repetidos: { codigo: string; ids: string[] }[];
}

export interface OpcionesGenerar {
  formato: FormatoEtiqueta;
  barras: boolean;
  /** QR grande con la ficha en texto (se lee sin internet) + QR chico del sistema. */
  fichaEnQr: boolean;
  asignarCodigo: boolean;
  soloSinEtiqueta: boolean;
}

async function leerPatio(): Promise<TrozaEtiquetable[]> {
  const r = await fetch("/api/admin/forestal/trozas/patio", { credentials: "include" });
  if (!r.ok) throw new Error(`El servidor respondió ${r.status}`);
  const j = (await r.json()) as { trozas?: TrozaEtiquetable[] };
  return j.trozas ?? [];
}

export function useGenerarEtiquetasTrozas(ids: readonly string[], soloSinEtiqueta: boolean) {
  const [patio, setPatio] = useState<TrozaEtiquetable[] | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [errorGenerar, setErrorGenerar] = useState<string | null>(null);
  const [resultado, setResultado] = useState<(RespuestaEtiquetas & { impresas: number }) | null>(null);

  useEffect(() => {
    let vivo = true;
    leerPatio()
      .then((t) => { if (vivo) setPatio(t); })
      .catch((e) => { if (vivo) setErrorCarga(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, []);

  const resumen = useMemo(
    () => (patio ? resumenEtiquetado(patio, ids, { soloSinEtiqueta }) : null),
    [patio, ids, soloSinEtiqueta],
  );

  const generar = useCallback(async (opts: OpcionesGenerar): Promise<(RespuestaEtiquetas & { impresas: number }) | null> => {
    if (!resumen || resumen.aImprimir.length === 0) return null;
    /* La ventana se abre YA, en el clic: después del `await` el navegador la
       bloquea como pop-up, y para entonces el servidor ya selló la impresión
       y asignó números (revisión 26-09: 4 reimpresiones fantasma en main). */
    const ventana = window.open("", "_blank", "width=980,height=760");
    if (!ventana) {
      setErrorGenerar("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio y vuelve a intentarlo: todavía no se guardó nada.");
      return null;
    }
    ventana.document.write('<!doctype html><meta charset="utf-8"><title>Generando etiquetas…</title><p style="font:16px system-ui;padding:24px">Generando etiquetas…</p>');
    setGenerando(true);
    setErrorGenerar(null);
    try {
      const res = await fetch("/api/admin/forestal/trozas/etiquetas", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids: resumen.aImprimir.map((t) => t.id), asignarCodigo: opts.asignarCodigo }),
      });
      const j = (await res.json().catch(() => ({}))) as Partial<RespuestaEtiquetas> & { message?: string; error?: string };
      if (!res.ok) throw new Error(j.message ?? j.error ?? `El servidor respondió ${res.status}`);
      const r: RespuestaEtiquetas = {
        trozas: j.trozas ?? [],
        asignados: j.asignados ?? [],
        omitidas: j.omitidas ?? [],
        sinCodigoNuevo: j.sinCodigoNuevo ?? [],
        repetidos: j.repetidos ?? [],
      };
      // Lo que el servidor ya guardó se refleja ANTES de imprimir: si la hoja
      // falla, la lista igual muestra el sello y los números nuevos.
      invalidarCtp("trozas");
      setPatio((prev) => {
        if (!prev) return prev;
        const nuevas = new Map(r.trozas.map((t) => [t.id, t]));
        return prev.map((t) => nuevas.get(t.id) ?? t);
      });
      /* Se imprime con lo que devolvió el servidor: trae el correlativo recién
         asignado y deja afuera lo que él omitió. */
      const impresas = await imprimirEtiquetasDeTrozas(r.trozas, {
        origin: window.location.origin,
        formato: opts.formato,
        barras: opts.barras,
        fichaEnQr: opts.fichaEnQr,
        ventana,
      });
      if (impresas === 0) ventana.close();
      const final = { ...r, impresas };
      setResultado(final);
      return final;
    } catch (e) {
      try { ventana.close(); } catch { /* ya cerrada */ }
      setErrorGenerar(e instanceof Error ? e.message : "No se pudieron generar las etiquetas.");
      return null;
    } finally {
      setGenerando(false);
    }
  }, [resumen]);

  return { patio, errorCarga, resumen, generar, generando, errorGenerar, resultado };
}

/**
 * Cuándo se etiquetó cada troza (id → ISO), para la columna «Etiqueta» de una
 * lista que no lo trae. Sale del patio, que es la lectura con el sello de
 * impresión; `actualizar` aplica lo que devolvió el modal sin volver a pedirlo.
 */
export function useEtiquetasDelPatio() {
  const [etiquetas, setEtiquetas] = useState<Map<string, string | null>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    leerPatio()
      .then((t) => { if (vivo) setEtiquetas(new Map(t.map((x) => [x.id, x.etiquetadaEn ?? null]))); })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : String(e)); });
    return () => { vivo = false; };
  }, []);

  const actualizar = useCallback((trozas: readonly TrozaEtiquetable[]) => {
    setEtiquetas((prev) => {
      const m = new Map(prev);
      for (const t of trozas) m.set(t.id, t.etiquetadaEn ?? null);
      return m;
    });
  }, []);

  return { etiquetas, error, actualizar };
}
