"use client";

/**
 * Lo que el libro ya asentó de UN árbol para el trozado: su línea de tala
 * (fecha, medidas, volumen, motosierrista, hora, GPS) y las trozas que salieron.
 *
 * Una sola lectura (`?search=<código>`: el GET ya devuelve la línea entera) y el
 * filtro exacto en `lineasDelArbol`. Recordada 30 s por código, como el censo
 * de la tala: abrir, cerrar y volver a abrir «Nueva línea» no son tres
 * consultas más (el libro en dev topa las 100 por minuto). Lo que escribe en
 * el libro llama a `olvidarArbolEnElLibro()`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { lineasDelArbol, type ArbolEnElLibro, type LineaDelLibro } from "@/lib/forestal/loth-restante";

const VIGENCIA_MS = 30_000;
/** Mientras se tipea el código no se consulta en cada tecla. */
const PAUSA_MS = 350;
const lecturas = new Map<string, { at: number; promesa: Promise<ArbolEnElLibro> }>();

export function olvidarArbolEnElLibro(): void {
  lecturas.clear();
}

async function leer(code: string): Promise<ArbolEnElLibro> {
  const r = await fetch(`/api/admin/forestal/loth?search=${encodeURIComponent(code)}&limit=500`, { credentials: "include" });
  if (!r.ok) {
    throw new Error(
      r.status === 429 ? "Demasiadas consultas seguidas: espera un minuto y reintenta." : `No se pudo leer el libro (error ${r.status}).`,
    );
  }
  const j = (await r.json()) as { entries?: LineaDelLibro[] };
  return lineasDelArbol(j.entries ?? [], code);
}

function lecturaDe(code: string): Promise<ArbolEnElLibro> {
  const previa = lecturas.get(code);
  if (previa && Date.now() - previa.at < VIGENCIA_MS) return previa.promesa;
  const promesa = leer(code);
  lecturas.set(code, { at: Date.now(), promesa });
  promesa.catch(() => {
    // Un error no se recuerda: el próximo intento vuelve a preguntar.
    if (lecturas.get(code)?.promesa === promesa) lecturas.delete(code);
  });
  return promesa;
}

export interface ArbolEnElLibroEstado {
  datos: ArbolEnElLibro | null;
  cargando: boolean;
  error: string | null;
  recargar: () => void;
}

export function useArbolEnElLibro(treeCode: string): ArbolEnElLibroEstado {
  const code = treeCode.trim();
  const [datos, setDatos] = useState<ArbolEnElLibro | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  /** La respuesta de un código anterior no pisa la del actual. */
  const ultimo = useRef(0);

  useEffect(() => {
    const pedido = ++ultimo.current;
    if (!code) {
      setDatos(null);
      setCargando(false);
      setError(null);
      return;
    }
    setCargando(true);
    setError(null);
    const t = setTimeout(() => {
      lecturaDe(code)
        .then((d) => {
          if (pedido === ultimo.current) setDatos(d);
        })
        .catch((e: unknown) => {
          if (pedido === ultimo.current) setError(e instanceof Error ? e.message : String(e));
        })
        .finally(() => {
          if (pedido === ultimo.current) setCargando(false);
        });
    }, lecturas.has(code) ? 0 : PAUSA_MS);
    return () => clearTimeout(t);
  }, [code, vuelta]);

  const recargar = useCallback(() => {
    if (code) lecturas.delete(code);
    // Lo leído antes de guardar ya no es lo que dice el libro: no se muestra.
    setDatos(null);
    setVuelta((v) => v + 1);
  }, [code]);

  // Los datos de otro árbol no se muestran mientras llega el nuevo.
  return { datos: datos && datos.treeCode === code ? datos : null, cargando, error, recargar };
}
