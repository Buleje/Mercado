"use client";

/**
 * Estado del papel de UNA cubicación (sus hojas en el Archivo, el código que se
 * imprime y la fórmula de su planilla) y el conteo de papeles para una lista.
 * Una carga vieja no pisa a la nueva: cada efecto corta la suya al cambiar el id.
 */
import { useCallback, useEffect, useState } from "react";
import { claveFormulaTrozas } from "@/lib/forestal/cubicacion-trozas-formula";
import type { DbDocument } from "@/lib/types/documents";
import { cambiarPapel, datosDeLaCuenta, papelesDe, papelesPorCubicacion, quitarPapel, subirPapel } from "./papel-api";
import { codigoDeHoja, esIdDeLaCuenta, problemaDelArchivo, type TipoPapel } from "./papel-cubicador";

const abortado = (e: unknown) => e instanceof DOMException && e.name === "AbortError";
const texto = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** La fórmula con que está abierto el patio del cubicador de trozas (sin cubicación guardada). */
function formulaDelPatio(): string | null {
  try {
    const slug = localStorage.getItem("active-tenant-slug") ?? "main";
    return localStorage.getItem(claveFormulaTrozas(slug));
  } catch {
    return null;
  }
}

export interface PapelDeCubicacion {
  /** El código impreso en la hoja («CUB-2026-0003» o «MA-7K3QX»); `null` sin cubicación guardada o mientras se lee. */
  codigo: string | null;
  /** «smalian» u «oxapampina» (trozas): qué planilla se ofrece primero. */
  formula: string | null;
  /** La persona de la cuenta, para el nombre del papel si no vino `etiqueta`. */
  persona: string | null;
  hojas: DbDocument[];
  cargando: boolean;
  error: string | null;
  /** «subir» · «cambiar:<id>» · «quitar:<id>»: lo que está en curso. */
  ocupado: string | null;
  subir: (archivo: File) => Promise<void>;
  cambiar: (doc: DbDocument, archivo: File) => Promise<void>;
  quitar: (doc: DbDocument) => Promise<void>;
}

export function usePapelDeCubicacion(tipo: TipoPapel, cubicacionId: string | null | undefined, etiqueta?: string): PapelDeCubicacion {
  const id = cubicacionId?.trim() || null;
  /* Lo leído de la cuenta para ESTE id (`d: null` = se leyó y no hay o no se pudo). */
  const [cuenta, setCuenta] = useState<{ id: string; d: { codigo: string; formula: string; persona: string | null } | null } | null>(null);
  const [hojas, setHojas] = useState<DbDocument[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [formulaLocal, setFormulaLocal] = useState<string | null>(null);

  useEffect(() => { setFormulaLocal(formulaDelPatio()); }, [id]);

  useEffect(() => {
    if (!id || !esIdDeLaCuenta(id)) return;
    const ac = new AbortController();
    datosDeLaCuenta(id, ac.signal).then((d) => { if (!ac.signal.aborted) setCuenta({ id, d }); });
    return () => ac.abort();
  }, [id]);

  useEffect(() => {
    if (!id) { setHojas([]); setError(null); return; }
    const ac = new AbortController();
    setCargando(true);
    papelesDe(id, ac.signal)
      .then((d) => { if (!ac.signal.aborted) { setHojas(d); setError(null); } })
      .catch((e: unknown) => { if (!abortado(e) && !ac.signal.aborted) setError(texto(e)); })
      .finally(() => { if (!ac.signal.aborted) setCargando(false); });
    return () => ac.abort();
  }, [id, vuelta]);

  const datos = cuenta && cuenta.id === id ? cuenta.d : null;
  /* El «CUB-…» llega con la cuenta: hasta entonces no se imprime ni se sube (saldría con otro código). */
  const listo = !id || !esIdDeLaCuenta(id) || cuenta?.id === id;
  const codigo = id && listo ? codigoDeHoja(tipo, id, datos?.codigo) : null;

  const correr = useCallback(async (que: string, fn: () => Promise<void>) => {
    setOcupado(que);
    setError(null);
    try {
      await fn();
      setVuelta((v) => v + 1);
    } catch (e) {
      setError(texto(e));
    } finally {
      setOcupado(null);
    }
  }, []);

  const validar = (archivo: File) => {
    const p = problemaDelArchivo(archivo);
    if (p) { setError(p); return false; }
    return true;
  };

  return {
    codigo,
    formula: datos?.formula || formulaLocal,
    persona: datos?.persona ?? null,
    hojas,
    cargando,
    error,
    ocupado,
    subir: async (archivo) => {
      if (!id || !codigo || !validar(archivo)) return;
      await correr("subir", async () => {
        await subirPapel({ archivo, tipo, cubicacionId: id, codigo, etiqueta: etiqueta || datos?.persona, hoja: hojas.length + 1 });
      });
    },
    cambiar: async (doc, archivo) => {
      if (!validar(archivo)) return;
      await correr(`cambiar:${doc.id}`, () => cambiarPapel(doc.id, archivo));
    },
    quitar: async (doc) => {
      await correr(`quitar:${doc.id}`, () => quitarPapel(doc.id));
    },
  };
}

/**
 * Cuántos papeles tiene cada cubicación, para marcar la lista de guardadas.
 * `activo=false` no pide nada (la lista cerrada). Si falla, la lista sigue sin marcas.
 */
export function usePapelesDeCubicaciones(activo: boolean): { porId: Map<string, number>; cargando: boolean } {
  const [porId, setPorId] = useState<Map<string, number>>(() => new Map());
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    if (!activo) return;
    const ac = new AbortController();
    setCargando(true);
    papelesPorCubicacion(ac.signal)
      .then((m) => { if (!ac.signal.aborted) setPorId(m); })
      .catch((e: unknown) => { if (!abortado(e) && !ac.signal.aborted) setPorId(new Map()); })
      .finally(() => { if (!ac.signal.aborted) setCargando(false); });
    return () => ac.abort();
  }, [activo]);
  return { porId, cargando };
}
